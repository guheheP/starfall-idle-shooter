import { WEAPON_BASES } from '../game/loot';
import { PART_BASES } from '../game/parts';
import type { AffixId, PartAffixId, PartItem, PartSlot, WeaponItem } from '../game/types';

export type ComparisonEquipment = WeaponItem | PartItem;
export type EquipmentEffectChange = 'added' | 'improved' | 'reduced' | 'removed' | 'unchanged';

export interface EquipmentAffixComparisonRow {
  id: AffixId | PartAffixId;
  label: string;
  beforeRaw: number | null;
  afterRaw: number | null;
  before: string;
  after: string;
  status: EquipmentEffectChange;
  note: string;
  effectiveLabel?: string;
  effectiveBefore?: string;
  effectiveAfter?: string;
  effectiveStatus?: EquipmentEffectChange;
}

export interface EquipmentModelDescription {
  id: string;
  name: string;
  description: string;
}

export interface EquipmentEffectComparison {
  kind: 'weapon' | PartSlot;
  rows: EquipmentAffixComparisonRow[];
  model: {
    before: EquipmentModelDescription;
    after: EquipmentModelDescription;
    changed: boolean;
  };
}

interface EffectDefinition {
  label: string;
  note: string;
  scale?: number;
  prefix?: string;
  suffix: string;
  precision?: number;
}

const WEAPON_EFFECTS: Record<AffixId, EffectDefinition> = {
  power: { label: '武器威力', note: '', prefix: '+', suffix: '%' },
  rapid: { label: '連射速度', note: '', prefix: '+', suffix: '%' },
  critical: { label: '会心率', note: '基礎倍率2倍・会心率上限65%', prefix: '+', suffix: '%' },
  pierce: { label: '貫通', note: '固有に加算・最大7体', scale: 1, prefix: '+', suffix: '体', precision: 0 },
  homing: { label: '追尾旋回', note: '固有と高い方を適用', scale: 180 / Math.PI, suffix: '°/秒', precision: 1 },
  explosive: { label: '爆風', note: '威力55%・固有と広い方×装備範囲', scale: 1, suffix: 'px' },
  chain: { label: '電撃連鎖', note: '威力72%ずつ減衰・固有と多い方（最大4体）', scale: 1, suffix: '体', precision: 0 },
  frost: { label: '凍結減速', note: '移動・射撃を2秒減速', suffix: '%' },
  leech: { label: 'シールド吸収', note: '全武装共通：最大シールド3%/秒まで回復', suffix: '%' },
  salvage: { label: '撃墜 CR', note: '武器の撃墜報酬に適用', prefix: '+', suffix: '%' },
};

const PART_EFFECTS: Record<PartAffixId, EffectDefinition> = {
  power: { label: '全武装威力', note: '武器・支援弾に適用', prefix: '+', suffix: '%' },
  rapid: { label: '連射速度', note: '武器・支援弾に適用（支援は2倍まで）', prefix: '+', suffix: '%' },
  critical: { label: '会心率', note: '武器・ストライカードローン共通（上限65%）', prefix: '+', suffix: '%' },
  vitality: { label: 'シールド', note: '', prefix: '+', suffix: '%' },
  regen: { label: 'シールド再生', note: '防衛型の再生補正も適用', scale: 1, prefix: '+', suffix: ' HP/秒' },
  guard: { label: '被ダメージ軽減', note: '装備合計で最大65%', suffix: '%' },
  reach: { label: '爆風・連鎖範囲', note: '既存の範囲を拡張・効果は新規発生しない', prefix: '+', suffix: '%' },
  chilled: { label: '減速中への威力', note: '命中前から減速中の敵に適用', prefix: '+', suffix: '%' },
  cooldown: { label: '必殺技の待ち時間', note: '装備合計55%まで・研究と乗算・最短12秒', prefix: '−', suffix: '%' },
  leech: { label: 'シールド吸収', note: '全武装共通：最大シールド3%/秒まで回復', suffix: '%' },
  salvage: { label: '撃墜 CR', note: '全武装の撃墜・オフライン収入に適用', prefix: '+', suffix: '%' },
};

const isWeapon = (item: ComparisonEquipment): item is WeaponItem => 'type' in item;

function modelDescription(item: ComparisonEquipment): EquipmentModelDescription {
  if (isWeapon(item)) {
    const definition = WEAPON_BASES[item.type];
    if (!definition) throw new RangeError('Unknown weapon model');
    return { id: item.type, name: definition.name, description: definition.description };
  }
  const definition = PART_BASES[item.model];
  if (!definition || definition.slot !== item.slot) throw new RangeError('Part model does not match its slot');
  return { id: item.model, name: definition.name, description: definition.description };
}

