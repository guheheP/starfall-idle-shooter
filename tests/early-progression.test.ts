import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { rarityRank, validateWeaponItem } from '../src/game/loot';
import { validatePartItem } from '../src/game/parts';
import { getOpeningDropMultiplier } from '../src/game/sectors';
import { getEnhancementCost } from '../src/game/enhancement';
import type { GameState, GameEvent } from '../src/game/types';

const NOW = 1_800_000_000_000;
const IDLE = { x: 0, y: 0 };
// No ordinary opening drops, no crits, and minimum normal rarity rolls.
const dryRng = () => 0.08;
function clearThrough(sim: Simulation, wave: number, limit = 120) {
  const events: GameEvent[] = [];
  let seconds = 0;
  while (sim.state.wave <= wave && seconds < limit) {
    sim.update(1 / 60, IDLE); events.push(...sim.drainEvents()); seconds += 1 / 60;
  }
  assert.ok(sim.state.wave > wave, `W${wave} remained at ${seconds.toFixed(1)}s`);
  return { seconds, events };
}
const save = (changes: Partial<GameState>) => ({ ...new Simulation(undefined, NOW, dryRng).toSave(NOW), ...changes });

test('a dry opening still offers an affixed weapon, then a part, without auto-equipping', () => {
  const sim = new Simulation(undefined, NOW, dryRng);
  const originalEquipped = { weapon: sim.state.equippedWeaponId, parts: { ...sim.state.equippedParts } };
  const first = clearThrough(sim, 1);
  assert.ok(first.seconds >= 7 && first.seconds <= 16, 'first fight should be readable and short');
  assert.equal(sim.state.lootStats.found, 1);
  const weapon = sim.state.inventory.find(item => !item.starter)!;
  assert.equal(weapon.rarity, 'uncommon'); assert.equal(weapon.affixes.length, 1);
  assert.deepEqual(validateWeaponItem(weapon), weapon);
  assert.ok(sim.getWeaponPreview(weapon).dps > sim.getWeaponPreview(sim.getEquippedWeapon()).dps);
  assert.ok(sim.state.credits >= getEnhancementCost(weapon));
  assert.ok(first.events.some(event => event.kind === 'inventory' && event.message?.includes('装備倉庫')));
  clearThrough(sim, 2);
  const part = sim.state.parts.find(item => !item.starter)!;
  assert.equal(part.rarity, 'uncommon'); assert.equal(part.affixes.length, 1);
  assert.deepEqual(validatePartItem(part), part);
  assert.equal(sim.state.lootStats.found, 2);
  assert.deepEqual({ weapon: sim.state.equippedWeaponId, parts: sim.state.equippedParts }, originalEquipped);
  assert.equal(sim.equipWeapon(weapon.id), true);
  assert.equal(sim.enhanceEquipment(weapon.id), true);
  assert.equal(sim.getEquippedWeapon().enhancement, 1);
});

test('first-clear equipment persists across reload and cannot be farmed by replay or sorties', () => {
  const first = new Simulation(undefined, NOW, dryRng); clearThrough(first, 1);
  const loaded = new Simulation(first.toSave(NOW), NOW, dryRng);
  clearThrough(loaded, 2);
  assert.equal(loaded.state.lootStats.found, 2);
  const replay = new Simulation({ ...loaded.toSave(NOW), wave: 1 }, NOW, dryRng);
  clearThrough(replay, 2);
  assert.equal(replay.state.lootStats.found, 2);
  const sortie = new Simulation(save({ runs: 1 }), NOW, dryRng); clearThrough(sortie, 2);
  assert.equal(sortie.state.lootStats.found, 0);
});

test('guaranteed opening loot respects auto-sale, discovery, and the current loadout', () => {
  const sim = new Simulation(save({ autoSellRarity: 'uncommon' }), NOW, dryRng);
  const result = clearThrough(sim, 2);
  assert.equal(sim.state.lootStats.found, 2); assert.equal(sim.state.lootStats.sold, 2);
  assert.equal(sim.state.inventory.length, 1); assert.equal(sim.state.parts.length, 3);
  assert.equal(sim.state.collection.weapons.pulse, 1);
  assert.equal(Object.values(sim.state.collection.parts).reduce((sum, count) => sum + count, 0), 1);
  assert.ok(sim.state.lootStats.soldCredits > 0);
  assert.equal(result.events.filter(event => event.kind === 'loot' && event.autoSold).length, 2);
  assert.equal(result.events.some(event => event.kind === 'inventory' && event.message?.includes('初回回収')), false);
});

test('the first boss keeps both quality drops despite lower ordinary drop rates', () => {
  const sim = new Simulation(save({ wave: 5, bestWave: 4 }), NOW, dryRng);
  const result = clearThrough(sim, 5);
  const loot = result.events.filter(event => event.kind === 'loot');
  assert.equal(loot.length, 2);
  assert.ok(loot.every(event => rarityRank(event.item!.rarity) >= 2 && event.item!.affixes.length >= 2));
  assert.ok(loot.some(event => 'slot' in event.item!));
  assert.ok(loot.some(event => 'type' in event.item!));
  assert.ok(result.seconds < 50, 'fresh starters can defeat the first boss without permanent upgrades');
  assert.equal(getOpeningDropMultiplier(15), 0.5);
  assert.equal(getOpeningDropMultiplier(30), 1);
  assert.equal(getOpeningDropMultiplier(10000), 1);
});
