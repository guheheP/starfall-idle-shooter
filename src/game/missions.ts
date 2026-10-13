import type { WeaponId, WeaponRarity } from './types';
import { WEAPON_BASES } from './loot';

export type MissionId = 'kills' | 'elites' | 'bosses' | 'waves' | 'chilled' | 'high-shield' | `weapon-${WeaponId}`;
export interface MissionDefinition {
  id: MissionId; name: string; description: string; baseTarget: number; unlockWave: number; weapon?: WeaponId;
}
export interface MissionState {
  active: MissionId | null;
  progress: Partial<Record<MissionId, number>>;
  completions: Partial<Record<MissionId, number>>;
}
export interface MissionSummary extends MissionDefinition {
  rank: number; completions: number; progress: number; target: number;
  unlocked: boolean; active: boolean; ready: boolean; rewardRarity: WeaponRarity;
}
export const MISSION_NODES: readonly MissionDefinition[] = [
  { id: 'kills', name: '前線制圧', description: '通常敵を撃破する（精鋭・旗艦を除く）', baseTarget: 120, unlockWave: 15 },
  { id: 'elites', name: '精鋭討伐', description: '精鋭を撃破する', baseTarget: 5, unlockWave: 20 },
  { id: 'bosses', name: '旗艦追撃', description: '旗艦を撃破する', baseTarget: 3, unlockWave: 15 },
  { id: 'waves', name: '航路開拓', description: 'WAVEをクリアする', baseTarget: 8, unlockWave: 15 },
  { id: 'chilled', name: '凍結包囲', description: 'すでに凍結している敵を撃破する', baseTarget: 30, unlockWave: 20 },
  { id: 'high-shield', name: '安定戦線', description: 'シールド70%以上の状態で敵を撃破する', baseTarget: 80, unlockWave: 20 },
  ...(['pulse', 'spread', 'lance', 'missile', 'arc', 'orbit'] as const).map(weapon => ({
    id: `weapon-${weapon}` as MissionId, name: `${WEAPON_BASES[weapon].name}実戦`,
    description: `${WEAPON_BASES[weapon].name}の主武装で撃破する（ドローンを除く）`,
    baseTarget: 60, unlockWave: weapon === 'orbit' ? 30 : weapon === 'missile' || weapon === 'arc' ? 20 : 15, weapon,
  })),
];
const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.floor(Math.max(0, Math.min(1e9, value))) : 0;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const isMissionId = (value: unknown): value is MissionId => MISSION_NODES.some(node => node.id === value);
export const createMissions = (): MissionState => ({ active: null, progress: {}, completions: {} });
export const cloneMissions = (state: MissionState): MissionState => ({ active: state.active, progress: { ...state.progress }, completions: { ...state.completions } });
export const getMissionRank = (completions: number): number => 1 + Math.min(9, count(completions));
export const getMissionTarget = (node: MissionDefinition, rank: number): number => node.baseTarget + Math.ceil(node.baseTarget * 0.2) * Math.min(9, Math.max(0, count(rank) - 1));
export const getMissionRewardLevel = (bestWave: number, rank: number): number => Math.min(10000, Math.max(1, count(bestWave) + 2 * Math.min(9, Math.max(0, count(rank) - 1))));

export function readMissions(raw: unknown, bestWave: number): MissionState {
  const data = record(raw), progress = record(data.progress), completions = record(data.completions), result = createMissions();
  for (const node of MISSION_NODES) {
    const completed = count(completions[node.id]);
    if (completed) result.completions[node.id] = completed;
    const current = Math.min(getMissionTarget(node, getMissionRank(completed)), count(progress[node.id]));
    if (current) result.progress[node.id] = current;
  }
  if (isMissionId(data.active) && bestWave >= MISSION_NODES.find(node => node.id === data.active)!.unlockWave) result.active = data.active;
  return result;
}
export function summarizeMissions(state: MissionState, bestWave: number): MissionSummary[] {
  return MISSION_NODES.map(node => {
    const completions = count(state.completions[node.id]), rank = getMissionRank(completions), target = getMissionTarget(node, rank);
    const progress = Math.min(target, count(state.progress[node.id])), unlocked = bestWave >= node.unlockWave;
    return { ...node, rank, completions, progress, target, unlocked, active: state.active === node.id,
      ready: unlocked && progress >= target, rewardRarity: rank >= 6 ? 'legendary' : 'epic' };
  });
}
