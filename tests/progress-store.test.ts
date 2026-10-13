import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressStore, PROGRESS_SAVE_KEY, PROGRESS_ACTIVE_KEY, INITIAL_RESET_GENERATION,
  progressSaveKey, type ProgressStorage } from '../src/game/progress-store';
import { Simulation } from '../src/game/simulation';
import { SaveSession } from '../src/game/session';
import { generateWeapon } from '../src/game/loot';
import { generatePart } from '../src/game/parts';
import type { GameState } from '../src/game/types';

const NOW = 1_800_000_000_000;
const fresh = (now = NOW): GameState => new Simulation(undefined, now).toSave(now);

class MemoryStorage implements ProgressStorage {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];
  failReads = false;
  failWrites = false;
  failKeys = new Set<string>();
  onGet: ((key: string) => void) | null = null;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('Storage access denied');
    const value = this.values.get(key) ?? null;
    this.onGet?.(key);
    return value;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites || this.failKeys.has(key)) throw new Error('Storage quota exceeded');
    this.values.set(key, value);
    this.writes.push(key);
  }
}

function progressed(): GameState {
  const state = fresh(NOW - 24 * 60 * 60 * 1000);
  Object.assign(state, { credits: 90000, totalCredits: 100000, kills: 500, totalKills: 1200,
    wave: 41, bestWave: 40, runs: 3, cores: 80, autopilot: false, sound: true, effects: false,
    weapon: 'missile', module: 'salvager', autoSellRarity: 'rare', lootSerial: 50,
    operation: 'salvage', achievements: ['first-boss', 'hundred-kills', 'wave-fifteen'] });
  state.upgrades = { damage: 10, rate: 9, shield: 8, drone: 0 };
  state.research = { power: 4, salvage: 5, cooldown: 3 };
  state.skills = { power: 2, cryo: 1 };
  state.mastery = { pulse: 500, spread: 300, lance: 200, missile: 700, arc: 40, orbit: 60 };
  const weapon = { ...generateWeapon(40, 1, () => 0.7), enhancement: 5, locked: true };
  const part = { ...generatePart(40, 2, () => 0.8), enhancement: 4, locked: true };
  state.inventory.push(weapon);
  state.equippedWeaponId = weapon.id;
  state.parts.push(part);
  state.equippedParts[part.slot] = part.id;
  state.loadouts = { one: { name: 'My build', weaponId: weapon.id, parts: { ...state.equippedParts }, module: 'salvager' } };
  state.collection = { weapons: { missile: 7 }, parts: { bastion: 5 }, rarities: { legendary: 2 },
    elites: 50, bosses: 20, claimed: ['first-legendary', 'elite-hunter'] };
  state.missions = { active: 'bosses', progress: { bosses: 2, kills: 110 }, completions: { bosses: 4, waves: 2 } };
  state.lootStats = { found: 80, sold: 45, soldCredits: 40000 };
  return state;
}

test('legacy v1 saves load without migration writes and retain all existing progress', () => {
  const storage = new MemoryStorage();
  const legacy = progressed();
  storage.values.set(PROGRESS_SAVE_KEY, JSON.stringify(legacy));
  const store = new ProgressStore(storage);
  const snapshot = store.read();
  assert.equal(snapshot.generation, INITIAL_RESET_GENERATION);
  assert.deepEqual(snapshot.saved, legacy);
  assert.equal(storage.writes.length, 0);
  const sim = new Simulation(snapshot.saved, NOW);
  assert.equal(sim.state.bestWave, 40);
  assert.equal(sim.state.totalKills, 1200);
  assert.ok(sim.state.inventory.some(item => item.id === legacy.equippedWeaponId));
  assert.equal(store.write(JSON.stringify(sim.toSave(NOW)), snapshot.generation), true);
  const saved = JSON.parse(storage.values.get(PROGRESS_SAVE_KEY)!);
  assert.equal(storage.values.has(PROGRESS_ACTIVE_KEY), false);
  assert.equal(saved.bestWave, 40);
});

test('reset replaces every progress field with the authoritative fresh state, preserving only sound and effects', () => {
  const storage = new MemoryStorage();
  const old = progressed();
  storage.values.set(PROGRESS_SAVE_KEY, JSON.stringify(old));
  const store = new ProgressStore(storage, () => 'reset-a');
  const snapshot = store.reset(old, NOW);
  const expected = { ...fresh(), sound: true, effects: false };
  assert.deepEqual(snapshot.saved, expected);
  assert.equal(snapshot.generation, 'reset-a');
  const persisted = JSON.parse(storage.values.get(progressSaveKey('reset-a'))!);
  assert.equal(storage.values.get(PROGRESS_ACTIVE_KEY), 'reset-a');
  assert.deepEqual(persisted, expected);
  assert.deepEqual(storage.writes, [progressSaveKey('reset-a'), PROGRESS_ACTIVE_KEY]);
  assert.deepEqual(JSON.parse(storage.values.get(PROGRESS_SAVE_KEY)!), old);
  assert.equal(old.credits, 90000);
  assert.equal(old.missions.active, 'bosses');
  snapshot.saved.inventory[0].enhancement = 10;
  assert.equal(JSON.parse(storage.values.get(progressSaveKey('reset-a'))!).inventory[0].enhancement, 0);
});

