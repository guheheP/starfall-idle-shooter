import type { CollectionState, PartItem, PartModel, WeaponId, WeaponItem, WeaponRarity } from './types';
import { RARITIES, WEAPON_BASES } from './loot';
import { PART_BASES } from './parts';

export interface CollectionMilestone { id: string; name: string; description: string; current: number; target: number; reward: number; claimed: boolean; }
export const createCollection = (): CollectionState => ({ weapons: {}, parts: {}, rarities: {}, elites: 0, bosses: 0, claimed: [] });
export const cloneCollection = (value: CollectionState): CollectionState => ({ ...value, weapons: { ...value.weapons }, parts: { ...value.parts },
  rarities: { ...value.rarities }, claimed: [...value.claimed] });
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.floor(Math.max(0, Math.min(1e9, value))) : 0;
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function collectionSummary(value: CollectionState) {
  return { weaponsFound: Object.keys(WEAPON_BASES).filter(id => (value.weapons[id as WeaponId] ?? 0) > 0).length, weaponTotal: 6,
    partsFound: Object.keys(PART_BASES).filter(id => (value.parts[id as PartModel] ?? 0) > 0).length, partTotal: 9,
    raritiesFound: RARITIES.filter(rarity => (value.rarities[rarity.id] ?? 0) > 0).length, rarityTotal: 5,
    elites: value.elites, bosses: value.bosses };
}
export function collectionMilestones(value: CollectionState, bestWave: number): CollectionMilestone[] {
  const summary = collectionSummary(value);
  const weaponAcquisitions = (Object.keys(WEAPON_BASES) as WeaponId[]).reduce((total, id) => total + count(value.weapons[id]), 0);
  const partAcquisitions = (Object.keys(PART_BASES) as PartModel[]).reduce((total, id) => total + count(value.parts[id]), 0);
  const make = (id: string, name: string, description: string, current: number, target: number, reward: number) =>
    ({ id, name, description, current: Math.min(target, count(current)), target, reward, claimed: value.claimed.includes(id) });
  return [
    make('weapon-families', '武装コレクター', '全6系統の武器を発見', summary.weaponsFound, 6, 1800),
    make('part-models', '機体設計士', '全9モデルのパーツを発見', summary.partsFound, 9, 2400),
    make('all-rarities', '星の輝き', '全5レア度の装備を発見', summary.raritiesFound, 5, 1800),
    make('first-legendary', '伝説との遭遇', 'レジェンダリー装備を初めて取得', value.rarities.legendary ?? 0, 1, 1500),
    make('elite-hunter', '精鋭ハンター', '精鋭を25機撃破', value.elites, 25, 1500),
    make('wave-30', '残骸回廊の先へ', 'WAVE 30を突破', bestWave, 30, 1500),
    make('wave-50', '極光を越えて', 'WAVE 50を突破', bestWave, 50, 3000),
    make('wave-100', '虚空の征服者', 'WAVE 100を突破', bestWave, 100, 8000),
    make('elite-100', '精鋭追撃隊', '精鋭を100機撃破', value.elites, 100, 8000),
    make('elite-500', '精鋭の天敵', '精鋭を500機撃破', value.elites, 500, 30000),
    make('boss-25', '旗艦狩り', 'ボスを25機撃破', value.bosses, 25, 10000),
    make('boss-100', '星域の守護者', 'ボスを100機撃破', value.bosses, 100, 40000),
    make('epic-100', '希少装備の探究者', 'エピック装備を100個取得', value.rarities.epic ?? 0, 100, 10000),
    make('legendary-10', '伝説を追う者', 'レジェンダリー装備を10個取得', value.rarities.legendary ?? 0, 10, 30000),
    make('legendary-50', '銀河の宝庫', 'レジェンダリー装備を50個取得', value.rarities.legendary ?? 0, 50, 100000),
    make('weapons-100', '武器工廠', '武器を合計100個取得（自動売却分も含む）', weaponAcquisitions, 100, 5000),
    make('weapons-500', '武装の研究家', '武器を合計500個取得（自動売却分も含む）', weaponAcquisitions, 500, 18000),
    make('parts-100', 'パーツ倉庫', 'パーツを合計100個取得（自動売却分も含む）', partAcquisitions, 100, 6500),
    make('parts-500', '設計図の収集家', 'パーツを合計500個取得（自動売却分も含む）', partAcquisitions, 500, 24000),
    make('wave-75', '虚空への航路', 'WAVE 75を突破', bestWave, 75, 5000),
    make('wave-150', '深宇宙探査', 'WAVE 150を突破', bestWave, 150, 30000),
    make('wave-200', '果てなき星海', 'WAVE 200を突破', bestWave, 200, 60000),
  ];
}
export function readCollection(raw: unknown): CollectionState {
  const data = asRecord(raw), result = createCollection();
  const weapons = asRecord(data.weapons), parts = asRecord(data.parts), rarities = asRecord(data.rarities);
  for (const id of Object.keys(WEAPON_BASES) as WeaponId[]) if (count(weapons[id]) > 0) result.weapons[id] = count(weapons[id]);
  for (const id of Object.keys(PART_BASES) as PartModel[]) if (count(parts[id]) > 0) result.parts[id] = count(parts[id]);
  for (const rarity of RARITIES) if (count(rarities[rarity.id]) > 0) result.rarities[rarity.id] = count(rarities[rarity.id]);
  result.elites = count(data.elites); result.bosses = count(data.bosses);
  const known = collectionMilestones(result, 0).map(milestone => milestone.id);
  const claimed = Array.isArray(data.claimed) ? data.claimed : [];
  result.claimed = known.filter(id => claimed.includes(id));
  return result;
}
/** Discovery records follow actual acquisitions, including drops sold by the player's policy. */
export function recordCollectionLoot(value: CollectionState, item: WeaponItem | PartItem): boolean {
  if (item.starter) return false;
  let first = false;
  if ('slot' in item) { first = !value.parts[item.model]; value.parts[item.model] = Math.min(1e9, (value.parts[item.model] ?? 0) + 1); }
  else { first = !value.weapons[item.type]; value.weapons[item.type] = Math.min(1e9, (value.weapons[item.type] ?? 0) + 1); }
  first ||= !value.rarities[item.rarity];
  value.rarities[item.rarity] = Math.min(1e9, (value.rarities[item.rarity] ?? 0) + 1);
  return first;
}
