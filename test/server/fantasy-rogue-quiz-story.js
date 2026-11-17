'use strict';
const assert = require('assert').strict;
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { chooseExpedition, expeditionView } = require('../../dist/server/fantasy-rogue/expedition-events');
const data = createPreviewContent();
function setup(target) {
	const run = { floor: 100, team: [createRoguePokemon(set(), stats(0))], bag: {}, money: 1000, boosts: stats(0),
		phase: 'event', node: { kind: 'event', encounters: [], reward: { money: 0, items: {} },
			event: { id: 'identityquiz', stage: 'choice', expedition: {} } } };
	const account = { captures: {}, unlocked: [] };
	const choose = choice => chooseExpedition(account, run, data, () => 0, choice, undefined,
		{ question: { target, answers: [target.split('-')[0], 'Pikachu', 'Bulbasaur', 'Charmander'] } });
	choose('enter'); return { run, choose };
}
describe('Identity quiz narrative and rewards', () => {
	for (const types of [['Psychic', 'Flying'], ['Water', 'Flying']]) it(`challenges the switched answer after ${types.join('/')}`, () => {
		const { run, choose } = setup('Lugia-Fantasy');
		assert.equal(run.money, 620); assert.equal(expeditionView(run).silhouette, 'Lugia-Fantasy');
		choose('answer:0'); assert.equal(expeditionView(run).options.filter(o => o.id.startsWith('type:')).length, 18);
		assert(expeditionView(run).options[0].name.includes('第一属性'));
		choose('type:' + types[0]); choose('type:' + types[1]); choose('confirmtypes');
		assert.equal(run.node.event.expedition.step, 'fight'); assert(run.node.event.result.join('').includes('来对战吧'));
		assert(expeditionView(run).options.some(o => o.id === 'fight'));
		assert(run.node.event.result[0].includes(types[0] === 'Water' ? '超能' : '水'));
		choose('fight'); assert.equal(run.phase, 'ready'); assert.equal(run.node.encounters.length, 1);
	});
	it('pays the ordinary-name prize once and keeps the wrong-name no-prize result', () => {
		for (const answer of ['answer:0', 'answer:1']) {
			const { run, choose } = setup('Lugia'); choose(answer);
			assert.equal(run.node.event.stage, 'result');
			assert.equal(run.money, answer === 'answer:0' ? 1380 : 620);
			assert.equal(run.bag.superpotion || 0, answer === 'answer:0' ? 2 : 0);
		}
	});
});
