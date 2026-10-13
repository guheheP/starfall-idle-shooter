import { generateWeapon, WEAPON_BASES } from './loot';
import { generatePart, PART_BASES } from './parts';
import type { AffixId, PartAffixId, PartItem, PartModel, PartSlot, WeaponId, WeaponItem } from './types';

export type RequisitionModel = WeaponId | PartModel;
export interface RequisitionProfile {
  readonly model: RequisitionModel;
  readonly name: string;
  readonly category: 'weapon' | PartSlot;
  readonly description: string;
  readonly guaranteedAffix: string;
  readonly guaranteedAffixId: AffixId | PartAffixId;
  readonly unlockWave: number;
}

const profiles: RequisitionProfile[] = [
  { model: 'pulse', name: 'パルス', category: 'weapon', description: '高速の手数と会心を組み合わせる精密射撃。', guaranteedAffix: '会心率', guaranteedAffixId: 'critical', unlockWave: 1 },
  { model: 'spread', name: 'スプレッド', category: 'weapon', description: '広がる散弾に爆風を重ねる範囲攻撃。', guaranteedAffix: '爆風', guaranteedAffixId: 'explosive', unlockWave: 5 },
  { model: 'lance', name: 'ランス', category: 'weapon', description: '貫通ビームで敵を減速し、凍結特効を支える。', guaranteedAffix: '凍結減速', guaranteedAffixId: 'frost', unlockWave: 10 },
  { model: 'missile', name: 'ミサイル', category: 'weapon', description: '誘導弾と爆風でシールド吸収の機会を増やす。', guaranteedAffix: 'シールド吸収', guaranteedAffixId: 'leech', unlockWave: 3 },
  { model: 'arc', name: 'アーク', category: 'weapon', description: '電撃連鎖で敵群を減速し、凍結ビルドをつなぐ。', guaranteedAffix: '凍結減速', guaranteedAffixId: 'frost', unlockWave: 8 },
  { model: 'orbit', name: 'オービット', category: 'weapon', description: '結晶弾から電撃を連鎖させる多段攻撃。', guaranteedAffix: '電撃連鎖', guaranteedAffixId: 'chain', unlockWave: 12 },
  { model: 'focus', name: PART_BASES.focus.name, category: 'wing', description: '会心率を伸ばし、会心武器の長所を磨く。', guaranteedAffix: '会心率', guaranteedAffixId: 'critical', unlockWave: 1 },
  { model: 'velocity', name: PART_BASES.velocity.name, category: 'wing', description: '連射速度を重ね、手数で副次効果を発動する。', guaranteedAffix: '連射速度', guaranteedAffixId: 'rapid', unlockWave: 1 },
  { model: 'cascade', name: PART_BASES.cascade.name, category: 'wing', description: '爆風と電撃の届く範囲をさらに広げる。', guaranteedAffix: '爆風・連鎖範囲', guaranteedAffixId: 'reach', unlockWave: 1 },
  { model: 'bastion', name: PART_BASES.bastion.name, category: 'body', description: '厚い装甲と継続回復でシールドを維持する。', guaranteedAffix: 'シールド再生', guaranteedAffixId: 'regen', unlockWave: 1 },
  { model: 'reactor', name: PART_BASES.reactor.name, category: 'body', description: 'シールドを保ち、全武装の出力を高める。', guaranteedAffix: '全武装威力', guaranteedAffixId: 'power', unlockWave: 1 },
  { model: 'siphon', name: PART_BASES.siphon.name, category: 'body', description: '攻撃によるシールド吸収を補強する。共通回復上限は通常装備と同じ。', guaranteedAffix: 'シールド吸収', guaranteedAffixId: 'leech', unlockWave: 1 },
  { model: 'striker', name: PART_BASES.striker.name, category: 'drone', description: '共有する会心率を高め、支援射撃を強化する。', guaranteedAffix: '会心率', guaranteedAffixId: 'critical', unlockWave: 1 },
  { model: 'frost', name: PART_BASES.frost.name, category: 'drone', description: '減速支援と凍結特効で、凍結中の敵への火力を伸ばす。', guaranteedAffix: '減速中の敵への威力', guaranteedAffixId: 'chilled', unlockWave: 1 },
  { model: 'mender', name: PART_BASES.mender.name, category: 'drone', description: '継続回復を補強し、高シールド条件を維持する。', guaranteedAffix: 'シールド再生', guaranteedAffixId: 'regen', unlockWave: 1 },
];
export const REQUISITION_PROFILES: readonly RequisitionProfile[] = Object.freeze(profiles.map(profile => Object.freeze(profile)));

