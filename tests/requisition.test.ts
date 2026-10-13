import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequisitionReward, getRequisitionProfile, getRequisitionRarity, isRequisitionModel, REQUISITION_PROFILES } from '../src/game/requisition';
import { getSellValue, validateWeaponItem } from '../src/game/loot';
import { getPartSellValue, validatePartItem } from '../src/game/parts';
import { Simulation } from '../src/game/simulation';

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('all fifteen requisition profiles expose the fixed model, role, unlock and promised build effect', () => {
  assert.equal(REQUISITION_PROFILES.length, 15);
  assert.equal(new Set(REQUISITION_PROFILES.map(profile => profile.model)).size, 15);
  assert.deepEqual(REQUISITION_PROFILES.map(profile => profile.category), [
    'weapon', 'weapon', 'weapon', 'weapon', 'weapon', 'weapon', 'wing', 'wing', 'wing', 'body', 'body', 'body', 'drone', 'drone', 'drone',
  ]);
  for (const profile of REQUISITION_PROFILES) {
    assert.equal(getRequisitionProfile(profile.model), profile);
    assert.equal(isRequisitionModel(profile.model), true);
    assert.ok(profile.name && profile.description && profile.guaranteedAffix);
    assert.ok(profile.unlockWave >= 1);
  }
  for (const invalid of ['missing', '__proto__', 'toString', null, {}, 1]) {
    assert.equal(isRequisitionModel(invalid), false);
    assert.equal(getRequisitionProfile(invalid), undefined);
  }
});

test('directed rewards always contain the promised model and affix, while all values survive ordinary save validation', () => {
  let serial = 400;
  for (const profile of REQUISITION_PROFILES) for (const rank of [1, 5, 6, 10]) for (const level of [1, 35, 200, 10000]) {
    const item = createRequisitionReward(profile.model, level, rank, ++serial, seeded(serial));
    assert.equal('slot' in item ? item.model : item.type, profile.model);
    assert.equal(item.level, level);
    assert.equal(item.rarity, rank < 6 ? 'epic' : 'legendary');
    assert.equal(item.locked, true);assert.equal(item.starter, false);assert.equal(item.enhancement, 0);
    assert.match(item.id, 'slot' in item ? /^part-\d+$/ : /^loot-\d+$/);
    assert.equal(item.affixes[0].id, profile.guaranteedAffixId);
    assert.equal(item.affixes.length, rank < 6 ? 3 : 4);
    assert.equal(new Set(item.affixes.map(affix => affix.id)).size, item.affixes.length);
    const validated = 'slot' in item ? validatePartItem(item) : validateWeaponItem(item);
    assert.deepEqual(validated, item, `${profile.model} / R${rank} / Lv${level} changed during validation`);
    assert.ok(('slot' in item ? getPartSellValue(item) : getSellValue(item)) > 0);
    if (!('slot' in item) && item.type === 'missile') assert.ok(item.affixes.every(affix => affix.id !== 'homing' && affix.id !== 'explosive'));
    if (!('slot' in item) && item.type === 'arc') assert.ok(item.affixes.every(affix => affix.id !== 'chain'));
  }
});

test('reward power and drone units follow the ordinary quality curve without a hidden mission-rank multiplier', () => {
  for (const profile of REQUISITION_PROFILES) for (const rank of [1, 5, 6, 10]) {
    const item = createRequisitionReward(profile.model, 35, rank, 999, () => .5);
    const quality = rank < 6 ? 3 : 4;
    const normal = 'slot' in item
      ? Math.round(Math.min(12, (1 + 34 * .045) * (1 + quality * .18) * 1.02) * 1000) / 1000
      : Math.round(Math.min(12, (1 + 34 * .032) * (1 + quality * .14) * 1.04) * 1000) / 1000;
    assert.equal(item.power, normal);
    if ('slot' in item) assert.equal(item.units, item.slot === 'drone' ? 4 : 1);
  }
  assert.equal(getRequisitionRarity(1), 'epic');assert.equal(getRequisitionRarity(5), 'epic');
  assert.equal(getRequisitionRarity(6), 'legendary');assert.equal(getRequisitionRarity(10), 'legendary');
});

test('guaranteed affixes stay in the middle-to-upper range, while the other rolls genuinely vary', () => {
  const pulseLow = createRequisitionReward('pulse', 40, 1, 1, () => 0);
  const pulseHigh = createRequisitionReward('pulse', 40, 1, 1, () => .999999);
  assert.equal(pulseLow.affixes[0].value, .19);
  assert.ok(pulseHigh.affixes[0].value >= .254 && pulseHigh.affixes[0].value <= .255);
  assert.ok(pulseHigh.affixes[0].value < .32);
  assert.notDeepEqual(pulseLow.affixes.slice(1), pulseHigh.affixes.slice(1));
  const chain = createRequisitionReward('orbit', 40, 6, 2, () => .999999);
  assert.equal(chain.affixes[0].value, 2); // A stable useful chain length without handing out the maximum.
  const bodies = [0, 1, 2, 3, 4].map(seed => createRequisitionReward('reactor', 40, 6, seed + 1, seeded(seed)));
  assert.ok(new Set(bodies.map(item => JSON.stringify(item.affixes.slice(1)))).size > 1);
});

test('named locked rewards enter ordinary inventories, resist automatic sale, and round-trip with standard IDs', () => {
  const now = 1_800_000_000_000;
  const base = new Simulation(undefined, now).toSave(now);
  const sim = new Simulation({ ...base, wave: 41, bestWave: 40, autoSellRarity: 'legendary' }, now);
  const equipped = [sim.state.equippedWeaponId, { ...sim.state.equippedParts }];
  const rewards = REQUISITION_PROFILES.map((profile, index) => createRequisitionReward(profile.model, 40, 6, 700 + index, seeded(index)));
  for (const item of rewards) {
    const outcome = 'slot' in item ? sim.receivePart(item) : sim.receiveWeapon(item);
    assert.equal(outcome.stored, true);assert.equal(outcome.sold, false);
  }
  assert.deepEqual([sim.state.equippedWeaponId, sim.state.equippedParts], equipped);
  assert.equal(sim.sellEligibleWeapons().count, 0);
  const reload = new Simulation(sim.toSave(now), now);
  for (const reward of rewards) {
    const stored = ('slot' in reward ? reload.state.parts : reload.state.inventory).find(item => item.id === reward.id);
    assert.ok(stored);assert.equal(stored.name, reward.name);assert.deepEqual(stored.affixes, reward.affixes);assert.equal(stored.locked, true);
  }
});

test('invalid numeric inputs cannot poison a valid directed reward', () => {
  for (const profile of REQUISITION_PROFILES) {
    const item = createRequisitionReward(profile.model, NaN, NaN, Infinity, () => NaN);
    assert.equal(item.level, 1);assert.equal(item.rarity, 'epic');assert.ok(Number.isFinite(item.power));
    assert.ok(item.affixes.every(affix => Number.isFinite(affix.value)));
    assert.deepEqual('slot' in item ? validatePartItem(item) : validateWeaponItem(item), item);
  }
  assert.throws(() => createRequisitionReward('invalid' as never, 1, 1, 1), RangeError);
});
