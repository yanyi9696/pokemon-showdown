'use strict';
const assert = require('assert').strict;
const { makeUser } = require('../users-utils');
const { commands } = require('../../dist/server/chat-plugins/fantasy-rogue');

describe('Fantasy Rogue dialogue navigation transport', () => {
	let user, parse, noThrottle;
	beforeEach(() => {
		user = makeUser('Dialogue QA', '127.0.9.91');
		parse = Chat.parse; noThrottle = Config.nothrottle; Config.nothrottle = false;
		user.hasSysopAccess = () => false;
	});
	afterEach(() => {
		Chat.parse = parse; Config.nothrottle = noThrottle;
		user.clearChatQueue(); user.disconnectAll(); user.destroy();
	});
	it('processes story navigation immediately without consuming or bypassing ordinary chat limits', () => {
		const calls = []; Chat.parse = text => calls.push(text);
		const conn = user.connections[0], story = '/fantasyrogue story {"id":"page1","action":"storynext"}';
		user.lastChatMessage = Date.now();
		user.chat('/fantasyrogue action {"action":"use"}', null, conn);
		assert(user.chatQueueTimeout); assert.equal(calls.length, 0);
		user.chat(story, null, conn);
		assert.deepEqual(calls, [story]); assert.equal(user.chatQueue.length, 1);
		user.chat(story, null, conn);
		assert.equal(calls.length, 1); assert.equal(user.chatQueue.length, 2);
	});
	it('never grants the fast story endpoint access to purchases or run starts', () => {
		for (const action of ['buy', 'start', 'startcard', 'saveclear']) {
			const responses = [];
			commands.fantasyrogue.story.call({}, JSON.stringify({ id: action, action }), null, user,
				{ send: value => responses.push(JSON.parse(value.split('|').slice(3).join('|'))) });
			assert.equal(responses.length, 1); assert.equal(responses[0].ok, false);
			assert.equal(responses[0].id, action); assert.match(responses[0].message, /仅用于剧情/);
		}
	});
});
