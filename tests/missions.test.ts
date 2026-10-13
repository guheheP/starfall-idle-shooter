import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { cloneMissions, createMissions, getMissionRewardLevel, getMissionTarget, MISSION_NODES, readMissions, type MissionId } from '../src/game/missions';
import { createStarterWeapon, INVENTORY_CAPACITY } from '../src/game/loot';
import { createStarterPart, PART_CAPACITY } from '../src/game/parts';
import type { RequisitionModel } from '../src/game/requisition';
import type { Bullet, Enemy, GameState, WeaponId } from '../src/game/types';

const NOW = 1_800_000_000_000, IDLE = { x: 0, y: 0 };
const save = (overrides: Partial<GameState> = {}): GameState => ({ ...new Simulation(undefined, NOW).toSave(NOW), bestWave: 100, wave: 41, ...overrides });
const row = (sim: Simulation, id: MissionId) => sim.getMissions().find(value => value.id === id)!;
let nextId = 80_000;
function kill(sim: Simulation, attributes: Partial<Enemy> = {}, traits: Partial<Bullet> = {}): Enemy {
  const enemy: Enemy = { id: nextId++, kind: 'scout', x: 360, y: 450, baseX: 360, hp: 1, maxHp: 1, radius: 19,
    age: 0, shotTimer: 100, hitFlash: 0, ...attributes };
  const guard: Enemy = { ...enemy, id: nextId++, x: 60, y: 120, baseX: 60, hp: 1e9, maxHp: 1e9, elite: undefined, kind: 'scout', slowLeft: 0 };
  sim.enemies = [enemy, guard];
  sim.bullets = [{ id: nextId++, x: 360, y: 450, vx: 0, vy: 0, damage: 1000, radius: 80,
    friendly: true, weapon: 'pulse', source: 'weapon', pierce: 1, hitIds: [], ...traits }];
  sim.update(1 / 60, IDLE);
  assert.ok(enemy.hp <= 0);
  return enemy;
}
function completed(id: MissionId = 'kills', completions = 0): GameState {
  const missions = createMissions(); missions.active = id; missions.completions[id] = completions;
  missions.progress[id] = getMissionTarget(MISSION_NODES.find(node => node.id === id)!, Math.min(10, completions + 1));
  return save({ missions });
}

test('twelve missions unlock gradually and never backfill lifetime or offline progress', () => {
  assert.equal(MISSION_NODES.length, 12); assert.equal(new Set(MISSION_NODES.map(node => node.id)).size, 12);
  const sim = new Simulation(save({ bestWave: 14, wave: 15, kills: 500, totalKills: 100_000 }), NOW, () => 0.99);
  assert.equal(sim.acceptMission('kills'), false); assert.equal(sim.acceptMission('bad' as MissionId), false);
  sim.state.bestWave = 15;
  assert.equal(sim.acceptMission('kills'), true); assert.equal(sim.acceptMission('kills'), false);
  assert.equal(sim.acceptMission('elites'), false); assert.equal(sim.acceptMission('weapon-orbit'), false);
  assert.equal(row(sim, 'kills').progress, 0);
  sim.claimOffline(3600);
  assert.equal(row(sim, 'kills').progress, 0);
  sim.state.bestWave = 20; assert.equal(sim.acceptMission('elites'), true);
  sim.state.bestWave = 30; assert.equal(sim.acceptMission('weapon-orbit'), true);
});

test('only accepted matching combat advances; mission switching retains each individual progress', () => {
  const sim = new Simulation(save(), NOW, () => 0.99);
  kill(sim); assert.equal(row(sim, 'kills').progress, 0);
  sim.acceptMission('kills'); kill(sim); kill(sim, { elite: 'vanguard' }); kill(sim, { kind: 'boss' });
  assert.equal(row(sim, 'kills').progress, 1); assert.equal(row(sim, 'elites').progress, 0);
  sim.acceptMission('elites'); kill(sim); kill(sim, { elite: 'sniper' });
  assert.equal(row(sim, 'elites').progress, 1); assert.equal(row(sim, 'kills').progress, 1);
  sim.acceptMission('bosses'); kill(sim, { kind: 'boss' });
  assert.equal(row(sim, 'bosses').progress, 1);
  sim.acceptMission('kills'); kill(sim); assert.equal(row(sim, 'kills').progress, 2);
});

test('wave mission advances once per actual clear and ignores waiting, recovery and absence', () => {
  const sim = new Simulation(save(), NOW, () => 0.99); sim.acceptMission('waves');
  sim.claimOffline(3600); assert.equal(row(sim, 'waves').progress, 0);
  sim.enemies = []; sim.update(1 / 60, IDLE); assert.equal(row(sim, 'waves').progress, 1);
  sim.update(0.5, IDLE); assert.equal(row(sim, 'waves').progress, 1);
  sim.status = 'recovering'; sim.recoveryLeft = 3; sim.update(1, IDLE);
  assert.equal(row(sim, 'waves').progress, 1);
});

