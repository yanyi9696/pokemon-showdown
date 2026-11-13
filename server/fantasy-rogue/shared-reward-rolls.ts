/** One synchronous, atomic shared choice; never attached to a persisted run or account. */
type RewardContext = { rolls: Map<string, unknown>, cursors: Map<string, number>, participants?: readonly object[] };
const contexts = new WeakMap<object, RewardContext>();

export function withSharedRewardRolls<T>(
	owner: object, rolls: Map<string, unknown>, apply: () => T, participants?: readonly object[]
): T {
	const previous = contexts.get(owner);
	contexts.set(owner, { rolls, cursors: new Map(), participants });
	try {
		return apply();
	} finally {
		if (previous) contexts.set(owner, previous);
		else contexts.delete(owner);
	}
}

/** Trusted participants of this common choice; absent for individual follow-up choices. */
export function sharedRewardParticipants<T extends object>(owner: T): readonly T[] {
	return (contexts.get(owner)?.participants || [owner]) as readonly T[];
}

/** Share only the explicitly named reward roll, not unrelated personal battle/growth randomness. */
export function sharedRewardRoll<T>(owner: object, kind: string, draw: () => T): T {
	const context = contexts.get(owner);
	if (!context) return draw();
	const index = context.cursors.get(kind) || 0;
	context.cursors.set(kind, index + 1);
	const key = `${kind}:${index}`;
	if (!context.rolls.has(key)) context.rolls.set(key, structuredClone(draw()));
	return structuredClone(context.rolls.get(key) as T);
}
