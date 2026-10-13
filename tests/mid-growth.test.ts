import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { createStarterWeapon, getSellValue } from '../src/game/loot';
import { createStarterPart, getPartSellValue, PART_BASES } from '../src/game/parts';
import { getEnhancementInvestment, getEnhancementRefund } from '../src/game/enhancement';
import { SKILL_NODES } from '../src/game/research';
import type { Bullet, Enemy, GameState, PartItem, PartModel, SkillId, WeaponItem } from '../src/game/types';

const NOW = 1_800_000_000_000, IDLE = { x: 0, y: 0 };
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} differs from ${expected}`);

// All saves and equipment below are synthetic, in-memory fixtures; browser storage is never used.
function syntheticSave(overrides: Partial<GameState> = {}): GameState {
  return { ...new Simulation(undefined, NOW, () => 0.99).toSave(NOW),
    credits: 30_000_000, wave: 26, bestWave: 25, autopilot: false, ...overrides };
}
function weapon(id: string, overrides: Partial<WeaponItem> = {}): WeaponItem {
  return { ...createStarterWeapon('pulse', NOW), id, name: '検証用の主武装',
    level: 50, rarity: 'legendary', power: 4, starter: false, locked: false, ...overrides };
}
function part(id: string, model: PartModel, overrides: Partial<PartItem> = {}): PartItem {
  return { ...createStarterPart(PART_BASES[model].slot, NOW), id, name: '検証用のパーツ', model,
    level: 50, rarity: 'legendary', power: 4, starter: false, locked: false, ...overrides };
}
function buildSave(items: PartItem[], gun?: WeaponItem, overrides: Partial<GameState> = {}): GameState {
  const save = syntheticSave(overrides);
  for (const item of items) {
    save.parts.push(item);
    save.equippedParts[item.slot] = item.id;
  }
  if (gun) {
    save.inventory.push(gun);
    save.equippedWeaponId = gun.id;
    save.weapon = gun.type;
  }
  return save;
}
function dummy(id = 950_001, slowed = false): Enemy {
  return { id, kind: 'tank', x: 360, y: 150, baseX: 360, hp: 1e9, maxHp: 1e9,
    radius: 60, age: 0, shotTimer: 100, hitFlash: 0, slowLeft: slowed ? 2 : 0, slowFactor: 0.7 };
}
function fireNextWeapon(sim: Simulation): Bullet {
  sim.enemies = [dummy()];
  const previous = new Set(sim.bullets.map(bullet => bullet.id));
  for (let step = 0; step < 120; step++) {
    sim.update(1 / 60, IDLE);
    const shot = sim.bullets.find(bullet => bullet.source === 'weapon' && !previous.has(bullet.id));
    if (shot) return structuredClone(shot);
  }
  assert.fail('Synthetic ship did not fire within two seconds');
}
function actualHit(sim: Simulation, shot: Bullet, slowed = true): number {
  const target = { ...dummy(950_002, slowed), y: 450, hp: 10_000, maxHp: 10_000 };
  sim.enemies = [target];
  sim.bullets = [{ ...structuredClone(shot), x: 360, y: 450, vx: 0, vy: 0, pierce: 1, hitIds: [] }];
  sim.drainEvents();
  sim.update(1 / 60, IDLE);
  const hit = sim.drainEvents().find(event => event.kind === 'hit' || event.kind === 'critical');
  assert.ok(hit && Number.isFinite(hit.value));
  close(10_000 - target.hp, hit.value!);
  return hit.value!;
}

test('power research adds six percent per rank to newly fired weapon and drone damage', () => {
  const sim = new Simulation(syntheticSave(), NOW, () => 0.99);
  const before = sim.getStats(), oldShot = fireNextWeapon(sim);
  for (let rank = 1; rank <= 3; rank++) {
    assert.equal(sim.learnSkill('power'), true);
    close(sim.getStats().damage / before.damage, 1 + rank * 0.06);
    const shot = fireNextWeapon(sim);
    close(shot.damage / oldShot.damage, 1 + rank * 0.06);
    close(oldShot.damage, before.damage);
  }
  close(sim.getStats().dps / before.dps, 1.18);
  const previous = new Set(sim.bullets.filter(bullet => bullet.source === 'drone').map(bullet => bullet.id));
  for (let step = 0; step < 90; step++) {
    sim.update(1 / 60, IDLE);
    const drone = sim.bullets.find(bullet => bullet.source === 'drone' && !previous.has(bullet.id));
    if (drone) { close(drone.damage, 7 * 0.95 * 1.18); return; }
  }
  assert.fail('Synthetic support drone did not fire');
});

test('accuracy remains useful at the 65 percent crit cap and changes actual critical shots', () => {
  const focus = part('synthetic-capped-focus', 'focus', { power: 12, enhancement: 10 });
  const gun = weapon('synthetic-critical-gun', { affixes: [{ id: 'critical', value: 0.32 }] });
  const sim = new Simulation(buildSave([focus], gun, { skills: { power: 2 } }), NOW, () => 0);
  const before = sim.getStats(), preview = sim.getWeaponPreview(sim.getEquippedWeapon());
  const oldShot = fireNextWeapon(sim);
  close(before.critChance, 0.65); close(before.critMultiplier, 4.1);
  assert.equal(oldShot.crit, true);
  assert.equal(sim.learnSkill('accuracy'), true);
  const after = sim.getStats(), shot = fireNextWeapon(sim);
  close(after.critChance, 0.65); close(after.critMultiplier, 4.22);
  assert.ok(after.dps > before.dps);
  close(sim.getWeaponPreview(sim.getEquippedWeapon()).dps / preview.dps,
    (1 + 0.65 * 3.22) / (1 + 0.65 * 3.1));
  close(shot.damage / oldShot.damage, 4.22 / 4.1);
  assert.equal(shot.crit, true);
  close(actualHit(sim, oldShot, false), oldShot.damage);
  close(actualHit(sim, shot, false), shot.damage);
});

test('cryo multiplies capped native affixes, but research cannot rewrite a shot already in flight', () => {
  const items = [part('synthetic-cryo-wing', 'velocity'), part('synthetic-cryo-body', 'bastion'), part('synthetic-cryo-drone', 'frost')]
    .map(item => ({ ...item, affixes: [{ id: 'chilled' as const, value: 0.45 }] }));
  const sim = new Simulation(buildSave(items, undefined, { skills: { power: 2, accuracy: 1 } }), NOW, () => 0.99);
  const oldShot = fireNextWeapon(sim), inFlight = sim.bullets.find(bullet => bullet.id === oldShot.id)!;
  const originalFlight = structuredClone(inFlight);
  close(oldShot.chilledBonus!, 1.35);
  assert.equal(sim.learnSkill('cryo'), true);
  assert.deepEqual(inFlight, originalFlight);
  const shot = fireNextWeapon(sim);
  close(shot.chilledBonus!, 1.538);
  close(actualHit(sim, oldShot), oldShot.damage * 2.35);
  close(actualHit(sim, shot), shot.damage * 2.538);
  close(actualHit(sim, shot) / actualHit(sim, oldShot), 1.08);
  close(actualHit(sim, shot, false), shot.damage);
  assert.equal(sim.learnSkill('cryo'), true);
  assert.equal(sim.learnSkill('cryo'), true);
  const maxShot = fireNextWeapon(sim);
  close(maxShot.chilledBonus!, 1.914);
  close(actualHit(sim, maxShot), maxShot.damage * 2.914);
  for (const [bonus, factor] of [[Number.MAX_VALUE, 3], [Infinity, 1], [NaN, 1]] as const) {
    close(actualHit(sim, { ...maxShot, chilledBonus: bonus }), maxShot.damage * factor);
    assert.ok(Number.isFinite(sim.enemies[0].hp));
  }
});

test('stability adds four percent actual damage even to an enhanced reactor at its native cap', () => {
  const reactor = part('synthetic-capped-reactor', 'reactor', { power: 12, enhancement: 10 });
  const sim = new Simulation(buildSave([reactor], undefined, { skills: { armor: 2, repair: 1 } }), NOW, () => 0.99);
  const before = sim.getStats(), oldShot = fireNextWeapon(sim);
  close(before.highShieldDamage, 3);
  assert.equal(oldShot.empowered, true);
  assert.equal(sim.learnSkill('stability'), true);
  close(sim.getStats().highShieldDamage, 3.16);
  close(sim.getStats().damage / before.damage, 1.04);
  const shot = fireNextWeapon(sim);
  close(shot.damage / oldShot.damage, 1.04);
  close(actualHit(sim, oldShot, false), oldShot.damage);
  close(actualHit(sim, shot, false), shot.damage);
  sim.player.hp = sim.getStats().maxHp * 0.69;
  const unempowered = fireNextWeapon(sim);
  assert.equal(unempowered.empowered, false);
  close(unempowered.damage, oldShot.damage / 4);
});

for (const [power, enhancement] of [[1, 0], [12, 10]] as const) {
  test(`repair research restores its shield-scaled amount in real ticks (body power ${power}, +${enhancement})`, () => {
    const body = part(`synthetic-repair-body-${power}`, 'bastion', { power, enhancement });
    const sim = new Simulation(buildSave([body], undefined, { skills: { armor: 2 } }), NOW, () => 0.99);
    sim.enemies = [dummy()];
    const before = sim.getStats(), perRank = Math.max(0.6, before.maxHp * 0.002);
    if (power === 1) close(perRank, 0.6);
    else assert.ok(perRank > 6);
    for (let rank = 1; rank <= 3; rank++) {
      sim.player.hp = before.maxHp * 0.2;
      assert.equal(sim.learnSkill('repair'), true);
      close(sim.player.hp / sim.getStats().maxHp, 0.2);
      close(sim.getStats().regen - before.regen, perRank * rank);
      const hp = sim.player.hp;
      sim.update(1, IDLE);
      close(sim.player.hp - hp, before.regen + perRank * rank);
    }
  });
}

test('improved research retains expensive three-rank choices, prerequisites and permanent learned effects', () => {
  const costs: Record<SkillId, number> = { power: 30_000, accuracy: 120_000, cryo: 360_000,
    armor: 40_000, repair: 110_000, stability: 330_000,
    salvage: 35_000, cooling: 100_000, overdrive: 300_000 };
  const sim = new Simulation(syntheticSave({ credits: 20_000_000 }), NOW, () => 0.99);
  const balance = sim.state.credits;
  assert.equal(sim.learnSkill('accuracy'), false);
  assert.equal(sim.learnSkill('repair'), false);
  assert.equal(sim.learnSkill('overdrive'), false);
  assert.equal(sim.state.credits, balance);
  for (const node of SKILL_NODES) {
    for (let rank = 0; rank < 3; rank++) {
      assert.equal(sim.getSkillCost(node.id), costs[node.id] * 3 ** rank);
      assert.equal(sim.learnSkill(node.id), true);
    }
    const credits = sim.state.credits;
    assert.equal(sim.getSkillCost(node.id), Infinity);
    assert.equal(sim.learnSkill(node.id), false);
    assert.equal(sim.state.credits, credits);
  }
  assert.equal(balance - sim.state.credits, 18_525_000);
  const stats = sim.getStats(), ranks = { ...sim.state.skills };
  const snapshot = sim.toSave(NOW);
  snapshot.skills.power = 0;
  assert.deepEqual(sim.state.skills, ranks);
  const reload = new Simulation(sim.toSave(NOW), NOW, () => 0.99);
  assert.deepEqual(reload.getStats(), stats);
  assert.equal(reload.prestige(), true);
  assert.deepEqual(reload.state.skills, ranks);
  assert.deepEqual(reload.getStats(), stats);
  assert.deepEqual(new Simulation(reload.toSave(NOW), NOW, () => 0.99).state.skills, ranks);
});

test('unupgraded sale values remain unchanged, including the support-drone unit premium', () => {
  assert.equal(getSellValue(weapon('synthetic-base-sale', { level: 20, power: 1 })), 871);
  assert.equal(getPartSellValue(part('synthetic-base-body', 'bastion', { level: 20, power: 1 })), 1042);
  assert.equal(getPartSellValue(part('synthetic-base-drone', 'striker', { level: 20, power: 1, units: 4 })), 1512);
  assert.equal(getEnhancementRefund(weapon('synthetic-no-upgrades')), 0);
});

for (const kind of ['weapon', 'body', 'drone'] as const) {
  test(`a replaced ${kind} refunds half its actual enhancement payments exactly once after reload`, () => {
    const id = `synthetic-refund-${kind}`;
    const item = kind === 'weapon'
      ? weapon(id, { affixes: [{ id: 'power', value: 0.2 }, { id: 'critical', value: 0.1 }] })
      : part(id, kind === 'body' ? 'reactor' : 'frost', { units: kind === 'drone' ? 4 : 1,
        affixes: [{ id: 'vitality', value: 0.2 }, { id: 'regen', value: 1 }] });
    const state = 'slot' in item ? buildSave([item]) : buildSave([], item);
    let sim = new Simulation(state, NOW, () => 0.99);
    const sale = () => kind === 'weapon' ? sim.sellWeapon(id) : sim.sellPart(id);
    const owned = () => kind === 'weapon' ? sim.state.inventory.find(item => item.id === id)! : sim.state.parts.find(item => item.id === id)!;
    const value = (gear: WeaponItem | PartItem) => 'slot' in gear ? getPartSellValue(gear) : getSellValue(gear);
    const original = structuredClone(owned()), baseSale = value(original), balance = sim.state.credits;
    const starterId = kind === 'weapon' ? 'starter-pulse' : `starter-${kind}`;
    assert.equal(kind === 'weapon' ? sim.sellWeapon(starterId) : sim.sellPart(starterId), 0);
    let paid = 0;
    for (let rank = 0; rank < 10; rank++) {
      const before = sim.state.credits, fee = sim.getEnhancementCost(id);
      assert.equal(sim.enhanceEquipment(id), true);
      assert.equal(before - sim.state.credits, fee);
      paid += before - sim.state.credits;
    }
    assert.equal(paid, 634_102);
    assert.equal(getEnhancementInvestment(owned()), paid);
    assert.deepEqual({ ...owned(), enhancement: 0 }, { ...original, enhancement: 0 });
    assert.equal(sale(), 0); // Equipped protection is unchanged by the added refund.
    assert.equal(sim.state.credits, balance - paid);
    const enhanced = structuredClone(owned()), snapshot = sim.toSave(NOW);
    sim = new Simulation(snapshot, NOW, () => 0.99);
    assert.deepEqual(owned(), enhanced);
    assert.equal(sim.state.credits, balance - paid);
    assert.equal(getEnhancementRefund(owned()), Math.floor(paid / 2));
    assert.equal(value(owned()), baseSale + Math.floor(paid / 2));
    assert.equal(kind === 'weapon' ? sim.equipWeapon(starterId) : sim.equipPart(starterId), true);
    assert.equal(kind === 'weapon' ? sim.toggleWeaponLock(id) : sim.togglePartLock(id), true);
    assert.equal(sale(), 0); // Locked protection also remains intact after replacing an item.
    assert.equal(sim.state.credits, balance - paid);
    assert.equal(kind === 'weapon' ? sim.toggleWeaponLock(id) : sim.togglePartLock(id), true);
    const priorSales = { ...sim.state.lootStats }, priorTotal = sim.state.totalCredits;
    const expected = baseSale + Math.floor(paid / 2);
    assert.equal(sale(), expected);
    assert.equal(sim.state.credits, balance - paid + expected);
    assert.equal(sim.state.totalCredits - priorTotal, expected);
    assert.equal(sim.state.lootStats.sold, priorSales.sold + 1);
    assert.equal(sim.state.lootStats.soldCredits - priorSales.soldCredits, expected);
    assert.ok(sim.state.credits < balance + baseSale, 'Enhancing solely for resale must lose CR');
    assert.equal(balance + baseSale - sim.state.credits, paid - Math.floor(paid / 2));
    const settled = sim.toSave(NOW);
    assert.equal(sale(), 0);
    assert.deepEqual(sim.toSave(NOW), settled);
  });
}
