import type { SkillId } from './types';

export type SkillBranch = 'offense' | 'defense' | 'utility';
export type SkillRanks = Partial<Record<SkillId, number>>;
export interface SkillDefinition {
  id: SkillId;
  branch: SkillBranch;
  name: string;
  description: string;
  maxRank: 3;
  baseCost: number;
  unlockWave: number;
  requires?: { id: SkillId; rank: number };
}

export const SKILL_BRANCHES: readonly { id: SkillBranch; name: string; label: string; color: string }[] = [
  { id: 'offense', name: '攻撃系統', label: '攻撃', color: '#59e4ff' },
  { id: 'defense', name: '防御系統', label: '防御', color: '#77e5bd' },
  { id: 'utility', name: '運用系統', label: '運用', color: '#ffd76d' },
];

export const SKILL_NODES: readonly SkillDefinition[] = [
  { id: 'power', branch: 'offense', name: '出力制御', description: '1ランクごとに与ダメージ +6%', maxRank: 3, baseCost: 30_000, unlockWave: 15 },
  { id: 'accuracy', branch: 'offense', name: '照準解析', description: '1ランクごとに会心率 +2% / 会心倍率 +0.12倍', maxRank: 3, baseCost: 120_000, unlockWave: 20, requires: { id: 'power', rank: 2 } },
  { id: 'cryo', branch: 'offense', name: '凍結追撃', description: '減速中の敵への威力を1ランクごとに8%増幅。装備の凍結特効にも乗算', maxRank: 3, baseCost: 360_000, unlockWave: 25, requires: { id: 'accuracy', rank: 1 } },
  { id: 'armor', branch: 'defense', name: '装甲設計', description: '1ランクごとに最大シールド +4%', maxRank: 3, baseCost: 40_000, unlockWave: 15 },
  { id: 'repair', branch: 'defense', name: '自己修復', description: '1ランクごとに最大シールドの0.2%を毎秒回復（最低0.6）。機体の成長に追従', maxRank: 3, baseCost: 110_000, unlockWave: 20, requires: { id: 'armor', rank: 2 } },
  { id: 'stability', branch: 'defense', name: '安定出力', description: 'シールド70%以上で威力を1ランクごとに4%増幅。リアクターの強化にも乗算', maxRank: 3, baseCost: 330_000, unlockWave: 25, requires: { id: 'repair', rank: 1 } },
  { id: 'salvage', branch: 'utility', name: '回収技術', description: '1ランクごとに戦闘・放置の獲得CR +4%', maxRank: 3, baseCost: 35_000, unlockWave: 15 },
  { id: 'cooling', branch: 'utility', name: '冷却回路', description: '1ランクごとにオーバードライブ待機時間 -4%', maxRank: 3, baseCost: 100_000, unlockWave: 20, requires: { id: 'salvage', rank: 2 } },
  { id: 'overdrive', branch: 'utility', name: '持続制御', description: '1ランクごとにオーバードライブ時間 +0.35秒', maxRank: 3, baseCost: 300_000, unlockWave: 25, requires: { id: 'cooling', rank: 1 } },
];

const definitions = new Map(SKILL_NODES.map(node => [node.id, node]));

export function getSkillDefinition(id: SkillId): SkillDefinition {
  const definition = definitions.get(id);
  if (!definition) throw new Error(`Unknown skill: ${String(id)}`);
  return definition;
}

/** Sanitize saved ranks without allowing malformed values to inflate a bonus. */
export function skillRank(skills: SkillRanks, id: SkillId): number {
  const rank = skills?.[id];
  return typeof rank === 'number' && Number.isFinite(rank)
    ? Math.min(getSkillDefinition(id).maxRank, Math.max(0, Math.floor(rank)))
    : 0;
}

export function skillCost(skills: SkillRanks, id: SkillId): number {
  const definition = getSkillDefinition(id);
  const rank = skillRank(skills, id);
  return rank >= definition.maxRank ? Infinity : definition.baseCost * 3 ** rank;
}

/** Currency is deliberately checked by the simulation, separately from tree access. */
export function skillAvailable(skills: SkillRanks, bestWave: number, id: SkillId): boolean {
  const definition = getSkillDefinition(id);
  return Number.isFinite(bestWave)
    && bestWave >= definition.unlockWave
    && skillRank(skills, id) < definition.maxRank
    && (!definition.requires || skillRank(skills, definition.requires.id) >= definition.requires.rank);
}

export interface ResearchBonuses {
  power: number;
  critChance: number;
  critMultiplier: number;
  chilledBonus: number;
  vitality: number;
  regen: number;
  highShieldDamage: number;
  salvage: number;
  cooldown: number;
  overdriveDuration: number;
}

export function getResearchBonuses(skills: SkillRanks): ResearchBonuses {
  return {
    power: skillRank(skills, 'power') * 0.06,
    critChance: skillRank(skills, 'accuracy') * 0.02,
    critMultiplier: skillRank(skills, 'accuracy') * 0.12,
    chilledBonus: skillRank(skills, 'cryo') * 0.08,
    vitality: skillRank(skills, 'armor') * 0.04,
    regen: skillRank(skills, 'repair') * 0.6,
    highShieldDamage: skillRank(skills, 'stability') * 0.04,
    salvage: skillRank(skills, 'salvage') * 0.04,
    cooldown: skillRank(skills, 'cooling') * 0.04,
    overdriveDuration: skillRank(skills, 'overdrive') * 0.35,
  };
}
