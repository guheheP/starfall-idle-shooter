import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, Simulation } from '../src/game/simulation';
import type { Bullet, Enemy, GameState, WeaponId } from '../src/game/types';

const NOW = 1_800_000_000_000;
const IDLE = { x: 0, y: 0 };
const save = (overrides: Partial<GameState> = {}): GameState => ({ ...new Simulation(undefined, NOW).toSave(NOW), ...overrides });
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
let nextEnemyId = 100000;

/** Keep a surviving target so a synthetic kill exercises attribution without clearing the wave. */
function kill(sim: Simulation, weapon: WeaponId, kind: Enemy['kind'] = 'scout', source: Bullet['source'] = 'weapon'): void {
  const target: Enemy = { id: nextEnemyId++, kind, x: 360, y: 450, baseX: 360,
    hp: 1, maxHp: 1, radius: 19, age: 0, shotTimer: 100, hitFlash: 0 };
  const survivor: Enemy = { ...target, id: nextEnemyId++, x: 60, baseX: 60, y: 120, hp: 1e9, maxHp: 1e9 };
  sim.enemies = [target, survivor];
  sim.bullets = [{ id: 200000 + target.id, x: 360, y: 450, vx: 0, vy: 0,
    damage: 100, radius: 160, friendly: true, weapon, source, pierce: 1, hitIds: [] }];
  sim.update(1 / 60, IDLE);
  assert.equal(sim.enemies.includes(target), false);
}

test('legacy v1 saves retain existing progress while missing loadout fields migrate', () => {
  const legacy = save({ credits: 3210, totalKills: 500, bestWave: 12, wave: 13, weapon: 'lance',
    research: { power: 3, salvage: 2, cooldown: 1 }, upgrades: { damage: 6, rate: 4, shield: 2, drone: 1 } });
  const { module: _module, mastery: _mastery, inventory: _inventory, equippedWeaponId: _equipped,
    autoSellRarity: _autoSell, lootSerial: _serial, lootStats: _stats,
    equipmentVersion: _equipmentVersion, parts: _parts, equippedParts: _equippedParts,
    researchVersion: _researchVersion, skills: _skills, ...oldSave } = legacy;
  const sim = new Simulation(oldSave, NOW);
  assert.equal(sim.state.module, 'standard');
  assert.deepEqual(sim.state.mastery, { pulse: 0, spread: 0, lance: 0 });
  assert.equal(sim.state.credits, 3210 + 644); // Refund old geometric spend minus retained calibration.
  assert.equal(sim.state.totalKills, 500);
  assert.equal(sim.state.weapon, 'lance');
  assert.deepEqual(sim.state.upgrades, { ...legacy.upgrades, drone: 0 });
  assert.equal(sim.getEquippedPart('drone').units, 1);
  assert.deepEqual(sim.state.research, { power: 0, salvage: 0, cooldown: 0 });
  assert.deepEqual(sim.state.skills, { power: 3, salvage: 2, cooling: 1 });
  assert.equal(sim.state.wave, 13);
});

test('invalid loadout saves are sanitized without poisoning stats', () => {
  const sim = new Simulation({ ...save({ bestWave: 10 }), module: 'invalid', mastery: { pulse: -8, spread: Infinity, lance: 1e15 } }, NOW);
  assert.equal(sim.state.module, 'standard');
  assert.deepEqual(sim.state.mastery, { pulse: 0, spread: 0, lance: 1e9 });
  assert.equal(new Simulation(save({ module: 'assault' }), NOW).state.module, 'standard');
  assert.ok(Object.values(sim.getStats()).every(Number.isFinite));
  assert.deepEqual(sim.getMastery('lance'), { level: 5, points: 1e9, current: 0, required: 0, bonus: 0.4 });
});

