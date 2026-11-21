/** Optional, bounded, payload-free transport accounting. No identities or raw messages are retained. */
export type TrafficKind = 'initialization' | 'rogue-state' | 'metadata' | 'battle' | 'rogue-battle' |
	'ai-battle' | 'chat' | 'ladder' | 'other';
export type RoomTrafficKind = 'battle' | 'rogue-battle' | 'ai-battle' | 'other';
type Counter = { messages: number, deliveries: number, bytes: number, maxBytes: number, broadcasts: number,
	broadcastRecipients: number, roomInitializationBytes: number, };
const kinds: TrafficKind[] = [
	'initialization', 'rogue-state', 'metadata', 'battle', 'rogue-battle', 'ai-battle', 'chat', 'ladder', 'other',
];

export function trafficKind(message: string, roomKind: RoomTrafficKind = 'other'): TrafficKind {
	// Only inspect the protocol prefix, never parse private JSON or examine chat bodies.
	const offset = message.startsWith('>') ? message.indexOf('\n') + 1 : 0;
	const prefix = message.slice(offset, offset + 96);
	if (prefix.startsWith('|queryresponse|fantasyroguecodex|')) return 'metadata';
	if (prefix.startsWith('|queryresponse|fantasyrogue')) return 'rogue-state';
	if (/^\|(?:formats|challstr|updateuser|customgroups)\|/.test(prefix)) return 'initialization';
	if (/^\|queryresponse\|(?:ladder|laddertop)\|/.test(prefix)) return 'ladder';
	if (roomKind !== 'other') return roomKind;
	if (message.startsWith('>battle-') || /^\|(?:request|init\|battle)\|?/.test(prefix)) return 'battle';
	if (/^\|(?:c|c:|chat|pm)\|/.test(prefix)) return 'chat';
	return 'other';
}

export class SocketMetrics {
	private counters = this.empty();
	private started = Date.now();
	private opened = 0;
	private closed = 0;
	private timer?: NodeJS.Timeout;
	private readonly emit: (record: object) => void;
	constructor(emit: (record: object) => void, automatic = true) {
		this.emit = emit;
		if (automatic) this.timer = setInterval(() => this.flush(), 60_000).unref();
	}
	private empty(): Record<TrafficKind, Counter> {
		return Object.fromEntries(kinds.map(kind => [kind, { messages: 0, deliveries: 0, bytes: 0, maxBytes: 0,
			broadcasts: 0, broadcastRecipients: 0, roomInitializationBytes: 0 }])) as Record<TrafficKind, Counter>;
	}
	connection(open: boolean) { if (open) this.opened++; else this.closed++; }
	record(message: string, recipients = 1, roomKind: RoomTrafficKind = 'other', broadcast = false) {
		if (recipients <= 0) return;
		const counter = this.counters[trafficKind(message, roomKind)];
		const bytes = Buffer.byteLength(message);
		counter.messages++;
		counter.deliveries += recipients;
		counter.bytes += bytes * recipients;
		counter.maxBytes = Math.max(counter.maxBytes, bytes);
		if (broadcast) { counter.broadcasts++; counter.broadcastRecipients += recipients; }
		const offset = message.startsWith('>') ? message.indexOf('\n') + 1 : 0;
		if (message.startsWith('|init|', offset)) counter.roomInitializationBytes += bytes * recipients;
	}
	flush(now = Date.now()) {
		const record = { metric: 'ws-payload-v1', start: this.started, end: now, opened: this.opened, closed: this.closed,
			// Bytes are UTF-8 application payload before SockJS/WebSocket framing or compression.
			categories: Object.fromEntries(kinds.map(kind => [kind, { ...this.counters[kind],
				averageBytes: this.counters[kind].bytes / (this.counters[kind].deliveries || 1) }])) };
		this.counters = this.empty(); this.started = now;
		this.opened = 0; this.closed = 0;
		try { this.emit(record); } catch {} // Monitoring must never break a live send or shutdown.
		return record;
	}
	close() { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.flush(); }
}
