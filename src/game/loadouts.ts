import type { GameState, ModuleId, PartSlot } from './types';

export type LoadoutSlot = 'one' | 'two' | 'three';
export const LOADOUT_SLOTS: readonly { id: LoadoutSlot; label: string }[] = [
  { id: 'one', label: '構成 1' }, { id: 'two', label: '構成 2' }, { id: 'three', label: '構成 3' },
];
export interface LoadoutPreset {
  name: string;
  weaponId: string;
  parts: Record<PartSlot, string>;
  module: ModuleId;
}
export type LoadoutPresets = Partial<Record<LoadoutSlot, LoadoutPreset>>;
export interface LoadoutSummary {
  slot: LoadoutSlot;
  label: string;
  preset: LoadoutPreset | null;
  missingItems: { slot: 'weapon' | PartSlot; id: string }[];
  moduleLocked: boolean;
  available: boolean;
  equipped: boolean;
}

const PART_SLOTS: readonly PartSlot[] = ['wing', 'body', 'drone'];
const MODULE_IDS: readonly ModuleId[] = ['standard', 'assault', 'bulwark', 'salvager'];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const itemId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,80}$/.test(value);
export const isLoadoutSlot = (value: unknown): value is LoadoutSlot => LOADOUT_SLOTS.some(slot => slot.id === value);
export function loadoutName(value: unknown, fallback: string): string {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return Array.from(name || fallback).slice(0, 20).join('');
}
export const cloneLoadout = (preset: LoadoutPreset): LoadoutPreset => ({ ...preset, parts: { ...preset.parts } });
export function cloneLoadouts(presets: LoadoutPresets): LoadoutPresets {
  const result: LoadoutPresets = {};
  for (const slot of LOADOUT_SLOTS) if (presets[slot.id]) result[slot.id] = cloneLoadout(presets[slot.id]!);
  return result;
}

/** Keep valid missing IDs: a sold item should make the build unavailable, never fabricate gear. */
export function readLoadouts(raw: unknown): LoadoutPresets {
  const data = record(raw), result: LoadoutPresets = {};
  for (const slot of LOADOUT_SLOTS) {
    const preset = record(data[slot.id]), parts = record(preset.parts);
    if (!itemId(preset.weaponId) || !PART_SLOTS.every(part => itemId(parts[part]))
      || !MODULE_IDS.includes(preset.module as ModuleId)) continue;
    result[slot.id] = { name: loadoutName(preset.name, slot.label), weaponId: preset.weaponId,
      parts: { wing: parts.wing as string, body: parts.body as string, drone: parts.drone as string },
      module: preset.module as ModuleId };
  }
  return result;
}

export function loadoutReferences(presets: LoadoutPresets, id: string): string[] {
  return LOADOUT_SLOTS.flatMap(slot => {
    const preset = presets[slot.id];
    return preset && (preset.weaponId === id || PART_SLOTS.some(part => preset.parts[part] === id)) ? [preset.name] : [];
  });
}

/** Read-only checks use the authoritative unlock rules supplied by the simulation. */
export function summarizeLoadouts(state: GameState, modules: readonly { id: ModuleId; unlock: number }[]): LoadoutSummary[] {
  return LOADOUT_SLOTS.map(slot => {
    const preset = state.loadouts[slot.id];
    if (!preset) return { slot: slot.id, label: slot.label, preset: null, missingItems: [], moduleLocked: false, available: false, equipped: false };
    const missingItems: LoadoutSummary['missingItems'] = [];
    if (!state.inventory.some(item => item.id === preset.weaponId)) missingItems.push({ slot: 'weapon', id: preset.weaponId });
    for (const part of PART_SLOTS) if (!state.parts.some(item => item.id === preset.parts[part] && item.slot === part))
      missingItems.push({ slot: part, id: preset.parts[part] });
    const module = modules.find(module => module.id === preset.module);
    const moduleLocked = !module || state.bestWave < module.unlock;
    const available = missingItems.length === 0 && !moduleLocked;
    const equipped = available && state.equippedWeaponId === preset.weaponId && state.module === preset.module
      && PART_SLOTS.every(part => state.equippedParts[part] === preset.parts[part]);
    return { slot: slot.id, label: slot.label, preset: cloneLoadout(preset), missingItems, moduleLocked, available, equipped };
  });
}
