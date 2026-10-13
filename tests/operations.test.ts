import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { OPERATION_NODES, type OperationId } from '../src/game/operations';
import { ELITES, getSector, getWaveScale } from '../src/game/sectors';
import type { Bullet, Enemy, GameState } from '../src/game/types';

const NOW = 1_800_000_000_000, IDLE = { x: 0, y: 0 };
const save = (overrides: Partial<GameState> = {}): GameState => ({ ...new Simulation(undefined, NOW).toSave(NOW), bestWave: 100, wave: 40, ...overrides });
const close = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-7, `${a} differs from ${b}`);

test('cruise preserves existing enemies and modifiers; operation gates sanitize invalid or locked saved choices', () => {
  assert.deepEqual(OPERATION_NODES.map(node => node.unlockWave), [0, 30, 50]);
  const sim = new Simulation(save({ operation: 'cruise' }), NOW);
  close(sim.enemies.find(enemy => enemy.kind === 'boss')!.maxHp, 245 * getWaveScale(40));
  assert.equal(sim.enemies.filter(enemy => enemy.elite).length, 1);
  assert.equal(sim.getOperation().id, 'cruise'); assert.equal(sim.getActiveOperation().id, 'cruise');
  sim.state.bestWave = 29; assert.equal(sim.setOperation('sweep'), false);
  sim.state.bestWave = 49; assert.equal(sim.setOperation('danger'), false);
  assert.equal(sim.setOperation('unknown' as OperationId), false);
  assert.equal(new Simulation(save({ operation: 'danger', bestWave: 49 }), NOW).getOperation().id, 'cruise');
  assert.equal(new Simulation(save({ operation: 'bad' as OperationId }), NOW).getOperation().id, 'cruise');
});

test('selection is pending until the next wave starts and stays fixed for the entire current wave', () => {
  const sim = new Simulation(save(), NOW, () => 0.99);
  const existing = sim.enemies.map(enemy => ({ id: enemy.id, hp: enemy.hp, timer: enemy.shotTimer, elite: enemy.elite }));
  assert.equal(sim.setOperation('danger'), true); assert.equal(sim.setOperation('danger'), false);
  assert.equal(sim.getOperation().id, 'danger'); assert.equal(sim.getActiveOperation().id, 'cruise');
  assert.deepEqual(sim.enemies.map(enemy => ({ id: enemy.id, hp: enemy.hp, timer: enemy.shotTimer, elite: enemy.elite })), existing);
  sim.enemies = []; sim.update(1 / 60, IDLE);
  assert.equal(sim.getActiveOperation().id, 'cruise'); assert.equal(sim.state.wave, 41);
  sim.update(1, IDLE); sim.update(0.3, IDLE);
  assert.equal(sim.getActiveOperation().id, 'danger'); assert.equal(sim.enemies.filter(enemy => enemy.elite).length, 3);
  for (const enemy of sim.enemies) {
    const base = enemy.kind === 'tank' ? 33 : enemy.kind === 'fighter' ? 19 : 12;
    close(enemy.maxHp, base * getWaveScale(41) * 1.5 * (enemy.elite ? ELITES[enemy.elite].healthMultiplier : 1));
  }
  assert.equal(sim.setOperation('cruise'), true); assert.equal(sim.getActiveOperation().id, 'danger');
});

test('operations promote one or two additional readable elites without increasing formation or boss count', () => {
  for (const wave of [1, 20, 50]) for (const operation of OPERATION_NODES) {
    const sim = new Simulation(save({ wave, operation: operation.id }), NOW);
    const baseline = new Simulation(save({ wave, operation: 'cruise' }), NOW);
    assert.equal(sim.enemies.length, baseline.enemies.length);
    assert.equal(sim.enemies.filter(enemy => enemy.elite).length, (wave >= 20 ? 1 : 0) + operation.extraElites);
    assert.ok(sim.enemies.filter(enemy => enemy.elite).every(enemy => enemy.kind !== 'boss' && enemy.charge === 0));
    assert.equal(sim.enemies.filter(enemy => enemy.kind === 'boss').length, baseline.enemies.filter(enemy => enemy.kind === 'boss').length);
  }
});

