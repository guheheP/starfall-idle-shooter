import type { EliteId, SectorId } from './types';

export interface SectorDefinition {
  id: SectorId; name: string; description: string; color: number; unlockWave: number;
  creditMultiplier: number; enemySpeed: number; shotInterval: number;
  weaponDropChance: number; partDropChance: number;
}
export const SECTORS: readonly SectorDefinition[] = [
  { id: 'frontier', name: '巡航宙域', description: '安定した前線。装備を揃えて先へ進む', color: 0x6dafff, unlockWave: 1,
    creditMultiplier: 1, enemySpeed: 1, shotInterval: 1, weaponDropChance: 0.12, partDropChance: 0.14 },
  { id: 'ion', name: 'イオン星雲', description: '弾速が10%低下 / 射撃間隔 +5% / 獲得CR +6%', color: 0x61e4f0, unlockWave: 15,
    creditMultiplier: 1.06, enemySpeed: 0.9, shotInterval: 1.05, weaponDropChance: 0.13, partDropChance: 0.15 },
  { id: 'wreckage', name: '残骸回廊', description: '射撃間隔 +12% / 獲得CR +15% / 装備回収率が上昇', color: 0xffb765, unlockWave: 30,
    creditMultiplier: 1.15, enemySpeed: 1, shotInterval: 1.12, weaponDropChance: 0.16, partDropChance: 0.18 },
  { id: 'aurora', name: '極光前線', description: '弾速が15%低下 / 射撃間隔 −10% / 獲得CR +25%', color: 0xbb91ff, unlockWave: 50,
    creditMultiplier: 1.25, enemySpeed: 0.85, shotInterval: 0.9, weaponDropChance: 0.18, partDropChance: 0.2 },
  { id: 'void', name: '虚空宙域', description: '弾速 +8% / 射撃間隔 +4% / 獲得CR +40% / 装備回収率が上昇', color: 0x6be5ad, unlockWave: 75,
    creditMultiplier: 1.4, enemySpeed: 1.08, shotInterval: 1.04, weaponDropChance: 0.2, partDropChance: 0.22 },
];
const validWave = (wave: number): number => Number.isFinite(wave) ? Math.max(1, Math.min(10000, Math.floor(wave))) : 1;
export function getSector(wave: number): SectorDefinition {
  const current = validWave(wave);
  return [...SECTORS].reverse().find(sector => current >= sector.unlockWave)!;
}
/** Give early equipment choices time to matter, tapering into the existing W30+ curve. */
export function getWaveScale(wave: number): number {
  const current = validWave(wave);
  return current <= 30 ? Math.pow(1.14, current - 1) * (1 + 1.4 * (30 - current) / 29)
    : Math.pow(1.14, 29) * Math.pow(current / 30, 3.5);
}
/** Fewer opening drops to compare; recovery to normal rates is gradual after W15. */
export function getOpeningDropMultiplier(wave: number): number {
  const current = validWave(wave);
  return current <= 15 ? 0.5 : Math.min(1, 0.5 + (current - 15) / 30);
}
export const ELITES: Record<EliteId, { name: string; color: number; chargeTime: number; healthMultiplier: number; creditMultiplier: number; shotInterval: number }> = {
  vanguard: { name: '精鋭ヴァンガード', color: 0xffa35f, chargeTime: 0.45, healthMultiplier: 1.6, creditMultiplier: 2.5, shotInterval: 2.4 },
  sniper: { name: '精鋭スナイパー', color: 0xff80b8, chargeTime: 0.7, healthMultiplier: 1.6, creditMultiplier: 2.5, shotInterval: 3.6 },
  barrage: { name: '精鋭バラージ', color: 0xb992ff, chargeTime: 0.6, healthMultiplier: 1.6, creditMultiplier: 2.5, shotInterval: 3.1 },
};