function formatValue(value: number, definition: EffectDefinition, precision: number): string {
  const amount = value * (definition.scale ?? 100);
  const rounded = amount.toFixed(precision).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${definition.prefix ?? ''}${rounded}${definition.suffix}`;
}

function formatPair(before: number | null, after: number | null, definition: EffectDefinition): [string, string] {
  let precision = definition.precision ?? 3;
  // A displayed change must not show identical rounded values, especially small leech rolls.
  if (before !== null && after !== null && before !== after) {
    while (precision < 8 && formatValue(before, definition, precision) === formatValue(after, definition, precision)) precision++;
  }
  return [before === null ? 'なし' : formatValue(before, definition, precision),
    after === null ? 'なし' : formatValue(after, definition, precision)];
}

function changeStatus(before: number | null, after: number | null): EquipmentEffectChange {
  if (before === null && after === null) return 'unchanged';
  if (before === null) return 'added';
  if (after === null) return 'removed';
  return after > before ? 'improved' : after < before ? 'reduced' : 'unchanged';
}

function nativeWeaponEffect(item: WeaponItem, id: string): number {
  if (id === 'homing') return item.type === 'missile' ? 2.5 : item.type === 'orbit' ? 1.1 : 0;
  if (id === 'explosive') return item.type === 'missile' ? 65 : 0;
  if (id === 'chain') return item.type === 'arc' ? 2 : 0;
  if (id === 'pierce') return item.type === 'lance' ? 3 : 1;
  return 0;
}

/** Compare raw random effects within the same equipment category; intrinsic model changes stay neutral. */
export function compareEquipmentEffects(candidate: ComparisonEquipment, equipped: ComparisonEquipment): EquipmentEffectComparison {
  const weapon = isWeapon(candidate);
  if (weapon !== isWeapon(equipped) || (!weapon && !isWeapon(equipped) && candidate.slot !== equipped.slot)) {
    throw new RangeError('Equipment comparison requires the same category');
  }
  const beforeModel = modelDescription(equipped), afterModel = modelDescription(candidate);
  const definitions = weapon ? WEAPON_EFFECTS : PART_EFFECTS;
  const beforeAffixes = new Map(equipped.affixes.map(affix => [affix.id, affix.value]));
  const afterAffixes = new Map(candidate.affixes.map(affix => [affix.id, affix.value]));
  const ids = new Set([...afterAffixes.keys(), ...beforeAffixes.keys()]);
  if (isWeapon(candidate) && isWeapon(equipped)) {
    // Native-only effects still have to be shown when switching archetypes.
    for (const id of ['homing', 'explosive', 'chain'] as const) {
      if (nativeWeaponEffect(candidate, id) || nativeWeaponEffect(equipped, id)) ids.add(id);
    }
    if (candidate.type !== equipped.type && (candidate.type === 'lance' || equipped.type === 'lance')) ids.add('pierce');
  }
  const rows = [...ids].map((id): EquipmentAffixComparisonRow => {
    const definition = (definitions as Record<string, EffectDefinition>)[id];
    if (!definition) throw new RangeError('Effect does not belong to this equipment category');
    const beforeRaw = beforeAffixes.get(id) ?? null, afterRaw = afterAffixes.get(id) ?? null;
    const [before, after] = formatPair(beforeRaw, afterRaw, definition);
    // All saved affix values represent positive potency, including cooldown reduction.
    const status = changeStatus(beforeRaw, afterRaw);
    const row: EquipmentAffixComparisonRow = { id, label: definition.label, beforeRaw, afterRaw, before, after, status, note: definition.note };
    if (isWeapon(candidate) && isWeapon(equipped) && ['homing', 'explosive', 'chain', 'pierce'].includes(id)) {
      const beforeNative = nativeWeaponEffect(equipped, id), afterNative = nativeWeaponEffect(candidate, id);
      if (beforeNative || afterNative) {
        const effectiveValue = (raw: number | null, native: number) => {
          const value = id === 'pierce' ? Math.min(7, native + Math.round(raw ?? 0))
            : id === 'chain' ? Math.min(4, Math.max(native, Math.round(raw ?? 0))) : Math.max(native, raw ?? 0);
          return value > 0 ? value : null;
        };
        const effectiveBeforeRaw = effectiveValue(beforeRaw, beforeNative), effectiveAfterRaw = effectiveValue(afterRaw, afterNative);
        const effectiveDefinition = id === 'pierce' ? { ...definition, prefix: '' } : definition;
        [row.effectiveBefore, row.effectiveAfter] = formatPair(effectiveBeforeRaw, effectiveAfterRaw, effectiveDefinition);
        row.effectiveLabel = `${id === 'pierce' ? '貫通到達数' : definition.label}（固有含む）`;
        row.effectiveStatus = changeStatus(effectiveBeforeRaw, effectiveAfterRaw);
        if (beforeRaw !== afterRaw && status !== row.effectiveStatus) {
          row.note = `副次効果 ${before} → ${after}。${definition.note}`;
        }
      }
    }
    return row;
  });
  return {
    kind: weapon ? 'weapon' : candidate.slot,
    rows,
    model: { before: beforeModel, after: afterModel, changed: beforeModel.id !== afterModel.id },
  };
}
