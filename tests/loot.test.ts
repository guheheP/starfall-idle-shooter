import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { createStarterWeapon, generateWeapon, getSellValue, INVENTORY_CAPACITY, rarityRank, RARITIES,
  validateWeaponItem, WEAPON_BASES } from '../src/game/loot';
import type { Bullet, Enemy, GameState, WeaponAffix, WeaponId, WeaponItem, WeaponRarity } from '../src/game/types';

const NOW = 1_800_000_000_000;
const IDLE = { x: 0, y: 0 };
function seeded(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function item(id: string, type: WeaponId = 'pulse', rarity: WeaponRarity = 'rare', affixes: WeaponAffix[] = [], power = 1.5): WeaponItem {
  return { id, name: `試験 ${type} ${id}`, type, rarity, level: 10, power, affixes,
    locked: false, starter: false, acquiredAt: NOW };
}
function save(overrides: Partial<GameState> = {}): GameState {
  return { ...new Simulation(undefined, NOW, () => 0.9).toSave(NOW), ...overrides };
}
let enemyId = 10000;
function enemy(x: number, y: number, hp = 100): Enemy {
  return { id: enemyId++, kind: 'scout', x, y, hp, maxHp: hp, radius: 19, baseX: x, age: 0, shotTimer: 100, hitFlash: 0 };
}
function projectile(target: Enemy, traits: Partial<Bullet> = {}): Bullet {
  return { id: 50000 + target.id, x: target.x, y: target.y, vx: 0, vy: 0, damage: 30,
    radius: 55, friendly: true, weapon: 'pulse', source: 'weapon', pierce: 1, hitIds: [], ...traits };
}

test('seeded loot covers all six archetypes, five rarities and ten bounded distinct affixes', () => {
  const types = new Set<string>();
  const rarities = new Set<string>();
  const affixIds = new Set<string>();
  const rng = seeded(42310);
  for (let serial = 1; serial <= 3000; serial++) {
    const weapon = generateWeapon(30, serial, rng);
    types.add(weapon.type); rarities.add(weapon.rarity);
    weapon.affixes.forEach(affix => affixIds.add(affix.id));
    assert.equal(weapon.affixes.length, rarityRank(weapon.rarity));
    assert.equal(new Set(weapon.affixes.map(affix => affix.id)).size, weapon.affixes.length);
    assert.ok(weapon.name.length > 0 && weapon.power >= 0.5 && weapon.power <= 12);
    assert.ok(weapon.affixes.every(affix => Number.isFinite(affix.value) && affix.value > 0));
    assert.ok(Number.isFinite(getSellValue(weapon)) && getSellValue(weapon) > 0);
    assert.deepEqual(validateWeaponItem(weapon), weapon);
  }
  assert.equal(types.size, Object.keys(WEAPON_BASES).length);
  assert.equal(rarities.size, RARITIES.length);
  assert.equal(affixIds.size, 10);
  assert.deepEqual(generateWeapon(40, 17, seeded(2)), generateWeapon(40, 17, seeded(2)));
  assert.ok(rarityRank(generateWeapon(5, 1, () => 0, true).rarity) >= 2);
  assert.equal(generateWeapon(1, 1, () => 0.5).type, 'pulse');
  const corrupt = generateWeapon(NaN, Infinity, () => NaN);
  assert.ok(Number.isFinite(corrupt.level) && Number.isFinite(corrupt.power));
});

test('random weapon equipment changes real volley shape and baseline archetype traits', () => {
  const expected: Record<WeaponId, number> = { pulse: 2, spread: 5, lance: 1, missile: 3, arc: 1, orbit: 8 };
  for (const type of Object.keys(expected) as WeaponId[]) {
    const sim = new Simulation(undefined, NOW, () => 0.9);
    const weapon = item(`test-${type}`, type);
    sim.receiveWeapon(weapon);
    assert.equal(sim.state.weapon, 'pulse');
    assert.equal(sim.equipWeapon(weapon.id), true);
    assert.equal(sim.state.weapon, type);
    sim.update(0.18, IDLE);
    const shots = sim.bullets.filter(bullet => bullet.friendly);
    assert.equal(shots.length, expected[type]);
    assert.ok(shots.every(bullet => bullet.weapon === type && Number.isFinite(bullet.vx) && Number.isFinite(bullet.vy)));
    assert.ok(Number.isFinite(sim.getWeaponPreview(weapon).dps));
    if (type === 'missile') assert.ok(shots.every(bullet => bullet.homing! > 0 && bullet.explosion! > 0));
    if (type === 'arc') assert.ok(shots.every(bullet => bullet.chain! > 0));
    if (type === 'orbit') {
      assert.ok(shots.every(bullet => bullet.vy < 0 && bullet.homing! >= 1.1));
      assert.ok(shots.some(bullet => bullet.vx < 0) && shots.some(bullet => bullet.vx > 0));
    }
  }
});

test('power, rapid, critical and pierce affixes affect projectiles and preview consistently', () => {
  const sim = new Simulation(undefined, NOW, () => 0);
  const weapon = item('damage-test', 'pulse', 'legendary', [
    { id: 'power', value: 0.5 }, { id: 'rapid', value: 0.3 }, { id: 'critical', value: 0.3 }, { id: 'pierce', value: 2 },
  ], 2);
  sim.receiveWeapon(weapon); sim.equipWeapon(weapon.id);
  const preview = sim.getWeaponPreview(weapon);
  assert.equal(preview.damage, 7 * 2 * 1.5);
  assert.ok(Math.abs(preview.fireRate - 3.8 * 1.3) < 1e-8);
  assert.equal(preview.critChance, 0.38); // 30% weapon + 8% focus wing.
  sim.update(0.18, IDLE);
  assert.ok(sim.bullets.every(bullet => bullet.crit && bullet.damage === preview.damage * preview.critMultiplier && bullet.pierce === 3));
  const target = enemy(360, 450, 1000);
  sim.enemies = [target, enemy(60, 120, 1e9)];
  sim.bullets = [projectile(target, { crit: true, damage: preview.damage * 2 })];
  sim.update(1 / 60, IDLE);
  assert.ok(sim.drainEvents().some(event => event.kind === 'critical' && event.value === preview.damage * 2));
});

test('homing steering is bounded and turns a projectile toward an off-axis target', () => {
  const sim = new Simulation(undefined, NOW, () => 0.9);
  sim.enemies = [enemy(550, 300, 1e9)];
  const bullet = projectile(sim.enemies[0], { x: 300, y: 600, radius: 4, vx: 0, vy: -500, homing: 2.5 });
  sim.bullets = [bullet];
  sim.update(0.1, IDLE);
  assert.ok(bullet.vx > 0);
  assert.ok(Math.abs(Math.hypot(bullet.vx, bullet.vy) - 500) < 1e-6);
  assert.ok(Math.abs(Math.atan2(bullet.vx, -bullet.vy)) <= 0.250001);
});

test('explosion and chain damage secondary targets once without recursively proccing', () => {
  const sim = new Simulation(undefined, NOW, () => 0.9);
  const primary = enemy(360, 450, 1000), adjacent = enemy(425, 450, 1000), linked = enemy(530, 450, 1000);
  sim.enemies = [primary, adjacent, linked, enemy(60, 120, 1e9)];
  sim.bullets = [projectile(primary, { radius: 32, explosion: 70, chain: 2 })];
  sim.update(1 / 60, IDLE);
  assert.equal(primary.hp, 970);
  assert.ok(adjacent.hp < 1000 && linked.hp < 1000);
  const events = sim.drainEvents();
  assert.equal(events.filter(event => event.kind === 'explosion').length, 1);
  assert.equal(events.find(event => event.kind === 'explosion')?.value, 70);
  assert.equal(events.filter(event => event.kind === 'chain').length, 1);
  assert.equal(events.find(event => event.kind === 'chain')?.points?.length, 3);
});

test('frost slows movement and fire timers, leech heals damage, salvage boosts kills', () => {
  const sim = new Simulation(undefined, NOW, () => 0.9);
  const target = enemy(360, 450, 1000);
  sim.enemies = [target, enemy(60, 120, 1e9)];
  sim.player.hp = 50;
  sim.bullets = [projectile(target, { frost: 0.5, leech: 0.05 })];
  sim.update(1 / 60, IDLE);
  assert.equal(sim.player.hp, 51.5);
  assert.equal(target.slowLeft, 2);
  const beforeAge = target.age, beforeTimer = target.shotTimer;
  sim.update(0.2, IDLE);
  assert.ok(Math.abs(target.age - beforeAge - 0.1) < 1e-6);
  assert.ok(Math.abs(beforeTimer - target.shotTimer - 0.1) < 1e-6);
  sim.bullets = [projectile(target, { damage: 2000, salvage: 0.5 })];
  const credits = sim.state.credits;
  sim.update(1 / 60, IDLE);
  assert.equal(sim.state.credits - credits, Math.floor((8 + 2) * 1.5));
});

test('splash kills credit each victim once to the actual projectile weapon and exclude drones', () => {
  const sim = new Simulation(undefined, NOW, () => 0.9);
  const primary = enemy(360, 450, 1), nearby = enemy(415, 450, 1), survivor = enemy(60, 120, 1e9);
  sim.enemies = [primary, nearby, survivor];
  sim.bullets = [projectile(primary, { radius: 32, weapon: 'arc', explosion: 100, chain: 3 }), projectile(primary, { radius: 32 })];
  sim.update(1 / 60, IDLE);
  assert.equal(sim.state.kills, 2);
  assert.equal(sim.state.mastery.arc, 2);
  assert.equal(sim.state.mastery.pulse, 0);
  const droneTarget = enemy(360, 450, 1);
  sim.enemies = [droneTarget, survivor]; sim.bullets = [projectile(droneTarget, { source: 'drone', weapon: 'arc' })];
  sim.update(1 / 60, IDLE);
  assert.equal(sim.state.mastery.arc, 2);
});

test('auto sell is inclusive, applies to future loot, and manual bulk protects equipment and locks', () => {
  const sim = new Simulation(undefined, NOW, () => 0.9);
  const old = item('old-common', 'spread', 'common');
  const equipped = item('equipped-common', 'pulse', 'common');
  const locked = item('locked-common', 'lance', 'common'); locked.locked = true;
  for (const weapon of [old, equipped, locked]) sim.receiveWeapon(weapon);
  sim.equipWeapon(equipped.id);
  const before = sim.state.credits;
  assert.equal(sim.setAutoSellRarity('uncommon'), true);
  assert.ok(sim.state.inventory.some(weapon => weapon.id === old.id));
  const incoming = item('new-uncommon', 'spread', 'uncommon');
  const sold = sim.receiveWeapon(incoming);
  assert.equal(sold.reason, 'threshold'); assert.equal(sold.sold, true);
  assert.equal(sim.state.credits - before, getSellValue(incoming));
  assert.equal(sim.receiveWeapon(item('new-rare')).stored, true);
  const bulk = sim.sellEligibleWeapons();
  assert.deepEqual(bulk, { count: 1, credits: getSellValue(old) });
  assert.equal(sim.sellWeapon(equipped.id), 0);
  assert.equal(sim.sellWeapon(locked.id), 0);
  assert.equal(sim.sellWeapon('starter-pulse'), 0);
  assert.equal(sim.state.inventory.length, 4);
  assert.equal(sim.state.equippedWeaponId, equipped.id);
  assert.equal(sim.state.lootStats.found, 5);
  assert.equal(sim.state.lootStats.sold, 2);
  assert.equal(sim.state.lootStats.soldCredits, sold.credits + bulk.credits);
  assert.equal(sim.setAutoSellRarity(null), true);
  assert.equal(sim.receiveWeapon(item('kept-common', 'pulse', 'common')).stored, true);
});

test('full inventory trades its weakest unprotected item and never deletes protected weapons', () => {
  const sim = new Simulation(undefined, NOW, () => 0.9);
  for (let index = 0; index < INVENTORY_CAPACITY - 1; index++) sim.receiveWeapon(item(`capacity-${index}`, 'pulse', 'common', [], 1));
  const incoming = item('upgrade', 'missile', 'legendary', [], 3);
  const before = sim.state.credits;
  assert.equal(sim.receiveWeapon(incoming).stored, true);
  assert.equal(sim.state.inventory.length, INVENTORY_CAPACITY);
  assert.ok(sim.state.credits > before);
  assert.ok(sim.state.inventory.some(weapon => weapon.id === 'starter-pulse'));
  assert.ok(sim.state.inventory.some(weapon => weapon.id === incoming.id));
  for (const weapon of sim.state.inventory) if (!weapon.locked) sim.toggleWeaponLock(weapon.id);
  const ids = sim.state.inventory.map(weapon => weapon.id);
  const result = sim.receiveWeapon(item('too-full', 'arc', 'legendary', [], 12));
  assert.equal(result.reason, 'full'); assert.equal(result.sold, true);
  assert.deepEqual(sim.state.inventory.map(weapon => weapon.id), ids);
  assert.equal(sim.state.inventory.length, INVENTORY_CAPACITY);
});

test('legacy migration preserves weapon and progress; corrupt modern items restore usable equipment', () => {
  const legacy = { version: 1, credits: 325, bestWave: 12, wave: 13, weapon: 'lance',
    mastery: { pulse: 35, lance: 600 }, module: 'assault', savedAt: NOW };
  const sim = new Simulation(legacy, NOW, () => 0.9);
  assert.equal(sim.getEquippedWeapon().type, 'lance');
  assert.equal(sim.state.inventory.length, 3);
  assert.ok(sim.state.inventory.every(weapon => weapon.starter && weapon.locked));
  assert.equal(sim.state.mastery.lance, 600); assert.equal(sim.state.credits, 325);
  const bad = item('valid', 'arc', 'legendary', [{ id: 'power', value: Infinity }]);
  const dirty = new Simulation(save({ inventory: [bad, bad, { ...bad, id: 'wrong.id' }, { ...bad, type: 'bad' as WeaponId }],
    equippedWeaponId: 'missing', lootSerial: Infinity, autoSellRarity: 'bad' as WeaponRarity }), NOW, () => 0.9);
  assert.equal(dirty.state.inventory.length, 1);
  assert.equal(dirty.getEquippedWeapon().id, 'valid');
  assert.equal(dirty.state.weapon, 'arc');
  assert.equal(dirty.state.autoSellRarity, null);
  assert.ok(Object.values(dirty.getStats()).every(Number.isFinite));
  const empty = new Simulation(save({ inventory: [{ ...bad, id: '' }], equippedWeaponId: 'missing' }), NOW);
  assert.equal(empty.getEquippedWeapon().id, 'starter-pulse');
  assert.equal(empty.state.weapon, 'pulse');
});

test('duplicate IDs are repaired and restored serial never overwrites existing loot', () => {
  const sim = new Simulation(save({ inventory: [createStarterWeapon('pulse'), item('loot-57')], lootSerial: 1 }), NOW, () => 0.9);
  assert.equal(sim.state.lootSerial, 57);
  const received = sim.receiveWeapon(item('loot-57'));
  assert.equal(received.item.id, 'loot-58');
  assert.equal(new Set(sim.state.inventory.map(weapon => weapon.id)).size, sim.state.inventory.length);
  const restored = new Simulation(sim.toSave(NOW), NOW, () => 0.9);
  assert.equal(restored.state.lootSerial, 58);
});

test('save snapshots and prestige deeply preserve loot, equipped weapon, policy and counters', () => {
  const sim = new Simulation(save({ bestWave: 15, wave: 16, mastery: { pulse: 30, arc: 150 } }), NOW, () => 0.9);
  const weapon = item('permanent', 'arc', 'epic', [{ id: 'chain', value: 3 }, { id: 'leech', value: 0.05 }]);
  sim.receiveWeapon(weapon); sim.equipWeapon(weapon.id); sim.setAutoSellRarity('common');
  const snapshot = sim.toSave(NOW);
  snapshot.inventory.find(item => item.id === weapon.id)!.affixes[0].value = 1;
  snapshot.inventory[0].name = 'changed'; snapshot.lootStats.found = 999;
  assert.equal(sim.getEquippedWeapon().affixes[0].value, 3);
  assert.equal(sim.state.lootStats.found, 1);
  assert.equal(sim.prestige(), true);
  assert.equal(sim.state.weapon, 'arc'); assert.equal(sim.state.equippedWeaponId, weapon.id);
  assert.equal(sim.state.autoSellRarity, 'common'); assert.equal(sim.state.mastery.arc, 150);
  const restored = new Simulation(sim.toSave(NOW), NOW, () => 0.9);
  assert.deepEqual(restored.state.inventory, sim.state.inventory);
  assert.deepEqual(restored.state.lootStats, sim.state.lootStats);
  assert.equal(restored.state.equippedWeaponId, weapon.id);
});

test('boss guarantees rare loot and all six archetypes remain within the bullet cap', () => {
  const sim = new Simulation(save({ wave: 5, bestWave: 4 }), NOW, () => 0);
  const boss = sim.enemies.find(enemy => enemy.kind === 'boss')!;
  sim.enemies = [boss, enemy(60, 120, 1e9)];
  sim.bullets = [projectile(boss, { damage: 1e6, radius: 100 })];
  sim.update(1 / 60, IDLE);
  const drop = sim.drainEvents().find(event => event.kind === 'loot');
  assert.ok(drop?.item && rarityRank(drop.item.rarity) >= 2);
  const orbit = item('cap-orbit', 'orbit', 'legendary', [{ id: 'rapid', value: 0.38 }, { id: 'pierce', value: 3 }]);
  sim.receiveWeapon(orbit); sim.equipWeapon(orbit.id);
  sim.state.upgrades.rate = 20;
  sim.player.invulnerable = 100;
  for (let second = 0; second < 20; second++) { sim.update(1, IDLE); assert.ok(sim.bullets.length <= 350); sim.drainEvents(); }
});

test('periodic save timestamps do not count combat age twice on acquisition', () => {
  const sim = new Simulation(save({ wave: 5, bestWave: 4 }), NOW, () => 0.9);
  sim.update(0.5, IDLE);
  sim.toSave(NOW + 500);
  const boss = sim.enemies.find(enemy => enemy.kind === 'boss')!;
  sim.enemies = [boss, enemy(60, 120, 1e9)];
  sim.bullets = [projectile(boss, { damage: 1e6, radius: 100 })];
  sim.update(1 / 60, IDLE);
  const drop = sim.drainEvents().find(event => event.kind === 'loot');
  assert.ok(drop?.item);
  assert.ok(drop.item.acquiredAt >= NOW + 500 && drop.item.acquiredAt <= NOW + 520);
});
