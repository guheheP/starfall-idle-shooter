import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { createStarterWeapon, getSellValue, validateWeaponItem } from '../src/game/loot';
import { createStarterPart, getPartSellValue, PART_BASES, validatePartItem } from '../src/game/parts';
import { ENHANCEMENT_MAX, enhancementLevel, enhancementMultiplier, getEnhancementCost, getEnhancementRefund } from '../src/game/enhancement';
import type { GameState, PartItem, PartModel, WeaponItem } from '../src/game/types';

const NOW = 1_800_000_000_000, IDLE = { x: 0, y: 0 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);
const save = (overrides: Partial<GameState> = {}) => ({ ...new Simulation(undefined, NOW, () => 0.99).toSave(NOW), ...overrides });
function part(id: string, model: PartModel, power = 2): PartItem {
  return { ...createStarterPart(PART_BASES[model].slot, NOW), id, name: `強化試験 ${model}`, model,
    rarity: 'legendary', level: 20, power, starter: false, locked: false };
}
function equip(sim: Simulation, item: PartItem): void { sim.receivePart(item); assert.equal(sim.equipPart(item.id), true); }

test('enhancement fees scale with acquisition level, rarity and current upgrade without poisoning arithmetic', () => {
  const starter = createStarterWeapon('pulse');
  assert.equal(getEnhancementCost(starter), 88);
  assert.equal(getEnhancementCost({ ...starter, enhancement: 1 }), 141);
  const rare = { ...starter, level: 10, rarity: 'rare' as const };
  assert.equal(getEnhancementCost(rare), 575);
  assert.equal(getEnhancementCost({ ...rare, enhancement: 3 }), 2356);
  assert.equal(ENHANCEMENT_MAX, 10);
  assert.equal(getEnhancementCost({ ...rare, enhancement: 10 }), Infinity);
  assert.equal(enhancementLevel({ enhancement: -99 }), 0);
  assert.equal(enhancementLevel({ enhancement: 19.5 }), 10);
  assert.equal(enhancementLevel({ enhancement: NaN }), 0);
  assert.equal(enhancementLevel({ enhancement: Infinity }), 0);
  assert.equal(enhancementMultiplier({ enhancement: 10 }), 1.5);
  assert.ok(Number.isFinite(getEnhancementCost({ ...rare, level: NaN, enhancement: NaN })));
});

test('only equipped items may spend CR and failed enhancement leaves currency and equipment unchanged', () => {
  const sim = new Simulation(save({ credits: 87 }), NOW, () => 0.99);
  const before = sim.toSave(NOW);
  assert.equal(sim.enhanceEquipment('starter-pulse'), false);
  assert.equal(sim.enhanceEquipment('missing'), false);
  assert.deepEqual(sim.toSave(NOW), before);
  const unused: WeaponItem = { ...createStarterWeapon('lance'), id: 'unused-gun', starter: false, locked: false };
  sim.receiveWeapon(unused);
  const unusedPart = part('unused-body', 'reactor'); sim.receivePart(unusedPart);
  sim.state.credits = 1e6;
  assert.equal(sim.getEnhancementCost(unused.id), Infinity);
  assert.equal(sim.getEnhancementCost(unusedPart.id), Infinity);
  assert.equal(sim.enhanceEquipment(unused.id), false);
  assert.equal(sim.enhanceEquipment(unusedPart.id), false);
  assert.equal(sim.state.credits, 1e6);
  sim.equipWeapon(unused.id); sim.paused = true;
  assert.equal(sim.enhanceEquipment(unused.id), true);
  assert.equal(sim.state.credits, 1e6 - 88);
  assert.equal(sim.getEquippedWeapon().enhancement, 1);
  assert.ok(sim.drainEvents().some(event => event.kind === 'inventory' && event.message?.includes('+1')));
});

