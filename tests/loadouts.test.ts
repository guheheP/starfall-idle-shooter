import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { createStarterWeapon, INVENTORY_CAPACITY } from '../src/game/loot';
import { createStarterPart, PART_BASES, PART_CAPACITY } from '../src/game/parts';
import { LOADOUT_SLOTS, readLoadouts, type LoadoutSlot } from '../src/game/loadouts';
import type { Bullet, Enemy, GameEvent, GameState, PartItem, PartModel, WeaponId, WeaponItem, WeaponRarity } from '../src/game/types';

const NOW = 1_800_000_000_000;
const IDLE = { x: 0, y: 0 };
const save = (overrides: Partial<GameState> = {}): GameState => ({ ...new Simulation(undefined, NOW).toSave(NOW), ...overrides });
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
const internals = (sim: Simulation) => sim as unknown as { fireTimer: number; droneTimer: number; leechBudget: number; events: GameEvent[] };

function weapon(id: string, type: WeaponId = 'arc', power = 2, rarity: WeaponRarity = 'rare'): WeaponItem {
  return { ...createStarterWeapon(type), id, name: id, level: 20, rarity, power, starter: false, locked: false };
}
function part(id: string, model: PartModel, power = 3, rarity: WeaponRarity = 'rare'): PartItem {
  const slot = PART_BASES[model].slot;
  return { ...createStarterPart(slot), id, name: id, model, rarity, power, starter: false, locked: false };
}
function prepared(): Simulation {
  const sim = new Simulation(save({ bestWave: 40, wave: 41, credits: 100_000 }), NOW, () => 0.99);
  assert.equal(sim.saveLoadout('one', '巡航'), true);
  sim.receiveWeapon(weapon('alt-weapon'));
  for (const [id, model] of [['alt-wing', 'cascade'], ['alt-body', 'bastion'], ['alt-drone', 'frost']] as const) {
    sim.receivePart(part(id, model)); sim.equipPart(id);
  }
  sim.equipWeapon('alt-weapon'); sim.setModule('bulwark');
  assert.equal(sim.saveLoadout('two', '凍結支援'), true);
  assert.equal(sim.equipLoadout('one'), true);
  sim.drainEvents();
  return sim;
}

test('three presets store only equipment references and names, without duplicating or altering gear', () => {
  const sim = prepared();
  const inventory = sim.state.inventory, parts = sim.state.parts;
  const counts = [inventory.length, parts.length], credits = sim.state.credits;
  const summaries = sim.getLoadouts();
  assert.deepEqual(summaries.map(value => value.slot), LOADOUT_SLOTS.map(slot => slot.id));
  assert.equal(summaries[0].available, true); assert.equal(summaries[0].equipped, true);
  assert.equal(summaries[1].available, true); assert.equal(summaries[1].equipped, false);
  assert.equal(summaries[2].preset, null); assert.equal(summaries[2].available, false);
  assert.deepEqual(Object.keys(sim.state.loadouts.two!).sort(), ['module', 'name', 'parts', 'weaponId']);
  assert.equal(sim.saveLoadout('three', '銀河航行🚀'.repeat(8)), true);
  assert.equal(Array.from(sim.state.loadouts.three!.name).length, 20);
  assert.equal(sim.saveLoadout('three'), true);
  assert.equal(Array.from(sim.state.loadouts.three!.name).length, 20);
  assert.equal(sim.state.inventory, inventory); assert.equal(sim.state.parts, parts);
  assert.deepEqual([inventory.length, parts.length], counts); assert.equal(sim.state.credits, credits);
  assert.deepEqual(sim.getLoadoutReferences('starter-pulse'), ['巡航', sim.state.loadouts.three!.name]);
  summaries[1].preset!.parts.body = 'changed'; summaries[1].preset!.name = 'changed';
  assert.equal(sim.state.loadouts.two!.name, '凍結支援'); assert.equal(sim.state.loadouts.two!.parts.body, 'alt-body');
});

