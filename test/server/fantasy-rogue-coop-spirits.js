'use strict';
const assert = require('assert').strict;
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { chooseCoopSpirit } = require('../../dist/server/fantasy-rogue/coop-spirits');
const { clearCoopDifficulty, canSelectSpirit } = require('../../dist/server/fantasy-rogue/difficulty');
const { activeRogueSpirits } = require('../../dist/sim/fantasy-rogue-spirits');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { content, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue shared tower spirit opening', function () {
	this.timeout(25000);
	let store, manager, data, host, guest, previous, created;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); data = content(); data.spirits = true;
		host = makeUser('Spirit Coop Host', '127.98.1.1'); guest = makeUser('Spirit Coop Guest', '127.98.1.2');
		for (const user of [host, guest]) store.change(user.id, account => {
			account.difficulties = { highest: 1, cleared: ['easy'], spirits: ['easy'] };
			account.spiritClearTiers = Object.fromEntries(activeRogueSpirits().map(spirit => [spirit.id, 0]));
		});
		rebuild();
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store?.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	function rebuild() {
		manager = new RogueManager(new RogueEngine(store, data), () => ({ enabled: true,
			createRogueBattle(user, trainer, team, rogue) { created = rogue.state; return { roomid: 'battle-coop-spirit' }; },
		}));
	}
	function get() { return store.coopSessionForUser(host.id); }
	function lobby(tier = 0) {
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: tier });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
	}
	function vote(user, value, confirmed = true, visit = get().spiritChoice?.key) {
		return manager.coop.command(user, { action: 'spirit', value, confirmed, visit });
	}
	function agree(value) { vote(host, value); vote(guest, value); }
	function starters() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	}
	function battle() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
			members: [get().adventure.members[user.id].team[0].id] });
		return created;
	}
	it('accepts charm-clear evidence globally, waits for matching choices and preserves previews across reconnect', () => {
		lobby(); assert(get().spiritChoice);
		assert.throws(starters, /共同确认塔灵/);
		vote(host, 'palkia', false); rebuild();
		assert.equal(manager.coop.view(guest).session.spiritChoice.partner, 'palkia');
		vote(host, 'palkia'); vote(guest, 'dialga'); assert(get().spiritChoice);
		vote(host, 'palkia', false); vote(guest, 'palkia'); assert(get().spiritChoice);
		const key = get().spiritChoice.key; vote(host, 'palkia');
		assert.equal(get().spirit, 'palkia'); assert.equal(get().spiritChoice, undefined);
		assert.throws(() => vote(host, 'dialga', true, key), /已更新/);
		starters(); const state = battle();
		assert.equal(state.spirit.id, 'palkia'); assert.equal(state.spirit.floor, 1);
		assert.equal(get().adventure.spirit, 'palkia');
	});
	it('uses the intersection of per-spirit tier qualifications, without letting local mode bypass it', () => {
		store.change(guest.id, account => {
			account.spiritClearTiers.palkia = 'easy'; delete account.spiritClearTiers.latios;
		});
		lobby();
		assert(!manager.coop.view(host).session.spiritChoice.selectable.some(spirit => spirit.id === 'palkia'));
		assert.throws(() => vote(host, 'palkia'), /双方都/);
		assert.throws(() => vote(host, 'latios'), /双方都/);
		assert.throws(() => vote(host, 'invalid'), /双方都/);
		agree('none'); starters(); assert.equal(battle().spirit, undefined);
	});
	it('does not insert a tower spirit step when either player has not unlocked the mode', () => {
		store.change(guest.id, account => {
			account.difficulties = { highest: 0, cleared: [], spirits: [] };
			delete account.spiritClearTiers; delete account.spiritUnlocked; delete account.unlockedSpirits;
		});
		lobby(); assert.equal(get().spiritChoice, undefined);
		starters(); assert.equal(get().adventure.spirit, undefined);
	});
	it('rolls a shared random spirit only when the second matching confirmation resolves, never on a stale retry', () => {
		lobby(); const session = get(), key = session.spiritChoice.key;
		const accounts = [store.get(host.id), store.get(guest.id)]; let rolls = 0;
		const random = max => { rolls++; return max - 1; };
		chooseCoopSpirit(session, host.id, key, 'random', true, accounts, random); assert.equal(rolls, 0);
		chooseCoopSpirit(session, guest.id, key, 'random', true, accounts, random); assert.equal(rolls, 1);
		assert.equal(session.spirit, activeRogueSpirits().at(-1).id);
		assert.throws(() => chooseCoopSpirit(session, host.id, key, 'random', true, accounts, random), /已更新/);
		assert.equal(rolls, 1);
	});
	it('revokes old confirmations on delegation changes and only the current controller can decide for both', () => {
		lobby(); vote(host, 'groudon'); manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.deepEqual(get().spiritChoice.confirmed, {});
		assert.throws(() => vote(host, 'groudon'), /已移交/);
		vote(guest, 'groudon'); assert.equal(get().spirit, 'groudon');
		starters(); assert.equal(get().status, 'active');
		assert.equal(get().delegatedTo, guest.id);
	});
	it('limits Regigigas starter parties before constructing or deleting any party members', () => {
		lobby(); agree('regigigas');
		assert.equal(manager.coop.view(host).session.partyLimit, 3);
		assert.throws(() => manager.coop.command(host, { action: 'selectstarters',
			starters: ['bulbasaur', 'magikarp', 'mew', 'fourth'] }), /塔灵允许/);
		assert.equal(get().starterSelections[host.id], null); starters(); assert.equal(battle().spirit.id, 'regigigas');
	});
	it('gives both owners the same Celebi gift with separate identities, personal boosts and a fixed level', () => {
		store.change(guest.id, account => { account.boosts.atk = 5; });
		lobby(); agree('celebi'); starters();
		const a = get().adventure.members[host.id].team[1], b = get().adventure.members[guest.id].team[1];
		assert.deepEqual(a.set, b.set); assert.notEqual(a.id, b.id);
		assert.equal(a.set.level, 40); assert.equal(a.fixedLevel, 40); assert.equal(b.fixedLevel, 40);
		assert(b.stats.atk > a.stats.atk); rebuild();
		assert.equal(get().adventure.members[guest.id].team.length, 2);
	});
	it('queues the Celebi gift for both full parties without replacing any of their independently chosen starters', () => {
		data.starters.find(starter => starter.id === 'magikarp').availableInitially = true;
		for (const [species, ability] of [
			['Charmander', 'Blaze'], ['Squirtle', 'Torrent'], ['Chikorita', 'Overgrow'], ['Eevee', 'Run Away'],
		]) data.starters.push({
			id: species.toLowerCase(), set: set(species, ability, 5, [species === 'Charmander' ? 'Scratch' : 'Tackle']),
			availableInitially: true,
		});
		for (const user of [host, guest]) store.change(user.id, account => { account.slots = 6; });
		rebuild(); lobby(); agree('celebi');
		const ids = ['bulbasaur', 'magikarp', 'charmander', 'squirtle', 'chikorita', 'eevee'];
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ids });
		for (const user of [host, guest]) {
			const member = get().adventure.members[user.id];
			assert.equal(member.team.length, 6); assert(member.team.every(mon => mon.initialPartner));
			assert.equal(member.pendingCaptures.length, 1); assert.equal(member.pendingCaptures[0].fixedLevel, 40);
		}
		rebuild(); assert.equal(manager.coop.view(host).session.adventure.pendingCapture.fixedLevel, 40);
	});
	for (const [spirit, quality, count, refreshes] of [
		['gholdengo', 'gold', 3, 1], ['silvally', 'silver', 3, 1], ['terapagos', 'prismatic', 3, 1],
		['necrozma', 'mixed', 3, 1], ['jirachi', null, 2, 1], ['victini', null, 3, 2],
	]) it(`applies ${spirit} to the shared opening blessing round`, () => {
		data.blessings = true; rebuild();
		lobby(); agree(spirit); starters();
		const round = get().adventure.coopBlessingRound;
		assert.equal(get().adventure.phase, 'blessing-selection');
		if (quality) assert.equal(round.tier, quality);
		assert.equal(round.options.length, count); assert.equal(round.remaining, spirit === 'jirachi' ? 2 : 1);
		assert(round.options.every(option => option.refreshes === refreshes));
	});
	for (const spirit of ['gholdengo', 'terapagos', 'necrozma']) {
		it(`never replaces a failed ${spirit} common draft with silver rewards`, () => {
			data.blessings = true; rebuild(); lobby();
			agree(spirit);
			manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
			const before = get(), accounts = [store.get(host.id), store.get(guest.id)];
			const original = manager.coop.commonBlessingCandidates;
			manager.coop.commonBlessingCandidates = () => [1, 2, 3].map(i => ({
				id: `silver${i}`, family: `silver${i}`, tier: 'silver',
			}));
			try {
				assert.throws(() => manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] }), /没有符合条件/);
				assert.deepEqual(get(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			} finally { manager.coop.commonBlessingCandidates = original; }
			manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
			const round = get().adventure.coopBlessingRound;
			assert.equal(round.tier, { gholdengo: 'gold', terapagos: 'prismatic', necrozma: 'mixed' }[spirit]);
			assert.equal(round.options.length, 3); assert(round.options.every(option => option.refreshes === 1));
		});
	}
	it('does not hide invalid common candidate weights as a successful draft', () => {
		data.blessings = true; rebuild(); lobby();
		agree('gholdengo');
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		const before = get(), original = manager.coop.commonBlessingCandidates;
		manager.coop.commonBlessingCandidates = () => [{ id: 'bad', family: 'bad', tier: 'gold', weight: -1 }];
		try {
			assert.throws(() => manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] }), /祝福类别权重无效/);
			assert.deepEqual(get(), before);
		} finally { manager.coop.commonBlessingCandidates = original; }
	});
	it('builds real common pools for all four blessing floors and six difficulty tiers without a quality fallback', () => {
		lobby(); agree('gholdengo'); starters();
		const session = get(); data = createPreviewContent(); rebuild();
		for (const difficulty of [0, 1, 2, 3, 4, 5]) for (const floor of [1, 50, 100, 150]) {
			for (const [spirit, tier] of Object.entries({ gholdengo: 'gold', silvally: 'silver',
				terapagos: 'prismatic', necrozma: 'mixed', jirachi: null, victini: null })) {
				const a = structuredClone(session.adventure); a.floor = floor; a.difficulty = difficulty;
				a.spirit = spirit;
				for (const member of Object.values(a.members)) {
					member.systems = { tera: floor >= 100, mega: floor >= 100, gmega: floor >= 100, z: floor >= 100 };
				}
				manager.coop.prepareCoopBlessingRound(a, session, floor, floor === 1 ? 'opening' : 'advance');
				const round = a.coopBlessingRound;
				if (tier) assert.equal(round.tier, tier);
				assert.equal(round.options.length, spirit === 'jirachi' ? 2 : 3);
				assert.equal(round.remaining, spirit === 'jirachi' ? 2 : 1);
				assert(round.options.every(option => option.refreshes === (spirit === 'victini' ? 2 : 1)));
				assert.deepEqual(a.members[host.id].blessings.round, a.members[guest.id].blessings.round);
			}
		}
	});
	it('records the exact cooperative spirit clear tier even before a queued clear card is kept', () => {
		const account = store.get(host.id); account.spiritClearTiers = {};
		clearCoopDifficulty(account, 3, 'palkia');
		assert(canSelectSpirit(account, 'palkia', 3)); assert(canSelectSpirit(account, 'palkia', 0));
		assert(!canSelectSpirit(account, 'palkia', 4)); assert(!canSelectSpirit(account, 'dialga', 0));
		assert.equal(account.mainline, undefined);
	});
});
