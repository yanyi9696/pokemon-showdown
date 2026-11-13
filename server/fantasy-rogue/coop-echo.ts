import { emptyEchoUpgrades, type EchoUpgrades } from '../../sim/rogue-echo';

/** Shared encounters use the larger opening snapshot, without sharing personal combat upgrades. */
export function sharedShinyEcho(owners: readonly { echo?: EchoUpgrades }[]): EchoUpgrades {
	return { ...emptyEchoUpgrades(), shiny: Math.max(0, ...owners.map(owner => owner.echo?.shiny || 0)) };
}
