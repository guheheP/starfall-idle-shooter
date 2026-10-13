import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationForEvent } from '../src/game/notifications';
import { Simulation } from '../src/game/simulation';

test('manual action events do not replace their control confirmations but migration still notifies',()=>{
  const sim=new Simulation(undefined,1800000000000);sim.drainEvents();sim.saveLoadout('one','巡航');
  const saveEvent=sim.drainEvents().find(event=>event.kind==='inventory')!;
  assert.equal(notificationForEvent(saveEvent),null);
  assert.deepEqual(notificationForEvent({kind:'inventory',message:'旧強化費を返還',value:300}),{message:'旧強化費を返還',tone:'info'});
  assert.deepEqual(notificationForEvent({kind:'collection',message:'目標達成',value:1500}),{message:'目標達成',tone:'success'});
});

test('automatic rare stored drops notify while common, autosold and missing drops stay quiet',()=>{
  const item=new Simulation(undefined,1800000000000).getEquippedWeapon();
  assert.equal(notificationForEvent({kind:'loot',message:'回収',item}),null);
  assert.equal(notificationForEvent({kind:'loot',message:'回収',item:{...item,rarity:'rare'},autoSold:true}),null);
  assert.equal(notificationForEvent({kind:'loot',message:'回収'}),null);
  assert.deepEqual(notificationForEvent({kind:'loot',message:'レア回収',item:{...item,rarity:'rare'}}),{message:'レア回収',tone:'power'});
});
