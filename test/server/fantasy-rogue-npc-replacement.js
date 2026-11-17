'use strict';
const assert = require('assert').strict;
const { RoomBattleStream } = require('../../dist/server/room-battle');
const { RogueCoopController } = require('../../dist/server/fantasy-rogue/coop-controller');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { content } = require('../fixtures/fantasy-rogue');
const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');

describe('NPC rival replacement after a floor 51 elite knockout', function () {
	this.timeout(15000);
	for (const liveProgression of [false, true]) for (const defeatedFoe of [false, true]) it(`replaces the NPC lead with enemy second seat ${defeatedFoe ? 'defeated' : 'alive'}, live growth ${liveProgression}`, async () => {
		const stream = new RoomBattleStream(), writes = [], errors = [];
		const team = [createRoguePokemon(set('Raichu', 'Static', 100, ['Thunderbolt', 'Splash']), stats(0))];
		const room = { roomid: 'npc-replacement', format: 'gen9fantasyroguecoop', options: { fantasyRogue: { wild: true } },
			stream: { write: text => { writes.push(text); } }, ended: false };
		for (const slot of ['p1', 'p2', 'p3', 'p4']) room[slot] = { isAI: slot !== 'p1', request: {} };
		const ai = new RogueCoopController(room); let rqid = 0;
		async function exchange(text, decide = false) {
			await stream.write(text);
			for (;;) {
				const packet = await stream.read(); if (!packet) throw Error('stream closed');
				const lines = packet.split('\n');
				if (lines[0] === 'update') ai.update(lines.slice(1).join('\n'));
				if (lines[0] === 'sideupdate') {
					const slot = lines[1];
					if (lines[2].startsWith('|request|')) {
						const request = JSON.parse(lines[2].slice(9));
						room[slot].request = { rqid: ++rqid, request: JSON.stringify(request), isWait: request.wait ? 'cantUndo' : false, choice: '' };
						ai.request(slot, request, rqid);
					} else if (lines[2].startsWith('|error|')) errors.push(lines[2]);
				}
				if (lines[0] === 'fantasyaiready') break;
			}
			if (decide) ai.flush();
		}
		try {
			await exchange(`>start ${JSON.stringify({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: {
				encounterId: 'npc51', floor: 51, team, boosts: stats(0), bag: {}, balls: [], catchable: false,
				cooperative: { opponentOffset: 1 }, opponentSlots: [0, 1], difficulty: 'easy', liveProgression, progression: true,
			} })}\n>fantasyai normal\n` +
			`>player p1 ${JSON.stringify({ name: 'QA', team: team.map(m => m.set) })}\n` +
			`>player p2 ${JSON.stringify({ name: 'Elite', team: [set('Corviknight', 'Pressure', 100, ['Brave Bird', 'Splash'])] })}\n` +
			`>player p3 ${JSON.stringify({ name: 'Nemona', team: [set('Pawmo', 'Volt Absorb', 28, ['Splash']), set('Lycanroc', 'Keen Eye', 28, ['Rock Slide']), set('Sliggoo', 'Sap Sipper', 28, ['Water Gun'])] })}\n` +
			`>player p4 ${JSON.stringify({ name: 'Elite', team: [set('Corviknight', 'Pressure', 41, ['Splash'])] })}`);
			await exchange('>p1 team\n>p2 team\n>p3 team\n>p4 team');
			stream.battle.p3.active[0].hp = 1;
			if (defeatedFoe) stream.battle.p4.active[0].hp = 1;
			await exchange(`>p1 ${defeatedFoe ? 'move thunderbolt 2' : 'move splash'}\n>p2 move bravebird 2\n>p3 move splash\n>p4 move splash`, true);
			assert(stream.battle.p3.active[0].fainted, 'NPC lead must fall in the native turn');
			if (liveProgression && defeatedFoe) {
				assert(stream.battle.fantasyRogue.growthWaiting);
				assert.equal(writes.length, 0, 'the NPC must not skip the player learning decision');
				const growth = { sequence: stream.battle.fantasyRogue.defeated.length, revision: 1, team, bag: {}, paused: true };
				await exchange('>rogueprogress ' + JSON.stringify(growth), true); assert.equal(writes.length, 0);
				await exchange('>rogueprogress ' + JSON.stringify({ ...growth, revision: 2, paused: false }), true);
			}
			assert(writes.some(w => />p3 switch [23]/.test(w)), JSON.stringify({ writes, p3: room.p3.request, errors }));
			while (writes.length) await exchange(writes.shift());
			assert(stream.battle.p3.active[0].hp > 0); assert(!stream.battle.p3.active[0].fainted);
			assert(stream.battle.turn >= 2); assert.deepEqual(errors, []);
		} finally { ai.finish(); await stream.destroy(); }
	});
});

