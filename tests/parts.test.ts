import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, UPGRADE_MAX } from '../src/game/simulation';
import { generatePart, createStarterPart, getPartSellValue, PART_BASES, PART_CAPACITY, validatePartItem } from '../src/game/parts';
import { createStarterWeapon, rarityRank } from '../src/game/loot';
import type { Bullet, Enemy, GameState, PartAffix, PartItem, PartModel, WeaponItem } from '../src/game/types';

const NOW = 1_800_000_000_000, IDLE = { x: 0, y: 0 };
const close = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);
function seeded(seed: number): () => number { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
const save = (overrides: Partial<GameState> = {}) => ({ ...new Simulation(undefined, NOW, () => 0.99).toSave(NOW), ...overrides });
function part(id: string, model: PartModel, power = 2, affixes: PartAffix[] = [], units = 1): PartItem {
  return { id, name: `試験 ${model}`, model, slot: PART_BASES[model].slot, rarity: 'legendary', level: 20,
    power, affixes, units, locked: false, starter: false, acquiredAt: NOW };
}
function equip(sim: Simulation, item: PartItem): void { assert.equal(sim.receivePart(item).stored, true); assert.equal(sim.equipPart(item.id), true); }
let enemyId = 40000;
function enemy(x: number, hp = 1000): Enemy { return { id: enemyId++, kind: 'scout', x, baseX: x, y: 450, hp, maxHp: hp, radius: 19, age: 0, shotTimer: 100, hitFlash: 0 }; }
function bullet(target: Enemy, traits: Partial<Bullet> = {}): Bullet {
  return { id: 90000 + target.id, x: target.x, y: target.y, vx: 0, vy: 0, damage: 30, radius: 55,
    friendly: true, source: 'weapon', weapon: 'pulse', pierce: 1, hitIds: [], ...traits };
}

test('parts cover nine models, all three slots and eleven bounded random affixes', () => {
  const models = new Set<string>(), slots = new Set<string>(), rarities = new Set<string>(), affixes = new Set<string>();
  const rng = seeded(81023);
  for (let serial = 1; serial <= 3000; serial++) {
    const item = generatePart(20, serial, rng);
    models.add(item.model); slots.add(item.slot); rarities.add(item.rarity);
    item.affixes.forEach(affix => affixes.add(affix.id));
    assert.equal(item.slot, PART_BASES[item.model].slot);
    assert.equal(item.affixes.length, rarityRank(item.rarity));
    assert.equal(new Set(item.affixes.map(affix => affix.id)).size, item.affixes.length);
    assert.ok(item.power >= 0.5 && item.power <= 12 && item.units >= 1 && item.units <= 4);
    if (item.slot !== 'drone') assert.equal(item.units, 1);
    assert.deepEqual(validatePartItem(item), item);
    assert.ok(Number.isFinite(getPartSellValue(item)) && getPartSellValue(item) > 0);
  }
  assert.equal(models.size, 9); assert.equal(slots.size, 3); assert.equal(rarities.size, 5); assert.equal(affixes.size, 11);
  assert.deepEqual(generatePart(10, 4, seeded(17)), generatePart(10, 4, seeded(17)));
  assert.ok(rarityRank(generatePart(1, 1, () => 0, true).rarity) >= 2);
});

test('credit calibration has modest fixed caps while equipment makes larger changes', () => {
  const sim = new Simulation(save({ credits: 1e9 }), NOW, () => 0.99);
  const baseline = sim.getStats();
  for (const id of ['damage', 'rate', 'shield'] as const) for (let level = 0; level < 10; level++) assert.equal(sim.buyUpgrade(id), true);
  const calibrated = sim.getStats();
  close(calibrated.damage / baseline.damage, 1.3);
  close(calibrated.fireRate / baseline.fireRate, 1.2);
  close(calibrated.maxHp / baseline.maxHp, 1.2);
  assert.deepEqual(UPGRADE_MAX, { damage: 10, rate: 10, shield: 10, drone: 0 });
  const credits = sim.state.credits;
  for (const id of ['damage', 'rate', 'shield', 'drone'] as const) assert.equal(sim.buyUpgrade(id), false);
  assert.equal(sim.state.credits, credits);
  equip(sim, part('strong-reactor', 'reactor', 3));
  equip(sim, part('strong-velocity', 'velocity', 3));
  assert.ok(sim.getStats().damage > calibrated.damage * 2);
  assert.ok(sim.getStats().fireRate > calibrated.fireRate * 1.4);
});

test('focus raises shared crit chance and multiplier for the weapon and striker drone', () => {
  const sim = new Simulation(undefined, NOW, () => 0);
  sim.state.autopilot = false;
  const weapon: WeaponItem = { ...createStarterWeapon('pulse'), id: 'critical-gun', name: '会心武器', starter: false,
    locked: false, rarity: 'rare', affixes: [{ id: 'critical', value: 0.2 }] };
  sim.receiveWeapon(weapon); sim.equipWeapon(weapon.id);
  equip(sim, part('focus-wing', 'focus', 2));
  const preview = sim.getWeaponPreview(weapon);
  close(preview.critChance, 0.36); close(preview.critMultiplier, 2.56);
  assert.equal(sim.getSynergies().find(synergy => synergy.name === '会心増幅')?.active, true);
  sim.update(0.35, IDLE);
  const shot = sim.bullets.find(bullet => bullet.source === 'weapon')!;
  const drone = sim.bullets.find(bullet => bullet.source === 'drone')!;
  assert.ok(shot.crit && drone.crit);
  close(shot.damage, 7 * 2.56); close(drone.damage, 7 * 0.95 * 2.56);
  assert.equal(drone.droneModel, 'striker');
  close(drone.x - drone.vx * (drone.age ?? 0), sim.player.x - 67);
});

test('cascade expands an existing max chain, piercing and blast instead of creating effects from nothing', () => {
  const sim = new Simulation(undefined, NOW, () => 0.99);
  equip(sim, part('cascade-wing', 'cascade', 3, [{ id: 'reach', value: 0.45 }]));
  assert.equal(sim.getSynergies().find(synergy => synergy.name === '連鎖拡張')?.active, false);
  const weapon: WeaponItem = { ...createStarterWeapon('lance'), id: 'cascade-lance', starter: false, locked: false,
    rarity: 'legendary', affixes: [{ id: 'chain', value: 3 }, { id: 'pierce', value: 3 }, { id: 'explosive', value: 115 }] };
  sim.receiveWeapon(weapon); sim.equipWeapon(weapon.id);
  sim.update(0.18, IDLE);
  const shot = sim.bullets.find(bullet => bullet.source === 'weapon')!;
  assert.equal(shot.chain, 4); assert.equal(shot.pierce, 7);
  close(shot.explosion!, 115 * 2.35); close(shot.chainRange!, 190 * 2.35);
  assert.equal(sim.getSynergies().find(synergy => synergy.name === '連鎖拡張')?.active, true);
  const a = enemy(100), b = enemy(370), c = enemy(640);
  sim.enemies = [a, b, c]; sim.bullets = [bullet(a, { chain: 4 })];
  sim.update(1 / 60, IDLE);
  assert.ok(b.hp < b.maxHp && c.hp < c.maxHp);
});

test('frost drones enable chilled bonus only against an already slowed enemy', () => {
  const sim = new Simulation(undefined, NOW, () => 0.99);
  equip(sim, part('frost-drone', 'frost', 2, [{ id: 'chilled', value: 0.3 }], 2));
  assert.equal(sim.getSynergies().find(synergy => synergy.name === '凍結追撃')?.active, true);
  sim.update(0.35, IDLE);
  const ice = sim.bullets.find(bullet => bullet.source === 'drone')!;
  assert.equal(ice.droneModel, 'frost'); assert.equal(ice.frost, 0.65); assert.equal(ice.chilledBonus, 0.3);
  const target = enemy(360);
  sim.enemies = [target, enemy(60, 1e9)]; sim.bullets = [bullet(target, { frost: 0.4, chilledBonus: 0.3 })];
  sim.update(1 / 60, IDLE); close(target.hp, 970);
  sim.bullets = [bullet(target, { chilledBonus: 0.3 })];
  sim.update(1 / 60, IDLE); close(target.hp, 931);
  target.slowLeft = 0; sim.bullets = [bullet(target, { chilledBonus: 0.3 })];
  sim.update(1 / 60, IDLE); close(target.hp, 901);
});

test('reactor damage is conditional on 70% shield and mender regeneration can maintain it', () => {
  const sim = new Simulation(undefined, NOW, () => 0.99);
  equip(sim, part('reactor-body', 'reactor', 2)); equip(sim, part('mender-drone', 'mender', 2, [], 2));
  const max = sim.getStats().maxHp;
  close(max, 220); close(sim.getStats().regen, 2.4 + 8.8);
  close(sim.getStats().damage, 7 * 1.7);
  sim.player.hp = max * 0.69; close(sim.getStats().damage, 7);
  sim.player.invulnerable = 100;
  sim.update(1, IDLE);
  assert.ok(sim.player.hp > max * 0.7); close(sim.getStats().damage, 7 * 1.7);
  assert.equal(sim.getSynergies().find(synergy => synergy.name === '高シールド維持')?.active, true);
});

test('reactor and stability bonuses apply to real support shots and estimated DPS only above 70% shield', () => {
  for (const source of ['reactor', 'stability'] as const) {
    const shoot = (healthy: boolean) => {
      const sim = new Simulation(save({ skills: source === 'stability' ? { stability: 1 } : {} }), NOW, () => 0.99);
      sim.state.autopilot = false;
      if (source === 'reactor') equip(sim, part(`support-reactor-${healthy}`, 'reactor', 2));
      sim.player.hp = sim.getStats().maxHp * (healthy ? 0.75 : 0.69);
      sim.player.invulnerable = 100;
      const stats = sim.getStats();
      sim.update(0.35, IDLE);
      const support = sim.bullets.find(bullet => bullet.source === 'drone');
      assert.ok(support && !support.crit);
      return { stats, support };
    };
    const high = shoot(true), low = shoot(false);
    const multiplier = source === 'reactor' ? 1.7 : 1.04;
    close(low.support.damage, 7 * 0.95);
    close(high.support.damage, low.support.damage * multiplier);
    close(high.stats.dps, low.stats.dps * multiplier);
  }
});

test('siphon quality can heal beyond six percent and bastion reduces actual incoming damage', () => {
  const sim = new Simulation(undefined, NOW, () => 0.99);
  equip(sim, part('siphon-body', 'siphon', 4));
  sim.update(1.18, IDLE); // The shared absorption budget refills after a larger body is equipped.
  const liveShot = sim.bullets.find(bullet => bullet.source === 'weapon')!;
  close(liveShot.leech!, 0.1);
  sim.player.hp = 50;
  const target = enemy(360);
  sim.enemies = [target, enemy(60, 1e9)]; sim.bullets = [bullet(target, { damage: 100, leech: liveShot.leech })];
  sim.update(1 / 60, IDLE); close(sim.player.hp, 60);
  equip(sim, part('bastion-body', 'bastion', 2));
  sim.player.hp = 200; sim.player.invulnerable = 0;
  sim.bullets = [bullet(target, { x: sim.player.x, y: sim.player.y, friendly: false, damage: 100 })];
  sim.update(1 / 60, IDLE); close(sim.player.hp, 124);
  assert.equal(sim.getPartPreview(sim.getEquippedPart('body')).stats.find(stat => stat.label === '軽減')?.value, 24);
});

test('equipment switching preserves shield fraction, cooldown and firing cadence', () => {
  const sim = new Simulation(undefined, NOW, () => 0.99);
  const reactor = part('swapped-reactor', 'reactor', 3, [{ id: 'cooldown', value: 0.18 }]);
  const velocity = part('swapped-velocity', 'velocity', 2);
  sim.receivePart(reactor); sim.receivePart(velocity);
  sim.player.hp = sim.getStats().maxHp * 0.4;
  sim.overdriveCooldown = 17;
  sim.update(1 / 60, IDLE);
  const initialShots = sim.bullets.filter(bullet => bullet.source === 'weapon').length;
  for (let index = 0; index < 10; index++) { sim.equipPart(reactor.id); sim.equipPart('starter-body'); sim.equipPart(velocity.id); sim.equipPart('starter-wing'); }
  close(sim.player.hp / sim.getStats().maxHp, 0.4);
  close(sim.overdriveCooldown, 17 - 1 / 60);
  sim.update(1 / 60, IDLE);
  assert.equal(sim.bullets.filter(bullet => bullet.source === 'weapon').length, initialShots);
  sim.equipPart(reactor.id); sim.overdriveCooldown = 0;
  sim.activateOverdrive(); close(sim.overdriveCooldown, 45 * 0.82);
  sim.player.hp = 0; sim.equipPart('starter-body'); assert.equal(sim.player.hp, 0);
});

test('part auto sell, bulk and manual protections share policy and counters with weapons', () => {
  const sim = new Simulation(undefined, NOW, () => 0.99);
  const eligible = { ...part('bulk-part', 'velocity'), rarity: 'common' as const, affixes: [] };
  const locked = { ...part('locked-part', 'bastion'), rarity: 'common' as const, locked: true };
  const equipped = { ...part('equipped-part', 'mender'), rarity: 'common' as const };
  for (const item of [eligible, locked, equipped]) sim.receivePart(item);
  sim.equipPart(equipped.id);
  const gun: WeaponItem = { ...createStarterWeapon('pulse'), id: 'bulk-gun', starter: false, locked: false };
  sim.receiveWeapon(gun); sim.setAutoSellRarity('common');
  const incoming = { ...part('auto-part', 'siphon'), rarity: 'common' as const };
  const outcome = sim.receivePart(incoming);
  assert.equal(outcome.reason, 'threshold'); assert.equal(outcome.credits, getPartSellValue(incoming));
  assert.equal(sim.sellPart('starter-body'), 0); assert.equal(sim.sellPart(locked.id), 0); assert.equal(sim.sellPart(equipped.id), 0);
  const bulk = sim.sellEligibleWeapons();
  assert.equal(bulk.count, 2);
  assert.equal(sim.state.lootStats.found, 5); assert.equal(sim.state.lootStats.sold, 3);
  assert.equal(sim.state.lootStats.soldCredits, outcome.credits + bulk.credits);
  assert.ok(sim.state.parts.some(item => item.id === locked.id));
  assert.equal(sim.state.parts.length, 5);
});

test('part capacity is independent and full all-protected storage sells only incoming loot', () => {
  const sim = new Simulation(undefined, NOW, () => 0.99);
  for (let index = 0; index < PART_CAPACITY - 3; index++) sim.receivePart({ ...part(`capacity-part-${index}`, 'velocity', 1), rarity: 'common' });
  assert.equal(sim.state.parts.length, PART_CAPACITY); assert.equal(sim.state.inventory.length, 1);
  const higher = part('higher-wing', 'cascade', 3);
  assert.equal(sim.receivePart(higher).stored, true);
  assert.equal(sim.state.parts.length, PART_CAPACITY);
  for (const item of sim.state.parts) if (!item.locked) sim.togglePartLock(item.id);
  const ids = sim.state.parts.map(item => item.id);
  assert.equal(sim.receivePart(part('overflow-body', 'reactor', 12)).reason, 'full');
  assert.deepEqual(sim.state.parts.map(item => item.id), ids);
});

test('mixed-slot overflow replaces lower rarity before preferring the incoming slot', () => {
  const sim = new Simulation(undefined, NOW, () => 0.99);
  const legendaryBody = part('valuable-body', 'reactor', 3);
  sim.receivePart(legendaryBody);
  for (let index = 0; index < PART_CAPACITY - 4; index++) sim.receivePart({ ...part(`disposable-wing-${index}`, 'velocity', 1), rarity: 'common' });
  assert.equal(sim.state.parts.length, PART_CAPACITY);
  const epicBody = { ...part('incoming-epic-body', 'siphon', 2), rarity: 'epic' as const };
  const outcome = sim.receivePart(epicBody);
  assert.equal(outcome.stored, true); assert.equal(outcome.sold, false);
  assert.equal(sim.state.parts.length, PART_CAPACITY);
  assert.ok(sim.state.parts.some(item => item.id === legendaryBody.id));
  assert.ok(sim.state.parts.some(item => item.id === epicBody.id));
  assert.equal(sim.state.parts.filter(item => item.id.startsWith('disposable-wing-')).length, PART_CAPACITY - 5);
  assert.equal(sim.state.lootStats.sold, 1);
});

test('old upgrade investment is refunded once and support converts to protected starter units', () => {
  const legacy = { ...save({ credits: 300, bestWave: 19, wave: 20, mastery: { pulse: 90 }, module: 'assault' }),
    equipmentVersion: undefined, parts: undefined, equippedParts: undefined,
    upgrades: { damage: 6, rate: 4, shield: 2, drone: 1 } };
  const sim = new Simulation(legacy, NOW, () => 0.99);
  assert.equal(sim.state.credits, 944);
  assert.equal(sim.state.equipmentVersion, 2);
  assert.equal(sim.getEquippedPart('drone').units, 1);
  assert.ok(sim.state.parts.every(item => item.starter && item.locked));
  assert.equal(sim.state.wave, 20); assert.equal(sim.state.mastery.pulse, 90); assert.equal(sim.state.module, 'assault');
  const reloaded = new Simulation(sim.toSave(NOW), NOW, () => 0.99);
  assert.equal(reloaded.state.credits, sim.state.credits);
  assert.deepEqual(reloaded.state.parts, sim.state.parts);
  const armor = new Simulation({ ...legacy, upgrades: { damage: 0, rate: 0, shield: 20, drone: 4 } }, NOW, () => 0.99);
  assert.equal(armor.getEquippedPart('drone').units, 4);
  assert.ok(armor.getStats().maxHp >= (100 + 20 * 28) * 0.8);
});

test('part saves sanitize corrupt slot/model, cap units, restore missing slots and preserve deep copies', () => {
  const valid = part('part-99', 'frost', 2, [{ id: 'chilled', value: Infinity }], 999);
  const sim = new Simulation(save({ parts: [valid, valid, { ...valid, id: 'bad.id' }, { ...valid, id: 'wrong-slot', slot: 'wing' } as PartItem],
    equippedParts: { wing: 'missing', body: 'missing', drone: 'part-99' }, lootSerial: 1 }), NOW, () => 0.99);
  assert.equal(sim.state.parts.length, 3); assert.equal(sim.getEquippedPart('drone').units, 4);
  assert.equal(sim.getEquippedPart('wing').id, 'starter-wing'); assert.equal(sim.getEquippedPart('body').id, 'starter-body');
  assert.equal(sim.state.lootSerial, 99);
  assert.ok(Object.values(sim.getStats()).every(Number.isFinite));
  const snapshot = sim.toSave(NOW);
  snapshot.parts[0].affixes[0].value = 0; snapshot.equippedParts.drone = 'changed';
  assert.ok(sim.getEquippedPart('drone').affixes[0].value > 0);
  const duplicate = sim.receivePart(valid);
  assert.equal(duplicate.item.id, 'part-100');
});

test('prestige retains all equipment, locks, affixes, policy and permanent progression', () => {
  const sim = new Simulation(save({ wave: 16, bestWave: 15, mastery: { pulse: 80 } }), NOW, () => 0.99);
  equip(sim, part('persistent-reactor', 'reactor', 3, [{ id: 'regen', value: 2 }]));
  sim.setAutoSellRarity('uncommon');
  const before = sim.toSave(NOW);
  assert.equal(sim.prestige(), true);
  assert.deepEqual(sim.state.parts, before.parts); assert.deepEqual(sim.state.equippedParts, before.equippedParts);
  assert.notEqual(sim.state.parts, before.parts);
  assert.equal(sim.state.autoSellRarity, 'uncommon'); assert.equal(sim.state.mastery.pulse, 80);
  const reload = new Simulation(sim.toSave(NOW), NOW, () => 0.99);
  assert.deepEqual(reload.state.parts, sim.state.parts); assert.deepEqual(reload.state.equippedParts, sim.state.equippedParts);
});

test('boss guarantees both rare weapon and rare part without auto-equipping either', () => {
  const sim = new Simulation(save({ wave: 5, bestWave: 4 }), NOW, () => 0.99);
  const boss = sim.enemies.find(enemy => enemy.kind === 'boss')!;
  sim.enemies = [boss, enemy(60, 1e9)]; sim.bullets = [bullet(boss, { damage: 1e6, radius: 100 })];
  sim.update(1 / 60, IDLE);
  const drops = sim.drainEvents().filter(event => event.kind === 'loot');
  assert.equal(drops.length, 2);
  assert.ok(drops.every(event => event.item && rarityRank(event.item.rarity) >= 2));
  assert.equal(sim.state.equippedWeaponId, 'starter-pulse');
  assert.deepEqual(sim.state.equippedParts, { wing: 'starter-wing', body: 'starter-body', drone: 'starter-drone' });
});