test('mastery follows the killing bullet after switching weapons and excludes drone kills', () => {
  const sim = new Simulation(save({ bestWave: 10, mastery: { pulse: 29, spread: 99, lance: 498 } }), NOW);
  sim.drainEvents();
  assert.equal(sim.setWeapon('spread'), true);
  kill(sim, 'pulse');
  assert.deepEqual(sim.getMastery('pulse'), { level: 2, points: 30, current: 0, required: 70, bonus: 0.1 });
  assert.equal(sim.state.mastery.spread, 99);
  assert.ok(sim.drainEvents().some(event => event.kind === 'mastery' && event.message?.includes('パルス')));
  assert.equal(sim.setWeapon('lance'), true);
  kill(sim, 'spread', 'boss');
  assert.equal(sim.state.mastery.spread, 104);
  assert.equal(sim.getMastery('spread').level, 3);
  kill(sim, 'pulse', 'boss', 'drone');
  assert.equal(sim.state.mastery.pulse, 30);
  kill(sim, 'lance', 'boss');
  assert.equal(sim.getMastery('lance').level, 5);
  assert.equal(sim.getMastery('lance').bonus, 0.4);
  sim.drainEvents();
  kill(sim, 'lance', 'boss');
  assert.equal(sim.drainEvents().some(event => event.kind === 'mastery'), false);
  close(sim.getStats().damage, 7 * 1.4);
});

test('drone projectiles identify their source and do not inherit weapon mastery', () => {
  const sim = new Simulation(save({ bestWave: 10, mastery: { pulse: 500, spread: 0, lance: 0 },
    upgrades: { damage: 0, rate: 0, shield: 0, drone: 0 } }), NOW, () => 0.99);
  sim.update(0.35, IDLE);
  const drone = sim.bullets.find(bullet => bullet.source === 'drone');
  assert.ok(drone);
  close(drone.damage, 7 * 0.95);
  assert.ok(sim.bullets.some(bullet => bullet.source === 'weapon' && bullet.damage === 7 * 1.4));
  close(sim.getStats().dps, (7 * 1.4 * 3.8 * 2 + 7 * 0.95) * (1 + 0.08 * (2.28 - 1)));
});

test('module unlocks and stat tradeoffs preserve health fraction and skill cooldown', () => {
  const locked = new Simulation(undefined, NOW);
  assert.deepEqual(MODULES.map(module => module.unlock), [0, 3, 6, 8]);
  assert.equal(locked.setModule('assault'), false);
  assert.equal(locked.setModule('bogus' as never), false);
  const sim = new Simulation(save({ bestWave: 10 }), NOW);
  sim.player.hp = 64.8;
  sim.overdriveCooldown = 17;
  assert.equal(sim.setModule('assault'), true);
  close(sim.getStats().damage, 7 * 1.25);
  close(sim.getStats().maxHp, 129.6);
  close(sim.player.hp, 51.84);
  assert.equal(sim.setModule('assault'), false);
  assert.equal(sim.setModule('bulwark'), true);
  close(sim.getStats().damage, 7 * 0.9);
  close(sim.getStats().maxHp, 234.9);
  close(sim.player.hp, 93.96);
  for (let i = 0; i < 10; i++) { sim.setModule('standard'); sim.setModule('bulwark'); }
  close(sim.player.hp / sim.getStats().maxHp, 0.4);
  assert.equal(sim.overdriveCooldown, 17);
  sim.player.hp = 0;
  sim.setModule('standard');
  assert.equal(sim.player.hp, 0);
});

test('salvager applies once to online kills, clears, achievements, recovery and offline income', () => {
  const standard = new Simulation(save({ wave: 9, bestWave: 8 }), NOW);
  const salvager = new Simulation(save({ wave: 9, bestWave: 8, module: 'salvager' }), NOW);
  const originalCredits = salvager.state.credits;
  kill(standard, 'pulse');
  kill(salvager, 'pulse');
  assert.equal(salvager.state.credits - originalCredits, Math.floor((8 + 9 * 2) * 1.35));
  close(salvager.getStats().offlineRate / standard.getStats().offlineRate, 1.35);
  const beforeOffline = salvager.state.credits;
  const offline = salvager.claimOffline(600);
  assert.equal(offline?.credits, Math.floor(600 * salvager.getStats().offlineRate));
  assert.equal(salvager.state.credits - beforeOffline, offline?.credits);
  const achievement = new Simulation(save({ wave: 9, bestWave: 8, module: 'salvager', totalKills: 99 }), NOW);
  kill(achievement, 'pulse');
  assert.equal(achievement.drainEvents().find(event => event.kind === 'achievement')?.value, Math.floor(250 * 1.35));
  const clear = new Simulation(save({ wave: 9, bestWave: 8, module: 'salvager' }), NOW);
  clear.enemies = [];
  clear.update(1 / 60, IDLE);
  assert.equal(clear.state.credits - 90, Math.floor((15 + 9 * 4) * 1.35));
  const recovery = new Simulation(save({ wave: 9, bestWave: 8, module: 'salvager', autopilot: false }), NOW);
  recovery.player.invulnerable = 100;
  recovery.update(1, IDLE);
  recovery.drainEvents();
  const age = 1 + 1 / 60;
  recovery.player.hp = 0;
  recovery.update(1 / 60, IDLE);
  assert.equal(recovery.drainEvents().find(event => event.kind === 'recovery')?.value, Math.floor(8 * age * 0.13 * 1.35));
});

