'use strict';
// Read-only inventory of main-series evolution metadata versus the tower's current gate.
const fs = require('fs');
const {Dex, toID} = require('../dist/sim/dex');
const {createPreviewContent} = require('../dist/server/fantasy-rogue/preview-content');
const {evolutionChildren} = require('../dist/server/fantasy-rogue/evolution');
const {partyEvolutions} = require('../dist/server/fantasy-rogue/party-evolution');
const dex = Dex.mod('gen9'), content = createPreviewContent(), rows = [];
const handled = new Set(['kingambit', 'gholdengo', 'sylveon', 'melmetal']);
for (const parent of dex.species.all().filter(s => s.num > 0 && s.num <= 1025 && !s.battleOnly && !s.isMega)) {
	const mon = {id: 'audit', hp: 1, set: {species: parent.name, gender: parent.gender || 'M', level: 100,
		moves: [], item: '', happiness: 255}};
	const options = partyEvolutions(mon, {floor: 100, bag: {}, money: 0});
	for (const child of evolutionChildren(parent.name)) {
		const special = child.evoType || child.evoCondition || child.evoMove || child.evoRegion ||
			['M', 'F'].includes(child.gender) && parent.gender !== child.gender || ['shedinja', 'melmetal'].includes(child.id);
		if (!special) continue;
		const option = options.find(e => e.species === child.name), gaps = [];
		if (child.evoMove) gaps.push('move-not-checked');
		if (child.evoRegion) gaps.push('regional-location-not-checked');
		if (child.evoType === 'other' && !handled.has(child.id)) gaps.push('special-action-replaced-by-level');
		if (child.evoCondition && !['levelFriendship', 'levelHold', 'useItem'].includes(child.evoType) && !handled.has(child.id)) {
			gaps.push('extra-condition-not-checked');
		}
		if (child.id === 'shedinja') gaps.push('empty-party-slot-and-pokeball-not-checked');
		if (child.id === 'lycanrocdusk') gaps.push('special-rockruff-ability-not-checked');
		if (child.evoItem && ['trade', 'levelHold'].includes(child.evoType)) {
			const item = content.items.find(i => i.id === toID(child.evoItem));
			if (!item || item.shopFloor === false) gaps.push('required-held-item-not-in-regular-shop');
		}
		rows.push({parent: parent.name, child: child.name, originalMetadata: {
			type: child.evoType, level: child.evoLevel, item: child.evoItem, move: child.evoMove,
			condition: child.evoCondition, region: child.evoRegion, gender: child.gender || undefined,
		}, tower: {requirements: option?.requirements.map(r => ({text: r.text, name: r.name})), item: option?.item, heldItem: option?.heldItem},
		status: handled.has(child.id) ? 'explicit-tower-adaptation' : gaps.length ? 'simplified-or-missing' : 'core-condition-supported', gaps});
	}
}
const path = 'docs/playtests/2026-10-21/prepared2/evolution-audit.json';
fs.mkdirSync('docs/playtests/2026-10-21/prepared2', {recursive: true});
fs.writeFileSync(path, JSON.stringify({basis: 'Current local Gen 9 Dex and partyEvolutions. Regional generations may differ; not an official exhaustive evolution guide.', rows}, null, 2));
console.log(JSON.stringify({path, routes: rows.length, supported: rows.filter(r => r.status === 'core-condition-supported').length,
	adaptations: rows.filter(r => r.status === 'explicit-tower-adaptation').length,
	simplified: rows.filter(r => r.status === 'simplified-or-missing').length,
	missingHeldItems: [...new Set(rows.filter(r => r.gaps.includes('required-held-item-not-in-regular-shop')).map(r => r.originalMetadata.item))]}));
