import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { createStarterWeapon } from '../src/game/loot';
import type { GameState } from '../src/game/types';

const NOW = 1_800_000_000_000;
const IDLE = { x: 0, y: 0 };
function saved(overrides: Partial<GameState> = {}): GameState {
  const state = { ...new Simulation(undefined, NOW).toSave(NOW), ...overrides };
  if (overrides.weapon && !overrides.inventory) {
    const item = createStarterWeapon(overrides.weapon, NOW);
    state.inventory = [item];
    state.equippedWeaponId = item.id;
  }
  return state;
}
function advance(sim: Simulation, seconds: number, until?: () => boolean): number {
  for (let frame = 0; frame < seconds * 60; frame++) {
    sim.update(1 / 60, IDLE);
    sim.drainEvents();
    if (until?.()) return (frame + 1) / 60;
  }
  return seconds;
}

test('fresh run affords two early upgrades and automatically clears the opening wave', () => {
  const sim = new Simulation(undefined, NOW);
  assert.equal(sim.state.credits, 90);
  assert.equal(sim.buyUpgrade('damage'), true);
  assert.equal(sim.getUpgradeCost('damage'), 53);
  assert.equal(sim.buyUpgrade('shield'), true);
  assert.equal(sim.state.credits, 5);
  assert.equal(sim.buyUpgrade('rate'), false);
  assert.equal(sim.getStats().maxHp, 162 * 1.02);
  const clearTime = advance(sim, 20, () => sim.state.bestWave >= 1);
  assert.equal(sim.state.bestWave, 1);
  assert.ok(clearTime < 16, `opening wave took ${clearTime.toFixed(1)} seconds`);
  assert.ok(sim.state.kills >= 6);
  assert.ok(sim.state.credits > 50);
});

test('upgraded autopilot can clear a moving boss and unlock spread', () => {
  const sim = new Simulation(saved({ wave: 5, bestWave: 4,
    upgrades: { damage: 4, rate: 3, shield: 2, drone: 1 } }), NOW);
  assert.ok(sim.enemies.some(enemy => enemy.kind === 'boss'));
  assert.equal(sim.setWeapon('spread'), false);
  const time = advance(sim, 45, () => sim.state.bestWave >= 5);
  assert.equal(sim.state.bestWave, 5, `boss was not cleared after ${time} seconds`);
  assert.ok(time < 40);
  assert.equal(sim.state.achievements.includes('first-boss'), true);
  assert.equal(sim.setWeapon('spread'), true);
  assert.equal(sim.setWeapon('lance'), false);
});

test('weapons have distinct volley shape and piercing and respect unlocks', () => {
  const sim = new Simulation(saved({ bestWave: 10, wave: 11 }), NOW, () => 0.99);
  sim.update(1 / 60, IDLE);
  assert.equal(sim.bullets.filter(b => b.friendly).length, 2);
  sim.bullets = [];
  assert.equal(sim.setWeapon('spread'), true);
  sim.update(0.35, IDLE);
  const spread = sim.bullets.filter(b => b.friendly && b.source === 'weapon');
  assert.equal(spread.length, 5);
  assert.ok(spread.some(b => b.vx < 0) && spread.some(b => b.vx > 0));
  sim.bullets = [];
  assert.equal(sim.setWeapon('lance'), true);
  sim.update(0.35, IDLE);
  const lance = sim.bullets.filter(b => b.friendly && b.source === 'weapon');
  assert.equal(lance.length, 1);
  assert.equal(lance[0].pierce, 3);
  assert.ok(lance[0].damage > spread[0].damage * 3);
});

test('pause freezes combat; manual diagonal movement is normalized and bounded', () => {
  const sim = new Simulation(undefined, NOW);
  sim.paused = true;
  const before = JSON.stringify({ player: sim.player, enemies: sim.enemies, bullets: sim.bullets });
  sim.update(1, { x: 1, y: -1 });
  assert.equal(JSON.stringify({ player: sim.player, enemies: sim.enemies, bullets: sim.bullets }), before);
  assert.equal(sim.activateOverdrive(), false);
  sim.paused = false;
  const x = sim.player.x;
  const y = sim.player.y;
  sim.update(0.1, { x: 1, y: -1 });
  assert.ok(Math.abs(Math.hypot(sim.player.x - x, sim.player.y - y) - 42) < 0.001);
  for (let i = 0; i < 20; i++) sim.update(1, { x: 1, y: -1 });
  assert.ok(sim.player.x <= 688 && sim.player.y >= 360);
});

test('overdrive clears danger and boosts fire, with a persistent cooldown', () => {
  const sim = new Simulation(saved({ bestWave: 10, wave: 11 }), NOW);
  advance(sim, 3.5);
  assert.ok(sim.bullets.some(b => !b.friendly));
  const initialDps = sim.getStats().dps;
  assert.equal(sim.activateOverdrive(), true);
  assert.equal(sim.bullets.some(b => !b.friendly), false);
  assert.equal(sim.overdriveLeft, 5);
  assert.equal(sim.overdriveCooldown, 45);
  assert.equal(sim.activateOverdrive(), false);
  sim.update(1 / 60, IDLE);
  assert.ok(sim.bullets.some(b => b.friendly && b.damage > sim.getStats().damage));
  assert.equal(sim.getStats().dps, initialDps); // HUD describes sustainable power.
  advance(sim, 6);
  assert.equal(sim.overdriveLeft, 0);
  assert.ok(sim.overdriveCooldown > 35);
});

