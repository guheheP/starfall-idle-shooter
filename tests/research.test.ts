import test from 'node:test';
import assert from 'node:assert/strict';
import { getResearchBonuses, getSkillDefinition, SKILL_BRANCHES, SKILL_NODES, skillAvailable, skillCost, skillRank } from '../src/game/research';
import { Simulation } from '../src/game/simulation';
import type { Enemy, GameState, SkillId } from '../src/game/types';

const NOW = 1_800_000_000_000;
const save = (overrides: Partial<GameState> = {}): GameState => ({ ...new Simulation(undefined, NOW).toSave(NOW), ...overrides });
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test('research has three independent paths with explicit tier gates and prerequisites', () => {
  assert.equal(SKILL_BRANCHES.length, 3);
  assert.equal(SKILL_NODES.length, 9);
  assert.equal(new Set(SKILL_NODES.map(node => node.id)).size, 9);
  for (const branch of SKILL_BRANCHES) {
    const path = SKILL_NODES.filter(node => node.branch === branch.id);
    assert.equal(path.length, 3);
    const [root, second, third] = path;
    assert.equal(root.unlockWave, 15);
    assert.equal(root.requires, undefined);
    assert.equal(second.unlockWave, 20);
    assert.deepEqual(second.requires, { id: root.id, rank: 2 });
    assert.equal(third.unlockWave, 25);
    assert.deepEqual(third.requires, { id: second.id, rank: 1 });
    for (const node of path) assert.equal(node.maxRank, 3);
    assert.equal(skillAvailable({}, 14, root.id), false);
    assert.equal(skillAvailable({}, 15, root.id), true);
    assert.equal(skillAvailable({ [root.id]: 1 }, 100, second.id), false);
    assert.equal(skillAvailable({ [root.id]: 2 }, 19, second.id), false);
    assert.equal(skillAvailable({ [root.id]: 2 }, 20, second.id), true);
    assert.equal(skillAvailable({ [root.id]: 3 }, 100, third.id), false);
    assert.equal(skillAvailable({ [second.id]: 1 }, 24, third.id), false);
    assert.equal(skillAvailable({ [second.id]: 1 }, 25, third.id), true);
    assert.equal(skillAvailable({ [root.id]: 3 }, 100, root.id), false);
  }
  assert.equal(skillAvailable({ power: 3, accuracy: 3, cryo: 3 }, 100, 'armor'), true);
  assert.equal(skillAvailable({ armor: 3, repair: 3, stability: 3 }, 100, 'salvage'), true);
});

test('skill rank sanitization caps persisted values and purchase fees stay finite until MAX', () => {
  for (const node of SKILL_NODES) {
    assert.equal(getSkillDefinition(node.id), node);
    assert.equal(skillRank({}, node.id), 0);
    assert.equal(skillRank({ [node.id]: -3 }, node.id), 0);
    assert.equal(skillRank({ [node.id]: 2.9 }, node.id), 2);
    assert.equal(skillRank({ [node.id]: 1e12 }, node.id), 3);
    for (const invalid of [NaN, Infinity, -Infinity, '3', null, undefined]) {
      const malformed = { [node.id]: invalid } as unknown as Partial<Record<SkillId, number>>;
      assert.equal(skillRank(malformed, node.id), 0);
      assert.equal(skillCost(malformed, node.id), node.baseCost);
    }
    let previousCost = 0;
    for (let rank = 0; rank < 3; rank++) {
      const cost = skillCost({ [node.id]: rank }, node.id);
      assert.equal(cost, node.baseCost * 3 ** rank);
      assert.ok(Number.isSafeInteger(cost));
      assert.ok(cost > previousCost);
      previousCost = cost;
    }
    assert.equal(skillCost({ [node.id]: 3 }, node.id), Infinity);
    assert.equal(skillCost({ [node.id]: Number.MAX_VALUE }, node.id), Infinity);
    assert.equal(skillAvailable({}, Infinity, node.id), false);
    assert.equal(skillAvailable({}, NaN, node.id), false);
  }
});

test('research bonuses are additive, modest, and bounded independently of gear', () => {
  const zero = getResearchBonuses({});
  assert.ok(Object.values(zero).every(value => value === 0));
  const one = Object.fromEntries(SKILL_NODES.map(node => [node.id, 1]));
  assert.deepEqual(getResearchBonuses(one), {
    power: 0.06, critChance: 0.02, critMultiplier: 0.12, chilledBonus: 0.08, vitality: 0.04,
    regen: 0.6, highShieldDamage: 0.04, salvage: 0.04, cooldown: 0.04, overdriveDuration: 0.35,
  });
  const max = Object.fromEntries(SKILL_NODES.map(node => [node.id, Number.MAX_VALUE]));
  const bonuses = getResearchBonuses(max);
  for (const [key, value] of Object.entries(bonuses)) {
    assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(value - oneBonus(key, one) * 3) < 1e-10);
  }
  assert.ok(bonuses.power < 0.2);
  assert.ok(bonuses.vitality < 0.15);
  assert.ok(bonuses.cooldown < 0.15);
  assert.ok(bonuses.regen < 2);
});

