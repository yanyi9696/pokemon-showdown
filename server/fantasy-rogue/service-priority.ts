import { toID } from '../../sim/dex';

const PRIORITY_ACCOUNTS = new Set(Array.from({ length: 5 }, (_, i) => `fcrbeta2610190${i + 1}`));
/** Identity is supplied by the authenticated server User, never an action parameter. */
export function rogueServicePriority(user: Pick<User, 'id' | 'named' | 'registered' | 'connected'>) {
	return !!user.named && !!user.registered && !!user.connected && PRIORITY_ACCOUNTS.has(toID(user.id));
}
export const rogueReservedSlots = (maximum: number) => Math.min(5, Math.floor(maximum / 4));
