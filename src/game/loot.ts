import type { AffixId, WeaponAffix, WeaponId, WeaponItem, WeaponRarity } from './types';
import { enhancementLevel, getEnhancementRefund } from './enhancement';

export const INVENTORY_CAPACITY = 64;
export const WEAPON_BASES: Record<WeaponId, { name: string; description: string; color: number; unlock: number }> = {
  pulse: { name: 'パルス', description: '高速の二連射で狙い撃つ', color: 0x59e4ff, unlock: 0 },
  spread: { name: 'スプレッド', description: '五方向に広がる散弾', color: 0xffaf62, unlock: 5 },
  lance: { name: 'ランス', description: '装甲を貫く高出力ビーム', color: 0xc79bff, unlock: 10 },
  missile: { name: 'ミサイル', description: '三連誘導弾と爆風', color: 0xff745c, unlock: 3 },
  arc: { name: 'アーク', description: '近くの2体へ連鎖する電撃', color: 0x83b5ff, unlock: 8 },
  orbit: { name: 'オービット', description: '八枚の花弁状結晶を前方へ放つ緩やかな誘導弾', color: 0xffd76d, unlock: 12 },
};
export const RARITIES: { id: WeaponRarity; label: string; color: number; rank: number }[] = [
  { id: 'common', label: 'コモン', color: 0xa9bacb, rank: 0 },
  { id: 'uncommon', label: 'アンコモン', color: 0x6ee5a3, rank: 1 },
  { id: 'rare', label: 'レア', color: 0x69bfff, rank: 2 },
  { id: 'epic', label: 'エピック', color: 0xc79bff, rank: 3 },
  { id: 'legendary', label: 'レジェンダリー', color: 0xffd76d, rank: 4 },
];
const AFFIXES: Record<AffixId, { label: string; min: number; max: number }> = {
  power: { label: '威力', min: 0.12, max: 0.6 }, rapid: { label: '連射速度', min: 0.08, max: 0.38 },
  critical: { label: '会心率', min: 0.06, max: 0.32 }, pierce: { label: '貫通', min: 1, max: 3 },
  homing: { label: '誘導', min: 1.5, max: 4 }, explosive: { label: '爆風', min: 55, max: 115 },
  chain: { label: '電撃連鎖', min: 1, max: 3 }, frost: { label: '凍結減速', min: 0.2, max: 0.55 },
  leech: { label: 'シールド吸収', min: 0.015, max: 0.06 }, salvage: { label: '撃墜 CR', min: 0.15, max: 0.6 },
};
const PREFIXES = ['星屑の', '閃光の', '残響の', '烈火の', '虚空の', '流星の', '雷鳴の', '暁の', '終焉の', '銀河の'];
const finite = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const safeRandom = (rng: () => number): number => finite(rng(), 0.5, 0, 0.999999999);
export const cloneWeapon = (item: WeaponItem): WeaponItem => ({ ...item, affixes: item.affixes.map(affix => ({ ...affix })) });
export const rarityRank = (id: WeaponRarity): number => RARITIES.find(rarity => rarity.id === id)?.rank ?? 0;
export const getWeaponColor = (item: WeaponItem): number => WEAPON_BASES[item.type].color;
export const formatAffixNumber = (value: number, precision = 3): string =>
  value.toFixed(precision).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