function oneBonus(key: string, ranks: Partial<Record<SkillId, number>>): number {
  return getResearchBonuses(ranks)[key as keyof ReturnType<typeof getResearchBonuses>];
}

test('skill purchases reject locked waves, missing prerequisites, insufficient CR, and MAX without spending', () => {
  const sim = new Simulation(save({ bestWave: 14, credits: 2_000_000 }), NOW);
  assert.equal(sim.canLearnSkill('power'), false);
  assert.equal(sim.learnSkill('power'), false);
  assert.equal(sim.state.credits, 2_000_000);
  sim.state.bestWave = 20;
  assert.equal(sim.learnSkill('accuracy'), false);
  assert.equal(sim.state.credits, 2_000_000);
  assert.equal(sim.learnSkill('power'), true);
  assert.equal(sim.learnSkill('accuracy'), false);
  assert.equal(sim.learnSkill('power'), true);
  const cost = sim.getSkillCost('accuracy');
  sim.state.credits = cost - 1;
  assert.equal(sim.canLearnSkill('accuracy'), false);
  assert.equal(sim.learnSkill('accuracy'), false);
  assert.equal(sim.state.credits, cost - 1);
  sim.state.credits = 2_000_000;
  assert.equal(sim.learnSkill('accuracy'), true);
  assert.equal(sim.learnSkill('cryo'), false);
  sim.state.bestWave = 25;
  assert.equal(sim.learnSkill('cryo'), true);
  assert.equal(sim.learnSkill('power'), true);
  const before = sim.state.credits;
  assert.equal(sim.getSkillRank('power'), 3);
  assert.equal(sim.getSkillCost('power'), Infinity);
  assert.equal(sim.canLearnSkill('power'), false);
  assert.equal(sim.learnSkill('power'), false);
  assert.equal(sim.learnSkill('missing' as SkillId), false);
  assert.equal(sim.state.credits, before);
});

test('learning from a paused menu debits CR once, preserves health fraction and active timers, and emits a save event', () => {
  const sim = new Simulation(save({ bestWave: 25, credits: 100_000 }), NOW);
  const maxHp = sim.getStats().maxHp;
  sim.player.hp = maxHp * 0.4;
  sim.overdriveCooldown = 17;
  sim.overdriveLeft = 2.5;
  sim.paused = true;
  sim.drainEvents();
  const cost = sim.getSkillCost('armor');
  assert.equal(sim.learnSkill('armor'), true);
  assert.equal(sim.state.credits, 100_000 - cost);
  close(sim.getStats().maxHp, maxHp * 1.04);
  close(sim.player.hp / sim.getStats().maxHp, 0.4);
  assert.equal(sim.overdriveCooldown, 17);
  assert.equal(sim.overdriveLeft, 2.5);
  assert.equal(sim.paused, true);
  const event = sim.drainEvents().find(event => event.kind === 'inventory');
  assert.equal(event?.value, cost);
  assert.match(event?.message ?? '', /装甲設計 Lv\.1/);
});

test('a 250K CR budget can specialize in one path but cannot also purchase the other paths', () => {
  for (const path of [['power', 'power', 'accuracy'], ['salvage', 'salvage', 'cooling']] as SkillId[][]) {
    const sim = new Simulation(save({ bestWave: 25, credits: 250_000 }), NOW);
    for (const id of path) assert.equal(sim.learnSkill(id), true);
    assert.equal(sim.state.credits, 10_000);
    for (const id of ['power', 'armor', 'salvage'] as SkillId[]) {
      assert.equal(sim.canLearnSkill(id), false);
      assert.equal(sim.learnSkill(id), false);
    }
    assert.equal(sim.state.credits, 10_000);
    // Research leaves an independent, lower-cost option for equipment investment.
    const item = sim.getEquippedWeapon();
    const cost = sim.getEnhancementCost(item.id);
    assert.equal(sim.enhanceEquipment(item.id), true);
    assert.equal(sim.state.credits, 10_000 - cost);
  }
});

test('purchased research is permanent through save cloning, reload, and prestige', () => {
  const sim = new Simulation(save({ bestWave: 25, wave: 26, credits: 2_000_000 }), NOW);
  for (const id of ['power', 'power', 'accuracy', 'armor', 'armor', 'repair', 'salvage', 'salvage', 'cooling', 'overdrive'] as SkillId[]) {
    assert.equal(sim.learnSkill(id), true);
  }
  const snapshot = sim.toSave(NOW);
  const expected = { ...sim.state.skills };
  snapshot.skills.power = 0;
  assert.deepEqual(sim.state.skills, expected);
  const reloaded = new Simulation(sim.toSave(NOW), NOW);
  assert.deepEqual(reloaded.state.skills, expected);
  const oldSkills = reloaded.state.skills;
  const credits = reloaded.state.credits;
  const reward = reloaded.getPrestigeReward();
  assert.ok(reward > 0);
  assert.equal(reloaded.prestige(), true);
  assert.deepEqual(reloaded.state.skills, expected);
  assert.equal(reloaded.state.credits, credits + reward);
  assert.equal(reloaded.state.cores, 0);
  assert.equal(reloaded.state.researchVersion, 1);
  oldSkills.power = 0;
  assert.deepEqual(reloaded.state.skills, expected);
  assert.deepEqual(new Simulation(reloaded.toSave(NOW), NOW).state.skills, expected);
});

