import Phaser from 'phaser';
import { WEAPON_BASES, RARITIES } from './loot';
import type { Bullet, GameEvent, WeaponId } from './types';

type FlareKind = 'muzzle' | 'impact' | 'critical' | 'blast' | 'boss' | 'loot' | 'overdrive' | 'cryo' | 'node';
interface Flare {
  kind: FlareKind; x: number; y: number; color: number; radius: number;
  life: number; max: number; angle: number; weapon: WeaponId;
}
interface Ribbon { points: { x: number; y: number }[]; sampledAt: number; color: number; width: number; }

/** Local light, material flashes and projectile ribbons; never changes combat rules. */
export class CombatVisuals {
  private ribbons = new Map<number, Ribbon>();
  private flares: Flare[] = [];
  private trailGraphics: Phaser.GameObjects.Graphics;
  private lightGraphics: Phaser.GameObjects.Graphics;
  private lastMuzzle = -1;
  private age = 0;

  constructor(scene: Phaser.Scene) {
    this.trailGraphics = scene.add.graphics().setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD);
    this.lightGraphics = scene.add.graphics().setDepth(12.3).setBlendMode(Phaser.BlendModes.ADD);
  }

  event(event: GameEvent, fallback: WeaponId, enabled: boolean): void {
    if (!enabled) return;
    const weapon = event.weapon ?? fallback;
    const color = WEAPON_BASES[weapon].color;
    if(event.kind==='chain' && event.points) for(const point of event.points.slice(1,5)) {
      if(this.flares.length>=56)this.flares.shift();
      this.flares.push({kind:'node',x:point.x,y:point.y,color:0xbb9cff,radius:13,life:.22,max:.22,angle:Math.PI/4,weapon});
    }
    if (event.x === undefined || event.y === undefined) return;
    const flare = (kind: FlareKind, radius: number, duration: number, tint = color, offsetX = 0) => {
      if (this.flares.length >= 56) this.flares.shift();
      this.flares.push({ kind, x: event.x! + offsetX, y: event.y! - (kind === 'muzzle' ? 21 : 0), color: tint, radius,
        life: duration, max: duration, angle: (event.x! * .013 + event.y! * .019) % Math.PI, weapon });
    };
    if (event.kind === 'shot' && event.source !== 'drone' && this.age - this.lastMuzzle >= .045) {
      this.lastMuzzle = this.age;
      if(weapon==='pulse') for(const side of [-1,1]) flare('muzzle',10,.11,color,side*9);
      else flare('muzzle', weapon === 'lance' ? 24 : weapon === 'spread' ? 21 : 15, .13);
    }
    if (event.kind === 'hit') flare('impact', 10, .13);
    if (event.kind === 'critical') flare('critical', 23, .2, 0xffda8a);
    if ((event.kind === 'hit' || event.kind === 'critical') && event.chilled) flare('cryo', 20, .25, 0x97edff);
    if (event.kind === 'explosion') flare('blast', Math.min(140, event.value ?? 60), .3, 0xffab65);
    if (event.kind === 'kill') {
      if (event.boss) flare('boss', 150, 1.05, 0xffc28b);
      else flare('blast', event.elite ? 58 : 25, event.elite ? .45 : .22, event.elite ? 0xffc583 : 0xffa873);
    }
    if (event.kind === 'loot' && event.item && !event.autoSold) {
      const rarity = RARITIES.find(value => value.id === event.item!.rarity)!;
      if (rarity.rank >= 2) flare('loot', rarity.rank === 4 ? 46 : 30, rarity.rank === 4 ? 1.2 : .65, rarity.color);
    }
    if (event.kind === 'overdrive') flare('overdrive', 150, .72, color);
  }

  render(dt: number, bullets: readonly Bullet[], enabled: boolean): void {
    this.trailGraphics.clear();
    this.lightGraphics.clear();
    if (!enabled) {
      this.ribbons.clear(); this.flares.length = 0;
      return;
    }
    this.age += dt;
    const alive = new Set<number>();
    for (const bullet of bullets) {
      if (!bullet.friendly || bullet.source === 'drone' ||
        !(bullet.crit || ['lance', 'missile', 'arc', 'orbit'].includes(bullet.weapon))) continue;
      alive.add(bullet.id);
      let ribbon = this.ribbons.get(bullet.id);
      if (!ribbon && this.ribbons.size < 96) {
        ribbon = { points: [], sampledAt: -1, color: bullet.color ?? WEAPON_BASES[bullet.weapon].color,
          width: bullet.weapon === 'lance' ? 4 : bullet.weapon === 'missile' ? 2.5 : 1.6 };
        this.ribbons.set(bullet.id, ribbon);
      }
      if (!ribbon) continue;
      if (this.age - ribbon.sampledAt >= .028) {
        ribbon.points.push({ x: bullet.x, y: bullet.y });
        if (ribbon.points.length > 6) ribbon.points.shift();
        ribbon.sampledAt = this.age;
      }
      for (let index = 1; index < ribbon.points.length; index++) {
        const start = ribbon.points[index - 1], end = ribbon.points[index];
        const intensity = index / ribbon.points.length;
        this.trailGraphics.lineStyle(ribbon.width * 3, ribbon.color, .075 * intensity);
        this.trailGraphics.lineBetween(start.x, start.y, end.x, end.y);
        this.trailGraphics.lineStyle(ribbon.width * intensity, ribbon.color, .48 * intensity);
        this.trailGraphics.lineBetween(start.x, start.y, end.x, end.y);
      }
    }
    for (const id of this.ribbons.keys()) if (!alive.has(id)) this.ribbons.delete(id);

    for (const flare of this.flares) {
      flare.life -= dt;
      if (flare.life <= 0) continue;
      const remaining = flare.life / flare.max;
      const progress = 1 - remaining;
      const radius = flare.radius * (.28 + progress * .95);
      const graphics = this.lightGraphics;
      const star = (arms: number, reach: number, width: number, alpha: number, rotation = flare.angle) => {
        for (let index = 0; index < arms; index++) {
          const angle = rotation + index * Math.PI * 2 / arms;
          const x = Math.cos(angle), y = Math.sin(angle);
          graphics.lineStyle(width, flare.color, alpha);
          graphics.lineBetween(flare.x + x * reach * .22, flare.y + y * reach * .22,
            flare.x + x * reach, flare.y + y * reach);
        }
      };
      if (flare.kind === 'muzzle') {
        graphics.fillStyle(flare.color, remaining * .13);
        graphics.fillEllipse(flare.x, flare.y, radius * 2, radius * .8);
        graphics.lineStyle(1.2, flare.color, remaining * .8);
        if (flare.weapon === 'arc') {
          const points = [-1, -.55, -.15, .25, .65, 1].map((amount, index) =>
            ({ x: flare.x + amount * radius, y: flare.y + (index % 2 ? 5 : -5) * remaining }));
          graphics.strokePoints(points, false);
        } else if (flare.weapon === 'orbit') {
          graphics.strokeEllipse(flare.x, flare.y, radius * 2, radius);
          star(6, radius, 1, remaining * .7);
        } else {
          graphics.lineBetween(flare.x - radius, flare.y, flare.x + radius, flare.y);
          graphics.fillStyle(0xeeffff, remaining * .85);
          graphics.fillTriangle(flare.x - 3, flare.y + 4, flare.x + 3, flare.y + 4,
            flare.x, flare.y - radius * (flare.weapon === 'lance' ? 2.3 : 1.1));
        }
      } else if (flare.kind === 'cryo') {
        for(let index=0;index<6;index++) {
          const angle=index*Math.PI/3+flare.angle,x=flare.x+Math.cos(angle)*radius,y=flare.y+Math.sin(angle)*radius;
          const dx=Math.cos(angle),dy=Math.sin(angle);
          graphics.lineStyle(1,flare.color,remaining*.8);
          graphics.lineBetween(x-dx*5,y-dy*5,x+dx*3,y+dy*3);
          graphics.fillStyle(flare.color,remaining*.7);
          graphics.fillTriangle(x-dy*2,y+dx*2,x+dy*2,y-dx*2,x+dx*5,y+dy*5);
        }
      } else if(flare.kind === 'node') {
        graphics.lineStyle(1.3,flare.color,remaining*.8);
        graphics.strokePoints([{x:flare.x,y:flare.y-radius},{x:flare.x+radius,y:flare.y},{x:flare.x,y:flare.y+radius},{x:flare.x-radius,y:flare.y}],true);
        star(4,radius*.7,1,remaining*.55,Math.PI/4);
      } else if (flare.kind === 'impact' || flare.kind === 'critical') {
        graphics.fillStyle(flare.color, remaining * .14);
        graphics.fillCircle(flare.x, flare.y, radius * .7);
        star(flare.kind === 'critical' ? 6 : 4, radius, flare.kind === 'critical' ? 2 : 1, remaining * .85);
        graphics.fillStyle(0xf5ffff, remaining * .9);
        graphics.fillCircle(flare.x, flare.y, 2.5 * remaining);
        if (flare.kind === 'critical') {
          graphics.lineStyle(.9, flare.color, remaining * .65);
          graphics.strokeCircle(flare.x, flare.y, radius * 1.15);
        }
      } else if (flare.kind === 'blast' || flare.kind === 'boss') {
        const boss = flare.kind === 'boss';
        const flash = Math.max(0, 1 - progress * (boss ? 5 : 3.7));
        graphics.fillStyle(flare.color, flash * .18);
        graphics.fillCircle(flare.x, flare.y, radius * .7);
        graphics.lineStyle(boss ? 3 : 1.3, flare.color, remaining * .55);
        graphics.strokeEllipse(flare.x, flare.y, radius * (boss ? 3.4 : 2.3), radius * .7);
        graphics.lineStyle(boss ? 8 : 3, flare.color, flash * .26);
        graphics.lineBetween(flare.x - radius * 1.6, flare.y, flare.x + radius * 1.6, flare.y);
        star(boss ? 10 : 5, radius, boss ? 2 : 1, remaining * .38);
        if (boss) {
          graphics.lineStyle(1, 0xd1edff, remaining * .45);
          graphics.strokeEllipse(flare.x, flare.y, radius * 3.8, radius * 1.2);
        }
      } else if (flare.kind === 'loot') {
        const top = flare.y - flare.radius * 3.5;
        graphics.lineStyle(flare.radius * .5, flare.color, remaining * .045);
        graphics.lineBetween(flare.x, top, flare.x, flare.y + 18);
        graphics.lineStyle(2, flare.color, remaining * .75);
        graphics.lineBetween(flare.x, top + 20, flare.x, flare.y - 3);
        graphics.lineStyle(1, flare.color, remaining * .8);
        graphics.strokeEllipse(flare.x, flare.y, radius * 2, radius * .65);
        star(4, 10 + progress * 16, 1, remaining * .7, Math.PI / 4);
      } else {
        graphics.lineStyle(4, flare.color, remaining * .18);
        graphics.strokeCircle(flare.x, flare.y, radius);
        graphics.lineStyle(1.4, 0xd7ffff, remaining * .75);
        for (let index = 0; index < 8; index++) {
          const angle = index * Math.PI / 4 + progress * .4;
          graphics.beginPath(); graphics.arc(flare.x, flare.y, radius, angle, angle + .24, false); graphics.strokePath();
        }
        star(8, radius * 1.3, 1.2, remaining * .4);
      }
    }
    this.flares = this.flares.filter(flare => flare.life > 0);
  }
}