test('defeat retries the same wave without removing currency or progress', () => {
  const sim = new Simulation(saved({ wave: 5, bestWave: 4, credits: 300 }), NOW);
  sim.player.hp = 0;
  sim.update(1 / 60, IDLE);
  assert.equal(sim.status, 'recovering');
  assert.equal(sim.state.wave, 5);
  assert.equal(sim.state.credits, 300);
  advance(sim, 3.1);
  assert.equal(sim.status, 'fighting');
  assert.equal(sim.state.wave, 5);
  assert.equal(sim.player.hp, sim.getStats().maxHp);
  assert.ok(sim.enemies.some(enemy => enemy.kind === 'boss'));
});

test('a lethal hit on a regeneration tick still triggers recovery', () => {
  const sim = new Simulation(undefined, NOW);
  sim.update(0.99, IDLE);
  sim.drainEvents();
  sim.player.invulnerable = 0;
  sim.bullets.push({ id: 9999, x: sim.player.x, y: sim.player.y, vx: 0, vy: 0,
    damage: sim.player.hp * 2, radius: 5, friendly: false, weapon: 'pulse', pierce: 1, hitIds: [] });
  sim.update(1 / 60, IDLE);
  assert.ok(sim.player.hp <= 0);
  assert.equal(sim.status, 'recovering');
  const events = sim.drainEvents();
  assert.ok(events.some(event => event.kind === 'hurt'));
  assert.ok(events.some(event => event.kind === 'recovery'));
});

test('an unreachable boss times out and produces salvage rather than stalling income', () => {
  const sim = new Simulation(saved({ wave: 20, bestWave: 19, credits: 0, autopilot: false }), NOW);
  sim.player.x = 32;
  sim.player.invulnerable = 100;
  advance(sim, 51);
  assert.equal(sim.status, 'recovering');
  assert.equal(sim.state.wave, 20);
  assert.ok(sim.state.credits >= 120);
  advance(sim, 3);
  assert.equal(sim.status, 'fighting');
});

test('prestige retains credits, permanent skills and lifetime progress, then cannot be repeated', () => {
  const sim = new Simulation(saved({ wave: 16, bestWave: 15, credits: 9000, totalCredits: 12000,
    kills: 170, totalKills: 500, sound: true, effects: false, autopilot: false,
    upgrades: { damage: 5, rate: 4, shield: 3, drone: 2 },
    skills: { power: 3, salvage: 2 }, weapon: 'lance',
    achievements: ['first-boss', 'hundred-kills', 'wave-fifteen'] }), NOW);
  assert.equal(sim.getPrestigeReward(), 1500);
  assert.equal(sim.prestige(), true);
  assert.equal(sim.state.wave, 1);
  assert.equal(sim.state.credits, 10500);
  assert.equal(sim.state.kills, 0);
  assert.equal(sim.state.totalKills, 500);
  assert.equal(sim.state.totalCredits, 13500);
  assert.equal(sim.state.bestWave, 15);
  assert.equal(sim.state.cores, 0);
  assert.equal(sim.state.runs, 1);
  assert.deepEqual(sim.state.upgrades, { damage: 0, rate: 0, shield: 0, drone: 0 });
  assert.deepEqual(sim.state.skills, { power: 3, salvage: 2 });
  assert.deepEqual(sim.state.research, { power: 0, salvage: 0, cooldown: 0 });
  assert.equal(sim.state.sound, true);
  assert.equal(sim.state.effects, false);
  assert.equal(sim.state.autopilot, false);
  assert.equal(sim.state.weapon, 'lance'); // Equipped loot persists through prestige.
  assert.equal(sim.state.achievements.length, 3);
  assert.equal(sim.getPrestigeReward(), 0);
  assert.equal(sim.prestige(), false);
  const damage = sim.getStats().damage;
  assert.equal(sim.learnSkill('power'), false); // Already at the permanent rank cap.
  assert.equal(sim.learnSkill('salvage'), false); // Relaunch income alone cannot buy a high rank.
  assert.equal(sim.state.credits, 10500);
  sim.state.credits = sim.getSkillCost('salvage');
  assert.equal(sim.learnSkill('salvage'), true);
  assert.equal(sim.getSkillRank('salvage'), 3);
  assert.equal(sim.getStats().damage, damage);
});