test('active operations multiply actual enemy bullet speeds and firing intervals', () => {
  for (const operation of OPERATION_NODES) {
    const sim = new Simulation(save({ wave: 50, operation: operation.id, autopilot: false }), NOW, () => 0.99);
    const boss = sim.enemies.find(enemy => enemy.kind === 'boss')!;
    sim.enemies = [boss]; boss.shotTimer = 0;
    sim.update(1 / 60, IDLE);
    const hostile = sim.bullets.find(bullet => !bullet.friendly)!;
    close(Math.hypot(hostile.vx, hostile.vy), 310 * getSector(50).enemySpeed * operation.bulletSpeed);
    close(boss.shotTimer, 0.95 * getSector(50).shotInterval * operation.shotInterval);
  }
});

test('combat rewards use the active choice while offline income ignores operation multipliers', () => {
  for (const operation of OPERATION_NODES) {
    const sim = new Simulation(save({ operation: operation.id }), NOW, () => 0.99);
    sim.setOperation(operation.id === 'cruise' ? 'danger' : 'cruise');
    const enemy: Enemy = { id: 80_000, kind: 'scout', x: 360, y: 450, baseX: 360, hp: 1, maxHp: 1, radius: 19, age: 0, shotTimer: 100, hitFlash: 0 };
    const guard: Enemy = { ...enemy, id: 80_001, x: 60, y: 120, baseX: 60, hp: 1e9 };
    const shot: Bullet = { id: 80_002, x: 360, y: 450, vx: 0, vy: 0, damage: 1000, radius: 80, friendly: true, weapon: 'pulse', source: 'weapon', hitIds: [], pierce: 1 };
    sim.drainEvents(); sim.enemies = [enemy, guard]; sim.bullets = [shot]; sim.update(1 / 60, IDLE);
    assert.equal(sim.drainEvents().find(event => event.kind === 'kill')!.value, Math.floor(88 * getSector(40).creditMultiplier * operation.creditMultiplier));
    const cruise = new Simulation(save(), NOW);
    close(sim.getStats().offlineRate, cruise.getStats().offlineRate);
    const before = sim.state.credits; sim.claimOffline(3600);
    assert.equal(sim.state.credits - before, Math.floor(3600 * cruise.getStats().offlineRate));
  }
});

test('extra drop probability applies only to active operation and preserves boss and elite guarantees', () => {
  for (const operation of OPERATION_NODES) {
    const sim = new Simulation(save({ wave: 30, operation: operation.id }), NOW, () => 0.195);
    sim.setOperation(operation.id === 'cruise' ? 'danger' : 'cruise');
    const enemy: Enemy = { id: 90_000, kind: 'scout', x: 360, y: 450, baseX: 360, hp: 1, maxHp: 1, radius: 19, age: 0, shotTimer: 100, hitFlash: 0 };
    sim.enemies = [enemy, { ...enemy, id: 90_001, x: 60, y: 120, baseX: 60, hp: 1e9 }];
    sim.bullets = [{ id: 90_002, x: 360, y: 450, vx: 0, vy: 0, damage: 1000, radius: 80, friendly: true,
      weapon: 'pulse', source: 'weapon', hitIds: [], pierce: 1 }];
    sim.drainEvents(); sim.update(1 / 60, IDLE);
    const drops = sim.drainEvents().filter(event => event.kind === 'loot');
    assert.equal(drops.length, operation.id === 'cruise' ? 0 : 2);
  }
});

test('selected operations persist and apply to the fresh wave after save, reload and prestige', () => {
  const sim = new Simulation(save(), NOW);
  sim.setOperation('danger');
  const reload = new Simulation(sim.toSave(NOW), NOW);
  assert.equal(reload.getOperation().id, 'danger'); assert.equal(reload.getActiveOperation().id, 'danger');
  assert.equal(reload.prestige(), true); assert.equal(reload.getOperation().id, 'danger'); assert.equal(reload.getActiveOperation().id, 'danger');
  assert.equal(reload.state.wave, 1); assert.equal(reload.enemies.filter(enemy => enemy.elite).length, 2);
});
