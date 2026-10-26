'use strict';

// Read-only aggregate report: never prints user IDs, account payloads or battle teams.
const { collapseEntries } = require('../dist/sim/rogue-collapse-data');
const number = value => Number.isFinite(value) && value > 0 ? value : 0;
const ratio = (a, b) => b ? Math.round(a / b * 10000) / 10000 : null;

function aggregateCollapseHistory(accounts) {
	const tiers = new Map(), combinations = new Map();
	const empty = () => ({ runs: 0, battles: 0, turns: 0, wins: 0, clears: 0 });
	for (const account of accounts) {
		for (const [key, h] of Object.entries(account.collapseHistory || {})) {
			const [rawTier, rawIds, rawVersion] = key.split(':');
			const version = rawVersion ? Number(rawVersion.slice(1)) : 2;
			if (![2, 3, 4].includes(version)) continue;
			const entries = collapseEntries(version), tierKey = `${version}:${rawTier}`;
			const tier = Number(rawTier), ids = (rawIds || '').split(',').sort();
			if (![1, 2, 3, 4, 5].includes(tier) || ids.length !== tier * 2 || new Set(ids).size !== ids.length ||
				ids.some(id => !entries.some(entry => entry.id === id))) continue;
			const tierRow = tiers.get(tierKey) || { ...empty(), tier, version, entries: entries.map(entry =>
				({ id: entry.id, name: entry.name, selections: 0, battlesWithEntry: 0, triggers: 0 })) };
			const canonical = `${tier}:${ids.join(',')}:v${version}`;
			const combination = combinations.get(canonical) || { ...empty(), tier, version, ids };
			for (const field of ['runs', 'battles', 'turns', 'wins', 'clears']) {
				tierRow[field] += number(h[field]); combination[field] += number(h[field]);
			}
			for (const row of tierRow.entries) {
				if (!ids.includes(row.id)) continue;
				row.selections += number(h.selections?.[row.id]);
				row.battlesWithEntry += number(h.battles);
				row.triggers += number(h.triggers?.[row.id]);
			}
			tiers.set(tierKey, tierRow); combinations.set(canonical, combination);
		}
	}
	const rates = row => ({ ...row, averageBattleTurns: ratio(row.turns, row.battles),
		battleWinRate: ratio(row.wins, row.battles), clearsPerStartedRun: ratio(row.clears, row.runs) });
	return {
		notes: [
			'仅统计启用幻想崩坏的新局；比率为 0 至 1，分母为 0 时为 null。',
			'通关数 / 开局数包含尚未结束的局，不能视为完成局胜率。第五档强制全选，选择率不能用于推断强弱。',
			'请结合档位、组合、平均回合和实战记录分析；触发次数是规则结算次数，详见开发文档。',
		],
		tiers: [...tiers.values()].sort((a, b) => a.tier - b.tier).map(row => ({ ...rates(row),
			entries: row.entries.map(entry => ({ ...entry, selectionRate: ratio(entry.selections, row.runs),
				triggerUnit: ['inflation', 'medicine'].includes(entry.id) ? 'resource-action' : 'battle-resolution',
				triggersPerBattle: ['inflation', 'medicine'].includes(entry.id) ? null : ratio(entry.triggers, entry.battlesWithEntry),
				triggersPerRun: ratio(entry.triggers, entry.selections) })),
		})),
		combinations: [...combinations.values()].sort((a, b) => a.tier - b.tier ||
			a.ids.join(',').localeCompare(b.ids.join(','))).map(rates),
	};
}

if (require.main === module) {
	const filename = process.argv[2];
	if (!filename || process.argv.length !== 3) {
		console.error('Usage: node tools/report-rogue-collapse.js <existing-local-database>');
		process.exitCode = 1;
	} else {
		const Database = require('better-sqlite3');
		const db = new Database(filename, { readonly: true, fileMustExist: true });
		try {
			const accounts = db.prepare('SELECT data FROM rogue_accounts').iterate();
			function* values() { for (const row of accounts) yield JSON.parse(row.data); }
			console.log(JSON.stringify(aggregateCollapseHistory(values()), null, 2));
		} finally { db.close(); }
	}
}
module.exports = { aggregateCollapseHistory };
