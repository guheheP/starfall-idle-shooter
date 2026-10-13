import type { PartItem, WeaponItem, WeaponRarity } from './types';

type Equipment = Pick<WeaponItem | PartItem, 'level' | 'rarity' | 'enhancement'>;
export const ENHANCEMENT_MAX = 10;
const RANKS: Record<WeaponRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
export function enhancementLevel(item: Pick<Equipment, 'enhancement'>): number {
  return typeof item.enhancement === 'number' && Number.isFinite(item.enhancement)
    ? Math.floor(Math.max(0, Math.min(ENHANCEMENT_MAX, item.enhancement))) : 0;
}
export function enhancementMultiplier(item: Pick<Equipment, 'enhancement'>): number { return 1 + enhancementLevel(item) * 0.05; }
export function getEnhancementCost(item: Equipment): number {
  const current = enhancementLevel(item);
  if (current >= ENHANCEMENT_MAX) return Infinity;
  const level = typeof item.level === 'number' && Number.isFinite(item.level) ? Math.floor(Math.max(1, Math.min(10000, item.level))) : 1;
  return Math.ceil((70 + level * 18) * (1 + (RANKS[item.rarity] ?? 0) * 0.65) * Math.pow(1.6, current));
}

/** Acquisition level and rarity never change, so the paid fees are reproducible from the saved rank. */
export function getEnhancementInvestment(item: Equipment): number {
  let credits = 0;
  for (let level = 0; level < enhancementLevel(item); level++) credits += getEnhancementCost({ ...item, enhancement: level });
  return credits;
}

export function getEnhancementRefund(item: Equipment): number {
  return Math.floor(getEnhancementInvestment(item) * 0.5);
}
