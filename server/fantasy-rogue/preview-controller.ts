import type { RoomBattle } from '../room-battle';
import type { ChoiceRequest } from '../../sim/side';
import { InformationView } from '../fantasy-ai/information';
import { emergencyChoice } from '../fantasy-ai/fallback';

type PreviewRequest = ChoiceRequest & {
	fantasyRogue?: { dragonKing?: ReturnType<typeof import('../../sim/fantasy-rogue-blessings').dragonKingRequest> },
};

/** Plays the player's native simulator seat using only its request and the public battle log. */
export class RoguePreviewController {
	private readonly view = new InformationView({ ownSide: 'p1', difficulty: 'normal' });
	private timer?: ReturnType<typeof setTimeout>;
	private closed = false;
	private rejected: string[] = [];
	private fingerprint = '';
	private readonly battle: RoomBattle;
	constructor(battle: RoomBattle) { this.battle = battle; }
	update(packet: string) { this.view.receiveUpdate(packet); }
	request(request: PreviewRequest, rqid: number) {
		if (this.closed) return;
		if (this.timer) clearTimeout(this.timer);
		const fingerprint = `${this.battle.turn}:${JSON.stringify(request).replace(/"rqid":\d+,?/g, '')}`;
		if (fingerprint !== this.fingerprint) { this.rejected = []; this.fingerprint = fingerprint; }
		this.timer = setTimeout(() => {
			const tracker = this.battle.p1.request;
			if (this.closed || this.battle.ended || tracker.rqid !== rqid || tracker.isWait !== false) return;
			const king = request.fantasyRogue?.dragonKing;
			if (request.wait && !king?.pending) return;
			let choice = 'default';
			try {
				choice = king?.pending ? `rogueking ${king.options[0]} ${king.token}` :
					emergencyChoice(this.view.observe(request), 'gen9fantasyrogue', this.rejected, true);
			} catch { /* Native default is a legal fallback for a stale or incomplete observation. */ }
			tracker.isWait = true;
			tracker.choice = choice;
			void this.battle.stream.write(`>p1 ${choice}`);
		}, 250);
	}
	invalidChoice() {
		const tracker = this.battle.p1.request;
		if (tracker.choice) this.rejected.push(tracker.choice);
		tracker.isWait = false;
		tracker.choice = '';
		if (tracker.request) this.request(JSON.parse(tracker.request), tracker.rqid);
	}
	finish() { this.closed = true; if (this.timer) clearTimeout(this.timer); }
}