test('prestige and save snapshots retain permanent loadout progress without shared references', () => {
  const mastery = { pulse: 62, spread: 108, lance: 251 };
  const sim = new Simulation(save({ bestWave: 15, wave: 16, module: 'salvager', mastery }), NOW);
  const snapshot = sim.toSave(NOW);
  snapshot.mastery.pulse = 999;
  assert.equal(sim.state.mastery.pulse, 62);
  assert.equal(sim.prestige(), true);
  assert.equal(sim.state.module, 'salvager');
  assert.deepEqual(sim.state.mastery, mastery);
  assert.notEqual(sim.state.mastery, mastery);
  assert.equal(sim.setModule('bulwark'), true);
  const reloaded = new Simulation(sim.toSave(NOW), NOW);
  assert.equal(reloaded.state.module, 'bulwark');
  assert.deepEqual(reloaded.state.mastery, mastery);
});

test('equip clicks cannot reset firing cadence to generate extra volleys', () => {
  const sim = new Simulation(save({ bestWave: 10 }), NOW);
  sim.update(1 / 60, IDLE);
  assert.equal(sim.bullets.filter(bullet => bullet.friendly).length, 2);
  for (let i = 0; i < 20; i++) assert.equal(sim.setWeapon('pulse'), false);
  sim.setWeapon('spread');
  sim.setWeapon('lance');
  sim.setWeapon('pulse');
  sim.update(1 / 60, IDLE);
  assert.equal(sim.bullets.filter(bullet => bullet.friendly).length, 2);
  for (let i = 0; i < 10; i++) { sim.setModule('assault'); sim.setModule('standard'); }
  sim.update(1 / 60, IDLE);
  assert.equal(sim.bullets.filter(bullet => bullet.friendly).length, 2);
});

test('bosses cycle distinct patterns and announce phase two before attacking', () => {
  for (const [wave, pattern] of [[5, 'fan'], [10, 'spiral'], [15, 'cross'], [20, 'fan']] as const) {
    const sim = new Simulation(save({ wave, bestWave: wave - 1 }), NOW);
    const boss = sim.enemies.find(enemy => enemy.kind === 'boss');
    assert.ok(boss);
    assert.equal(boss.pattern, pattern);
    sim.enemies = [boss];
    boss.shotTimer = 0;
    sim.update(1 / 60, IDLE);
    const shots = sim.bullets.filter(bullet => !bullet.friendly);
    assert.equal(shots.length, pattern === 'fan' ? 5 : pattern === 'spiral' ? 4 : 3);
    assert.ok(shots.every(bullet => Number.isFinite(bullet.vx) && Number.isFinite(bullet.vy)));
    sim.bullets = [];
    sim.drainEvents();
    boss.hp = boss.maxHp * 0.49;
    boss.shotTimer = 0;
    sim.update(1 / 60, IDLE);
    assert.equal(boss.phase, 2);
    assert.ok(boss.shotTimer > 0.8);
    assert.equal(sim.bullets.some(bullet => !bullet.friendly), false);
    assert.ok(sim.drainEvents().some(event => event.kind === 'boss' && event.message?.includes('第2形態')));
  }
});