test('recall changes all four slots and the module atomically while preserving health, cadence and in-flight attribution', () => {
  const sim = prepared();
  sim.player.hp = sim.getStats().maxHp * 0.4;
  sim.update(0.29, IDLE);
  const fraction = sim.player.hp / sim.getStats().maxHp;
  const state = internals(sim);
  assert.ok(state.fireTimer > 0 && state.fireTimer < 0.15);
  assert.ok(state.droneTimer > 0 && state.droneTimer < 0.15);
  sim.overdriveLeft = 2.7; sim.overdriveCooldown = 17; sim.paused = true;
  const cadence = [state.fireTimer, state.droneTimer, state.leechBudget];
  const bullets = sim.bullets, oldBullets = structuredClone(bullets), events = [...state.events];
  const itemCounts = [sim.state.inventory.length, sim.state.parts.length], credits = sim.state.credits;
  assert.equal(sim.equipLoadout('two'), true);
  assert.equal(sim.state.equippedWeaponId, 'alt-weapon'); assert.equal(sim.state.weapon, 'arc');
  assert.deepEqual(sim.state.equippedParts, { wing: 'alt-wing', body: 'alt-body', drone: 'alt-drone' });
  assert.equal(sim.state.module, 'bulwark'); close(sim.player.hp / sim.getStats().maxHp, fraction);
  assert.deepEqual([state.fireTimer, state.droneTimer, state.leechBudget], cadence);
  assert.equal(sim.overdriveLeft, 2.7); assert.equal(sim.overdriveCooldown, 17); assert.equal(sim.paused, true);
  assert.equal(sim.bullets, bullets); assert.deepEqual(sim.bullets, oldBullets);
  for (let index = 0; index < events.length; index++) assert.equal(state.events[index], events[index]);
  assert.deepEqual([sim.state.inventory.length, sim.state.parts.length], itemCounts); assert.equal(sim.state.credits, credits);
  assert.equal(state.events.at(-1)?.kind, 'inventory');
  const eventCount = state.events.length;
  assert.equal(sim.equipLoadout('two'), false); assert.equal(state.events.length, eventCount);
});

test('missing and mismatched items or locked modules reject the whole recall before any mutation', () => {
  const corruptions = [
    (sim: Simulation) => { sim.state.loadouts.two!.weaponId = 'missing-weapon'; },
    (sim: Simulation) => { sim.state.loadouts.two!.parts.wing = 'missing-wing'; },
    (sim: Simulation) => { sim.state.loadouts.two!.parts.body = 'missing-body'; },
    (sim: Simulation) => { sim.state.loadouts.two!.parts.drone = 'missing-drone'; },
    (sim: Simulation) => { sim.state.loadouts.two!.parts.wing = 'alt-body'; },
    (sim: Simulation) => { sim.state.bestWave = 0; },
  ];
  for (const corrupt of corruptions) {
    const sim = prepared(); sim.player.hp *= 0.37; sim.overdriveLeft = 2; sim.overdriveCooldown = 10;
    corrupt(sim);
    const before = sim.toSave(NOW), hp = sim.player.hp, cadence = { ...internals(sim) };
    assert.equal(sim.getLoadouts()[1].available, false);
    assert.equal(sim.equipLoadout('two'), false);
    assert.deepEqual(sim.toSave(NOW), before); assert.equal(sim.player.hp, hp);
    assert.equal(sim.overdriveLeft, 2); assert.equal(sim.overdriveCooldown, 10);
    assert.equal(internals(sim).fireTimer, cadence.fireTimer); assert.equal(internals(sim).droneTimer, cadence.droneTimer);
    assert.equal(internals(sim).leechBudget, cadence.leechBudget); assert.equal(sim.drainEvents().length, 0);
  }
  const sim = prepared(), before = sim.toSave(NOW);
  assert.equal(sim.saveLoadout('bad' as LoadoutSlot), false); assert.equal(sim.equipLoadout('bad' as LoadoutSlot), false);
  assert.equal(sim.deleteLoadout('bad' as LoadoutSlot), false); assert.equal(sim.deleteLoadout('three'), false);
  assert.deepEqual(sim.toSave(NOW), before);
  sim.state.equippedParts.wing = 'missing-current-wing';
  const counts = [sim.state.inventory.length, sim.state.parts.length];
  assert.equal(sim.saveLoadout('three'), false);
  assert.deepEqual([sim.state.inventory.length, sim.state.parts.length], counts);
});