test('all six weapon missions use projectile attribution and exclude drone kills after equipment changes', () => {
  for (const weapon of ['pulse', 'spread', 'lance', 'missile', 'arc', 'orbit'] as const) {
    const sim = new Simulation(save(), NOW, () => 0.99);
    const current = weapon === 'pulse' ? 'arc' : 'pulse';
    const item = { ...createStarterWeapon(current), id: `current-${weapon}`, starter: false, locked: false };
    sim.receiveWeapon(item); sim.equipWeapon(item.id); sim.acceptMission(`weapon-${weapon}`);
    assert.notEqual(sim.state.weapon, weapon);
    kill(sim, {}, { weapon, source: 'drone' }); assert.equal(row(sim, `weapon-${weapon}`).progress, 0);
    kill(sim, {}, { weapon, source: 'weapon' }); assert.equal(row(sim, `weapon-${weapon}`).progress, 1);
    kill(sim, {}, { weapon: current as WeaponId }); assert.equal(row(sim, `weapon-${weapon}`).progress, 1);
  }
});

test('secondary chain kills retain main-weapon mission attribution and cannot count a dead enemy twice', () => {
  const sim = new Simulation(save(), NOW, () => 0.99); sim.acceptMission('weapon-arc');
  const enemies: Enemy[] = [360, 450, 540].map(x => ({ id: nextId++, kind: 'scout', x, y: 450, baseX: x,
    hp: 1, maxHp: 1, radius: 19, age: 0, shotTimer: 100, hitFlash: 0 }));
  sim.enemies = enemies;
  sim.bullets = [{ id: nextId++, x: 360, y: 450, vx: 0, vy: 0, damage: 1000, radius: 80, friendly: true,
    weapon: 'arc', source: 'weapon', pierce: 1, hitIds: [], chain: 3, chainRange: 200, explosion: 250 }];
  sim.update(1 / 60, IDLE);
  assert.equal(row(sim, 'weapon-arc').progress, 3); assert.equal(sim.waveKills, 3);
});

test('conditional missions snapshot the already-frozen target and shield before lethal-hit healing', () => {
  const sim = new Simulation(save(), NOW, () => 0.99); sim.acceptMission('chilled');
  kill(sim, {}, { frost: 0.3 }); assert.equal(row(sim, 'chilled').progress, 0);
  kill(sim, { slowLeft: 1 }, { source: 'drone' }); assert.equal(row(sim, 'chilled').progress, 1);
  sim.acceptMission('high-shield');
  sim.player.hp = sim.getStats().maxHp * 0.7 - 0.1;
  kill(sim, { hp: 20, maxHp: 20 }, { leech: 0.2 });
  assert.ok(sim.player.hp >= sim.getStats().maxHp * 0.7); assert.equal(row(sim, 'high-shield').progress, 0);
  sim.player.hp = sim.getStats().maxHp * 0.7;
  kill(sim, {}, { source: 'drone' }); assert.equal(row(sim, 'high-shield').progress, 1);
});

test('ready progress stops at the target until a manual claim and then the active mission starts the next rank', () => {
  const source = completed(); source.missions.progress.kills!--;
  const sim = new Simulation(source, NOW, () => 0.99); kill(sim); kill(sim);
  assert.equal(row(sim, 'kills').progress, 120); assert.equal(row(sim, 'kills').ready, true);
  const equipped = [sim.state.equippedWeaponId, { ...sim.state.equippedParts }, sim.state.module];
  const count = sim.state.inventory.length, serial = sim.state.lootSerial;
  sim.setAutoSellRarity('legendary');
  assert.equal(sim.claimMission('kills', 'pulse'), true);
  const reward = sim.state.inventory.at(-1)!;
  assert.equal(reward.rarity, 'epic'); assert.equal(reward.locked, true); assert.equal(reward.level, 100);
  assert.equal(sim.state.inventory.length, count + 1); assert.equal(sim.state.lootSerial, serial + 1);
  assert.equal(sim.state.collection.weapons.pulse, 1); assert.equal(sim.state.lootStats.found, 1);
  assert.deepEqual([sim.state.equippedWeaponId, sim.state.equippedParts, sim.state.module], equipped);
  assert.equal(row(sim, 'kills').rank, 2); assert.equal(row(sim, 'kills').target, 144);
  assert.equal(row(sim, 'kills').active, true); assert.equal(row(sim, 'kills').progress, 0);
  assert.equal(sim.claimMission('kills', 'pulse'), false); assert.equal(sim.state.inventory.length, count + 1);
  kill(sim); assert.equal(row(sim, 'kills').progress, 1);
});

