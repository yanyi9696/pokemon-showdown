// Note: This is the list of formats
// The rules that formats use are stored in data/rulesets.ts

export const Formats: import('../sim/dex-formats').FormatList = [
	{
		section: "FC",
		column: 1,
	},
	{
		name: "[Gen 9] FC OU",
		mod: 'gen9fantasy',
		ruleset: ['Standard', 'Sleep Moves Clause', '!Sleep Clause Mod', 'Max Level=85'],
		banlist: ['Uber', 'AG', 'Arena Trap', 'Moody', 'Sand Veil', 'Shadow Tag', 'Snow Cloak', 'King\'s Rock', 'Razor Fang', 'Baton Pass', 'Last Respects', 'Shed Tail'],
	},
];