export function getAffixText(affix: WeaponAffix): string {
  const definition = AFFIXES[affix.id];
  if (affix.id === 'pierce') return `貫通 +${affix.value}体`;
  if (affix.id === 'chain') return `電撃連鎖 ${affix.value}体（威力72%ずつ減衰）`;
  if (affix.id === 'homing') return `追尾（旋回 ${formatAffixNumber(affix.value * 180 / Math.PI, 1)}°/秒）`;
  if (affix.id === 'explosive') return `爆風 ${formatAffixNumber(affix.value)}px（威力55%）`;
  if (affix.id === 'frost') return `敵を${formatAffixNumber(affix.value * 100)}%減速（2秒）`;
  if (affix.id === 'leech') return `与ダメージの${formatAffixNumber(affix.value * 100)}%を回復（共通上限: シールド3%/秒）`;
  if (affix.id === 'critical') return `会心率 +${formatAffixNumber(affix.value * 100)}%（基礎倍率2倍）`;
  return `${definition.label} +${formatAffixNumber(affix.value * 100)}%`;
}
export function getSellValue(item: WeaponItem): number {
  return Math.floor((12 + item.level * 6) * (1 + rarityRank(item.rarity) * 1.4) * item.power) + getEnhancementRefund(item);
}
export function createStarterWeapon(type: WeaponId, now = 0): WeaponItem {
  return { id: `starter-${type}`, name: `${WEAPON_BASES[type].name} Mk.I`, type, rarity: 'common',
    level: 1, power: 1, affixes: [], locked: true, starter: true, acquiredAt: now, enhancement: 0 };
}
export function generateWeapon(wave: number, serial: number, rng: () => number = Math.random, boss = false, minimumRarity: WeaponRarity = 'common'): WeaponItem {
  const level = Math.floor(finite(wave, 1, 1, 10000));
  const identifier = Math.floor(finite(serial, 1, 1, Number.MAX_SAFE_INTEGER));
  const roll = safeRandom(rng) * 100;
  let rank = roll < 58 ? 0 : roll < 84 ? 1 : roll < 95 ? 2 : roll < 99 ? 3 : 4;
  rank = Math.max(boss ? 2 : 0, rarityRank(minimumRarity), rank);
  const rarity = RARITIES[rank].id;
  const pool = (Object.keys(WEAPON_BASES) as WeaponId[]).filter(type => WEAPON_BASES[type].unlock <= level);
  const type = pool[Math.floor(safeRandom(rng) * pool.length)];
  // Do not roll a weaker duplicate of an archetype's built-in trait.
  const affixPool = (Object.keys(AFFIXES) as AffixId[]).filter(id =>
    !(type === 'missile' && (id === 'homing' || id === 'explosive')) && !(type === 'arc' && id === 'chain'));
  const affixes: WeaponAffix[] = [];
  for (let i = 0; i < rank; i++) {
    const id = affixPool.splice(Math.floor(safeRandom(rng) * affixPool.length), 1)[0];
    const definition = AFFIXES[id];
    let value = definition.min + (definition.max - definition.min) * safeRandom(rng);
    value = id === 'pierce' || id === 'chain' ? Math.round(value) : Math.round(value * 1000) / 1000;
    affixes.push({ id, value });
  }
  const prefix = PREFIXES[Math.floor(safeRandom(rng) * PREFIXES.length)];
  const power = Math.min(12, (1 + Math.min(level - 1, 150) * 0.032) * (1 + rank * 0.14) * (0.96 + safeRandom(rng) * 0.16));
  return { id: `loot-${identifier}`, name: `${prefix}${WEAPON_BASES[type].name} #${identifier}`, type, rarity,
    level, power: Math.round(power * 1000) / 1000, affixes, locked: false, starter: false, acquiredAt: 0, enhancement: 0 };
}
export function validateWeaponItem(value: unknown): WeaponItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.id !== 'string' || !/^[\w-]{1,80}$/.test(data.id)) return null;
  if (typeof data.type !== 'string' || !Object.hasOwn(WEAPON_BASES, data.type)) return null;
  const type = data.type as WeaponId;
  // Fallback equipment owns these IDs; another kind or weapon type must not impersonate it.
  if (data.id.startsWith('starter-') && data.id !== `starter-${type}`) return null;
  if (!RARITIES.some(rarity => rarity.id === data.rarity)) return null;
  const rarity = data.rarity as WeaponRarity;
  const affixes: WeaponAffix[] = [];
  if (Array.isArray(data.affixes) && rarityRank(rarity) > 0) {
    for (const value of data.affixes) {
      if (!value || typeof value !== 'object') continue;
      const affix = value as Record<string, unknown>;
      if (typeof affix.id !== 'string' || !Object.hasOwn(AFFIXES, affix.id) || affixes.some(item => item.id === affix.id)) continue;
      const id = affix.id as AffixId;
      const definition = AFFIXES[id];
      let amount = finite(affix.value, definition.min, definition.min, definition.max);
      if (id === 'pierce' || id === 'chain') amount = Math.round(amount);
      affixes.push({ id, value: amount });
      if (affixes.length >= rarityRank(rarity)) break;
    }
  }
  const starter = data.starter === true && data.id === `starter-${type}`;
  return { id: data.id, name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 80) : `${WEAPON_BASES[type].name} #${data.id}`,
    type, rarity: starter ? 'common' : rarity, level: starter ? 1 : Math.floor(finite(data.level, 1, 1, 10000)),
    power: starter ? 1 : finite(data.power, 1, 0.5, 12), affixes: starter ? [] : affixes,
    locked: starter || data.locked === true, starter, acquiredAt: finite(data.acquiredAt, 0, 0, Number.MAX_SAFE_INTEGER),
    enhancement: enhancementLevel({ enhancement: data.enhancement as number | undefined }) };
}
