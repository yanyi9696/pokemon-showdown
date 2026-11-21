'use strict';
const assert = require('assert').strict;
const { SocketMetrics, trafficKind } = require('../../dist/server/socket-metrics');
const { ServerStream } = require('../../dist/server/sockets');
describe('Aggregate socket traffic metrics', () => {
	it('meters actual direct, broadcast and private channel writes without changing them', async () => {
		const records = [], stream = new ServerStream({ port: 0, bindaddress: '127.0.0.1', disablenodestatic: true, wsdeflate: null });
		if (!stream.server.listening) await require('events').once(stream.server, 'listening');
		try {
			assert.equal(stream.metrics, undefined, 'off by default');
			const sent = [[], [], []];
			for (let i = 0; i < 3; i++) stream.sockets.set(String(i), { write: x => sent[i].push(x), destroy() {} });
			stream.metrics = new SocketMetrics(r => records.push(r), false);
			stream._write('%battle-test\nrogue-battle');
			for (let i = 0; i < 3; i++) stream._write('+battle-test\n' + i);
			stream.roomChannels.set('battle-test', new Map([['1', 1], ['2', 2]]));
			stream._write('>0\n|formats|test');
			stream._write('#battle-test\n>battle-test\n|turn|1');
			stream._write(':battle-test\n>battle-test\n|split|p1\n|-damage|p1a: Hidden|27/100\n|-damage|p1a: Hidden|27%');
			assert(sent[1].join('').includes('27/100')); assert(!sent[0].join('').includes('27/100'));
			const r = stream.metrics.flush();
			const total = Object.values(r.categories).reduce((sum, c) => sum + c.bytes, 0);
			assert.equal(total, sent.flat().reduce((sum, s) => sum + Buffer.byteLength(s), 0));
			assert.equal(r.categories['rogue-battle'].deliveries, 6);
			assert(!JSON.stringify(records).includes('Hidden'));
			const fake = new (require('events').EventEmitter)();
			fake.remoteAddress = '127.0.0.1'; fake.protocol = 'websocket'; fake.headers = {};
			fake.write = value => sent[0].push(value); fake.destroy = () => {};
			stream.onConnection(fake);
			const printed = [], original = console.log;
			try {
				console.log = value => printed.push(value);
				fake.emit('data', '|synthetic-private-marker|' + 'x'.repeat(103000));
			} finally { console.log = original; }
			assert(!JSON.stringify(printed).includes('synthetic-private-marker'));
			assert.equal(stream.metrics.flush().categories.other.deliveries, 1);
		} finally {
			stream.metrics?.close();
			stream.sockets.clear();
			await new Promise(resolve => { stream.server.close(resolve); });
		}
	});
	it('accounts UTF-8 fanout and channel-specific deliveries without retaining payloads', () => {
		const records = [], m = new SocketMetrics(r => records.push(r), false);
		const payload = '>battle-private-id\n|init|battle\n|c|PrivateName|private text 你好';
		m.record(payload, 3, 'rogue-battle', true); m.connection(true); m.connection(false);
		const r = m.flush(), c = r.categories['rogue-battle'];
		assert.equal(c.bytes, Buffer.byteLength(payload) * 3); assert.equal(c.deliveries, 3);
		assert.equal(c.messages, 1); assert.equal(c.broadcastRecipients, 3);
		assert.equal(c.maxBytes, Buffer.byteLength(payload)); assert.equal(c.averageBytes, c.maxBytes);
		assert.equal(c.roomInitializationBytes, c.bytes); assert.equal(r.opened, 1); assert.equal(r.closed, 1);
		assert(!/PrivateName|private-id|你好|private text/.test(JSON.stringify(records)));
		assert.equal(m.flush().categories['rogue-battle'].bytes, 0);
	});
	it('uses a fixed classification vocabulary and ignores zero recipients', () => {
		assert.equal(trafficKind('|formats|public formats'), 'initialization');
		assert.equal(trafficKind('|queryresponse|fantasyroguecodex|{}'), 'metadata');
		assert.equal(trafficKind('|queryresponse|fantasyrogueaction|{}'), 'rogue-state');
		assert.equal(trafficKind('|queryresponse|laddertop|{}'), 'ladder');
		assert.equal(trafficKind('|pm|one|two|text'), 'chat');
		assert.equal(trafficKind('>battle-id\n|turn|1', 'ai-battle'), 'ai-battle');
		assert.equal(trafficKind('|popup|unknown'), 'other');
		const m = new SocketMetrics(() => {}, false); m.record('ignored', 0);
		assert.equal(m.flush().categories.other.messages, 0);
	});
	it('never lets a failed monitoring sink interrupt gameplay', () => {
		const m = new SocketMetrics(() => { throw Error('sink failed'); }, false);
		m.record('|challstr|not-retained'); assert.doesNotThrow(() => m.close());
	});
});