test('offline reward caps at eight hours, does not advance waves, and cannot reload-claim twice', () => {
  const sim = new Simulation(saved({ bestWave: 10, wave: 11, savedAt: NOW - 20 * 60 * 60 * 1000 }), NOW);
  assert.deepEqual(sim.offlineReward, { seconds: 28800, credits: Math.floor(28800 * sim.getStats().offlineRate) });
  assert.equal(sim.state.wave, 11);
  const credits = sim.state.credits;
  const reloaded = new Simulation(sim.toSave(NOW), NOW);
  assert.equal(reloaded.offlineReward, null);
  assert.equal(reloaded.state.credits, credits);
  assert.equal(sim.claimOffline(-60), null);
  assert.equal(sim.claimOffline(Number.NaN), null);
  assert.equal(sim.claimOffline(59), null);
  const future = new Simulation(saved({ bestWave: 10, wave: 11, savedAt: NOW + 500000 }), NOW);
  assert.equal(future.offlineReward, null);
  assert.equal(new Simulation(saved({ savedAt: NOW - 100000 }), NOW).offlineReward, null);
});

test('W38 basic gear receives the strengthened exact eight-hour CR reward once without wave progress', () => {
  const progress = saved({ bestWave: 38, wave: 39, credits: 1000, totalCredits: 1000, savedAt: NOW - 12 * 60 * 60 * 1000 });
  progress.collection.claimed = ['wave-30'];
  const sim = new Simulation(progress, NOW, () => 0.99);
  assert.equal(sim.getStats().offlineRate, 83.835);
  assert.deepEqual(sim.offlineReward, { seconds: 28800, credits: 2_414_448 });
  assert.equal(sim.state.credits, 2_415_448);
  assert.equal(sim.state.wave, 39); assert.equal(sim.state.bestWave, 38);
  const reload = new Simulation(sim.toSave(NOW), NOW, () => 0.99);
  assert.equal(reload.offlineReward, null);
  assert.equal(reload.state.credits, sim.state.credits);
  assert.equal(reload.state.wave, 39);
});

test('permanent CR skills affect power, salvage, and cooldown; capped purchases cannot waste funds', () => {
  const sim = new Simulation(saved({ bestWave: 25, wave: 26, skills: { salvage: 2 },
    credits: 1e12, upgrades: { damage: 0, rate: 10, shield: 0, drone: 0 } }), NOW);
  const power = sim.getStats().damage;
  const offlineRate = sim.getStats().offlineRate;
  assert.equal(sim.learnSkill('power'), true);
  assert.ok(sim.getStats().damage > power);
  assert.equal(sim.learnSkill('salvage'), true);
  assert.ok(sim.getStats().offlineRate > offlineRate);
  assert.equal(sim.learnSkill('cooling'), true);
  assert.equal(sim.activateOverdrive(), true);
  assert.ok(Math.abs(sim.overdriveCooldown - 43.2) < 1e-8);
  const credits = sim.state.credits;
  assert.equal(sim.getUpgradeCost('rate'), Infinity);
  assert.equal(sim.getUpgradeCost('drone'), Infinity);
  assert.equal(sim.buyUpgrade('rate'), false);
  assert.equal(sim.buyUpgrade('drone'), false);
  assert.equal(sim.state.credits, credits);
  sim.state.skills.cooling = 3;
  const remaining = sim.state.credits;
  assert.equal(sim.getSkillCost('cooling'), Infinity);
  assert.equal(sim.learnSkill('cooling'), false);
  assert.equal(sim.state.credits, remaining);
});

test('corrupt saves and invalid time values cannot poison the simulation', () => {
  const invalidVersion = new Simulation({ version: 2, credits: 999999 }, NOW);
  assert.equal(invalidVersion.state.credits, 90);
  const sim = new Simulation({ version: 1, credits: NaN, totalCredits: Infinity,
    wave: -10, bestWave: Infinity, cores: -2, savedAt: 'bad', weapon: 'lance',
    upgrades: { damage: Infinity, rate: -5, shield: '100', drone: 10000 },
    research: { power: NaN, salvage: -1, cooldown: Infinity },
    achievements: ['first-boss', 'first-boss', {}, 'unknown'] }, NOW);
  assert.equal(sim.state.wave, 1);
  assert.equal(sim.state.bestWave, 0);
  assert.equal(sim.state.weapon, 'pulse');
  assert.equal(sim.state.cores, 0);
  assert.equal(sim.state.upgrades.drone, 0);
  assert.equal(sim.getEquippedPart('drone').units, 4); // Legacy support investment becomes gear.
  assert.deepEqual(sim.state.achievements, ['first-boss']);
  sim.update(Infinity, IDLE);
  sim.update(NaN, IDLE);
  sim.update(1, { x: NaN, y: Infinity, target: { x: NaN, y: NaN } });
  assert.ok(Object.values(sim.getStats()).every(Number.isFinite));
  assert.ok(Number.isFinite(sim.player.x) && Number.isFinite(sim.player.y));
  const snapshot = sim.toSave(NOW);
  snapshot.upgrades.damage = 99;
  snapshot.achievements.length = 0;
  assert.equal(sim.state.upgrades.damage, 0);
  assert.equal(sim.state.achievements.length, 1);
});