test('old autosave, visibility resume and unload writers cannot restore pre-reset progress', () => {
  const storage = new MemoryStorage();
  storage.values.set(PROGRESS_SAVE_KEY, JSON.stringify(progressed()));
  const oldTabStore = new ProgressStore(storage);
  const oldSnapshot = oldTabStore.read();
  let now = NOW;
  const oldSim = new Simulation(oldSnapshot.saved, now);
  const attempts: boolean[] = [];
  const session = new SaveSession(oldSim, json => { attempts.push(oldTabStore.write(json, oldSnapshot.generation)); }, () => now);
  session.hide();
  const newTabStore = new ProgressStore(storage, () => 'reset-b');
  newTabStore.reset({ sound: false, effects: true }, NOW);
  const resetSave = storage.values.get(progressSaveKey('reset-b'));
  now += 10 * 60 * 1000;
  session.save(); // autosave or pagehide
  session.resume(); // the hidden old simulation still has unclaimed offline rewards
  session.save(); // beforeunload
  assert.deepEqual(attempts, [true, false, false, false]);
  assert.equal(oldTabStore.isCurrent(oldSnapshot.generation), false);
  assert.equal(storage.values.get(progressSaveKey('reset-b')), resetSave);
  assert.equal(JSON.parse(resetSave!).credits, 90);
  assert.equal(newTabStore.read().generation, 'reset-b');
});

test('a new tab resumes saving only into the active generation slot', () => {
  const storage = new MemoryStorage();
  const resetStore = new ProgressStore(storage, () => 'reset-c');
  resetStore.reset({ sound: true, effects: true }, NOW);
  const resumedStore = new ProgressStore(storage);
  const snapshot = resumedStore.read();
  const sim = new Simulation(snapshot.saved, NOW);
  sim.buyUpgrade('damage');
  assert.equal(resumedStore.write(JSON.stringify(sim.toSave(NOW)), snapshot.generation), true);
  const persisted = JSON.parse(storage.values.get(progressSaveKey('reset-c'))!);
  assert.equal(storage.values.get(PROGRESS_ACTIVE_KEY), 'reset-c');
  assert.equal(persisted.upgrades.damage, 1);
  assert.equal(persisted.sound, true);
  assert.equal(resumedStore.write(JSON.stringify(progressed()), '0'), false);
});

test('a failed generation write preserves the previous active pointer and save', () => {
  const storage = new MemoryStorage();
  const oldSave = JSON.stringify(progressed());
  storage.values.set(progressSaveKey('previous-reset'), oldSave);
  storage.values.set(PROGRESS_ACTIVE_KEY, 'previous-reset');
  const store = new ProgressStore(storage, () => 'failed-reset');
  storage.failWrites = true;
  assert.throws(() => store.reset({ sound: false, effects: true }, NOW), /quota/);
  assert.equal(storage.values.get(progressSaveKey('previous-reset')), oldSave);
  assert.equal(store.read().generation, 'previous-reset');
  assert.equal(storage.writes.length, 0);
  storage.failWrites = false;
  storage.failReads = true;
  assert.throws(() => store.reset({ sound: false, effects: true }, NOW), /denied/);
  assert.equal(storage.values.get(progressSaveKey('previous-reset')), oldSave);
});

test('a failed pointer commit leaves the old generation active and the prepared slot unused', () => {
  const storage = new MemoryStorage();
  const oldSave = JSON.stringify(progressed());
  storage.values.set(PROGRESS_SAVE_KEY, oldSave);
  storage.failKeys.add(PROGRESS_ACTIVE_KEY);
  const store = new ProgressStore(storage, () => 'uncommitted');
  assert.throws(() => store.reset({ sound: false, effects: true }, NOW), /quota/);
  assert.equal(store.read().generation, INITIAL_RESET_GENERATION);
  assert.equal(storage.values.get(PROGRESS_SAVE_KEY), oldSave);
  assert.equal(storage.values.has(PROGRESS_ACTIVE_KEY), false);
  assert.equal(JSON.parse(storage.values.get(progressSaveKey('uncommitted'))!).bestWave, 0);
  assert.deepEqual(storage.writes, [progressSaveKey('uncommitted')]);
  storage.failKeys.clear();
  assert.throws(() => store.reset({ sound: false, effects: true }, NOW), /unused generation/);
  assert.deepEqual(store.read().saved, progressed());
});

