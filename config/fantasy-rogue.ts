import type { RogueContent } from '../server/fantasy-rogue/types';
import { createPreviewContent } from '../server/fantasy-rogue/preview-content';

/** Owner-authorized playtest pack. Replace with a new content version for the final release. */
export const FantasyRogueContent: RogueContent | null = createPreviewContent();
