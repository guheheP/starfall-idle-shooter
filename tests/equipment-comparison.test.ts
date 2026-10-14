import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterWeapon, WEAPON_BASES } from '../src/game/loot';
import { createStarterPart, PART_BASES } from '../src/game/parts';
import type { PartAffix, PartItem, WeaponAffix, WeaponItem } from '../src/game/types';
import { compareEquipmentEffects } from '../src/ui/equipment-comparison';

const weapon = (affixes: WeaponAffix[], overrides: Partial<WeaponItem> = {}): WeaponItem =>
  ({ ...createStarterWeapon('pulse'), affixes, ...overrides });
const part = (affixes: PartAffix[], overrides: Partial<PartItem> = {}): PartItem =>
  ({ ...createStarterPart('wing'), affixes, ...overrides });

test('a candidate without effects explicitly retains every equipped-only loss', () => {
  const comparison = compareEquipmentEffects(weapon([]), weapon([{ id: 'leech', value: 0.015 }, { id: 'frost', value: 0.4 }]));
  assert.equal(comparison.rows.length, 2);
  assert.deepEqual(comparison.rows.map(row => [row.id, row.status, row.before, row.after, row.afterRaw]),
    [['leech', 'removed', '1.5%', 'なし', null], ['frost', 'removed', '40%', 'なし', null]]);
  assert.match(comparison.rows[0].note, /全武装共通.*3%\/秒/);
  assert.match(comparison.rows[1].note, /2秒/);
});

test('disjoint four-effect items keep all eight gained and lost effects', () => {
  const equipped = weapon([{ id: 'power', value: 0.3 }, { id: 'rapid', value: 0.2 }, { id: 'critical', value: 0.1 }, { id: 'pierce', value: 2 }]);
  const candidate = weapon([{ id: 'homing', value: Math.PI }, { id: 'explosive', value: 70 }, { id: 'chain', value: 3 }, { id: 'salvage', value: 0.6 }]);
  const rows = compareEquipmentEffects(candidate, equipped).rows;
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map(row => row.id)).size, 8);
  assert.ok(rows.slice(0, 4).every(row => row.status === 'added' && row.before === 'なし'));
  assert.ok(rows.slice(4).every(row => row.status === 'removed' && row.after === 'なし'));
  assert.deepEqual(rows.slice(0, 3).map(row => row.after), ['180°/秒', '70px', '3体']);
  assert.match(rows.find(row => row.id === 'chain')!.note, /72%ずつ減衰/);
  assert.match(rows.find(row => row.id === 'explosive')!.note, /55%/);
});

test('larger cooldown reduction is beneficial even though its display is negative', () => {
  const improved = compareEquipmentEffects(part([{ id: 'cooldown', value: 0.18 }]), part([{ id: 'cooldown', value: 0.05 }])).rows[0];
  assert.equal(improved.status, 'improved');
  assert.equal(improved.before, '−5%');
  assert.equal(improved.after, '−18%');
  assert.match(improved.note, /最短12秒/);
  assert.equal(compareEquipmentEffects(part([{ id: 'cooldown', value: 0.05 }]), part([{ id: 'cooldown', value: 0.18 }])).rows[0].status, 'reduced');
});

test('close percent rolls stay visibly distinct and values preserve small absorption amounts', () => {
  const rows = compareEquipmentEffects(weapon([{ id: 'leech', value: 0.016 }, { id: 'critical', value: 0.10001 }]),
    weapon([{ id: 'leech', value: 0.015 }, { id: 'critical', value: 0.10002 }])).rows;
  assert.deepEqual(rows.map(row => [row.before, row.after, row.status]), [['1.5%', '1.6%', 'improved'], ['+10.002%', '+10.001%', 'reduced']]);
  const tinyRotation = compareEquipmentEffects(weapon([{ id: 'homing', value: 1.5001 }]), weapon([{ id: 'homing', value: 1.5002 }])).rows[0];
  assert.notEqual(tinyRotation.before, tinyRotation.after);
  assert.equal(tinyRotation.status, 'reduced');
});

test('part regeneration uses HP per second and overlapping ids preserve different equipment scopes', () => {
  const partRows = compareEquipmentEffects(part([{ id: 'regen', value: 1.255 }, { id: 'power', value: 0.2 }, { id: 'critical', value: 0.1 }]), part([])).rows;
  const weaponRows = compareEquipmentEffects(weapon([{ id: 'power', value: 0.2 }, { id: 'critical', value: 0.1 }]), weapon([])).rows;
  assert.equal(partRows[0].after, '+1.255 HP/秒');
  assert.equal(partRows[1].label, '全武装威力');
  assert.equal(weaponRows[0].label, '武器威力');
  assert.match(partRows[2].note, /ストライカードローン/);
  assert.match(weaponRows[1].note, /基礎倍率2倍/);
  assert.doesNotMatch(partRows[2].note, /基礎倍率2倍/);
});

test('equal effects remain unchanged and comparison never mutates either item', () => {
  const candidate = part([{ id: 'guard', value: 0.12 }, { id: 'reach', value: 0.3 }]);
  const equipped = part([{ id: 'reach', value: 0.3 }, { id: 'guard', value: 0.12 }]);
  const snapshot = structuredClone([candidate, equipped]);
  const comparison = compareEquipmentEffects(candidate, equipped);
  assert.ok(comparison.rows.every(row => row.status === 'unchanged' && row.before === row.after));
  assert.equal(comparison.model.changed, false);
  comparison.model.before.name = 'mutable output';
  comparison.rows[0].beforeRaw = 0;
  assert.deepEqual([candidate, equipped], snapshot);
  assert.equal(PART_BASES.focus.name, 'フォーカスウイング');
});