test('legacy research converts unused cores and over-cap investment to CR exactly once', () => {
  const current = save({ bestWave: 25, credits: 1234, totalCredits: 10_000,
    research: { power: 5, salvage: 1, cooldown: 4 }, cores: 7 });
  const { researchVersion: _version, skills: _skills, ...legacy } = current;
  const migrated = new Simulation(legacy, NOW);
  assert.deepEqual(migrated.state.skills, { power: 3, salvage: 2, cooling: 3 });
  assert.equal(migrated.state.credits, 1234 + 53_000);
  assert.equal(migrated.state.cores, 0);
  assert.deepEqual(migrated.state.research, { power: 0, salvage: 0, cooldown: 0 });
  assert.equal(migrated.state.researchVersion, 1);
  assert.ok(migrated.drainEvents().some(event => event.kind === 'inventory' && event.value === 53_000));
  const persisted = migrated.toSave(NOW);
  const reloaded = new Simulation(persisted, NOW);
  assert.equal(reloaded.state.credits, migrated.state.credits);
  assert.deepEqual(reloaded.state.skills, migrated.state.skills);
  assert.ok(!reloaded.drainEvents().some(event => event.message?.includes('旧研究')));
});

test('crafted research saves stay within rank and stat bounds and cannot spend beyond MAX', () => {
  const sim = new Simulation({ ...save({ bestWave: 25, credits: 100_000 }),
    skills: { power: Number.MAX_VALUE, accuracy: Infinity, armor: -20, repair: NaN, cooling: 2.9, invented: 1e99 } }, NOW);
  assert.deepEqual(sim.state.skills, { power: 3, accuracy: 0, armor: 0, repair: 0, cooling: 2 });
  const credits = sim.state.credits;
  assert.equal(sim.learnSkill('power'), false);
  assert.equal(sim.state.credits, credits);
  assert.ok(Object.values(sim.getStats()).every(Number.isFinite));
});

test('research affects combat stats, high-shield conditions, regeneration, offline income, and overdrive', () => {
  const base = new Simulation(save({ bestWave: 25 }), NOW, () => 0.5);
  const skilled = new Simulation(save({ bestWave: 25, skills: Object.fromEntries(SKILL_NODES.map(node => [node.id, 3])) }), NOW, () => 0.5);
  const before = base.getStats(), after = skilled.getStats();
  close(after.damage / before.damage, 1.18 * 1.12);
  close(after.maxHp / before.maxHp, 1.12);
  close(after.critChance - before.critChance, 0.06);
  close(after.regen - before.regen, 1.8);
  close(after.chilledBonus, 0.24);
  close(after.highShieldDamage, 0.12);
  close(after.offlineRate / before.offlineRate, 1.12);
  close(after.cooldownSeconds, 45 * 0.88);
  close(skilled.getOverdriveDuration(), 6.05);
  assert.equal(skilled.activateOverdrive(), true);
  close(skilled.overdriveCooldown, after.cooldownSeconds);
  close(skilled.overdriveLeft, 6.05);
  skilled.player.hp = skilled.getStats().maxHp * 0.5;
  close(skilled.getStats().damage / before.damage, 1.18);
  const credits = skilled.state.credits;
  assert.equal(skilled.claimOffline(600)?.credits, Math.floor(600 * after.offlineRate));
  assert.equal(skilled.state.credits - credits, Math.floor(600 * after.offlineRate));
  base.player.hp = 50;
  skilled.player.hp = 50;
  base.update(1, { x: 0, y: 0 });
  skilled.update(1, { x: 0, y: 0 });
  close(base.player.hp, 50 + before.regen);
  close(skilled.player.hp, 50 + after.regen);
});

test('cryo research travels with real fired shots and only amplifies already slowed targets', () => {
  for (const slowed of [false, true]) {
    const sim = new Simulation(save({ bestWave: 25, skills: { power: 2, accuracy: 1, cryo: 3 } }), NOW, () => 0.5);
    sim.update(1 / 60, { x: 0, y: 0 });
    const shot = sim.bullets.find(bullet => bullet.friendly && bullet.source === 'weapon')!;
    assert.ok(shot);
    close(shot.chilledBonus ?? 0, 0.24);
    const target: Enemy = { id: 900_000, kind: 'tank', x: 360, y: 450, baseX: 360,
      hp: 1000, maxHp: 1000, radius: 60, age: 0, shotTimer: 100, hitFlash: 0,
      slowLeft: slowed ? 2 : 0, slowFactor: 0.7 };
    sim.enemies = [target];
    sim.bullets = [{ ...shot, x: 360, y: 450, vx: 0, vy: 0, hitIds: [] }];
    sim.update(1 / 60, { x: 0, y: 0 });
    close(1000 - target.hp, shot.damage * (slowed ? 1.24 : 1));
  }
});