describe('NPC elite replacement through the room manager and scheduler', function () {
	this.timeout(20000);
	it('advances floor 51 after the NPC lead falls, with a defeated enemy and live growth enabled', async () => {
		const previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const store = new RogueStore(':memory:'), data = content(); data.progression = true;
		for (const item of data.items) if (item.kind === 'ball') item.multiplier = 1;
		const ai = new AIChallengeManager([], { enabled: true, decisionMs: 0, maxBattles: 1 }, 6);
		const manager = new RogueManager(new RogueEngine(store, data, () => 0), () => ai);
		const user = makeUser('Npc Floor QA', '127.7.7.51');
		let room;
		const command = (action, fields = {}) => manager.command(user.connections[0], {
			id: randomUUID(), revision: store.get(user.id).revision, action, ...fields,
		});
		const until = async (check, label) => {
			const started = Date.now();
			while (!check()) { assert(Date.now() - started < 8000, label); await delay(5); }
		};
		try {
			command('start', { starters: ['bulbasaur'], difficulty: 'easy' });
			command('select', { value: 'grass' });
			store.change(user.id, a => {
				const run = a.run; run.floor = 51;
				run.team = [createRoguePokemon(set('Raichu', 'Static', 100, ['Thunderbolt', 'Splash']), stats(0))];
				run.node.kind = 'adventure'; run.node.name = '与妮莫的相遇·其三';
				run.node.encounters = [{ name: '暴走的高阶精英', style: 'balanced', catchable: false, stars: [2, 2],
					team: [set('Corviknight', 'Pressure', 41, ['Brave Bird']), set('Corviknight', 'Pressure', 41, ['Splash'])],
					cooperative: { id: 'nemona', name: '妮莫', team: [
						set('Pawmo', 'Volt Absorb', 28, ['Splash']), set('Lycanroc', 'Keen Eye', 28, ['Rock Slide']),
						set('Sliggoo', 'Sap Sipper', 28, ['Water Gun']),
					] },
				}];
			});
			room = Rooms.get(command('battle').run.roomid);
			await until(() => room.battle.p2.request.isWait === true, 'AI preview did not complete');
			room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
			await until(() => room.battle.turn === 1, 'first turn');
			const native = room.battle.stream.battle;
			native.p3.active[0].hp = 1; native.p4.active[0].hp = 1;
			room.battle.choose(user, `move 1 2|${room.battle.p1.request.rqid}`);
			await until(() => native.turn >= 2, 'NPC replacement or live growth did not resume');
			assert(native.p3.pokemon.some(mon => mon.species.id === 'pawmo' && mon.fainted));
			assert(native.p3.active[0].hp > 0 && native.p3.active[0].species.id !== 'pawmo');
			assert(native.p4.pokemon.every(mon => mon.fainted));
			assert(!store.get(user.id).run.battle.growthPaused);
			assert(!room.log.log.some(line => line.startsWith('|error|')));
		} finally {
			await ai.dispose(); if (room) Rooms.get(room.roomid)?.destroy();
			user.disconnectAll(); user.destroy(); store.close();
			Object.assign(Config, { fantasyailocal: previous.local, bindaddress: previous.bind, fantasyrogue: previous.rogue });
		}
	});
});
