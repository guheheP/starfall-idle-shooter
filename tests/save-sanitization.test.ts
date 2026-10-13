import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { createStarterWeapon, generateWeapon, validateWeaponItem, WEAPON_BASES } from '../src/game/loot';
import { createStarterPart, generatePart, PART_SLOTS, validatePartItem } from '../src/game/parts';
import type { GameState, WeaponId } from '../src/game/types';

const NOW = 1_800_000_000_000;
const save = (): GameState => new Simulation(undefined, NOW).toSave(NOW);
function assertOwnedSlots(sim: Simulation): void {
  const owned = [...sim.state.inventory, ...sim.state.parts];
  assert.equal(new Set(owned.map(item => item.id)).size, owned.length);
  assert.ok(sim.state.inventory.some(item => item.id === sim.state.equippedWeaponId));
  for (const slot of PART_SLOTS) assert.ok(sim.state.parts.some(part => part.slot === slot.id && part.id === sim.state.equippedParts[slot.id]));
}

test('reserved starter IDs reject another equipment kind, weapon type, or part slot', () => {
  const weapon = { ...createStarterWeapon('pulse'), starter: false };
  for (const id of ['starter-wing', 'starter-body', 'starter-drone', 'starter-lance', 'starter-unknown'])
    assert.equal(validateWeaponItem({ ...weapon, id }), null);
  const body = { ...createStarterPart('body'), starter: false };
  for (const id of ['starter-pulse', 'starter-lance', 'starter-wing', 'starter-drone', 'starter-unknown'])
    assert.equal(validatePartItem({ ...body, id }), null);
  for (const type of Object.keys(WEAPON_BASES) as WeaponId[]) {
    const item = createStarterWeapon(type);
    assert.deepEqual(validateWeaponItem(item), item);
    assert.equal(validateWeaponItem({ ...item, starter: false })?.id, item.id);
  }
  for (const slot of PART_SLOTS) {
    const item = createStarterPart(slot.id);
    assert.deepEqual(validatePartItem(item), item);
    assert.equal(validatePartItem({ ...item, starter: false })?.id, item.id);
  }
});

test('a dirty weapon cannot collide with a restored body or redirect body enhancement', () => {
  const weapon = { ...createStarterWeapon('pulse'), id: 'starter-body', starter: false, locked: false };
  const sim = new Simulation({ ...save(), credits: 100_000, inventory: [weapon], equippedWeaponId: weapon.id,
    parts: [], equippedParts: {} }, NOW);
  assertOwnedSlots(sim);
  assert.equal(sim.getEquippedWeapon().id, 'starter-pulse');
  assert.equal(sim.getEquippedPart('body').id, 'starter-body');
  assert.equal(sim.enhanceEquipment(sim.state.equippedParts.body), true);
  assert.equal(sim.getEquippedPart('body').enhancement, 1);
  assert.equal(sim.getEquippedWeapon().enhancement, 0);
  assert.equal(sim.receiveWeapon(weapon).stored, false);
});

test('a dirty body cannot collide with a restored wing or redirect wing enhancement', () => {
  const body = { ...createStarterPart('body'), id: 'starter-wing', starter: false, locked: false };
  const sim = new Simulation({ ...save(), credits: 100_000, parts: [body],
    equippedParts: { wing: 'gone', body: body.id, drone: 'gone' } }, NOW);
  assertOwnedSlots(sim);
  assert.equal(sim.getEquippedPart('body').id, 'starter-body');
  assert.equal(sim.getEquippedPart('wing').id, 'starter-wing');
  assert.equal(sim.enhanceEquipment(sim.state.equippedParts.wing), true);
  assert.equal(sim.getEquippedPart('wing').enhancement, 1);
  assert.equal(sim.getEquippedPart('body').enhancement, 0);
  assert.equal(sim.receivePart(body).stored, false);
});

test('legacy starters and ordinary earned equipment retain their IDs and stats', () => {
  const legacy = new Simulation({ version: 1, bestWave: 12, wave: 13, weapon: 'lance', savedAt: NOW }, NOW);
  assertOwnedSlots(legacy);
  assert.deepEqual(legacy.state.inventory.map(item => item.id), ['starter-pulse', 'starter-spread', 'starter-lance']);
  assert.deepEqual(legacy.state.parts.map(item => item.id), ['starter-wing', 'starter-body', 'starter-drone']);
  let seed = 71;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x1_0000_0000; };
  const source = save();
  source.inventory.push(...Array.from({ length: 20 }, (_, index) => ({ ...generateWeapon(40, index + 1, rng), enhancement: 2 })));
  source.parts.push(...Array.from({ length: 30 }, (_, index) => ({ ...generatePart(40, index + 100, rng), enhancement: 3 })));
  const restored = new Simulation(source, NOW);
  assertOwnedSlots(restored);
  assert.deepEqual(restored.state.inventory, source.inventory);
  assert.deepEqual(restored.state.parts, source.parts);
});
