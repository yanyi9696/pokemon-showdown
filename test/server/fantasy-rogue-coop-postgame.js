'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { content, set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { assertRogueSaveCompatible } = require('../../dist/server/fantasy-rogue/save-compatibility');

describe('Fantasy Rogue cooperative tower clear and optional Arceus challenge', function () {
	this.timeout(25000);
	let store, engine, manager, host, guest, oldConfig, sessionId, created, solos;
	let serial = 0;
	const pack = createPreviewContent({ doubleBattle: true });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:');
		const data = content();
		data.floors[200] = structuredClone(pack.floors[200]); data.arceusMoves = { ...pack.arceusMoves };
		data.items.push(...pack.items.filter(item => !data.items.some(existing => existing.id === item.id)));
		engine = new RogueEngine(store, data);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue, partner) {
			created = { user, trainer, team, rogue, partner }; return { roomid: 'battle-coop-postgame-test' };
		} }));
		host = makeUser(`Postgame Host ${++serial}`, `127.0.91.${serial}`);
		guest = makeUser(`Postgame Guest ${serial}`, `127.0.92.${serial}`);
		solos = {};
		for (const user of [host, guest]) {
			engine.command(user.id, { id: randomUUID(), revision: store.get(user.id).revision,
				action: 'start', starters: ['bulbasaur'] }, user.name);
			solos[user.id] = store.get(user.id).run;
		}
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		const session = store.coopSessionForUser(host.id); sessionId = session.id;
		// Resume an ordinary rest stop, then exercise the real next-floor route generation and shared choices.
		session.adventure.floor = 199; session.adventure.phase = 'route-interaction';
		session.adventure.node = { id: 'center', name: '休整中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} } };
		write(session);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function get() { return store.coopSession(sessionId); }
	function write(session) { const revision = session.revision++; store.updateCoopSession(session, revision); }
	function start() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
			members: get().adventure.members[user.id].team.slice(0, 3).map(mon => mon.id) });
		return structuredClone(created.rogue.state);
	}
	function result(state, won, extra = {}) {
		return { encounterId: state.encounterId, won, turns: 3,
			team: structuredClone(state.team), partnerTeam: structuredClone(state.partner.team),
			bag: { ...state.bag }, partnerBag: { ...state.partnerBag }, ...extra };
	}
	function summit() {
		const route = get().adventure.routeChoices[0];
		assert.equal(route.encounters[0].boss.kind, 'summit');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: route.id });
		const state = start();
		assert.equal(state.boss.kind, 'summit'); assert.equal(state.cooperative.singleOpponent, true);
		created.rogue.onResult(result(state, true));
	}
	function offer() {
		summit();
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		return get().adventure.postgame;
	}
	function vote(user, value, key = get().adventure.postgame.key) {
		return manager.coop.command(user, { action: 'godchallenge', value, visit: key });
	}
	function challenge() {
		offer(); vote(host, 'accept'); vote(guest, 'accept');
		return start();
	}
	function assertClear() {
		for (const user of [host, guest]) {
			assert.equal(store.history(user.id).total, 1);
			assert.equal(store.history(user.id).records[0].outcome, 'complete');
			assert.equal(store.history(user.id).records[0].floor, 200);
			assert.deepEqual(store.get(user.id).run, solos[user.id]);
			assert.deepEqual(store.get(user.id).difficulties.cleared, ['0']);
			assert.equal(store.get(user.id).difficulties.highest, 0);
			assert.equal(store.get(user.id).mainline, undefined);
		}
	}
	it('records monthly challenges from each own full party with no credit from the partner or paused solo run', () => {
		const { monthlyRoster, challengeMonth } = require('../../dist/server/fantasy-rogue/monthly-challenges');
		const entries = monthlyRoster(), session = get();
		for (const [index, user] of [host, guest].entries()) {
			session.adventure.members[user.id].team = entries.slice(index * 2, index * 2 + 2)
				.map(entry => createRoguePokemon(set(entry.species, Dex.mod('gen9').species.get(entry.species).abilities[0], 100), stats(0)));
		}
		write(session); offer();
		for (const [index, user] of [host, guest].entries()) {
			const saved = store.get(user.id).monthlyChallenges;
			assert.deepEqual(Object.keys(saved[challengeMonth()].entries).sort(), entries.slice(index * 2, index * 2 + 2).map(e => e.id).sort());
			assert.deepEqual(store.get(user.id).run, solos[user.id]);
		}
		const ledgers = [host, guest].map(user => store.get(user.id).monthlyChallenges);
		vote(host, 'decline'); vote(guest, 'decline');
		assert.deepEqual([host, guest].map(user => store.get(user.id).monthlyChallenges), ledgers);
	});
	it('reaches the authored summit from floor 199 and commits both clears before offering the optional challenge', () => {
		const points = [store.get(host.id).points, store.get(guest.id).points];
		offer(); const session = get();
		assert.equal(session.status, 'active'); assert.equal(session.adventure.phase, 'postgame');
		assert.equal(session.adventure.campaignCleared, true); assertClear();
		for (const [index, user] of [host, guest].entries()) {
			const view = manager.coop.view(user).session.adventure.postgame;
			assert.equal(view.cleared, true); assert.equal(view.stage, 'offer');
			assert.equal(view.before, undefined, 'private recovery snapshots must never be sent to the browser');
			assert(get().adventure.members[user.id].team.every(mon => mon.hp === mon.maxhp));
			const account = store.get(user.id), card = account.cards[0];
			assert.equal(account.points, points[index] + 5);
			assert(account.firstClearSpecies.includes('1'));
			assert.equal(card.owner, user.id); assert.equal(card.public, false);
			assert.equal(card.cooperative.partnerName, index ? host.name : guest.name);
			assert.deepEqual(store.card(card.id), card);
			assert.deepEqual(card.snapshot.team.map(mon => mon.id), session.adventure.members[user.id].team.map(mon => mon.id));
		}
	});
	it('retains an unresolved solo keepsake while queuing the new co-op card and supports native replace/publish actions', () => {
		const temporary = structuredClone(store.get(host.id));
		recordClear(temporary, { ...structuredClone(solos[host.id]), floor: 200, phase: 'complete' });
		const template = temporary.cards[0]; assert(template);
		store.change(host.id, account => {
			delete account.firstClearSpecies; // Legacy account: retained cards must initialize the species ledger.
			account.cards = [0, 1, 2].map(index => ({ ...structuredClone(template), id: `old-${index}`, runId: `old-run-${index}` }));
			account.pendingClear = { ...structuredClone(template), id: 'pending-solo', runId: 'pending-solo-run' };
		});
		const previous = store.get(host.id), points = previous.points;
		offer(); let account = store.get(host.id);
		assert.equal(account.points, points, 'old saved cards are existing first-species-clear evidence');
		assert.deepEqual(account.cards, previous.cards); assert.deepEqual(account.pendingClear, previous.pendingClear);
		assert.equal(account.pendingClearQueue.length, 1);
		const queued = account.pendingClearQueue[0]; assert.equal(queued.cooperative.partnerName, guest.name);
		assertClear();
		assert.equal(manager.state(host).pendingClearCount, 2);
		assert.equal(manager.gallery(host).pendingClearCount, 2);
		const save = value => engine.command(host.id, { action: 'saveclear', value,
			id: randomUUID(), revision: store.get(host.id).revision }, host.name);
		save('discard'); account = store.get(host.id);
		assert.equal(account.pendingClear.id, queued.id); assert.equal(account.pendingClearQueue, undefined);
		save('old-1'); account = store.get(host.id);
		assert.equal(account.cards.length, 3); assert.equal(account.cards[1].id, queued.id);
		assert.equal(account.pendingClear, undefined); assert.deepEqual(store.card(queued.id), account.cards[1]);
		engine.command(host.id, { action: 'publishcard', member: queued.id, value: 'public',
			id: randomUUID(), revision: account.revision }, host.name);
		assert.equal(store.gallery()[0].id, queued.id); assert.equal(store.card('old-1'), undefined);
		assert.equal(store.history(host.id).total, 1);
		assert.deepEqual(store.get(host.id).run, solos[host.id]);
	});
	it('counts unique final-party species separately for each owner and excludes the reserve', () => {
		const session = get(), members = session.adventure.members;
		members[host.id].team.push(createRoguePokemon(set(), stats(0)),
			createRoguePokemon(set('Charmander', 'Blaze'), stats(0)));
		members[host.id].box.push(createRoguePokemon(set('Squirtle', 'Torrent'), stats(0)));
		members[guest.id].team.push(createRoguePokemon(set('Squirtle', 'Torrent'), stats(0)));
		write(session);
		const points = [store.get(host.id).points, store.get(guest.id).points]; offer();
		assert.deepEqual(store.get(host.id).firstClearSpecies.slice().sort(), ['1', '4']);
		assert.deepEqual(store.get(guest.id).firstClearSpecies.slice().sort(), ['1', '7']);
		assert.equal(store.get(host.id).points, points[0] + 10); assert.equal(store.get(guest.id).points, points[1] + 10);
	});
	it('validates queued keepsake snapshots before allowing an incompatible account write', () => {
		offer(); const account = store.get(host.id);
		account.pendingClearQueue = [structuredClone(account.cards[0])];
		account.pendingClearQueue[0].snapshot.boostRuleVersion = 999;
		assert.throws(() => assertRogueSaveCompatible(account), /不支持的版本/);
	});
	it('persists differing votes, cancellation, reloads and declining without replaying the tower clear', () => {
		offer(); vote(host, 'accept'); vote(guest, 'decline');
		assert.equal(get().adventure.phase, 'postgame');
		const view = manager.coop.view(host).session.adventure.postgame;
		assert.equal(view.ownChoice, 'accept'); assert.equal(view.partnerChoice, 'decline');
		vote(host, 'cancel'); assert.equal(manager.coop.view(guest).session.adventure.postgame.partnerChoice, null);
		vote(host, 'decline'); assert.equal(get().status, 'complete'); assertClear();
		assert.equal(store.coopSessionForUser(host.id), undefined);
	});
	it('uses revocable delegation and rejects expired pages and delegated-away commands', () => {
		offer(); const key = get().adventure.postgame.key;
		assert.throws(() => vote(host, 'accept', 'old-page'), /页面已更新/);
		vote(host, 'accept');
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.deepEqual(get().adventure.postgame.choices, {});
		assert.throws(() => vote(host, 'accept'), /操作权/);
		vote(guest, 'accept'); assert.equal(get().adventure.phase, 'battle-selection');
		assert.throws(() => vote(guest, 'accept', key), /页面已更新/); assertClear();
	});
	for (const won of [true, false]) it(`restores both inventories and settles ${won ? 'victory once' : 'a loss without bonus'}`, () => {
		const state = challenge(), before = get().adventure.postgame.before;
		assert.equal(state.boss.kind, 'arceus'); assert.equal(state.cooperative.singleOpponent, true);
		assert.equal(state.catchable, false); assert.equal(state.liveProgression, false);
		const points = [host, guest].map(user => store.get(user.id).points);
		const cards = [host, guest].map(user => store.get(user.id).cards);
		const outcome = result(state, won, { bag: {}, partnerBag: {}, defeated: [{ species: 'Arceus', level: 100 }] });
		for (const mon of [...outcome.team, ...outcome.partnerTeam]) mon.hp = 0;
		created.rogue.onResult(outcome); created.rogue.onResult(outcome);
		assert.equal(get().adventure.phase, 'postgame'); assert.equal(get().adventure.postgame.stage, won ? 'won' : 'lost');
		for (const [index, user] of [host, guest].entries()) {
			const member = get().adventure.members[user.id];
			assert.deepEqual(member.team, before[user.id].team); assert.deepEqual(member.bag, before[user.id].bag);
			assert.equal(member.money, before[user.id].money);
			assert.equal(store.get(user.id).points, points[index] + (won ? 20 : 0));
			assert.deepEqual(store.get(user.id).cards, cards[index], 'the optional challenge must not rewrite tower keepsakes');
		}
		assertClear(); vote(host, 'finish'); assert.equal(get().status, 'active');
		vote(guest, 'finish'); assert.equal(get().status, 'complete'); assertClear();
	});
	it('keeps a retreat as a paid retry, without finishing the challenge or granting a reward', () => {
		const state = challenge(), points = store.get(host.id).points;
		const outcome = result(state, false, { coopExit: 'retreat', bag: {}, partnerBag: {},
			defeated: [{ species: 'Arceus', level: 100, killer: state.team[0].id }] });
		outcome.team[0].hp = 1;
		created.rogue.onResult(outcome);
		assert.equal(get().adventure.phase, 'settlement'); assert.equal(get().adventure.postgame.stage, 'battle');
		assert.equal(get().adventure.members[host.id].team[0].hp, 1);
		assert.deepEqual(get().adventure.members[host.id].bag, {});
		assert.equal(get().adventure.members[host.id].team[0].set.level, state.team[0].set.level);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.equal(get().adventure.node.encounters[0].boss.kind, 'arceus');
		assert.equal(start().boss.kind, 'arceus'); assert.equal(store.get(host.id).points, points); assertClear();
	});
	it('does not turn a shared challenge abandonment into an abandoned tower or a win bonus', () => {
		const state = challenge(), points = [store.get(host.id).points, store.get(guest.id).points];
		created.rogue.onResult(result(state, true, { coopExit: 'abandon' }));
		assert.equal(get().status, 'complete'); assert.equal(get().adventure.postgame.stage, 'lost');
		assert.deepEqual([store.get(host.id).points, store.get(guest.id).points], points); assertClear();
	});
	it('rolls back an incomplete Arceus move pack without consuming either shared choice', () => {
		offer(); vote(host, 'accept'); const before = get();
		engine.content.arceusMoves = { Normal: 'Tackle' };
		assert.throws(() => vote(guest, 'accept'), /第四招尚未配置完整/);
		assert.deepEqual(get(), before); assertClear();
	});
	it('preserves the committed clear when both players abandon from the offer', () => {
		offer(); manager.coop.command(host, { action: 'proposeexit', value: 'abandon' });
		manager.coop.command(guest, { action: 'respondexit', id: get().exitProposal.id, value: 'accept' });
		assert.equal(get().status, 'abandoned'); assertClear();
	});
	it('rolls back both clear histories and the offer if the second account write fails', () => {
		summit(); manager.coop.command(host, { action: 'continuebattle' });
		const before = get(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec(`CREATE TEMP TRIGGER reject_postgame BEFORE INSERT ON rogue_accounts
			WHEN NEW.userid = '${guest.id}' BEGIN SELECT RAISE(ABORT, 'test account failure'); END`);
		assert.throws(() => manager.coop.command(guest, { action: 'continuebattle' }), /test account failure/);
		assert.deepEqual(get(), before);
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(store.history(user.id).total, 0); assert.deepEqual(store.get(user.id), accounts[index]);
		}
		assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM rogue_cards').get().count, 0);
		store.db.exec('DROP TRIGGER reject_postgame'); manager.coop.command(guest, { action: 'continuebattle' }); assertClear();
	});
	it('rolls back both challenge bonuses and restores a retryable result callback if the second write fails', () => {
		const state = challenge(), outcome = result(state, true), before = get();
		const points = [store.get(host.id).points, store.get(guest.id).points];
		store.db.exec(`CREATE TEMP TRIGGER reject_postgame BEFORE INSERT ON rogue_accounts
			WHEN NEW.userid = '${guest.id}' BEGIN SELECT RAISE(ABORT, 'test reward failure'); END`);
		assert.throws(() => created.rogue.onResult(outcome), /test reward failure/);
		assert.deepEqual(get(), before);
		assert.deepEqual([store.get(host.id).points, store.get(guest.id).points], points);
		store.db.exec('DROP TRIGGER reject_postgame'); created.rogue.onResult(outcome); assertClear();
		assert.equal(store.get(host.id).points, points[0] + 20); assert.equal(store.get(guest.id).points, points[1] + 20);
	});
});