test('five prior completions unlock legendary rewards; held claims preserve another active mission', () => {
  const sim = new Simulation(completed('kills', 5), NOW, () => 0.99);
  sim.acceptMission('waves');
  assert.equal(row(sim, 'kills').rewardRarity, 'legendary');
  assert.equal(sim.claimMission('kills', 'frost'), true);
  const reward = sim.state.parts.at(-1)!;
  assert.equal(reward.model, 'frost'); assert.equal(reward.rarity, 'legendary'); assert.equal(reward.locked, true);
  assert.equal(reward.level, 110); assert.equal(sim.state.missions.active, 'waves');
  assert.equal(sim.state.collection.parts.frost, 1);
  const earlier = new Simulation(completed('kills', 4), NOW, () => 0.99);
  assert.equal(row(earlier, 'kills').rewardRarity, 'epic'); assert.equal(earlier.claimMission('kills', 'bastion'), true);
  assert.equal(earlier.state.parts.at(-1)!.rarity, 'epic');
});

test('full destination storage or an invalid reward rejects atomically without RNG, serial or progress consumption', () => {
  for (const model of ['pulse', 'frost'] as const) {
    const source = completed();
    if (model === 'pulse') source.inventory = Array.from({ length: INVENTORY_CAPACITY }, (_, i) => ({ ...createStarterWeapon('pulse'), id: `loot-${i + 1}`, starter: false, locked: true }));
    else source.parts = [...source.parts, ...Array.from({ length: PART_CAPACITY - 3 }, (_, i) => ({ ...createStarterPart('body'), id: `part-${i + 1}`, starter: false, locked: true }))];
    let rolls = 0;
    const sim = new Simulation(source, NOW, () => { rolls++; return 0.99; });
    const snapshot = sim.toSave(NOW), equipped = [sim.state.equippedWeaponId, { ...sim.state.equippedParts }];
    assert.match(sim.getMissionClaimIssue('kills', model)!, /空き枠/);
    assert.equal(sim.claimMission('kills', model), false); assert.equal(rolls, 0);
    assert.deepEqual(sim.toSave(NOW), snapshot);
    assert.equal(sim.claimMission('kills', 'unknown' as RequisitionModel), false);
    assert.deepEqual(sim.toSave(NOW), snapshot);
    const other = model === 'pulse' ? 'frost' : 'pulse';
    assert.equal(sim.claimMission('kills', other), true); // Only the selected destination needs space.
    assert.deepEqual([sim.state.equippedWeaponId, sim.state.equippedParts], equipped);
  }
});

test('mission saves sanitize and bound counters, deep-copy progress, and retain it through absence and prestige', () => {
  const dirty = readMissions({ active: 'elites', completions: { kills: 1e20, bosses: Infinity, waves: -9, fake: 8 },
    progress: { kills: 1e20, bosses: NaN, chilled: -3, elites: 2.9, fake: 55 } }, 15);
  assert.equal(dirty.active, null); assert.equal(dirty.completions.kills, 1e9); assert.equal(dirty.progress.kills, 336);
  assert.equal(dirty.progress.elites, 2); assert.equal(dirty.progress.bosses, undefined);
  assert.deepEqual(Object.keys(dirty.completions), ['kills']);
  const source = completed('kills', 9); source.missions.progress.kills = 17;
  const sim = new Simulation(source, NOW, () => 0.99);
  const snapshot = sim.toSave(NOW); snapshot.missions.progress.kills = 999; snapshot.missions.completions.kills = 999;
  assert.equal(sim.state.missions.progress.kills, 17); assert.equal(sim.state.missions.completions.kills, 9);
  const expected = cloneMissions(sim.state.missions);
  const reload = new Simulation(sim.toSave(NOW), NOW + 3600_000, () => 0.99);
  assert.deepEqual(reload.state.missions, expected); assert.ok(reload.offlineReward);
  const old = reload.state.missions; assert.equal(reload.prestige(), true); assert.deepEqual(reload.state.missions, expected);
  old.progress.kills = 333; assert.deepEqual(reload.state.missions, expected);
  assert.equal(getMissionRewardLevel(9999, 999), 10000); assert.equal(getMissionRewardLevel(NaN, Infinity), 1);
});

test('rank ten remains repeatable while progress and completion counters stay bounded', () => {
  const sim = new Simulation(completed('kills', 1e9), NOW, () => 0.99);
  assert.equal(row(sim, 'kills').rank, 10); assert.equal(sim.claimMission('kills', 'reactor'), true);
  assert.equal(row(sim, 'kills').rank, 10); assert.equal(row(sim, 'kills').completions, 1e9);
  assert.equal(row(sim, 'kills').target, 336); assert.equal(row(sim, 'kills').progress, 0);
  assert.equal(sim.claimMission('kills', 'reactor'), false);
  sim.state.missions.progress.kills = 335; kill(sim);
  assert.equal(sim.claimMission('kills', 'reactor'), true);
  assert.notEqual(sim.state.parts.at(-1)!.id, sim.state.parts.at(-2)!.id);
});