test('rapid recall cannot refill spent shared absorption budget', () => {
  const sim = prepared();
  const enemy: Enemy = { id: 900_000, kind: 'tank', x: 360, y: 450, baseX: 360,
    hp: 1e9, maxHp: 1e9, radius: 80, age: 0, shotTimer: 100, hitFlash: 0 };
  const shot: Bullet = { id: 900_001, x: 360, y: 450, vx: 0, vy: 0, damage: 20_000,
    radius: 80, friendly: true, weapon: 'pulse', pierce: 1, hitIds: [], source: 'weapon', leech: 0.2 };
  sim.enemies = [enemy]; sim.player.hp = 50; sim.bullets = [shot];
  sim.update(1 / 60, IDLE);
  close(internals(sim).leechBudget, 0);
  sim.paused = true;
  for (let repeat = 0; repeat < 5; repeat++) {
    const fraction = sim.player.hp / sim.getStats().maxHp;
    assert.equal(sim.equipLoadout(repeat % 2 ? 'one' : 'two'), true);
    close(sim.player.hp / sim.getStats().maxHp, fraction);
    close(internals(sim).leechBudget, 0);
  }
});

test('preset gear is excluded from bulk selling but an explicit individual sale leaves a missing reference', () => {
  const sim = prepared();
  sim.receiveWeapon(weapon('junk-weapon'));
  for (const [id, model] of [['junk-wing', 'focus'], ['junk-body', 'reactor'], ['junk-drone', 'striker']] as const) sim.receivePart(part(id, model));
  sim.setAutoSellRarity('epic');
  assert.equal(sim.sellEligibleWeapons().count, 4);
  assert.ok(sim.state.inventory.some(item => item.id === 'alt-weapon'));
  assert.ok(['alt-wing', 'alt-body', 'alt-drone'].every(id => sim.state.parts.some(item => item.id === id)));
  assert.ok(sim.sellWeapon('alt-weapon') > 0);
  assert.ok(sim.sellPart('alt-wing') > 0);
  const missing = sim.getLoadouts()[1];
  assert.equal(missing.available, false);
  assert.deepEqual(missing.missingItems, [{ slot: 'weapon', id: 'alt-weapon' }, { slot: 'wing', id: 'alt-wing' }]);
  assert.equal(sim.equipLoadout('two'), false);
  assert.deepEqual(sim.getLoadoutReferences('alt-weapon'), ['凍結支援']);
  assert.equal(sim.deleteLoadout('two'), true);
  assert.deepEqual(sim.getLoadoutReferences('alt-body'), []);
  assert.equal(sim.sellEligibleWeapons().count, 2);
});

test('inventory overflow retains weak preset references while replacing unreferenced equipment', () => {
  const sim = new Simulation(save({ bestWave: 40 }), NOW, () => 0.99);
  sim.saveLoadout('one', '初期');
  sim.receiveWeapon(weapon('weak-reference', 'orbit', 0.5, 'common'));
  sim.receivePart(part('weak-body-reference', 'bastion', 0.5, 'common'));
  sim.equipWeapon('weak-reference'); sim.equipPart('weak-body-reference'); sim.saveLoadout('two', '保管'); sim.equipLoadout('one');
  for (let index = 0; sim.state.inventory.length < INVENTORY_CAPACITY; index++) sim.receiveWeapon(weapon(`overflow-weapon-${index}`, 'pulse', 1, 'common'));
  for (let index = 0; sim.state.parts.length < PART_CAPACITY; index++) sim.receivePart(part(`overflow-part-${index}`, 'bastion', 1, 'common'));
  const weaponDrop = sim.receiveWeapon(weapon('valuable-weapon', 'spread', 4, 'legendary'));
  const partDrop = sim.receivePart(part('valuable-part', 'reactor', 4, 'legendary'));
  assert.equal(weaponDrop.stored, true); assert.equal(partDrop.stored, true);
  assert.equal(sim.state.inventory.length, INVENTORY_CAPACITY); assert.equal(sim.state.parts.length, PART_CAPACITY);
  assert.ok(sim.state.inventory.some(item => item.id === 'weak-reference'));
  assert.ok(sim.state.parts.some(item => item.id === 'weak-body-reference'));
  assert.equal(sim.getLoadouts()[1].available, true);
});

