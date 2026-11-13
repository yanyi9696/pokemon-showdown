'use strict';

const assert = require('assert').strict;
const { setImmediate: nextTurn } = require('timers/promises');
const { Monitor } = require('../../dist/server/monitor');
const { AIController } = require('../../dist/server/fantasy-ai/controller');
const { RogueCoopController } = require('../../dist/server/fantasy-rogue/coop-controller');

describe('Fantasy AI transport failures', () => {
	let originalCrashlog, errors, unhandled, controller;
	const onUnhandled = error => unhandled.push(error);
	beforeEach(() => {
		originalCrashlog = Monitor.crashlog; errors = []; unhandled = [];
		Monitor.crashlog = (error, phase) => errors.push({ error, phase });
		process.on('unhandledRejection', onUnhandled);
	});
	afterEach(() => {
		controller?.finish('test-ended');
		Monitor.crashlog = originalCrashlog;
		process.removeListener('unhandledRejection', onUnhandled);
	});
	function setup(coop) {
		const request = { teamPreview: true, side: { pokemon: [{ details: 'Pikachu', condition: '100/100' }] } };
		const battle = { roomid: 'transport-qa', ended: false,
			options: { fantasyRogue: { wild: true } },
			p1: { eliminated: false }, p2: { isAI: true, request: { rqid: 1, isWait: false } },
			stream: { write() {} }, room: { closed: 0, destroy() { this.closed++; } } };
		const options = { difficulty: 'normal', trainer: { id: 'qa' }, instanceId: 'qa',
			scheduler: { register() {}, unregister() {}, cancel() {} }, onEnd() {} };
		controller = coop ? new RogueCoopController(battle) : new AIController(battle, options);
		if (coop) controller.request('p2', request, 1);
		else controller.request(request, 1);
		return { battle, send: () => coop ? controller.flush() : controller.sendChoice('team 1', 1, 1) };
	}
	for (const coop of [false, true]) for (const mode of ['sync', 'async', 'late']) {
		it(`${coop ? 'co-op' : 'solo'} safely handles ${mode} transport failure`, async () => {
			const { battle, send } = setup(coop); let reject;
			battle.stream.write = () => {
				if (mode === 'sync') throw new Error('injected transport failure');
				if (mode === 'late') return new Promise((resolve, fail) => { reject = fail; });
				return Promise.reject(new Error('injected transport failure'));
			};
			assert.doesNotThrow(send);
			if (mode === 'late') { controller.finish('test-close'); reject(new Error('late transport failure')); }
			await nextTurn(); await nextTurn();
			assert.equal(unhandled.length, 0);
			assert.equal(errors.length, 1);
			assert.equal(battle.room.closed, mode === 'late' ? 0 : 1);
		});
	}
});
