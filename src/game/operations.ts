export type OperationId = 'cruise' | 'sweep' | 'danger';
export interface OperationDefinition {
  id: OperationId; name: string; description: string; unlockWave: number; color: number;
  healthMultiplier: number; extraElites: number; shotInterval: number; bulletSpeed: number; creditMultiplier: number; dropBonus: number;
}
export const OPERATION_NODES: readonly OperationDefinition[] = [
  { id: 'cruise', name: '巡航', description: '通常の航行。宙域の標準条件で戦う', unlockWave: 0, color: 0x6dafff,
    healthMultiplier: 1, extraElites: 0, shotInterval: 1, bulletSpeed: 1, creditMultiplier: 1, dropBonus: 0 },
  { id: 'sweep', name: '精鋭掃討', description: '敵HP +20% / 精鋭 +1 / 射撃間隔 −6% / CR +25% / 装備回収率 +4ポイント', unlockWave: 30, color: 0xffb765,
    healthMultiplier: 1.2, extraElites: 1, shotInterval: 0.94, bulletSpeed: 1, creditMultiplier: 1.25, dropBonus: 0.04 },
  { id: 'danger', name: '危険宙域', description: '敵HP +50% / 精鋭 +2 / 弾速 +10% / 射撃間隔 −10% / CR +55% / 装備回収率 +8ポイント', unlockWave: 50, color: 0xff718c,
    healthMultiplier: 1.5, extraElites: 2, shotInterval: 0.9, bulletSpeed: 1.1, creditMultiplier: 1.55, dropBonus: 0.08 },
];
export const isOperationId = (value: unknown): value is OperationId => OPERATION_NODES.some(node => node.id === value);
export const getOperationDefinition = (id: OperationId): OperationDefinition => OPERATION_NODES.find(node => node.id === id)!;
export function readOperation(value: unknown, bestWave: number): OperationId {
  return isOperationId(value) && bestWave >= getOperationDefinition(value).unlockWave ? value : 'cruise';
}
