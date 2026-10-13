import type Phaser from 'phaser';
import { WEAPON_BASES } from './loot';
import type { Bullet } from './types';

/** Physical projectile silhouettes always remain; bloom and accents follow the effects preference. */
export function drawProjectiles(friendly: Phaser.GameObjects.Graphics, hostile: Phaser.GameObjects.Graphics,
  bullets: readonly Bullet[], time: number, full: boolean): void {
  friendly.clear(); hostile.clear();
  for (const b of bullets) {
    const g = b.friendly ? friendly : hostile;
    const speed = Math.max(1, Math.hypot(b.vx, b.vy)), ux = b.vx / speed, uy = b.vy / speed;
    const point = (forward: number, side = 0) => ({ x: b.x + ux * forward - uy * side, y: b.y + uy * forward + ux * side });
    const line = (from: number, to: number, width: number, color: number, alpha: number, side = 0) => {
      const a = point(from, side), c = point(to, side);
      g.lineStyle(width, color, alpha); g.lineBetween(a.x, a.y, c.x, c.y);
    };
    const shape = (vertices: [number, number][], color: number, alpha = 1) => {
      g.fillStyle(color, alpha); g.fillPoints(vertices.map(([forward, side]) => point(forward, side)), true);
    };
    const outline = (vertices: [number, number][], color: number, width: number, alpha = 1) => {
      g.lineStyle(width, color, alpha); g.strokePoints(vertices.map(([forward, side]) => point(forward, side)), true);
    };
    if (!b.friendly) {
      const color = b.color ?? 0xff875f;
      if (full) {
        line(-15, -1, 3.5, color, .22);
        g.fillStyle(color, .1); g.fillCircle(b.x, b.y, b.radius + 5);
      }
      // Threats sit above damage flashes; the dark annulus keeps their actual core legible.
      g.fillStyle(0x170b20, .98); g.fillCircle(b.x, b.y, b.radius + 1.6);
      g.lineStyle(1, color, .95); g.strokeCircle(b.x, b.y, b.radius + .5);
      g.fillStyle(color, .95); g.fillCircle(b.x, b.y, b.radius * .82);
      g.fillStyle(0xfff1d4, .98); g.fillCircle(b.x - ux * .7, b.y - uy * .7, b.radius * .36);
      if (b.radius >= 6) {
        g.lineStyle(.85, 0xffd5e0, .8); g.strokeCircle(b.x, b.y, b.radius + 2);
        line(-b.radius * .55, b.radius * .55, .8, 0xfff0d8, .6);
      }
      continue;
    }
    const color = b.color ?? WEAPON_BASES[b.weapon].color;
    const drone = b.source === 'drone';
    const length = b.weapon === 'lance' ? 86 : b.weapon === 'missile' ? 41 : b.weapon === 'arc' ? 46 : b.weapon === 'orbit' ? 30 : 28;
    if (full) {
      line(-length, 0, drone ? 5 : b.weapon === 'lance' ? 15 : b.crit ? 11 : 8, color, drone ? .06 : .08);
      line(-length * .65, 0, drone ? 2.8 : 4.5, color, .2);
    }
    if (drone && b.droneModel === 'frost') {
      const crystal: [number, number][] = [[8, 0], [-2, 4], [-8, 0], [-2, -4]];
      shape(crystal, color); outline(crystal, 0xeaffff, .8);
      shape([[6, 0], [-2, 0], [-2, -3]], 0xf3ffff, .8);
      line(-20, -7, 1, color, .5);
    } else if (drone && b.droneModel === 'mender') {
      line(-21, 0, 2.5, color, .9); line(-11, 0, 1, 0xeefff0, 1);
      g.fillStyle(color, .9); g.fillCircle(b.x, b.y, 3.2);
      g.fillStyle(0xedfff4); g.fillCircle(b.x, b.y, 1.3);
    } else if (b.weapon === 'missile' && !drone) {
      if (full) {
        const reach = 37 + Math.sin(time * 35 + b.id) * 4;
        shape([[-12, 4], [-reach, 0], [-12, -4]], 0xff9760, .65);
        shape([[-12, 2], [-reach * .84, 0], [-12, -2]], 0xffe7a0, .9);
        line(-14, -reach * .65, 1.1, 0xffffdf, .95);
      }
      const hull: [number, number][] = [[9, 0], [1, 3.4], [-12, 3.1], [-15, 0], [-12, -3.1], [1, -3.4]];
      shape(hull, 0x192e46); outline(hull, 0x091320, 1.2);
      shape([[9, 0], [0, 3], [-12, 2.7], [-10, 0]], 0x71899e);
      shape([[9, 0], [0, -3], [-12, -2.7], [-10, 0]], 0xd5e4e8);
      shape([[9, 0], [1, 2.6], [1, -2.6]], color);
      shape([[-7, 2.5], [-17, 7], [-14, 2.5]], 0xa5bac9);
      shape([[-7, -2.5], [-17, -7], [-14, -2.5]], 0x58728d);
      line(-10, 1, .8, 0xf3fbff, .9, -.8);
      line(-14, -11, 2.6, 0xffe3aa, .95);
    } else if (b.weapon === 'arc' && !drone) {
      const vertices = Array.from({ length: 7 }, (_, i) => point(-length + i * length / 6,
        i === 0 || i === 6 ? 0 : (i % 2 ? -1 : 1) * (2.6 + (full ? Math.sin(time * 23 + b.id + i) * 1.8 : 0))));
      if (full) { g.lineStyle(6, color, .15); g.strokePoints(vertices, false); }
      g.lineStyle(2.4, color, .95); g.strokePoints(vertices, false);
      g.lineStyle(.8, 0xe8f5ff, .95); g.strokePoints(vertices, false);
      shape([[6, 0], [0, 4.3], [-6, 0], [0, -4.3]], color);
      line(-3, 3, 1.1, 0xffffff, 1);
      if (full) {
        for (const side of [-1, 1]) {
          g.lineStyle(.9, color, .65);
          g.strokePoints([point(-15), point(-22, side * 7), point(-30, side * 3)], false);
        }
      }
    } else if (b.weapon === 'orbit' && !drone) {
      const angle = full ? (b.age ?? time) * 6 + b.id : Math.atan2(uy, ux);
      const vertex = (r: number, a: number) => ({ x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r });
      const vertices = [vertex(10, angle), vertex(3.8, angle + Math.PI / 2), vertex(10, angle + Math.PI), vertex(3.8, angle - Math.PI / 2)];
      g.fillStyle(0x59493d); g.fillPoints(vertices, true);
      g.lineStyle(1, 0xffedb6, .95); g.strokePoints(vertices, true);
      g.fillStyle(color, .95); g.fillTriangle(vertices[0].x, vertices[0].y, vertices[1].x, vertices[1].y, b.x, b.y);
      g.fillStyle(0xfffbe6); g.fillTriangle(vertices[0].x, vertices[0].y, vertices[3].x, vertices[3].y, b.x, b.y);
      g.fillStyle(0xffffee); g.fillCircle(b.x, b.y, 1.8);
      if (full) {
        g.lineStyle(.8, color, .4); g.beginPath(); g.arc(b.x, b.y, 12, angle + .25, angle + Math.PI * .8, false); g.strokePath();
      }
    } else if (b.weapon === 'lance' && !drone) {
      const beam: [number, number][] = [[7, 0], [-9, 4], [-62, 2.4], [-80, 0], [-62, -2.4], [-9, -4]];
      shape(beam, color, .92);
      shape([[6, 0], [-13, 1.25], [-63, .7], [-73, 0], [-63, -.7], [-13, -1.25]], 0xfbffff);
      if (full) {
        for (const at of [-9, -28, -48]) { const a = point(at, 6), c = point(at, -6); g.lineStyle(.8, color, .6); g.lineBetween(a.x, a.y, c.x, c.y); }
      }
    } else if (b.weapon === 'spread' && !drone) {
      const slug: [number, number][] = [[6, 0], [-3, 3], [-20, 2.4], [-28, 0], [-20, -2.4], [-3, -3]];
      shape(slug, color, .94);
      shape([[5, 0], [-4, 1.1], [-18, 0], [-4, -1.1]], 0xfff9d6);
      if (full) { line(-16, -6, .75, 0xffd6a7, .8, 3.5); line(-16, -6, .75, 0xffd6a7, .8, -3.5); }
    } else {
      const bolt: [number, number][] = [[6, 0], [-2, 2.4], [-21, 1.5], [-26, 0], [-21, -1.5], [-2, -2.4]];
      shape(bolt, color, drone ? .8 : .95); line(-18, 3, .9, 0xedffff, .98);
      if (full && !drone) { line(-8, -1, .7, color, .65, 4); line(-8, -1, .7, color, .65, -4); }
    }
    // Affixes accent a family instead of replacing its silhouette.
    if (full && b.crit) {
      const a = point(-3, 5), c = point(-3, -5), nose = point(5);
      g.lineStyle(1, 0xffe0a1, .9); g.lineBetween(a.x, a.y, nose.x, nose.y); g.lineBetween(c.x, c.y, nose.x, nose.y);
    }
    if (full && (b.frost ?? 0) > 0) outline([[3, 0], [-3, 5], [-3, -5]], 0xc1fcff, 1, .85);
    if (full && (b.leech ?? 0) > 0) line(-length * .5, -3, 1.1, 0x91ffb9, .55);
    if (full && (b.explosion ?? 0) > 0 && b.weapon !== 'missile') { g.lineStyle(.8, 0xffaa6b, .7); g.strokeCircle(b.x, b.y, 4.8); }
    if (full && b.empowered) line(-7, 0, .8, 0xffedbd, .75, 2.5);
  }
}
