'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative personal companion services', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0, oldNow, now, oldRandom;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldNow = Date.now; now = oldNow(); Date.now = () => now;
		oldRandom = crypto.randomInt;
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true; fixture.events = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		for (const id of Object.keys(preview.unlocks)) {
			fixture.unlocks[id] = structuredClone(preview.unlocks[id]);
			if (!fixture.starters.some(entry => entry.id === fixture.unlocks[id].starter)) {
				fixture.starters.push(structuredClone(preview.starters.find(entry => entry.id === fixture.unlocks[id].starter)));
			}
		}
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-activity-battles-fixture' };
		} }));
		host = makeUser(`Service Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Service Guest ${serial}`, `127.0.86.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: crypto.randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			const round = { floor: 1, tier: 'silver', remaining: 1, familiesSeen: [], idsSeen: ['swapstats'],
				options: [{ id: 'swapstats', tier: 'silver', refreshes: 1, chosen: false }] };
			shared.adventure.coopBlessingRound = round;
			for (const user of [host, guest]) shared.adventure.members[user.id].blessings.round = structuredClone(round);
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 0 });
	});
	afterEach(() => {
		Date.now = oldNow; crypto.randomInt = oldRandom;
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	const service = user => manager.coop.view(user).session.adventure.companionServices;
	function act(user, id, value, owner = user.id, visit = service(owner === host.id ? host : guest).visit, action = 'companion') {
		return manager.coop.command(user, { action, owner, member: id, value, visit });
	}
	function add(user, id, extra = {}) {
		change(s => {
			const m = s.adventure.members[user.id];
			(m.blessings.companions ||= []).push({ id, preferences: 0, ...extra });
		});
	}
	it('renders native personal services without mutating the saved session', () => {
		add(host, 'liko', { type: 'Grass' }); add(guest, 'bea', { type: 'Fighting' });
		const before = session(); const view = manager.coop.view(host).session.adventure;
		assert.equal(view.companionServices.run.companions[0].id, 'liko');
		assert.equal(view.partnerCompanionServices.run.companions[0].id, 'bea');
		assert.deepEqual(session(), before);
	});
	it('assigns a native ability to the personal strongest member, never the partner', () => {
		add(host, 'liko', { type: 'Grass' }); const before = member(guest);
		act(host, 'liko', 'ability:flowergift');
		const c = member(host).blessings.companions[0];
		assert.equal(c.ability, 'flowergift'); assert.equal(c.member, member(host).team[0].id);
		assert.deepEqual(member(guest), before);
		assert.throws(() => act(host, 'liko', 'ability:hugepower'), /额外特性/);
	});
	it('clears the old ability when changing a multi-type companion guidance', () => {
		add(host, 'acerola', { type: 'Ghost', ability: 'guiying' });
		act(host, 'acerola', 'type:Normal');
		assert.equal(member(host).blessings.companions[0].type, 'Normal');
		assert(!member(host).blessings.companions[0].ability);
		assert.throws(() => act(host, 'acerola', 'type:Fire'), /额外特性/);
	});
	it('claims a native gift once and only from an active owned companion', () => {
		add(host, 'liko', { type: 'Grass', giftPending: true });
		const gift = service(host).run.companions[0].giftOptions[0].id;
		const before = member(host).bag[gift] || 0;
		assert.throws(() => act(host, 'liko', 'gift:potion'), /赠礼/);
		act(host, 'liko', 'gift:' + gift); assert.equal(member(host).bag[gift], before + 1);
		assert.throws(() => act(host, 'liko', 'gift:' + gift), /赠礼/);
		assert.throws(() => act(guest, 'liko', 'chat'), /尚未同行/);
	});
	it('rolls back an overflowing reward without consuming the gift', () => {
		add(host, 'liko', { type: 'Grass', giftPending: true });
		const gift = service(host).run.companions[0].giftOptions[0].id;
		change(s => { s.adventure.members[host.id].bag[gift] = Number.MAX_SAFE_INTEGER; });
		const before = session();
		assert.throws(() => act(host, 'liko', 'gift:' + gift), /可保存范围/);
		assert.deepEqual(session(), before);
	});
	for (const social of [false, true]) {
		for (const converted of [false, true]) {
			it(`keeps ${social ? 'social' : 'blessing'} Mew gifts personal through delegation and ${converted ? 'conversion' : 'no conversion'}`, () => {
				const id = social ? 'marnie' : 'liko', action = social ? 'socialcompanion' : 'companion';
				if (!social) add(guest, id, { type: 'Grass', giftPending: true });
				change(shared => {
					shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1;
					if (social) shared.adventure.members[guest.id].socialCompanions = [
						{ id, origin: 'event', preferences: 5, counted: [], giftPending: true },
					];
				});
				const choices = service(guest).run[social ? 'socialCompanions' : 'companions'];
				const gift = choices[0].giftOptions[0].id;
				manager.coop.command(guest, { action: 'delegate', value: 'partner' });
				const before = member(host), solo = [host, guest].map(user => store.get(user.id));
				let rolls = 0;
				crypto.randomInt = max => { if (max === 2) rolls++; return converted ? 0 : 1; };
				act(host, id, 'gift:' + gift, guest.id, service(guest).visit, action);
				const received = converted ? 'fantasypowerlens' : gift;
				assert.equal(rolls, 1); assert.equal(member(guest).bag[received], 1);
				assert.equal(member(guest).spiritConversions[`${social ? 'social' : 'companion'}-gift:${id}`], received);
				assert.deepEqual(member(host), before);
				if (converted) {
					assert(!member(guest).bag[gift]); assert(member(guest).notices.some(line => line.includes('梦幻的奇赠')));
					assert(!member(guest).notices.some(line => line.includes('×1.2')));
				}
				const saved = session(); manager = new RogueManager(new RogueEngine(store, engine.content));
				manager.coop.view(host); manager.coop.view(guest); assert.deepEqual(session(), saved);
				assert.throws(() => act(host, id, 'gift:' + gift, guest.id, service(guest).visit, action), /赠礼/);
				assert.deepEqual(session(), saved); assert.equal(rolls, 1);
				for (const [i, user] of [host, guest].entries()) assert.deepEqual(store.get(user.id), solo[i]);
			});
		}
		it(`rolls back the ${social ? 'social' : 'blessing'} Mew gift and new ledger on inventory overflow`, () => {
			const id = social ? 'marnie' : 'liko', action = social ? 'socialcompanion' : 'companion';
			if (!social) add(host, id, { type: 'Grass', giftPending: true });
			change(shared => {
				shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1;
				const m = shared.adventure.members[host.id]; m.bag.fantasypowerlens = Number.MAX_SAFE_INTEGER;
				if (social) m.socialCompanions = [{ id, origin: 'event', preferences: 5, counted: [], giftPending: true }];
			});
			const gift = service(host).run[social ? 'socialCompanions' : 'companions'][0].giftOptions[0].id;
			crypto.randomInt = () => 0; const before = session();
			assert.throws(() => act(host, id, 'gift:' + gift, host.id, service(host).visit, action), /可保存范围/);
			assert.deepEqual(session(), before); assert(!member(host).spiritConversions);
			change(shared => { delete shared.adventure.members[host.id].bag.fantasypowerlens; });
			act(host, id, 'gift:' + gift, host.id, service(host).visit, action);
			assert.equal(member(host).bag.fantasypowerlens, 1);
		});
	}
	it('enforces delegation and immediately respects revocation', () => {
		add(guest, 'liko', { type: 'Grass' });
		assert.throws(() => act(host, 'liko', 'chat', guest.id), /权限|操作|队友/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		act(host, 'liko', 'chat', guest.id); assert(member(guest).blessings.companions[0].message);
		assert.throws(() => act(guest, 'liko', 'chat'), /操作权已移交/);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => act(host, 'liko', 'chat', guest.id), /权限|操作|队友/);
	});
	it('rejects stale stage tokens and commands during battle or unresolved party changes', () => {
		add(host, 'liko', { type: 'Grass' }); const visit = service(host).visit;
		change(s => { s.adventure.floor++; });
		assert.throws(() => act(host, 'liko', 'chat', host.id, visit), /阶段已变化/);
		change(s => { s.adventure.phase = 'battle'; });
		assert.throws(() => act(host, 'liko', 'chat'), /战斗|对话/);
		change(s => { s.adventure.phase = 'area-selection'; s.adventure.members[guest.id].pendingMoves = [{ member: 'pending' }]; });
		assert.throws(() => act(host, 'liko', 'chat'), /待学招式/);
	});
	it('supports social chat without granting repeatable affection', () => {
		change(s => { s.adventure.members[host.id].socialCompanions = [{ id: 'marnie', origin: 'event', preferences: 0, counted: [] }]; });
		act(host, 'marnie', 'chat', host.id, service(host).visit, 'socialcompanion');
		assert(member(host).socialCompanions[0].message);
		assert.equal(member(host).trainerBonds?.marnie?.score || 0, 0);
	});
	it('chooses a native companion family independently for each player', () => {
		change(s => { for (const user of [host, guest]) s.adventure.members[user.id].blessings.owned.push({ id: 'companionband', family: 'companionband', tier: 'gold', floor: 1 }); });
		act(host, 'roxie', 'chooseband'); act(guest, 'marnie', 'chooseband');
		assert.equal(member(host).blessings.companions[0].id, 'roxie');
		assert.equal(member(guest).blessings.companions[0].id, 'marnie');
		assert.throws(() => act(host, 'lacey', 'chooseband'), /选择一位/);
	});
	it('assigns an extra Z only to a qualified personal Pokemon and only once', () => {
		add(guest, 'roxie', { type: 'Poison' });
		change(s => {
			s.adventure.members[guest.id].team = [createRoguePokemon({ species: 'Bulbasaur', level: 30,
				ability: 'Overgrow', moves: ['Sludge Wave'], nature: 'Serious' }, s.adventure.members[guest.id].boosts)];
		});
		const target = member(guest).team[0].id;
		assert.throws(() => act(guest, 'roxie', 'z:' + member(host).team[0].id), /请选择/);
		act(guest, 'roxie', 'z:' + target);
		assert.deepEqual(member(guest).blessings.companionZ, { companion: 'roxie', member: target });
		assert(!member(host).blessings.companionZ);
		assert.throws(() => act(guest, 'roxie', 'z:' + target), /只能指定一次/);
		route();
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'ordinary' });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		const state = created.rogue.state;
		assert.equal(state.partner.blessings.companionZ.member, target);
		assert(!state.blessings.companionZ);
		const outcome = { encounterId: state.encounterId, won: false, turns: 1,
			team: structuredClone(state.team), partnerTeam: structuredClone(state.partner.team),
			bag: { ...state.bag }, partnerBag: { ...state.partner.bag }, defeated: [], partnerCompanionZUsed: true };
		created.rogue.onResult(outcome);
		assert(member(guest).blessings.companionZ.spent);
		assert(!member(host).blessings.companionZ);
		const before = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), before);
	});
	function route() {
		change(s => {
			s.adventure.floor = 50; s.adventure.phase = 'area-selection';
			s.adventure.routeChoices = [{ id: 'ordinary', name: '普通战斗', kind: 'wild',
				encounters: [{ key: 'service-wild', name: '野生宝可梦', catchable: true,
					team: [{ species: 'Pikachu', level: 20, ability: 'Static', moves: ['Thunderbolt'], nature: 'Serious' }] }],
				reward: { money: 0, items: {} } }];
		});
	}
	it('records route preferences only after agreement, separately for both players', () => {
		add(host, 'bea', { type: 'Fighting' }); add(guest, 'liko', { type: 'Grass' }); route();
		act(host, 'bea', 'advice'); assert.equal(service(host).run.companions[0].recommended, 'ordinary');
		manager.coop.command(host, { action: 'selectarea', value: 'ordinary' });
		assert(!member(host).trainerBonds?.bea);
		manager.coop.command(host, { action: 'cancelarea' });
		manager.coop.command(guest, { action: 'selectarea', value: 'ordinary' });
		assert(!member(host).trainerBonds?.bea);
		manager.coop.command(host, { action: 'selectarea', value: 'ordinary' });
		assert.equal(member(host).trainerBonds.bea.score, 2);
		assert.equal(member(guest).trainerBonds?.liko?.score || 0, 0);
		assert.deepEqual(member(host).blessings.companions[0].counted, ['routes:50']);
	});
	it('resumes the selected battle after an affection gift at a blessing floor', () => {
		add(host, 'bea', { type: 'Fighting' }); route();
		change(s => { s.adventure.members[host.id].trainerBonds = { bea: { score: 98, gifts: [50], pending: [] } }; });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'ordinary' });
		assert.equal(session().adventure.phase, 'blessing-reward');
		assert.equal(session().adventure.coopBlessingResume, 'battle-selection');
		// Finishing the item must not create the floor's next blessing before the selected battle.
		const pending = member(host).blessings.pending[0];
		manager.coop.command(host, { action: 'blessingreward', member: pending.id, value: pending.options[0] });
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.equal(session().adventure.node.id, 'ordinary');
		assert(!session().adventure.coopBlessingRound);
		for (let i = 0; i < 5; i++) {
			const scene = manager.coop.view(host).session.adventure.coopAffection;
			if (!scene) break;
			for (const user of [host, guest]) manager.coop.command(user, { action: 'affection', visit: scene.visit, value: scene.options[0].id });
		}
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		assert(created.rogue.cooperative);
	});
});
