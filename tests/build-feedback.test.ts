import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { createStarterWeapon } from '../src/game/loot';
import { createStarterPart } from '../src/game/parts';
import type { Bullet, Enemy, PartItem } from '../src/game/types';

const NOW=1800000000000, IDLE={x:0,y:0};
function fixture() {
  const starter=new Simulation(undefined,NOW).toSave(NOW);
  const weapon={...createStarterWeapon('pulse'),id:'feedback-weapon',starter:false,locked:false,rarity:'rare' as const,affixes:[{id:'frost' as const,value:.3},{id:'critical' as const,value:.1}]};
  const reactor:PartItem={...createStarterPart('body'),id:'feedback-reactor',model:'reactor',starter:false,rarity:'rare',affixes:[{id:'regen',value:1}]};
  const frost:PartItem={...createStarterPart('drone'),id:'feedback-drone',model:'frost',starter:false,rarity:'rare',affixes:[{id:'chilled',value:.3}]};
  return new Simulation({...starter,autopilot:false,inventory:[weapon],equippedWeaponId:weapon.id,
    parts:[...starter.parts,reactor,frost],equippedParts:{...starter.equippedParts,body:reactor.id,drone:frost.id}},NOW,()=>.99);
}
function target():Enemy {
  return {id:80000,kind:'tank',x:360,y:450,baseX:360,hp:100000,maxHp:100000,radius:26,age:0,shotTimer:100,hitFlash:0};
}
const hit=(enemy:Enemy,override:Partial<Bullet>={}):Bullet=>({id:90000,x:enemy.x,y:enemy.y,vx:0,vy:0,damage:10,radius:4,friendly:true,weapon:'pulse',pierce:1,hitIds:[],chilledBonus:.3,frost:.3,...override});

test('build feedback distinguishes compatible gear from current frozen and high-shield conditions',()=>{
  const sim=fixture(), enemy=target(); sim.enemies=[enemy];
  const row=(id:string)=>sim.getSynergies().find(status=>status.id===id)!;
  assert.equal(row('cryo').active,true); assert.equal(row('cryo').engaged,false);
  enemy.slowLeft=1; assert.equal(row('cryo').engaged,true);
  enemy.hp=0; assert.equal(row('cryo').engaged,false);
  assert.equal(row('sustain').active,true); assert.equal(row('sustain').engaged,true);
  sim.player.hp=sim.getStats().maxHp*.69; assert.equal(row('sustain').engaged,false);
  sim.player.hp=sim.getStats().maxHp*.69999;assert.equal(row('sustain').engaged,false);assert.match(row('sustain').detail,/69\.9%/);
  sim.player.hp=sim.getStats().maxHp*.7; assert.equal(row('sustain').engaged,true);
  assert.match(row('sustain').detail,/70%/);
  assert.equal(row('cascade').detail.includes('対象 +1'),false);
  sim.state.parts.find(part=>part.id==='feedback-reactor')!.affixes=[];
  assert.equal(row('sustain').active,true); // A plain reactor's own regeneration counts.
  sim.player.hp=0;assert.equal(row('sustain').engaged,false);assert.equal(row('critical').engaged,false);
});

test('ice impact metadata reports an actual chilled bonus, excluding the first freeze application',()=>{
  const sim=fixture(),enemy=target();sim.enemies=[enemy];sim.drainEvents();sim.bullets=[hit(enemy)];
  sim.update(1/60,IDLE);
  const first=sim.drainEvents().find(event=>event.kind==='hit')!;
  assert.equal(first.chilled,false);assert.equal(first.value,10);
  sim.bullets=[hit(enemy,{id:90001})];sim.update(1/60,IDLE);
  const second=sim.drainEvents().find(event=>event.kind==='hit')!;
  assert.equal(second.chilled,true);assert.equal(second.value,13);
});

test('high-shield projectile and hit accents retain the firing condition after changing equipment',()=>{
  const sim=fixture(),enemy=target();sim.enemies=[enemy];sim.update(1/60,IDLE);
  const fired=sim.bullets.find(bullet=>bullet.source==='weapon')!;
  assert.equal(fired.empowered,true);
  sim.state.equippedParts.body='starter-body';sim.player.hp=sim.getStats().maxHp*.4;
  sim.drainEvents();sim.bullets=[{...fired,x:enemy.x,y:enemy.y,vx:0,vy:0,hitIds:[]}];sim.update(1/60,IDLE);
  const impact=sim.drainEvents().find(event=>event.kind==='hit'||event.kind==='critical')!;
  assert.equal(impact.empowered,true);assert.equal(sim.getStats().highShieldDamage,0);
});