test('weapon enhancement increases actual damage, preserves rolls, and includes half its fee in resale', () => {
  const sim = new Simulation(save({ credits: 1e6 }), NOW, () => 0.99);
  const weapon: WeaponItem = { ...createStarterWeapon('spread'), id: 'rolled-gun', starter: false, locked: false,
    level: 19, rarity: 'epic', power: 2, affixes: [{ id: 'power', value: 0.2 }, { id: 'rapid', value: 0.15 }, { id: 'critical', value: 0.1 }] };
  sim.receiveWeapon(weapon); sim.equipWeapon(weapon.id);
  const before = structuredClone(sim.getEquippedWeapon());
  const preview = sim.getWeaponPreview(before), sell = getSellValue(before);
  const fee = sim.getEnhancementCost(weapon.id);
  assert.equal(sim.enhanceEquipment(weapon.id), true);
  const enhanced = sim.getEquippedWeapon();
  assert.equal(sim.state.credits, 1e6 - fee);
  close(sim.getWeaponPreview(enhanced).damage, preview.damage * 1.05);
  close(sim.getWeaponPreview(enhanced).dps, preview.dps * 1.05);
  assert.equal(sim.getWeaponPreview(enhanced).fireRate, preview.fireRate);
  assert.deepEqual({ ...enhanced, enhancement: 0 }, before);
  assert.equal(getSellValue(enhanced), sell + getEnhancementRefund(enhanced));
  sim.update(0.18, IDLE);
  const shot = sim.bullets.find(bullet => bullet.source === 'weapon')!;
  close(shot.damage, preview.damage * 1.05);
});

test('all three part slots grow primary stats and body upgrades preserve shield fraction', () => {
  const sim = new Simulation(save({ credits: 1e7 }), NOW, () => 0.99);
  const wing = sim.getEquippedPart('wing'), body = sim.getEquippedPart('body'), drone = sim.getEquippedPart('drone');
  let before = sim.getStats();
  assert.equal(sim.enhanceEquipment(wing.id), true);
  close(sim.getStats().critChance, before.critChance * 1.05);
  close(sim.getStats().critMultiplier - 2, (before.critMultiplier - 2) * 1.05);
  before = sim.getStats(); sim.player.hp = before.maxHp * 0.43;
  const sell = getPartSellValue(body);
  assert.equal(sim.enhanceEquipment(body.id), true);
  close(sim.getStats().maxHp, before.maxHp * 1.05);
  close(sim.getStats().regen, before.regen * 1.05);
  close(sim.player.hp / sim.getStats().maxHp, 0.43);
  assert.equal(getPartSellValue(body), sell + getEnhancementRefund(body));
  const dronePreview = sim.getPartPreview(drone);
  assert.equal(sim.enhanceEquipment(drone.id), true);
  const newDrone = sim.getPartPreview(drone);
  close(newDrone.stats.find(stat => stat.label === '1機の威力')!.value, dronePreview.stats.find(stat => stat.label === '1機の威力')!.value * 1.05);
  close(newDrone.score, dronePreview.score * 1.05);
  sim.update(0.35, IDLE);
  const shot = sim.bullets.find(bullet => bullet.source === 'drone')!;
  close(shot.damage, 7 * 0.95 * 1.05);
});

test('high quality focus and velocity still benefit after local soft caps while global limits remain', () => {
  const sim = new Simulation(save({ credits: 1e12 }), NOW, () => 0.99);
  const focus = part('softcap-focus', 'focus', 12); equip(sim, focus);
  const before = sim.getStats();
  for (let level = 0; level < 10; level++) assert.equal(sim.enhanceEquipment(focus.id), true);
  assert.ok(sim.getStats().critChance > before.critChance);
  close(sim.getStats().critChance, 0.45); close(sim.getStats().critMultiplier, 4.1);
  const velocity = part('softcap-velocity', 'velocity', 12); equip(sim, velocity);
  const rate = sim.getStats().fireRate;
  for (let level = 0; level < 10; level++) sim.enhanceEquipment(velocity.id);
  assert.ok(sim.getStats().fireRate > rate && sim.getStats().fireRate <= 24);
  close(sim.getPartPreview(sim.getEquippedPart('wing')).stats.find(stat => stat.label === '連射補正')!.value, 180);
  const armor = part('softcap-bastion', 'bastion', 12); equip(sim, armor);
  for (let level = 0; level < 10; level++) sim.enhanceEquipment(armor.id);
  close(sim.getStats().damageReduction, 0.65);
  close(sim.getStats().maxHp, 162 * 12 * 1.5);
  assert.ok(sim.getPartPreview(sim.getEquippedPart('body')).stats.every(stat => Number.isFinite(stat.value)));
});

