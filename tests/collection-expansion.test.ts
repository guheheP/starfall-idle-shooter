import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionMilestones, createCollection, readCollection } from '../src/game/collection';
import { Simulation } from '../src/game/simulation';
import { createRequisitionReward } from '../src/game/requisition';

const NOW = 1_800_000_000_000;
const OLD_IDS = ['weapon-families', 'part-models', 'all-rarities', 'first-legendary', 'elite-hunter', 'wave-30', 'wave-50', 'wave-100'];

test('the original eight collection IDs and rewards remain stable alongside fourteen long-term goals', () => {
  const milestones = collectionMilestones(createCollection(), 0);
  assert.equal(milestones.length, 22);
  assert.deepEqual(milestones.slice(0, 8).map(item => item.id), OLD_IDS);
  assert.deepEqual(milestones.slice(0, 8).map(item => item.reward), [1800, 2400, 1800, 1500, 1500, 1500, 3000, 8000]);
  assert.equal(new Set(milestones.map(item => item.id)).size, 22);
  assert.ok(milestones.slice(8).every(item => item.reward >= 5000 && item.reward <= 100000));
});

test('existing save achievements pay newly available goals exactly once and keep all old claim markers', () => {
  const collection = createCollection();
  collection.weapons = { pulse: 90, spread: 90, lance: 90, missile: 90, arc: 90, orbit: 90 };
  collection.parts = { focus: 60, velocity: 60, cascade: 60, bastion: 60, reactor: 60, siphon: 60, striker: 60, frost: 60, mender: 60 };
  collection.rarities = { common: 300, uncommon: 310, rare: 300, epic: 120, legendary: 50 };
  collection.elites = 500;collection.bosses = 100;collection.claimed = [...OLD_IDS];
  const base = new Simulation(undefined, NOW).toSave(NOW);
  const oldSave = { ...base, credits: 100000, totalCredits: 100000, bestWave: 200, wave: 201, collection };
  const sim = new Simulation(oldSave, NOW);
  assert.equal(sim.state.credits, 476500);
  assert.equal(sim.state.totalCredits, 476500);
  assert.equal(sim.state.collection.claimed.length, 22);
  assert.ok(OLD_IDS.every(id => sim.state.collection.claimed.includes(id)));
  const paid = sim.drainEvents().filter(event => event.kind === 'collection' && event.value);
  assert.equal(paid.length, 14);
  assert.equal(paid.reduce((total, event) => total + event.value!, 0), 376500);
  const reload = new Simulation(sim.toSave(NOW), NOW);
  assert.equal(reload.state.credits, 476500);
  assert.deepEqual(reload.state.collection.claimed, sim.state.collection.claimed);
  assert.equal(reload.drainEvents().filter(event => event.kind === 'collection' && event.value).length, 0);
  assert.equal(reload.prestige(), true);
  const prestigeReload = new Simulation(reload.toSave(NOW), NOW);
  assert.equal(prestigeReload.drainEvents().filter(event => event.kind === 'collection' && event.value).length, 0);
  assert.deepEqual(prestigeReload.state.collection.claimed, sim.state.collection.claimed);
});

test('long-term acquisition counts include automatic sales but never starter or held inventory copies', () => {
  const collection = createCollection();collection.weapons.pulse = 99;collection.parts.focus = 99;
  const base = new Simulation(undefined, NOW).toSave(NOW);
  const sim = new Simulation({ ...base, collection, autoSellRarity: 'legendary' }, NOW);
  assert.equal(sim.getCollectionMilestones().find(item => item.id === 'weapons-100')!.current, 99);
  assert.equal(sim.getCollectionMilestones().find(item => item.id === 'parts-100')!.current, 99);
  const weapon = { ...createRequisitionReward('pulse', 1, 1, 1, () => .5), locked: false };
  const part = { ...createRequisitionReward('focus', 1, 1, 2, () => .5), locked: false };
  assert.ok(!('slot' in weapon));assert.ok('slot' in part);
  assert.equal(sim.receiveWeapon(weapon).sold, true);
  assert.equal(sim.receivePart(part).sold, true);
  assert.equal(sim.state.inventory.length, 1);assert.equal(sim.state.parts.length, 3);
  assert.ok(sim.state.collection.claimed.includes('weapons-100'));assert.ok(sim.state.collection.claimed.includes('parts-100'));
  const reloaded = new Simulation(sim.toSave(NOW), NOW);
  assert.equal(reloaded.state.collection.weapons.pulse, 100);assert.equal(reloaded.state.collection.parts.focus, 100);
  assert.equal(reloaded.drainEvents().filter(event => event.kind === 'collection' && event.value).length, 0);
});

test('expanded claim parsing removes duplicates and unknown markers without resurrecting a paid goal', () => {
  const collection = readCollection({ claimed: ['weapons-100', 'weapons-100', 'legendary-50', 'wave-200', 'fake'], weapons: { pulse: 100 }, rarities: { legendary: 50 } });
  assert.deepEqual(collection.claimed, ['legendary-50', 'weapons-100', 'wave-200']);
  assert.equal(collectionMilestones(collection, 200).find(item => item.id === 'weapons-100')!.claimed, true);
  assert.equal(collectionMilestones(collection, 200).find(item => item.id === 'wave-200')!.claimed, true);
});
