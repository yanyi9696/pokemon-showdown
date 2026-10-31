import type { TravellerProfile } from './traveller-profiles';

/** Tower-only meetings: these trainers do not dilute the ordinary travel-event pool. */
export const CHALLENGE_TRAVELLERS: TravellerProfile[] = [
	{ id: 'ingo', name: '北尚', region: '合众', preference: 'battle', areas: ['challenge', 'elite'],
		challengeOnly: true, gifts: [{ id: 'softsand', name: '柔软沙子' }],
		team: ['Excadrill', 'Chandelure', 'Haxorus'],
		greeting: '请确认伙伴状态与前进方向。列车可以停靠，但我们的旅程还远未结束！',
		farewell: '本次同行到站了。感谢您的陪伴，愿下一段旅途也一路平安！',
		thanks: '每次出发前，你都会回头确认伙伴。这份细心，比时刻表更可靠。请收下这份纪念。' },
	{ id: 'emmet', name: '南厦', region: '合众', preference: 'battle', areas: ['challenge', 'wild'],
		challengeOnly: true, gifts: [{ id: 'sharpbeak', name: '锐利鸟嘴' }],
		team: ['Archeops', 'Eelektross', 'Galvantula'],
		greeting: '我是南厦。我喜欢对战。也喜欢看你们配合。下一站，一起走吧。',
		farewell: '我是南厦。这一程，很开心。下次见面，再来对战。一定。',
		thanks: '我是南厦。这份给你。你总能接住伙伴的心意。我很喜欢这样的配合。' },
	{ id: 'palmer', name: '桄榔', region: '神奥', preference: 'battle', areas: ['challenge', 'elite'],
		challengeOnly: true, gifts: [{ id: 'protector', name: '护具' }],
		team: ['Dragonite', 'Milotic', 'Rhyperior'],
		greeting: '哈哈，今天又想到了什么新战术？先让伙伴歇一会儿，咱们慢慢聊！',
		farewell: '我也得回对战塔看看了。别忘了，下回见面，我可要见识你的新本事！',
		thanks: '你能在失利后照样认真听伙伴的声音，这点真不错。这份护具，留给需要它的伙伴吧。' },
	{ id: 'riley', name: '亚玄', region: '神奥', preference: 'pokemon', areas: ['challenge', 'event'],
		challengeOnly: true, gifts: [{ id: 'blackbelt', name: '黑带' }],
		team: ['Lucario', 'Metagross', 'Crobat'],
		greeting: '这里很安静。先听听伙伴的呼吸，再决定下一步吧。你的心意，它们一直都能感受到。',
		farewell: '我要继续自己的修行了。相信你与伙伴的联系，我们还会在路上相遇。',
		thanks: '你没有把伙伴的信任当成理所当然。和你同行，也让我学到很多。这份黑带，请收下。' },
];
