import RandomTeams, { type MoveCounter } from '../gen9/teams';

export class RandomGen9FantasyTeams extends RandomTeams {
	override randomSets: { [species: string]: RandomTeamsTypes.RandomSpeciesData } = require('./sets.json');

	override randomSet(
		s: string | Species,
		teamDetails: RandomTeamsTypes.TeamDetails = {},
		isLead = false,
		isDoubles = false
	): RandomTeamsTypes.RandomSet {
		const set = super.randomSet(s, teamDetails, isLead, isDoubles);
		if (set.moves.length > this.maxMoveCount) set.moves = set.moves.slice(0, this.maxMoveCount);
		return set;
	}

	protected getFantasyMegaStone(species: Species): string | undefined {
		for (const item of this.dex.items.all()) {
			if (!item.exists || !item.megaStone) continue;
			const users = item.itemUser || [];
			if (users.includes(species.name) || users.includes(species.baseSpecies)) return item.name;

			const megaEvolves = Array.isArray(item.megaEvolves) ? item.megaEvolves : [item.megaEvolves];
			if (megaEvolves.includes(species.name) || megaEvolves.includes(species.baseSpecies)) return item.name;
		}
	}

	protected validFantasyItem(item: string): string | undefined {
		const data = this.dex.items.get(item);
		return data.exists ? data.name : undefined;
	}

	protected getFantasyItem(
		ability: string,
		moves: Set<string>,
		counter: MoveCounter,
		species: Species,
		role: RandomTeamsTypes.Role,
	): string | undefined {
		const megaStone = this.getFantasyMegaStone(species);
		if (megaStone) return megaStone;

		const moveData = [...moves].map(move => this.dex.moves.get(move));
		if (moveData.some(move => (
			move.exists && move.category !== 'Status' && typeof move.accuracy === 'number' && move.accuracy < 100
		))) {
			return this.validFantasyItem('Fantasy Power Lens');
		}
		if (moveData.some(move => move.flags['shooting'] || move.flags['bullet'])) {
			return this.validFantasyItem('Fantasy Scope Lens');
		}
		if (
			moves.has('willowisp') ||
			moveData.some(move => move.status === 'brn' || move.secondaries?.some(secondary => secondary.status === 'brn'))
		) {
			return this.validFantasyItem('Fantasy Ice Stone');
		}
		if (
			(ability === 'Guts' || moves.has('facade') || moves.has('rest')) &&
			['Bulky Attacker', 'Bulky Setup'].includes(role)
		) {
			return this.validFantasyItem('Fantasy Life Orb');
		}
		if (['Bulky Support', 'Bulky Setup'].includes(role) && species.baseStats.spe <= 75 && counter.get('Status')) {
			return this.validFantasyItem('Fantasy Protector');
		}
		if (['Bulky Attacker', 'Bulky Support'].includes(role) && counter.get('Status')) {
			return this.validFantasyItem('Fantasy Syrupy Apple');
		}
	}

	override getPriorityItem(
		ability: string,
		types: string[],
		moves: Set<string>,
		counter: MoveCounter,
		teamDetails: RandomTeamsTypes.TeamDetails,
		species: Species,
		isLead: boolean,
		isDoubles: boolean,
		teraType: string,
		role: RandomTeamsTypes.Role,
	) {
		if (!isDoubles) {
			const fantasyItem = this.getFantasyItem(ability, moves, counter, species, role);
			if (fantasyItem) return fantasyItem;
		}
		return super.getPriorityItem(ability, types, moves, counter, teamDetails, species, isLead, isDoubles, teraType, role);
	}
}

export default RandomGen9FantasyTeams;