export function getRequisitionProfile(model: unknown): RequisitionProfile | undefined {
  return REQUISITION_PROFILES.find(profile => profile.model === model);
}
export function isRequisitionModel(value: unknown): value is RequisitionModel {
  return typeof value === 'string' && getRequisitionProfile(value) !== undefined;
}
const finite = (value: number, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export const getRequisitionRarity = (rank: number): 'epic' | 'legendary' =>
  Math.floor(finite(rank, 1, 1, 10)) >= 6 ? 'legendary' : 'epic';

// Only guaranteed ranges are duplicated here; all other affix pools and rolls use the normal generators.
const WEAPON_GUARANTEES: Partial<Record<AffixId, [number, number]>> = {
  critical: [.06, .32], explosive: [55, 115], frost: [.2, .55], leech: [.015, .06], chain: [1, 3],
};
const PART_GUARANTEES: Partial<Record<PartAffixId, [number, number]>> = {
  critical: [.03, .14], rapid: [.06, .24], reach: [.15, .45], regen: [.6, 3], power: [.08, .3], leech: [.01, .035], chilled: [.12, .45],
};
function guaranteedValue(range: [number, number], rng: () => number, integer = false) {
  const amount = range[0] + (range[1] - range[0]) * (.5 + finite(rng(), .5, 0, .999999999) * .25);
  return integer ? Math.round(amount) : Math.round(amount * 1000) / 1000;
}

/** Directed model and one build affix; power, sell value, units and remaining rolls use ordinary equipment rules. */
export function createRequisitionReward(model: RequisitionModel, level: number, rank: number, serial: number,
  rng: () => number = Math.random): WeaponItem | PartItem {
  const profile = getRequisitionProfile(model);
  if (!profile) throw new RangeError('Unknown requisition model');
  const rewardLevel = Math.floor(finite(level, 1, 1, 10000));
  const rewardRank = Math.floor(finite(rank, 1, 1, 10));
  const rarity = getRequisitionRarity(rewardRank), rarityRank = rarity === 'legendary' ? 4 : 3;
  const rarityRoll = rarity === 'legendary' ? .995 : .965;
  let draw = 0, lastRoll = .5;
  const generatorRng = (modelRoll: number) => () => {
    if (draw++ === 0) return rarityRoll;
    if (draw === 2) return modelRoll;
    lastRoll = finite(rng(), .5, 0, .999999999);
    return lastRoll;
  };
  if (profile.category === 'weapon') {
    const weapon = model as WeaponId;
    // The factory remains total for valid models at low levels; unlock gating belongs to the mission claim.
    const generationLevel = Math.max(rewardLevel, WEAPON_BASES[weapon].unlock);
    const pool = (Object.keys(WEAPON_BASES) as WeaponId[]).filter(id => WEAPON_BASES[id].unlock <= generationLevel);
    const item = generateWeapon(generationLevel, serial, generatorRng((pool.indexOf(weapon) + .5) / pool.length));
    const id = profile.guaranteedAffixId as AffixId;
    // When a caller asks for a low-level locked family, preserve the normal power curve at the requested level.
    if (generationLevel !== rewardLevel) item.power = Math.round(Math.min(12,
      (1 + Math.min(rewardLevel - 1, 150) * .032) * (1 + rarityRank * .14) * (.96 + lastRoll * .16)) * 1000) / 1000;
    return { ...item, name: `特注${profile.name} R${rewardRank} #${item.id.slice(5)}`, level: rewardLevel,
      affixes: [{ id, value: guaranteedValue(WEAPON_GUARANTEES[id]!, rng, id === 'chain') },
        ...item.affixes.filter(affix => affix.id !== id)].slice(0, rarityRank),
      locked: true, starter: false, enhancement: 0 };
  }
  const part = model as PartModel;
  const models = Object.keys(PART_BASES) as PartModel[];
  const item = generatePart(rewardLevel, serial, generatorRng((models.indexOf(part) + .5) / models.length));
  const id = profile.guaranteedAffixId as PartAffixId;
  return { ...item, name: `特注${profile.name} R${rewardRank} #${item.id.slice(5)}`,
    affixes: [{ id, value: guaranteedValue(PART_GUARANTEES[id]!, rng) },
      ...item.affixes.filter(affix => affix.id !== id)].slice(0, rarityRank),
    locked: true, starter: false, enhancement: 0 };
}
