import type { PartAffix, PartAffixId, PartItem, PartModel, PartSlot, WeaponRarity } from './types';
import { RARITIES, rarityRank, formatAffixNumber } from './loot';
import { enhancementLevel, getEnhancementRefund } from './enhancement';

export const PART_CAPACITY = 64;
export const PART_SLOTS: { id: PartSlot; label: string }[] = [
  { id: 'wing', label: 'ウイング' }, { id: 'body', label: 'ボディ' }, { id: 'drone', label: 'ドローン' },
];
export const PART_BASES: Record<PartModel, { slot: PartSlot; name: string; description: string; color: number }> = {
  focus: { slot: 'wing', name: 'フォーカスウイング', description: '会心率と会心倍率を強化。会心武器と好相性', color: 0xffdc79 },
  velocity: { slot: 'wing', name: 'ベロシティウイング', description: '連射と移動を加速。手数で副次効果を発動', color: 0x69e0ff },
  cascade: { slot: 'wing', name: 'カスケードウイング', description: '爆風・連鎖範囲を拡張。連鎖弾・貫通弾は到達先が1体増加', color: 0xbf8bff },
  bastion: { slot: 'body', name: 'バスティオン装甲', description: '厚いシールド、被ダメージ軽減、自然再生', color: 0x85b8ff },
  reactor: { slot: 'body', name: 'リアクターコア', description: 'シールド70%以上で火力増幅。回復装備と好相性', color: 0xff986a },
  siphon: { slot: 'body', name: 'サイフォンフレーム', description: '与ダメージからシールドを吸収。全武装合計で毎秒最大シールド3%', color: 0xa4e696 },
  striker: { slot: 'drone', name: 'ストライカードローン', description: '高威力の支援射撃。機体の会心率と会心倍率を共有', color: 0xffb05e },
  frost: { slot: 'drone', name: 'フロストドローン', description: '支援弾で敵を凍結減速。凍結特効と好相性', color: 0x8febff },
  mender: { slot: 'drone', name: 'メンダードローン', description: '支援射撃と継続回復でシールドを維持', color: 0x70edae },
};
const PART_AFFIXES: Record<PartAffixId, { label: string; min: number; max: number }> = {
  power: { label: '全武装威力', min: 0.08, max: 0.3 }, rapid: { label: '連射速度', min: 0.06, max: 0.24 },
  critical: { label: '会心率', min: 0.03, max: 0.14 }, vitality: { label: 'シールド', min: 0.1, max: 0.4 },
  regen: { label: 'シールド再生', min: 0.6, max: 3 }, guard: { label: '被ダメージ軽減', min: 0.04, max: 0.14 },
  reach: { label: '爆風・連鎖範囲', min: 0.15, max: 0.45 }, chilled: { label: '減速中の敵への威力', min: 0.12, max: 0.45 },
  cooldown: { label: '必殺技の待ち時間', min: 0.05, max: 0.18 }, leech: { label: 'シールド吸収', min: 0.01, max: 0.035 },
  salvage: { label: '撃墜 CR', min: 0.12, max: 0.4 },
};
const finite = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const random = (rng: () => number) => finite(rng(), 0.5, 0, 0.999999999);
export const clonePart = (item: PartItem): PartItem => ({ ...item, affixes: item.affixes.map(affix => ({ ...affix })) });
export const partAffixValue = (item: PartItem, id: PartAffixId): number => item.affixes.find(affix => affix.id === id)?.value ?? 0;
export function getPartAffixText(affix: PartAffix): string {
  const label = PART_AFFIXES[affix.id].label;
  if (affix.id === 'regen') return `${label} +${formatAffixNumber(affix.value)} HP/秒`;
  if (affix.id === 'leech') return `与ダメージの${formatAffixNumber(affix.value * 100)}%を回復（共通上限: シールド3%/秒）`;
  if (affix.id === 'cooldown') return `${label} −${formatAffixNumber(affix.value * 100)}%`;
  return `${label} +${formatAffixNumber(affix.value * 100)}%`;
}
export function getPartSellValue(item: PartItem): number {
  return Math.floor((18 + item.level * 7) * (1 + rarityRank(item.rarity) * 1.4) * item.power * (item.slot === 'drone' ? 1 + (item.units - 1) * 0.15 : 1)) + getEnhancementRefund(item);
}
export function createStarterPart(slot: PartSlot, now = 0, power = 1, units = 1): PartItem {
  const model: PartModel = slot === 'wing' ? 'focus' : slot === 'body' ? 'bastion' : 'striker';
  return { id: `starter-${slot}`, name: `${PART_BASES[model].name} Mk.I`, slot, model, rarity: 'common',
    level: 1, power: finite(power, 1, 0.5, 12), units: slot === 'drone' ? Math.floor(finite(units, 1, 1, 4)) : 1,
    affixes: [], locked: true, starter: true, acquiredAt: now, enhancement: 0 };
}
export function generatePart(wave: number, serial: number, rng: () => number = Math.random, boss = false, minimumRarity: WeaponRarity = 'common'): PartItem {
  const level = Math.floor(finite(wave, 1, 1, 10000));
  const identifier = Math.floor(finite(serial, 1, 1, Number.MAX_SAFE_INTEGER));
  const roll = random(rng) * 100;
  const rank = Math.max(boss ? 2 : 0, rarityRank(minimumRarity), roll < 58 ? 0 : roll < 84 ? 1 : roll < 95 ? 2 : roll < 99 ? 3 : 4);
  const model = (Object.keys(PART_BASES) as PartModel[])[Math.floor(random(rng) * 9)];
  const slot = PART_BASES[model].slot;
  const pool = Object.keys(PART_AFFIXES) as PartAffixId[];
  const affixes: PartAffix[] = [];
  for (let index = 0; index < rank; index++) {
    const id = pool.splice(Math.floor(random(rng) * pool.length), 1)[0];
    const definition = PART_AFFIXES[id];
    affixes.push({ id, value: Math.round((definition.min + (definition.max - definition.min) * random(rng)) * 1000) / 1000 });
  }
  const power = Math.min(12, (1 + Math.min(level - 1, 120) * 0.045) * (1 + rank * 0.18) * (0.94 + random(rng) * 0.16));
  const prefix = ['星屑の', '閃光の', '黎明の', '銀河の', '虚空の'][Math.floor(random(rng) * 5)];
  return { id: `part-${identifier}`, name: `${prefix}${PART_BASES[model].name} #${identifier}`, slot, model,
    rarity: RARITIES[rank].id, level, power: Math.round(power * 1000) / 1000,
    units: slot === 'drone' ? Math.min(4, 1 + Math.floor((level - 1) / 8) + (rank >= 3 ? 1 : 0)) : 1,
    affixes, locked: false, starter: false, acquiredAt: 0, enhancement: 0 };
}
export function validatePartItem(value: unknown): PartItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.id !== 'string' || !/^[\w-]{1,80}$/.test(data.id)) return null;
  if (typeof data.model !== 'string' || !Object.hasOwn(PART_BASES, data.model)) return null;
  const model = data.model as PartModel;
  if (data.slot !== PART_BASES[model].slot || !RARITIES.some(rarity => rarity.id === data.rarity)) return null;
  const slot = data.slot as PartSlot, rarity = data.rarity as WeaponRarity;
  // Missing slots are restored with these IDs, so reserve them for their corresponding part slot.
  if (data.id.startsWith('starter-') && data.id !== `starter-${slot}`) return null;
  const starter = data.starter === true && data.id === `starter-${slot}`;
  const affixes: PartAffix[] = [];
  if (!starter && Array.isArray(data.affixes) && rarityRank(rarity)) for (const raw of data.affixes) {
    if (!raw || typeof raw !== 'object') continue;
    const affix = raw as Record<string, unknown>;
    if (typeof affix.id !== 'string' || !Object.hasOwn(PART_AFFIXES, affix.id) || affixes.some(value => value.id === affix.id)) continue;
    const id = affix.id as PartAffixId, definition = PART_AFFIXES[id];
    affixes.push({ id, value: finite(affix.value, definition.min, definition.min, definition.max) });
    if (affixes.length >= rarityRank(rarity)) break;
  }
  return { id: data.id, name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 80) : PART_BASES[model].name,
    slot, model, rarity: starter ? 'common' : rarity, level: Math.floor(finite(data.level, 1, 1, 10000)),
    power: finite(data.power, 1, 0.5, 12), units: slot === 'drone' ? Math.floor(finite(data.units, 1, 1, 4)) : 1,
    affixes, starter, locked: starter || data.locked === true, acquiredAt: finite(data.acquiredAt, 0, 0, Number.MAX_SAFE_INTEGER),
    enhancement: enhancementLevel({ enhancement: data.enhancement as number | undefined }) };
}