test('save migration sanitizes preset fields, keeps missing references, and never fabricates matching equipment', () => {
  const malformed = {
    one: { name: 'invalid module', weaponId: 'starter-pulse', parts: { wing: 'starter-wing', body: 'starter-body', drone: 'starter-drone' }, module: 'invalid' },
    two: { name: `\u0000 ${'🚀'.repeat(24)} \n`, weaponId: 'loot-444', parts: { wing: 'gone-wing', body: 'part-445', drone: 'gone-drone' }, module: 'bulwark', copies: ['fake'] },
    three: { name: 'unsafe id', weaponId: '<script>', parts: { wing: 'a', body: 'b', drone: 'c' }, module: 'standard' },
    unknown: { name: 'ignored' },
  };
  const validated = readLoadouts(malformed);
  assert.deepEqual(Object.keys(validated), ['two']); assert.equal(Array.from(validated.two!.name).length, 20);
  assert.deepEqual(Object.keys(validated.two!).sort(), ['module', 'name', 'parts', 'weaponId']);
  const sim = new Simulation({ ...save(), loadouts: malformed }, NOW);
  assert.equal(sim.state.inventory.length, 1); assert.equal(sim.state.parts.length, 3);
  assert.equal(sim.getLoadouts()[1].missingItems.length, 4); assert.equal(sim.getLoadouts()[1].moduleLocked, true);
  assert.equal(sim.equipLoadout('two'), false); assert.equal(sim.state.lootSerial, 445);
  const { loadouts: _loadouts, ...legacy } = save();
  assert.deepEqual(new Simulation(legacy, NOW).state.loadouts, {});
});

test('oversized saves prioritize preset references before applying inventory limits', () => {
  const source = prepared().toSave(NOW);
  const wantedWeapon = source.inventory.find(item => item.id === 'alt-weapon')!;
  const wantedParts = source.parts.filter(item => item.id.startsWith('alt-'));
  source.inventory = [source.inventory[0], ...Array.from({ length: 70 }, (_, i) => ({ ...weapon(`saved-weapon-${i}`), locked: true })), wantedWeapon];
  source.parts = [source.parts[0], source.parts[1], source.parts[2], ...Array.from({ length: 70 }, (_, i) => ({ ...part(`saved-part-${i}`, 'bastion'), locked: true })), ...wantedParts];
  const sim = new Simulation(source, NOW);
  assert.equal(sim.state.inventory.length, INVENTORY_CAPACITY); assert.equal(sim.state.parts.length, PART_CAPACITY);
  assert.equal(sim.getLoadouts()[1].available, true); assert.equal(sim.equipLoadout('two'), true);
});

test('presets deep-clone through save, reload and prestige while following the same owned item IDs', () => {
  const sim = prepared(); sim.state.wave = 16;
  const expected = structuredClone(sim.state.loadouts), saved = sim.toSave(NOW);
  saved.loadouts.two!.name = 'outside'; saved.loadouts.two!.parts.body = 'outside';
  assert.deepEqual(sim.state.loadouts, expected);
  const reloaded = new Simulation(sim.toSave(NOW), NOW);
  assert.deepEqual(reloaded.state.loadouts, expected); assert.equal(reloaded.getLoadouts()[1].available, true);
  const oldLoadouts = reloaded.state.loadouts, itemCounts = [reloaded.state.inventory.length, reloaded.state.parts.length];
  assert.equal(reloaded.prestige(), true); assert.deepEqual(reloaded.state.loadouts, expected);
  oldLoadouts.two!.parts.body = 'outside'; assert.deepEqual(reloaded.state.loadouts, expected);
  assert.equal(reloaded.equipLoadout('two'), true);
  assert.deepEqual([reloaded.state.inventory.length, reloaded.state.parts.length], itemCounts);
  assert.equal(reloaded.state.module, 'bulwark'); assert.equal(reloaded.state.equippedParts.body, 'alt-body');
});
