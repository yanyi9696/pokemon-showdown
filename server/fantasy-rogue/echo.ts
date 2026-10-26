import { ECHO_RULES, ECHO_SYSTEMS, ECHO_TYPES, emptyEchoUpgrades, echoChance, type CollapseEcho } from '../../sim/rogue-echo';
import { ROGUE_STATS } from '../../sim/fantasy-rogue';
import { collapseCount } from '../../sim/rogue-collapse-data';
import type { RogueAccount, RogueRun } from './types';

function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export function echoEligible(run: RogueRun) {
	return run.floor === 200 && typeof run.difficulty === 'number' && run.difficulty >= 1 &&
		!run.difficultyTest && run.collapse?.length === collapseCount(run.difficulty);
}
/** Existing clear evidence unlocks the menu, never retroactively creates currency. */
export function normalizeEcho(account: RogueAccount): CollapseEcho | undefined {
	if (!account.echo && account.difficulties?.cleared.some(tier => /^[1-5]$/.test(tier))) {
		account.echo = { unlocked: true, points: 0, earned: 0, upgrades: emptyEchoUpgrades() };
	}
	return account.echo;
}
export function awardEcho(account: RogueAccount, run: RogueRun) {
	if (!echoEligible(run) || run.echoAwarded !== undefined) return 0;
	const echo = account.echo ||= { unlocked: true, points: 0, earned: 0, upgrades: emptyEchoUpgrades() };
	echo.unlocked = true;
	const points = collapseCount(run.difficulty);
	echo.points += points; echo.earned += points; run.echoAwarded = points;
	(run.notices ||= []).push(`对抗幻想崩坏的力量留下了回响，获得【崩坏适性】×${points}。`);
	return points;
}
export function growthMaxed(account: RogueAccount) { return account.slots >= 6 && ROGUE_STATS.every(stat => account.boosts[stat] >= 10); }
export function buyEcho(account: RogueAccount, key: string) {
	const echo = normalizeEcho(account);
	requireRule(echo?.unlocked, '首次通关 1 档后解锁崩坏回响。');
	requireRule(!account.run || account.run.phase === 'complete', '请结束或放弃本局后，再点亮崩坏回响。');
	if (key === 'exchange') {
		requireRule(growthMaxed(account), '请先将六项局外能力和初始栏位全部升满。');
		requireRule(account.points >= ECHO_RULES.exchange, '兑换需要 100 点局外成长点数。');
		account.points -= ECHO_RULES.exchange; echo.points++; return;
	}
	const [kind, id, extra] = key.split('/'), u = echo.upgrades;
	requireRule(extra === undefined, '回响选项无效。');
	const type = kind === 'type' && Object.prototype.hasOwnProperty.call(ECHO_TYPES, id) && !u.types.includes(id);
	const system = kind === 'system' && Object.prototype.hasOwnProperty.call(ECHO_SYSTEMS, id) && !u.systems.includes(id as keyof typeof ECHO_SYSTEMS);
	const chance = (key === 'shiny' || key === 'catch') && u[key] < ECHO_RULES.chanceCap;
	requireRule(type || system || chance || key === 'guard' && !u.guard, '该回响已达上限或选项无效。');
	const cost = system ? ECHO_RULES.systemCost : ECHO_RULES.cost;
	requireRule(echo.points >= cost, `崩坏适性不足，需要 ${cost} 点。`);
	echo.points -= cost;
	if (type) u.types.push(id);
	else if (system) u.systems.push(id as keyof typeof ECHO_SYSTEMS);
	else if (key === 'shiny' || key === 'catch') u[key]++;
	else u.guard = true;
}
export function echoView(account: RogueAccount) {
	const echo = normalizeEcho(account);
	return echo?.unlocked ? { ...structuredClone(echo), canExchange: growthMaxed(account),
		cost: ECHO_RULES.cost, systemCost: ECHO_RULES.systemCost, exchangeCost: ECHO_RULES.exchange,
		types: ECHO_TYPES, systems: ECHO_SYSTEMS } : undefined;
}
/** Chance inputs use the producer's existing denominator; one RNG draw, no shiny reroll. */
export function rollEchoShiny(run: RogueRun, random: (max: number) => number, numerator: number, denominator = 1000) {
	if (!run.echo?.shiny) return random(denominator) < numerator;
	return random(denominator * 10) < Math.min(denominator * 10, Math.round(numerator * 10 * echoChance(run.echo?.shiny)));
}
export const ECHO_INTRO = [
	{ scene: 'stranger', title: '崩坏回响', speaker: '黑袍老人', text: '“训练家，先等一等。”熟悉的声音从塔顶的白光旁传来。“明知道这条路更难，你还是带着伙伴走到了这里。”' },
	{ scene: 'stranger', title: '崩坏回响', speaker: '黑袍老人', text: '“谢谢你，愿意直面那些失控的幻想。我没什么能替你做的……但你们一路坚持的心意，这座塔不会忘记。”老人轻轻点头，转身走入光中。' },
	{ scene: 'summit', title: '新的力量', text: '他的脚步声消失了。一缕温暖的力量却留在胸口，仿佛伙伴们一路以来的呼唤，此刻终于得到了回应。\n【崩坏回响】已开启。每次通关 1—5 档，获得与本局词条数相同的【崩坏适性】，可在局外点亮永久加成。' },
];
