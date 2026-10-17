'use strict';
// Run after `node build`; exports exactly the text supplied to the local codex.
const fs = require('fs');
const path = require('path');
const {rogueCodex} = require('../dist/server/fantasy-rogue/codex');
const {ROGUE_BLESSINGS, STAGED_BLESSING_FAMILIES} = require('../dist/sim/rogue-blessing-data');
const entries = rogueCodex(undefined, 'blessings', true).entries;
const tiers = {silver: '白银', gold: '黄金', prismatic: '棱彩'};
const text = [
	'# 幻想杯肉鸽 · 祝福展示文本', '',
	`当前共有 ${ROGUE_BLESSINGS.length} 个独立选项。${STAGED_BLESSING_FAMILIES.length} 个系列有四阶段版本，图鉴合计展示 ${entries.length} 条。`, '',
	'按名称拼音首字母排列；英文名按首字母排列。基础版、+、++、+++ 分别对应第 1、50、100、150 层。出现楼层单独标注，不混入效果正文。', '',
	'此清单与游戏内图鉴使用同一数据来源。未取得过的祝福在正式图鉴中仍只显示名字与“？？？”；本地预览完整显示。', '',
	...entries.flatMap(entry => [
		`## ${entry.name} · ${tiers[entry.tier]}`, '',
		...(entry.floors?.length ? [`出现楼层：${entry.floors.join('、')} 层。`, ''] : []),
		entry.text, '',
	]),
].join('\n');
const target = path.resolve(__dirname, '../FANTASY-ROGUE-BLESSING-TEXTS.md');
fs.writeFileSync(target, text);
console.log(`Exported ${entries.length} entries to ${target}`);
