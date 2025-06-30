import {ModdedSpeciesFormatsData as OriginalFormatsData} from '../../../sim/dex-species';

export interface FantasySpeciesFormatsData extends OriginalFormatsData {
	abilities?: {
		0: string;
	};
}