test('enhancements preserve firing, drone cadence, active overdrive and cooldown', () => {
  const sim = new Simulation(save({ credits: 1e7 }), NOW, () => 0.99);
  sim.state.autopilot = false;
  sim.update(1 / 60, IDLE);
  const initialShots = sim.bullets.filter(bullet => bullet.source === 'weapon').length;
  sim.overdriveLeft = 2; sim.overdriveCooldown = 17;
  for (const id of [sim.state.equippedWeaponId, ...Object.values(sim.state.equippedParts)]) assert.equal(sim.enhanceEquipment(id), true);
  assert.equal(sim.overdriveLeft, 2); assert.equal(sim.overdriveCooldown, 17);
  sim.update(1 / 60, IDLE);
  assert.equal(sim.bullets.filter(bullet => bullet.source === 'weapon').length, initialShots);
  assert.equal(sim.bullets.some(bullet => bullet.source === 'drone'), false);
  sim.update(0.29, IDLE);
  assert.equal(sim.bullets.filter(bullet => bullet.source === 'drone').length, 1);
  sim.player.hp = 0;
  assert.equal(sim.enhanceEquipment(sim.state.equippedParts.body), true);
  assert.equal(sim.player.hp, 0);
});

test('enhancement cap rejects payment and saves sanitize levels while keeping enhanced starters', () => {
  const sim = new Simulation(save({ credits: 1e9 }), NOW, () => 0.99);
  const id = sim.state.equippedWeaponId;
  for (let level = 0; level < 10; level++) assert.equal(sim.enhanceEquipment(id), true);
  const credits = sim.state.credits;
  assert.equal(sim.getEnhancementCost(id), Infinity); assert.equal(sim.enhanceEquipment(id), false);
  assert.equal(sim.state.credits, credits);
  const snapshot = sim.toSave(NOW);
  snapshot.inventory[0].enhancement = 2;
  assert.equal(sim.getEquippedWeapon().enhancement, 10);
  const reload = new Simulation(sim.toSave(NOW), NOW, () => 0.99);
  assert.equal(reload.getEquippedWeapon().enhancement, 10);
  close(reload.getStats().damage, 7 * 1.5);
  assert.equal(validateWeaponItem({ ...createStarterWeapon('pulse'), enhancement: 99 })?.enhancement, 10);
  assert.equal(validatePartItem({ ...createStarterPart('body'), enhancement: -3 })?.enhancement, 0);
  assert.equal(validatePartItem({ ...createStarterPart('wing'), enhancement: NaN })?.enhancement, 0);
});

test('legacy enhancement defaults and upgraded gear survive switching, save and prestige', () => {
  const oldWeapon = { ...createStarterWeapon('pulse') }; delete oldWeapon.enhancement;
  const oldParts = ['wing', 'body', 'drone'].map(slot => createStarterPart(slot as PartItem['slot']));
  oldParts.forEach(part => { delete part.enhancement; });
  const sim = new Simulation(save({ inventory: [oldWeapon], parts: oldParts, wave: 16, bestWave: 15, credits: 1e6 }), NOW, () => 0.99);
  assert.equal(sim.getEquippedWeapon().enhancement, 0);
  assert.ok(sim.state.parts.every(part => part.enhancement === 0));
  const reactor = part('persistent-enhancement', 'reactor'); equip(sim, reactor);
  sim.enhanceEquipment(reactor.id); sim.enhanceEquipment(sim.state.equippedWeaponId);
  sim.equipPart('starter-body'); sim.equipPart(reactor.id);
  assert.equal(sim.getEquippedPart('body').enhancement, 1);
  const snapshot = sim.toSave(NOW);
  assert.equal(sim.prestige(), true);
  assert.equal(sim.state.credits, snapshot.credits + 1500);
  assert.equal(sim.getEquippedPart('body').enhancement, 1); assert.equal(sim.getEquippedWeapon().enhancement, 1);
  const reload = new Simulation(sim.toSave(NOW), NOW, () => 0.99);
  assert.deepEqual(reload.state.parts, sim.state.parts);
  assert.deepEqual(reload.state.inventory, sim.state.inventory);
});
