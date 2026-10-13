import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { ELITES, getSector, getWaveScale, SECTORS } from '../src/game/sectors';
import { createCollection, readCollection } from '../src/game/collection';
import { createStarterWeapon, RARITIES, rarityRank, WEAPON_BASES } from '../src/game/loot';
import { createStarterPart, PART_BASES } from '../src/game/parts';
import type { Bullet, EliteId, Enemy, GameState, PartItem, PartModel, WeaponId, WeaponItem, WeaponRarity } from '../src/game/types';

const NOW = 1_800_000_000_000, IDLE = { x: 0, y: 0 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);
const save = (overrides: Partial<GameState> = {}) => ({ ...new Simulation(undefined, NOW, () => 0.9).toSave(NOW), ...overrides });
const weapon = (id: string, type: WeaponId = 'pulse', rarity: WeaponRarity = 'rare'): WeaponItem =>
  ({ ...createStarterWeapon(type), id, starter: false, locked: false, rarity, level: 10 });
const part = (id: string, model: PartModel, rarity: WeaponRarity = 'rare', power = 1): PartItem =>
  ({ ...createStarterPart(PART_BASES[model].slot), id, model, rarity, power, starter: false, locked: false });
let nextId = 80000;
const target = (x = 360, y = 450): Enemy => ({ id: nextId++, kind: 'scout', x, y, baseX: x, hp: 1e9, maxHp: 1e9, radius: 19, age: 0, shotTimer: 100, hitFlash: 0 });
const shot = (enemy: Enemy, traits: Partial<Bullet> = {}): Bullet => ({ id: nextId++, x: enemy.x, y: enemy.y, vx: 0, vy: 0,
  radius: 55, damage: 10000, friendly: true, weapon: 'pulse', source: 'weapon', hitIds: [], pierce: 1, ...traits });

test('five sectors have stable gates and early armor tapers smoothly into the late curve', () => {
  assert.deepEqual(SECTORS.map(sector => sector.unlockWave), [1, 15, 30, 50, 75]);
  assert.equal(new Set(SECTORS.map(sector => sector.id)).size, 5);
  for (const [wave, id] of [[14, 'frontier'], [15, 'ion'], [29, 'ion'], [30, 'wreckage'], [50, 'aurora'], [75, 'void']] as const) assert.equal(getSector(wave).id, id);
  close(getWaveScale(1), 2.4);
  close(getWaveScale(30), Math.pow(1.14, 29));
  for (let wave = 2; wave <= 31; wave++) {
    assert.ok(getWaveScale(wave) > getWaveScale(wave - 1));
    assert.ok(getWaveScale(wave) / getWaveScale(wave - 1) < 1.15, 'sector transition must not create an armor spike');
  }
  assert.ok(getWaveScale(100) < Math.pow(1.14, 99) / 20);
  assert.ok(getWaveScale(100) > getWaveScale(75) && getWaveScale(75) > getWaveScale(50));
  assert.ok(Number.isFinite(getWaveScale(10000))); assert.equal(getSector(NaN).id, 'frontier');
  const sim = new Simulation(save({ wave: 100, bestWave: 99 }), NOW, () => 0.9);
  close(sim.enemies.find(enemy => enemy.kind === 'boss')!.maxHp, 245 * getWaveScale(100));
});

test('one readable elite appears from W20 and its warning precedes distinct attacks with locked sniper aim', () => {
  assert.equal(new Simulation(save({ wave: 19, bestWave: 18 }), NOW).enemies.some(enemy => enemy.elite), false);
  for (const [wave, model, count] of [[20, 'vanguard', 3], [23, 'sniper', 1], [26, 'barrage', 6]] as const) {
    const sim = new Simulation(save({ wave, bestWave: wave - 1, autopilot: false }), NOW, () => 0.9);
    assert.equal(sim.enemies.filter(enemy => enemy.elite).length, 1);
    const elite = sim.enemies.find(enemy => enemy.elite)!;
    assert.equal(elite.elite, model); assert.notEqual(elite.kind, 'boss');
    elite.hp = elite.maxHp = 1e9; sim.enemies = [elite];
    elite.shotTimer = ELITES[model].chargeTime + 0.1;
    sim.update(0.12, IDLE);
    assert.ok(elite.charge! > 0 && elite.charge! <= 1 && Number.isFinite(elite.aimAngle));
    assert.equal(sim.bullets.some(bullet => !bullet.friendly), false);
    const locked = elite.aimAngle!;
    sim.player.x += 120;
    sim.update(ELITES[model].chargeTime + 0.1, IDLE);
    const hostile = sim.bullets.filter(bullet => !bullet.friendly);
    assert.equal(hostile.length, count);
    assert.ok(hostile.every(bullet => Number.isFinite(bullet.vx) && Number.isFinite(bullet.vy)));
    if (model === 'sniper') close(Math.atan2(hostile[0].vy, hostile[0].vx), locked);
    assert.equal(elite.charge, 0);
  }
});

