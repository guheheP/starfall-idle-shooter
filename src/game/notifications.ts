import { rarityRank } from './loot';
import type { GameEvent } from './types';

/** Manual actions are confirmed by their controls; automatic progress and migration still notify. */
export function notificationForEvent(event: GameEvent): { message: string; tone: 'info' | 'warning' | 'success' | 'power' } | null {
  if (!event.message || event.manual || event.kind === 'recovery' || event.message === 'CLEAR') return null;
  if (event.kind === 'loot' && (event.autoSold || !event.item || rarityRank(event.item.rarity) < 2)) return null;
  return { message: event.message, tone: event.kind === 'boss' ? 'warning'
    : event.kind === 'achievement' || event.kind === 'collection' ? 'success' : event.kind === 'loot' ? 'power' : 'info' };
}
