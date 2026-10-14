import test from 'node:test';
import assert from 'node:assert/strict';
import { getAffixText } from '../src/game/loot';
import { getPartAffixText } from '../src/game/parts';

test('weapon descriptions preserve fractional percentages without rounding small absorption up', () => {
  assert.equal(getAffixText({ id: 'leech', value: 0.015 }),
    '与ダメージの1.5%を回復（共通上限: シールド3%/秒）');
  assert.equal(getAffixText({ id: 'critical', value: 0.10001 }), '会心率 +10.001%（基礎倍率2倍）');
  assert.equal(getAffixText({ id: 'critical', value: 0.10002 }), '会心率 +10.002%（基礎倍率2倍）');
  assert.equal(getAffixText({ id: 'frost', value: 0.234 }), '敵を23.4%減速（2秒）');
  assert.equal(getAffixText({ id: 'power', value: 0.3 }), '威力 +30%');
  assert.equal(getAffixText({ id: 'explosive', value: 65.125 }), '爆風 65.125px（威力55%）');
});

test('part descriptions preserve absorption, cooldown and other percent roll fractions', () => {
  assert.equal(getPartAffixText({ id: 'leech', value: 0.015 }),
    '与ダメージの1.5%を回復（共通上限: シールド3%/秒）');
  assert.equal(getPartAffixText({ id: 'cooldown', value: 0.057 }), '必殺技の待ち時間 −5.7%');
  assert.equal(getPartAffixText({ id: 'critical', value: 0.10001 }), '会心率 +10.001%');
  assert.equal(getPartAffixText({ id: 'power', value: 0.2 }), '全武装威力 +20%');
  assert.equal(getPartAffixText({ id: 'cooldown', value: 0.18 }), '必殺技の待ち時間 −18%');
  assert.equal(getPartAffixText({ id: 'regen', value: 1.255 }), 'シールド再生 +1.255 HP/秒');
});

test('homing descriptions show one decimal degree of rotation while retaining integer angles', () => {
  assert.equal(getAffixText({ id: 'homing', value: 2.5 }), '追尾（旋回 143.2°/秒）');
  assert.equal(getAffixText({ id: 'homing', value: Math.PI }), '追尾（旋回 180°/秒）');
});
