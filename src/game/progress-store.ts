import { Simulation } from './simulation';
import type { GameState } from './types';

export const PROGRESS_SAVE_KEY = 'starfall-idle-save-v1';
export const PROGRESS_ACTIVE_KEY = `${PROGRESS_SAVE_KEY}:active`;
export const INITIAL_RESET_GENERATION = '0';

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProgressSnapshot {
  saved: unknown;
  generation: string;
}

export interface ResetSnapshot extends ProgressSnapshot {
  saved: GameState;
}

export type ResetPreferences = Pick<GameState, 'sound' | 'effects'>;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const validGeneration = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function progressSaveKey(generation: string): string {
  if (!validGeneration(generation)) throw new TypeError('Invalid progress generation');
  return generation === INITIAL_RESET_GENERATION ? PROGRESS_SAVE_KEY
    : `${PROGRESS_SAVE_KEY}:generation:${generation}`;
}

/**
 * A reset prepares a new generation slot, then commits its active pointer with
 * one atomic setItem. Writers only touch their captured generation's slot, so
 * even a check/write race or a pre-feature legacy writer cannot restore old
 * progress into the active save. No cross-tab lock or cleanup is required.
 */
export class ProgressStore {
  constructor(private readonly storage: ProgressStorage,
    private readonly createGeneration: () => string = () => globalThis.crypto.randomUUID()) {}

  read(): ProgressSnapshot {
    const generation = this.currentGeneration();
    const raw = this.storage.getItem(progressSaveKey(generation));
    let saved: unknown;
    try { saved = raw === null ? undefined : JSON.parse(raw); }
    catch { saved = undefined; }
    return { saved, generation };
  }

  isCurrent(generation: string): boolean {
    return this.currentGeneration() === generation;
  }

  private currentGeneration(): string {
    const pointer = this.storage.getItem(PROGRESS_ACTIVE_KEY);
    if (pointer === null) return INITIAL_RESET_GENERATION;
    // A corrupt committed pointer must never resurrect the inactive legacy save.
    if (!validGeneration(pointer) || pointer === INITIAL_RESET_GENERATION)
      throw new TypeError('Invalid active progress generation');
    return pointer;
  }

  /** A stale writer returns false without changing storage or adopting the new token. */
  write(json: string, capturedGeneration: string): boolean {
    if (!this.isCurrent(capturedGeneration)) return false;
    const saved = record(JSON.parse(json));
    if (!saved || saved.version !== 1) throw new TypeError('Expected a v1 progress save');
    this.storage.setItem(progressSaveKey(capturedGeneration), json);
    return this.isCurrent(capturedGeneration);
  }

  /** Invoke only after confirmation; construct the new runtime after this write succeeds. */
  reset(preferences: ResetPreferences, now = Date.now()): ResetSnapshot {
    // Explicitly confirmed reset can repair a corrupt pointer without loading it.
    const currentGeneration = this.storage.getItem(PROGRESS_ACTIVE_KEY);
    const generation = this.createGeneration();
    if (!validGeneration(generation) || generation === currentGeneration || generation === INITIAL_RESET_GENERATION)
      throw new TypeError('A reset requires a new generation');
    const saveKey = progressSaveKey(generation);
    if (this.storage.getItem(saveKey) !== null) throw new TypeError('A reset requires an unused generation');
    const sim = new Simulation(undefined, now);
    if (typeof preferences.sound === 'boolean') sim.state.sound = preferences.sound;
    if (typeof preferences.effects === 'boolean') sim.state.effects = preferences.effects;
    const saved = sim.toSave(now);
    this.storage.setItem(saveKey, JSON.stringify(saved));
    this.storage.setItem(PROGRESS_ACTIVE_KEY, generation);
    return { saved, generation };
  }
}