test('elite kill gives exactly one real rare drop and captured projectile attribution even after a weapon change', () => {
  const sim = new Simulation(save({ wave: 20, bestWave: 19 }), NOW, () => 0.9);
  const elite = sim.enemies.find(enemy => enemy.elite)!;
  sim.enemies = [elite, target(60, 120)]; sim.bullets = [shot(elite, { damage: 1e9, radius: 100, weapon: 'arc' })];
  sim.update(1 / 60, IDLE);
  const events = sim.drainEvents(), kill = events.find(event => event.kind === 'kill')!;
  assert.equal(kill.weapon, 'arc'); assert.equal(kill.source, 'weapon'); assert.equal(kill.elite, 'vanguard');
  assert.equal(kill.value, Math.floor((8 + 20 * 2) * 2.5 * getSector(20).creditMultiplier));
  const drops = events.filter(event => event.kind === 'loot');
  assert.equal(drops.length, 1); assert.ok(rarityRank(drops[0].item!.rarity) >= 2);
  assert.equal(sim.state.collection.elites, 1); assert.equal(sim.state.mastery.arc, 1);
  assert.equal(sim.state.weapon, 'pulse');
});

test('collection counts actual sold acquisitions, excludes starters, and awards fixed milestones once', () => {
  const sim = new Simulation(save({ module: 'salvager', bestWave: 100, wave: 101 }), NOW, () => 0.9);
  assert.equal(sim.getCollectionSummary().weaponsFound, 0); assert.equal(sim.getCollectionSummary().partsFound, 0);
  sim.drainEvents(); sim.setAutoSellRarity('legendary');
  for (const id of Object.keys(WEAPON_BASES) as WeaponId[]) assert.equal(sim.receiveWeapon(weapon(`family-${id}`, id)).sold, true);
  for (const id of Object.keys(PART_BASES) as PartModel[]) assert.equal(sim.receivePart(part(`model-${id}`, id)).sold, true);
  for (const rarity of RARITIES) sim.receiveWeapon(weapon(`rarity-${rarity.id}`, 'pulse', rarity.id));
  const summary = sim.getCollectionSummary();
  assert.equal(summary.weaponsFound, 6); assert.equal(summary.partsFound, 9); assert.equal(summary.raritiesFound, 5);
  assert.equal(sim.state.inventory.length, 1); assert.equal(sim.state.parts.length, 3);
  const rewards = sim.drainEvents().filter(event => event.kind === 'collection' && event.value);
  assert.ok(rewards.some(event => event.value === 1800)); assert.ok(rewards.some(event => event.value === 2400));
  assert.ok(rewards.some(event => event.value === 1500)); // Fixed reward bypasses both module and sector multipliers.
  const claimed = [...sim.state.collection.claimed];
  sim.receiveWeapon(weapon('another-legend', 'pulse', 'legendary'));
  assert.deepEqual(sim.state.collection.claimed, claimed);
  assert.equal(sim.drainEvents().some(event => event.kind === 'collection' && event.value), false);
});