test('model switches remain neutral, preserve descriptions, and work within one category', () => {
  const comparison = compareEquipmentEffects(weapon([], { type: 'missile' }), weapon([], { type: 'arc' }));
  assert.equal(comparison.kind, 'weapon');
  assert.equal(comparison.model.changed, true);
  assert.deepEqual(comparison.model.before, { id: 'arc', name: WEAPON_BASES.arc.name, description: WEAPON_BASES.arc.description });
  assert.deepEqual(comparison.model.after, { id: 'missile', name: WEAPON_BASES.missile.name, description: WEAPON_BASES.missile.description });
  assert.deepEqual(comparison.rows.map(row => [row.id, row.effectiveStatus]),
    [['homing', 'added'], ['explosive', 'added'], ['chain', 'removed']]);
  const reactor = compareEquipmentEffects(part([], { model: 'reactor', slot: 'body' }), part([], { model: 'bastion', slot: 'body' }));
  assert.equal(reactor.kind, 'body');
  assert.match(reactor.model.after.description, /シールド70%以上/);
});

test('cross-category and malformed part model comparisons are rejected', () => {
  assert.throws(() => compareEquipmentEffects(weapon([]), part([])), RangeError);
  assert.throws(() => compareEquipmentEffects(part([]), weapon([])), RangeError);
  assert.throws(() => compareEquipmentEffects(part([]), part([], { slot: 'body', model: 'bastion' })), RangeError);
  assert.throws(() => compareEquipmentEffects(part([], { slot: 'wing', model: 'bastion' }), part([])), RangeError);
  assert.throws(() => compareEquipmentEffects(part([]), part([], { slot: 'wing', model: 'bastion' })), RangeError);
});

test('native max keeps a masked affix loss unchanged without claiming that the attack was lost', () => {
  const comparison = compareEquipmentEffects(weapon([], { type: 'missile' }),
    weapon([{ id: 'explosive', value: 55 }, { id: 'homing', value: 1.5 }], { type: 'missile' }));
  const explosion = comparison.rows.find(row => row.id === 'explosive')!;
  assert.equal(explosion.status, 'removed');
  assert.equal(explosion.after, 'なし');
  assert.equal(explosion.effectiveBefore, '65px');
  assert.equal(explosion.effectiveAfter, '65px');
  assert.equal(explosion.effectiveStatus, 'unchanged');
  assert.match(explosion.note, /副次効果 55px → なし/);
  const homing = comparison.rows.find(row => row.id === 'homing')!;
  assert.equal(homing.effectiveStatus, 'unchanged');
  assert.equal(homing.effectiveBefore, homing.effectiveAfter);
  assert.match(homing.note, /副次効果/);
});

test('a larger raw roll can lose effectiveness after switching away from a stronger native model', () => {
  const homing = compareEquipmentEffects(weapon([{ id: 'homing', value: 2 }], { type: 'pulse' }),
    weapon([{ id: 'homing', value: 1.5 }], { type: 'missile' })).rows.find(row => row.id === 'homing')!;
  assert.equal(homing.status, 'improved');
  assert.equal(homing.effectiveStatus, 'reduced');
  assert.equal(homing.effectiveBefore, '143.2°/秒');
  assert.equal(homing.effectiveAfter, '114.6°/秒');
  assert.match(homing.effectiveLabel!, /固有含む/);
});

test('native-only effects are explicitly lost, and lance reach adds the affix to its intrinsic hits', () => {
  const lost = compareEquipmentEffects(weapon([]), weapon([], { type: 'missile' }));
  assert.deepEqual(lost.rows.map(row => [row.id, row.status, row.effectiveStatus, row.effectiveAfter]),
    [['homing', 'unchanged', 'removed', 'なし'], ['explosive', 'unchanged', 'removed', 'なし']]);
  assert.ok(lost.rows.every(row => !row.note.includes('副次効果')));
  const reach = compareEquipmentEffects(weapon([{ id: 'pierce', value: 1 }]),
    weapon([], { type: 'lance' })).rows.find(row => row.id === 'pierce')!;
  assert.equal(reach.before, 'なし');
  assert.equal(reach.after, '+1体');
  assert.equal(reach.status, 'added');
  assert.equal(reach.effectiveBefore, '3体');
  assert.equal(reach.effectiveAfter, '2体');
  assert.equal(reach.effectiveStatus, 'reduced');
});

test('ordinary native comparisons omit redundant raw pairs when their benefit direction agrees', () => {
  const homing = compareEquipmentEffects(weapon([{ id: 'homing', value: 3 }], { type: 'orbit' }),
    weapon([{ id: 'homing', value: 2 }], { type: 'orbit' })).rows.find(row => row.id === 'homing')!;
  assert.equal(homing.status, 'improved');
  assert.equal(homing.effectiveStatus, 'improved');
  assert.doesNotMatch(homing.note, /副次効果/);
  assert.match(homing.note, /固有と高い方/);
});