test('a reset racing between an old writer check and write cannot touch the new active save', () => {
  const storage = new MemoryStorage();
  const old = progressed();
  storage.values.set(PROGRESS_SAVE_KEY, JSON.stringify(old));
  const oldStore = new ProgressStore(storage);
  const oldSnapshot = oldStore.read();
  const resetStore = new ProgressStore(storage, () => 'racing-reset');
  storage.onGet = key => {
    if (key !== PROGRESS_ACTIVE_KEY) return;
    storage.onGet = null;
    resetStore.reset({ sound: false, effects: true }, NOW);
  };
  assert.equal(oldStore.write(JSON.stringify(old), oldSnapshot.generation), false);
  assert.equal(resetStore.read().generation, 'racing-reset');
  assert.deepEqual(resetStore.read().saved, fresh());
  assert.equal(storage.values.get(PROGRESS_SAVE_KEY), JSON.stringify(old));
});

test('pre-feature tabs that directly overwrite the legacy save remain inactive after reset', () => {
  const storage = new MemoryStorage();
  const old = progressed();
  storage.values.set(PROGRESS_SAVE_KEY, JSON.stringify(old));
  const store = new ProgressStore(storage, () => 'new-runtime');
  store.reset({ sound: true, effects: false }, NOW);
  old.credits = 999999;
  storage.setItem(PROGRESS_SAVE_KEY, JSON.stringify(old)); // already-open pre-feature app
  const snapshot = new ProgressStore(storage).read();
  assert.equal(snapshot.generation, 'new-runtime');
  assert.deepEqual(snapshot.saved, { ...fresh(), sound: true, effects: false });
});

test('reload after a reset starts wave one without old offline income, including a hidden interval', () => {
  const storage = new MemoryStorage();
  storage.values.set(PROGRESS_SAVE_KEY, JSON.stringify(progressed()));
  const store = new ProgressStore(storage, () => 'reset-d');
  store.reset({ sound: false, effects: true }, NOW);
  for (const now of [NOW, NOW + 10 * 60 * 1000, NOW + 24 * 60 * 60 * 1000]) {
    const reloaded = new Simulation(store.read().saved, now);
    assert.equal(reloaded.state.wave, 1);
    assert.equal(reloaded.state.bestWave, 0);
    assert.equal(reloaded.state.credits, 90);
    assert.equal(reloaded.offlineReward, null);
  }
});

test('missing or corrupt storage remains recoverable and invalid reset tokens cannot silently reuse a generation', () => {
  const storage = new MemoryStorage();
  const store = new ProgressStore(storage, () => INITIAL_RESET_GENERATION);
  assert.deepEqual(store.read(), { saved: undefined, generation: INITIAL_RESET_GENERATION });
  storage.values.set(PROGRESS_SAVE_KEY, '{broken JSON');
  assert.deepEqual(store.read(), { saved: undefined, generation: INITIAL_RESET_GENERATION });
  assert.throws(() => store.reset({ sound: true, effects: false }, NOW), /new generation/);
  assert.equal(storage.values.get(PROGRESS_SAVE_KEY), '{broken JSON');
  const valid = new ProgressStore(storage, () => 'recovered');
  assert.equal(valid.reset({ sound: true, effects: false }, NOW).generation, 'recovered');
  assert.throws(() => valid.reset({ sound: true, effects: false }, NOW), /new generation/);
  assert.equal(storage.writes.length, 2);
  assert.throws(() => valid.write('[]', 'recovered'), /v1 progress save/);
  assert.equal(storage.writes.length, 2);
});

test('corrupt or missing active slots never fall back to inactive legacy progress', () => {
  const storage = new MemoryStorage();
  storage.values.set(PROGRESS_SAVE_KEY, JSON.stringify(progressed()));
  storage.values.set(PROGRESS_ACTIVE_KEY, '../bad generation');
  const store = new ProgressStore(storage, () => 'repaired');
  assert.throws(() => store.read(), /Invalid active progress generation/);
  assert.throws(() => store.write(JSON.stringify(fresh()), '0'), /Invalid active progress generation/);
  store.reset({ sound: false, effects: true }, NOW);
  assert.deepEqual(store.read().saved, fresh());
  storage.values.set(PROGRESS_ACTIVE_KEY, 'missing-slot');
  assert.deepEqual(store.read(), { saved: undefined, generation: 'missing-slot' });
  storage.values.set(progressSaveKey('missing-slot'), 'broken JSON');
  assert.deepEqual(store.read(), { saved: undefined, generation: 'missing-slot' });
});