test('legacy collection derives only owned nonstarter gear once and keeps deep permanent snapshots', () => {
  const modern = save({ wave: 16, bestWave: 15, inventory: [createStarterWeapon('pulse'), weapon('legacy-drop', 'arc')],
    parts: [createStarterPart('wing'), createStarterPart('body'), createStarterPart('drone'), part('legacy-part', 'frost')] });
  const { collectionVersion: _version, collection: _collection, ...legacy } = modern;
  const sim = new Simulation(legacy, NOW, () => 0.9);
  assert.equal(sim.state.collection.weapons.arc, 1); assert.equal(sim.state.collection.parts.frost, 1);
  assert.equal(sim.state.collection.rarities.rare, 2); assert.equal(sim.state.collection.weapons.pulse, undefined);
  const snapshot = sim.toSave(NOW);
  snapshot.collection.weapons.arc = 999; snapshot.collection.claimed.push('fake');
  assert.equal(sim.state.collection.weapons.arc, 1); assert.equal(sim.state.collection.claimed.includes('fake'), false);
  assert.equal(sim.prestige(), true);
  const reload = new Simulation(sim.toSave(NOW), NOW, () => 0.9);
  assert.deepEqual(reload.state.collection, sim.state.collection);
  assert.equal(reload.state.collection.weapons.arc, 1); assert.equal(reload.state.collection.parts.frost, 1);
  const corrupt = readCollection({ weapons: { pulse: Infinity, orbit: 1e20, fake: 4 }, parts: { frost: -3 }, rarities: { rare: 4 },
    elites: NaN, bosses: -9, claimed: ['first-legendary', 'first-legendary', 'fake'] });
  assert.equal(corrupt.weapons.orbit, 1e9); assert.equal(corrupt.weapons.pulse, undefined);
  assert.deepEqual(corrupt.claimed, ['first-legendary']); assert.equal(corrupt.elites, 0);
});

test('wave and elite milestones are automatic, permanent, and never awarded twice', () => {
  const collection = createCollection(); collection.elites = 24;
  collection.claimed = ['first-legendary', 'wave-30', 'wave-50'];
  const sim = new Simulation(save({ wave: 100, bestWave: 99, collection }), NOW, () => 0.9);
  const enemy = target(); enemy.hp = 1; enemy.elite = 'sniper';
  sim.enemies = [enemy, target(60, 120)]; sim.bullets = [shot(enemy)];
  sim.update(1 / 60, IDLE);
  assert.equal(sim.state.collection.elites, 25);
  assert.ok(sim.drainEvents().some(event => event.kind === 'collection' && event.value === 1500));
  sim.enemies = []; sim.update(1 / 60, IDLE);
  assert.equal(sim.state.bestWave, 100);
  assert.ok(sim.drainEvents().some(event => event.kind === 'collection' && event.value === 8000));
  const reload = new Simulation(sim.toSave(NOW), NOW, () => 0.9);
  assert.equal(reload.drainEvents().some(event => event.kind === 'collection' && event.value), false);
});

test('offline sector follows completed progress while combat shot speed and interval follow the active sector', () => {
  const sim = new Simulation(save({ bestWave: 49, wave: 50 }), NOW, () => 0.9);
  close(sim.getStats().offlineRate, (3 + 49 * 1.2) * 0.5 * getSector(49).creditMultiplier * 3);
  const boss = sim.enemies.find(enemy => enemy.kind === 'boss')!;
  sim.enemies = [boss]; boss.shotTimer = 0; sim.update(1 / 60, IDLE);
  const bullet = sim.bullets.find(bullet => !bullet.friendly)!;
  close(Math.hypot(bullet.vx, bullet.vy), (140 + 170) * getSector(50).enemySpeed);
  close(boss.shotTimer, Math.max(0.95, 1.75 - 50 * 0.018) * getSector(50).shotInterval);
});

test('orbit is functional without homing affixes and retains eight flower origins with curved forward lanes', () => {
  const sim = new Simulation(save({ autopilot: false }), NOW, () => 0.9);
  const orbit = weapon('base-orbit', 'orbit', 'common'); sim.receiveWeapon(orbit); sim.equipWeapon(orbit.id);
  sim.enemies = [target(540, 180)];
  sim.update(0.151, IDLE);
  const shots = sim.bullets.filter(bullet => bullet.source === 'weapon');
  assert.equal(shots.length, 8);
  assert.ok(shots.every(bullet => bullet.homing === 1.1 && bullet.vy < 0));
  assert.equal(new Set(shots.map(bullet => Math.round(bullet.x))).size, 8);
  const left = shots[0], previousVx = left.vx;
  sim.update(0.2, IDLE);
  assert.ok(left.vx > previousVx); assert.ok(left.vy < 0);
  assert.ok(sim.drainEvents().some(event => event.kind === 'shot' && event.weapon === 'orbit' && event.source === 'weapon'));
});

test('shared absorption budget limits simultaneous weapon and drone bursts and refills over combat time', () => {
  const sim = new Simulation(undefined, NOW, () => 0.9), enemy = target();
  sim.enemies = [enemy, target(60, 120)]; sim.player.hp = 50; sim.player.invulnerable = 100;
  const cap = sim.getStats().leechCapPerSecond;
  sim.bullets = [shot(enemy, { leech: 0.2 }), shot(enemy, { leech: 0.2, source: 'drone' })];
  sim.update(1 / 60, IDLE); close(sim.player.hp, 50 + cap);
  const burstEvents = sim.drainEvents().filter(event => event.kind === 'hit' || event.kind === 'critical');
  close(burstEvents.reduce((sum, event) => sum + (event.healing ?? 0), 0), cap);
  assert.ok(burstEvents.some(event => event.source === 'drone' && event.healing === 0));
  assert.ok(burstEvents.every(event => event.value === 10000));
  sim.bullets = []; sim.update(0.5, IDLE);
  const hp = sim.player.hp;
  sim.bullets = [shot(enemy, { leech: 0.2 }), shot(enemy, { leech: 0.2, source: 'drone' })];
  sim.update(1 / 60, IDLE); close(sim.player.hp - hp, cap * (0.5 + 1 / 60));
});

test('build changes preserve absorption budget instead of refilling it, while respawn refreshes it', () => {
  const sim = new Simulation(save({ credits: 1e6, bestWave: 10 }), NOW, () => 0.9), enemy = target();
  sim.enemies = [enemy, target(60, 120)]; sim.player.hp = 50;
  sim.bullets = [shot(enemy, { leech: 0.2 })]; sim.update(1 / 60, IDLE);
  const body = part('larger-body', 'bastion', 'rare', 4); sim.receivePart(body);
  const changes = [() => sim.equipPart(body.id), () => sim.setModule('bulwark'), () => sim.enhanceEquipment(body.id)];
  for (const change of changes) {
    assert.equal(change(), true);
    const hp = sim.player.hp, cap = sim.getStats().leechCapPerSecond;
    sim.bullets = [shot(enemy, { leech: 0.2 })]; sim.update(1 / 60, IDLE);
    close(sim.player.hp - hp, cap / 60);
  }
  sim.player.hp = 0; sim.update(1 / 60, IDLE); sim.update(1, IDLE); sim.update(1, IDLE); sim.update(1, IDLE); sim.update(0.1, IDLE);
  assert.equal(sim.status, 'fighting');
  const fresh = target(); sim.enemies = [fresh, target(60, 120)]; sim.player.hp = 50;
  sim.bullets = [shot(fresh, { leech: 0.2 })]; sim.update(1 / 60, IDLE);
  close(sim.player.hp, 50 + sim.getStats().leechCapPerSecond);
});

test('high DPS absorption cannot outrun its shared cap and mender regeneration stays independent', () => {
  const sim = new Simulation(undefined, NOW, () => 0.9), enemy = target();
  const mender = part('healing-drone', 'mender', 'rare', 2); mender.units = 2;
  sim.receivePart(mender); sim.equipPart(mender.id);
  sim.enemies = [enemy, target(60, 120)]; sim.player.hp = 50; sim.player.invulnerable = 100;
  const stats = sim.getStats(); close(stats.regen, 10.8);
  for (let frame = 0; frame < 300; frame++) {
    sim.bullets = [shot(enemy, { damage: 20000, leech: 0.01 }), shot(enemy, { damage: 20000, leech: 0.01, source: 'drone' })];
    sim.update(1 / 60, IDLE); sim.drainEvents();
  }
  const healed = sim.player.hp - 50;
  assert.ok(healed <= stats.leechCapPerSecond * 6 + stats.regen * 5 + 1e-6);
  assert.ok(healed > stats.leechCapPerSecond * 6 + stats.regen * 3);
});
