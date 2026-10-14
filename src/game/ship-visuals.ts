import type Phaser from 'phaser';
import { WEAPON_BASES } from './loot';
import { PART_BASES } from './parts';
import { MODULES } from './simulation';
import type { ModuleId, WeaponId } from './types';

type Paint = { light: string; mid: string; dark: string; edge: string };
type Ctx = CanvasRenderingContext2D;
// Detail level belongs to each baked texture, so rich and compact art can coexist.
const compactContexts = new WeakSet<Ctx>();
const TAU = Math.PI * 2;
const CERAMIC: Paint = { light: '#f2f4e9', mid: '#a5bcc7', dark: '#506c80', edge: '#f1ffff' };
const TITANIUM: Paint = { light: '#d5e7ee', mid: '#7d9bad', dark: '#2b455e', edge: '#dffaff' };
const GRAPHITE: Paint = { light: '#62798b', mid: '#31495e', dark: '#101d2c', edge: '#9cbac9' };
const GOLD: Paint = { light: '#f1e4be', mid: '#b09a73', dark: '#514948', edge: '#fff6d6' };
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

function path(ctx: Ctx, points: number[]) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
  ctx.closePath();
}

/** A broad face, a shaded bevel, and a fine leading edge survive downscaling. */
function plate(ctx: Ctx, points: number[], paint = TITANIUM) {
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  const compact = compactContexts.has(ctx);
  const metal = ctx.createLinearGradient(left, top, right, bottom);
  metal.addColorStop(0, paint.light);
  if (compact) {
    metal.addColorStop(.52, paint.mid);
  } else {
    metal.addColorStop(.19, paint.mid);
    metal.addColorStop(.49, paint.dark);
    metal.addColorStop(.55, paint.mid);
    metal.addColorStop(.81, paint.mid);
  }
  metal.addColorStop(1, paint.dark);
  path(ctx, points);
  ctx.fillStyle = metal;
  ctx.fill();
  // Small muzzle/coil cells read as one face; their thin dark rims turn into specks.
  if (compact && Math.min(right - left, bottom - top) < 7) return;
  ctx.strokeStyle = '#071421';
  ctx.lineWidth = 1.25;
  ctx.stroke();
  if (compact) return;
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = paint.edge;
  ctx.globalAlpha = .7;
  ctx.lineWidth = .7;
  ctx.beginPath();
  ctx.moveTo(points[0] + .3, points[1] + .3);
  for (let index = 2; index < Math.min(points.length, 8); index += 2) ctx.lineTo(points[index], points[index + 1] + .45);
  ctx.stroke();
  ctx.restore();
}

function seam(ctx: Ctx, points: number[], color = '#152b40', width = .8) {
  if (compactContexts.has(ctx) && width < 1.5) {
    const channels = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16));
    const saturated = Math.max(...channels) - Math.min(...channels) > 48;
    if (!saturated || Math.max(...channels) < 110) return;
    width = Math.max(width, 1.25);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'bevel';
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
  ctx.stroke();
}

function bolt(ctx: Ctx, x: number, y: number) {
  if (compactContexts.has(ctx)) return;
  ctx.fillStyle = '#0a1a29';
  ctx.beginPath();ctx.arc(x, y, 1.05, 0, TAU);ctx.fill();
  ctx.fillStyle = '#cce4ec';ctx.fillRect(x - .35, y - .7, .65, .7);
}

function vents(ctx: Ctx, x: number, y: number, width: number, count: number, accent?: string) {
  ctx.fillStyle = '#081722';ctx.fillRect(x - .7, y - 1, width + 1.4, count * 2.8 + 1);
  if (compactContexts.has(ctx)) {
    ctx.fillStyle = '#253a48';ctx.fillRect(x + .5, y + .5, Math.max(0, width - 1), Math.max(1, count * 2.8 - 2));
    if (accent) { ctx.fillStyle = accent;ctx.fillRect(x, y + (count - 1) * 2.8, width, 1.5); }
    return;
  }
  for (let index = 0; index < count; index++) {
    ctx.fillStyle = accent && index === count - 1 ? accent : '#718d9d';
    ctx.fillRect(x, y + index * 2.8, width, .85);
  }
}

/** Small optical details are part of the object; no diffuse glow is baked in. */
function lens(ctx: Ctx, x: number, y: number, radius: number, accent: string) {
  const compact = compactContexts.has(ctx);
  ctx.fillStyle = '#091827';ctx.beginPath();ctx.arc(x, y, radius + 1.45, 0, TAU);ctx.fill();
  if (!compact) { ctx.strokeStyle = '#a8c0c8';ctx.lineWidth = .8;ctx.stroke(); }
  const glass = ctx.createRadialGradient(x - radius * .32, y - radius * .4, .2, x, y, radius);
  glass.addColorStop(0, compact ? accent : '#eeffff');glass.addColorStop(compact ? .55 : .32, accent);glass.addColorStop(1, '#143548');
  ctx.fillStyle = glass;ctx.beginPath();ctx.arc(x, y, radius, 0, TAU);ctx.fill();
  if (compact) return;
  ctx.strokeStyle = accent;ctx.lineWidth = .7;ctx.stroke();
  ctx.fillStyle = '#f5ffff';ctx.fillRect(x - radius * .4, y - radius * .54, Math.max(.8, radius * .27), .7);
}

function thruster(ctx: Ctx, x: number, y: number, width: number, height: number, accent: string) {
  plate(ctx, [x, y, x + width, y, x + width + 1, y + height - 3, x + width - 1, y + height, x + 1, y + height, x - 1, y + height - 3], GRAPHITE);
  vents(ctx, x + 1.8, y + 3, width - 3.6, Math.max(2, Math.floor((height - 8) / 2.8)));
  ctx.fillStyle = '#081522';ctx.fillRect(x + .5, y + height - 4, width - 1, 3);
  ctx.fillStyle = accent;ctx.fillRect(x + 1.5, y + height - 3, width - 3, 1.4);
  if (!compactContexts.has(ctx)) { ctx.fillStyle = '#eaffff';ctx.fillRect(x + 2.5, y + height - 2.6, width - 5, .5); }
}

function mirrored(ctx: Ctx, width: number, draw: () => void) {
  for (const side of [-1, 1]) {
    ctx.save();
    if (side === 1) { ctx.translate(width, 0);ctx.scale(-1, 1); }
    draw();
    ctx.restore();
  }
}

function weaponPod(ctx: Ctx, weapon: WeaponId, accent: string) {
  // The left mount is mirrored around the fuselage. Each archetype has its own silhouette.
  const x = 17;
  const compact = compactContexts.has(ctx);
  if (weapon === 'pulse') {
    plate(ctx, [x - 5, 41, x + 6, 39, x + 8, 66, x - 5, 70], TITANIUM);
    plate(ctx, [x - 2, 21, x + 2, 21, x + 3, 53, x - 3, 53], GRAPHITE);
    if (!compact) { ctx.fillStyle = '#c8e0e6';ctx.fillRect(x - 2, 25, 4, 1.5);ctx.fillRect(x - 2.5, 37, 5, 2); }
    ctx.fillStyle = accent;ctx.fillRect(x - 1.2, 21, 2.4, 2);
    seam(ctx, [x, 27, x, 46], accent, .7);
    vents(ctx, x + 2.5, 48, 3, 5);lens(ctx, x + 1, 62, 2.1, accent);
  } else if (weapon === 'spread') {
    plate(ctx, [x - 7, 39, x + 8, 35, x + 10, 61, x + 3, 70, x - 8, 67], CERAMIC);
    for (let index = 0; index < 3; index++) {
      const bx = x - 4.5 + index * 4.5, tip = 32 - index * 3;
      plate(ctx, [bx - 1.7, tip, bx + 1.7, tip, bx + 2, 49, bx - 2, 49], GRAPHITE);
      if (!compact) { ctx.fillStyle = '#b4c9d0';ctx.fillRect(bx - 2, tip + 6, 4, 1.5); }
      ctx.fillStyle = accent;ctx.fillRect(bx - 1, tip, 2, 2);
    }
    seam(ctx, [x - 5, 54, x + 5, 51, x + 6, 59], '#30495d');
    vents(ctx, x - 4, 57, 9, 3, accent);bolt(ctx, x + 5, 65);
  } else if (weapon === 'lance') {
    plate(ctx, [x - 6, 41, x + 6, 37, x + 8, 65, x + 2, 73, x - 6, 69], TITANIUM);
    plate(ctx, [x - 4, 15, x - 1, 12, x - 1, 55, x - 5, 55], CERAMIC);
    plate(ctx, [x + 1, 12, x + 4, 15, x + 5, 55, x + 1, 55], CERAMIC);
    ctx.fillStyle = '#071827';ctx.fillRect(x - .7, 14, 1.4, 40);
    seam(ctx, [x, 17, x, 51], accent, 1);
    if (!compact) for (const y of [24, 34, 44]) { ctx.fillStyle = '#6b7f97';ctx.fillRect(x - 4.8, y, 3.3, 2);ctx.fillRect(x + 1.5, y, 3.3, 2); }
    lens(ctx, x, 61, 3.5, accent);bolt(ctx, x - 3, 69);
  } else if (weapon === 'missile') {
    plate(ctx, [x - 8, 33, x + 8, 31, x + 10, 62, x + 5, 72, x - 8, 69], TITANIUM);
    plate(ctx, [x - 6, 39, x + 6, 37, x + 7, 63, x - 6, 63], GRAPHITE);
    for (let index = 0; index < 3; index++) {
      const bx = x - 4.5 + index * 4.5;
      ctx.fillStyle = '#091421';ctx.fillRect(bx - 1.8, 39, 3.6, 18);
      plate(ctx, [bx, 33, bx + 1.2, 36, bx + 1.2, 53, bx - 1.2, 53, bx - 1.2, 36], CERAMIC);
      ctx.fillStyle = accent;ctx.fillRect(bx - 1.1, 38, 2.2, 3);
    }
    vents(ctx, x - 5, 61, 10, 3);seam(ctx, [x - 5, 68, x + 5, 68], accent, 1.1);
  } else if (weapon === 'arc') {
    plate(ctx, [x - 5, 44, x + 6, 40, x + 9, 64, x + 3, 73, x - 7, 69], GRAPHITE);
    plate(ctx, [x - 6, 27, x - 3, 23, x - 1, 38, x - 4, 49, x - 7, 45], TITANIUM);
    plate(ctx, [x + 2, 25, x + 5, 28, x + 7, 44, x + 4, 48, x + 1, 36], TITANIUM);
    ctx.strokeStyle = '#718db1';ctx.lineWidth = 2.6;ctx.beginPath();ctx.ellipse(x, 50, 7, 10, 0, 0, TAU);ctx.stroke();
    ctx.strokeStyle = accent;ctx.lineWidth = compact ? 1.25 : .75;ctx.beginPath();ctx.ellipse(x, 50, 5.2, 8, 0, .15, Math.PI * 1.25);ctx.stroke();
    lens(ctx, x, 49, 3.3, accent);
    if (compact) vents(ctx, x - 4, 57, 8, 3);
    else for (const y of [57, 61, 65]) { ctx.fillStyle = '#90a4bb';ctx.fillRect(x - 4, y, 8, 1.6); }
    ctx.fillStyle = accent;ctx.fillRect(x - 5, 26, 1.8, 2);ctx.fillRect(x + 3, 26, 1.8, 2);
  } else {
    plate(ctx, [x - 4, 40, x + 6, 40, x + 8, 66, x + 2, 74, x - 6, 68], TITANIUM);
    ctx.fillStyle = '#132334';ctx.beginPath();ctx.arc(x, 43, 10, 0, TAU);ctx.fill();
    ctx.strokeStyle = '#ccb98c';ctx.lineWidth = 2.4;ctx.stroke();
    if (!compact) { ctx.strokeStyle = '#fff1b8';ctx.lineWidth = .7;ctx.beginPath();ctx.arc(x, 43, 9.8, Math.PI, Math.PI * 1.77);ctx.stroke(); }
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3;
      const px = x + Math.cos(angle) * 7.3, py = 43 + Math.sin(angle) * 7.3;
      ctx.save();ctx.translate(px, py);ctx.rotate(angle);
      plate(ctx, [-2.4, 0, 0, -1.4, 2.4, 0, 0, 1.4], GOLD);ctx.restore();
    }
    lens(ctx, x, 43, 3.1, accent);seam(ctx, [x - 3, 61, x, 66, x + 3, 61], accent, 1);
    vents(ctx, x - 2, 54, 4, 3);
  }
}

function ship(ctx: Ctx, module: ModuleId, weapon: WeaponId, moduleColor: string, accent: string) {
  const compact = compactContexts.has(ctx);
  // Graphite keel and ceramic outer plates keep a bright, recognizable player silhouette.
  plate(ctx, [44, 4, 50, 17, 56, 42, 67, 57, 71, 81, 54, 80, 49, 96, 39, 96, 34, 80, 17, 81, 21, 57, 32, 42, 38, 17], GRAPHITE);
  mirrored(ctx, 88, () => {
    plate(ctx, [31, 41, 36, 58, 27, 68, 7, 78, 12, 62], CERAMIC);
    plate(ctx, [14, 63, 29, 49, 29, 60, 21, 71, 11, 74], TITANIUM);
    seam(ctx, [12, 66, 24, 63, 29, 54], '#435e71', .9);
    seam(ctx, [14, 72, 22, 68], moduleColor, 1.1);
    bolt(ctx, 20, 67);bolt(ctx, 31, 53);
    plate(ctx, [33, 44, 40, 43, 40, 76, 35, 82, 29, 65], TITANIUM);
    vents(ctx, 33, 58, 4.5, 4);
    if (module === 'assault') {
      plate(ctx, [24, 42, 30, 37, 34, 58, 30, 77, 23, 76], TITANIUM);
      plate(ctx, [24, 47, 27, 44, 30, 54, 28, 67, 24, 69], GOLD);
      vents(ctx, 25, 56, 3.2, 4, moduleColor);
    } else if (module === 'bulwark') {
      plate(ctx, [10, 54, 22, 47, 29, 59, 27, 76, 15, 85, 7, 75], CERAMIC);
      plate(ctx, [11, 60, 18, 56, 22, 63, 21, 75, 15, 80, 10, 73], TITANIUM);
      seam(ctx, [12, 61, 17, 59, 21, 64, 20, 74], moduleColor, 1.2);
      bolt(ctx, 16, 77);
    } else if (module === 'salvager') {
      plate(ctx, [10, 54, 22, 51, 25, 65, 20, 83, 11, 83, 8, 72], GRAPHITE);
      plate(ctx, [11, 57, 19, 55, 20, 65, 16, 78, 11, 78], TITANIUM);
      vents(ctx, 12, 60, 5, 4, moduleColor);
      seam(ctx, [10, 75, 8, 81, 12, 86], '#9dbfc8', 2);
    }
  });
  plate(ctx, [44, 4, 50, 21, 54, 43, 51, 64, 44, 81, 37, 64, 34, 43, 38, 21], CERAMIC);
  plate(ctx, [44, 6, 44, 79, 37, 62, 35, 42, 39, 20], TITANIUM);
  // Canopy remains in the upper fuselage, outside all body attachment footprints.
  plate(ctx, [44, 16, 50, 32, 48, 42, 44, 48, 40, 42, 38, 32], GRAPHITE);
  const glass = ctx.createLinearGradient(39, 19, 48, 42);
  if (compact) {
    glass.addColorStop(0, '#b6f0f2');glass.addColorStop(.45, accent);glass.addColorStop(1, '#0b2b42');
  } else {
    glass.addColorStop(0, '#f0ffff');glass.addColorStop(.18, '#b6f0f2');glass.addColorStop(.4, accent);glass.addColorStop(.62, '#2c677f');glass.addColorStop(1, '#0b2b42');
  }
  path(ctx, [44, 18, 48.2, 32, 46.8, 40.5, 44, 44.5, 41.2, 40.5, 39.8, 32]);ctx.fillStyle = glass;ctx.fill();
  seam(ctx, [44, 19, 41.4, 31, 41.7, 38], '#f1ffff', .9);
  seam(ctx, [41, 35, 47, 35], '#143b54', .7);
  seam(ctx, [44, 8, 41, 16], '#f7ffff', .75);
  seam(ctx, [37, 48, 40, 53, 40, 59], '#506f7e');seam(ctx, [51, 48, 48, 53, 48, 59], '#506f7e');
  lens(ctx, 44, 63, 3.2, accent);
  plate(ctx, [44, 73, 50, 83, 49, 91, 39, 91, 38, 83], TITANIUM);
  seam(ctx, [44, 77, 44, 87], moduleColor, 1.2);
  thruster(ctx, 34, 78, 8, 19, accent);thruster(ctx, 46, 78, 8, 19, accent);
  mirrored(ctx, 88, () => weaponPod(ctx, weapon, accent));
  for (const [x, y] of [[37, 49], [51, 49], [39, 72], [49, 72]]) bolt(ctx, x, y);
}

function wing(ctx: Ctx, model: 'focus' | 'velocity' | 'cascade', accent: string) {
  mirrored(ctx, 128, () => {
    if (model === 'focus') {
      // Forward accuracy fins with a long, clean targeting rail.
      plate(ctx, [29, 11, 35, 20, 42, 49, 36, 72, 26, 82, 16, 79, 24, 49], GRAPHITE);
      plate(ctx, [29, 13, 33, 24, 35, 47, 29, 69, 20, 76, 27, 48], CERAMIC);
      plate(ctx, [31, 29, 38, 40, 38, 54, 32, 65, 29, 63, 33, 45], TITANIUM);
      plate(ctx, [26, 17, 29, 17, 30, 57, 26, 61], GRAPHITE);
      seam(ctx, [27.5, 20, 27.5, 50], accent, .8);
      ctx.fillStyle = accent;ctx.fillRect(26.4, 17, 2.2, 2.4);
      vents(ctx, 30.5, 49, 4, 4);lens(ctx, 28, 69, 2.6, accent);
      seam(ctx, [19, 76, 27, 78, 34, 70], accent, 1);
      bolt(ctx, 31, 35);bolt(ctx, 32, 75);
    } else if (model === 'velocity') {
      // Swept aerofoil, cutout trailing edge, and exposed booster bank.
      plate(ctx, [7, 42, 29, 28, 41, 50, 40, 70, 31, 83, 9, 100, 19, 70, 13, 59], GRAPHITE);
      plate(ctx, [8, 43, 28, 31, 34, 45, 28, 61, 14, 68, 18, 56], CERAMIC);
      plate(ctx, [29, 39, 37, 51, 34, 69, 26, 81, 14, 94, 22, 68], TITANIUM);
      seam(ctx, [11, 46, 26, 37, 31, 45], '#f3ffff', .7);
      seam(ctx, [18, 69, 28, 60, 28, 50], accent, 1.2);
      thruster(ctx, 18, 77, 7, 14, accent);thruster(ctx, 28, 69, 6, 14, accent);
      vents(ctx, 27, 45, 4, 3);bolt(ctx, 21, 49);bolt(ctx, 31, 58);
      seam(ctx, [12, 95, 16, 91], accent, 1.2);
    } else {
      // Wide split plates carry visibly separate relay nodes for chaining.
      plate(ctx, [5, 44, 34, 37, 44, 52, 40, 73, 31, 89, 3, 86, 9, 73, 14, 61], GRAPHITE);
      plate(ctx, [6, 46, 32, 40, 39, 51, 30, 62, 10, 64, 15, 55], CERAMIC);
      plate(ctx, [11, 70, 31, 65, 37, 73, 29, 85, 6, 82], TITANIUM);
      plate(ctx, [28, 47, 35, 47, 38, 61, 33, 74, 26, 70], TITANIUM);
      lens(ctx, 31, 61, 4.4, accent);lens(ctx, 11, 55, 2.5, accent);lens(ctx, 14, 77, 2.2, accent);
      seam(ctx, [14, 55, 24, 53, 27, 58], accent, .9);
      seam(ctx, [17, 76, 24, 74, 28, 66], accent, .9);
      vents(ctx, 21, 45, 4, 3);bolt(ctx, 27, 80);bolt(ctx, 8, 79);
    }
  });
}

function body(ctx: Ctx, model: 'bastion' | 'reactor' | 'siphon', accent: string) {
  // Upper center stays transparent so the cockpit remains visible over every attachment.
  if (model === 'bastion') {
    mirrored(ctx, 64, () => {
      plate(ctx, [19, 12, 25, 17, 25, 39, 29, 52, 25, 65, 15, 59, 7, 41, 11, 23], GRAPHITE);
      plate(ctx, [18, 14, 24, 19, 23, 42, 26, 55, 21, 61, 14, 56, 9, 40, 13, 25], CERAMIC);
      plate(ctx, [12, 26, 18, 22, 20, 39, 17, 53, 12, 48, 9, 39], TITANIUM);
      seam(ctx, [14, 27, 17, 25, 18, 41, 15, 49], accent, 1);
      vents(ctx, 19, 34, 3, 4);bolt(ctx, 17, 19);bolt(ctx, 20, 55);
    });
    plate(ctx, [25, 31, 39, 31, 43, 47, 40, 59, 32, 67, 24, 59, 21, 47], TITANIUM);
    plate(ctx, [27, 35, 37, 35, 39, 46, 32, 56, 25, 46], CERAMIC);
    lens(ctx, 32, 42, 4.3, accent);seam(ctx, [27, 59, 32, 62, 37, 59], accent, 1);
  } else if (model === 'reactor') {
    mirrored(ctx, 64, () => {
      plate(ctx, [21, 17, 25, 22, 25, 29, 17, 35, 16, 48, 23, 56, 22, 61, 12, 50, 10, 34, 15, 23], TITANIUM);
      vents(ctx, 14, 36, 3, 4);bolt(ctx, 19, 25);
    });
    plate(ctx, [26, 28, 38, 28, 46, 37, 45, 50, 37, 61, 32, 66, 27, 61, 19, 50, 18, 37], GRAPHITE);
    ctx.strokeStyle = '#b7c6ce';ctx.lineWidth = 3;ctx.beginPath();ctx.arc(32, 43, 13.5, 0, TAU);ctx.stroke();
    if (!compactContexts.has(ctx)) { ctx.strokeStyle = '#f4e0b2';ctx.lineWidth = .65;ctx.beginPath();ctx.arc(32, 43, 15.4, Math.PI * .85, Math.PI * 1.88);ctx.stroke(); }
    for (let index = 0; index < 6; index++) {
      const a = index * Math.PI / 3;
      ctx.save();ctx.translate(32 + Math.cos(a) * 13.5, 43 + Math.sin(a) * 13.5);ctx.rotate(a);
      plate(ctx, [-2, -3, 2, -3, 2, 3, -2, 3], GOLD);
      ctx.fillStyle = accent;ctx.fillRect(-1, -1.8, 1.7, 3.6);ctx.restore();
    }
    lens(ctx, 32, 43, 8.3, accent);
    seam(ctx, [28, 61, 32, 64, 36, 61], '#b9ced3', 1.2);
  } else {
    mirrored(ctx, 64, () => {
      plate(ctx, [22, 17, 27, 22, 25, 32, 22, 43, 26, 57, 22, 62, 14, 49, 12, 36, 16, 22], TITANIUM);
      plate(ctx, [19, 23, 23, 23, 21, 36, 19, 39, 17, 36], CERAMIC);
      // Paired intake ducts connect to a clearly visible central recovery reservoir.
      seam(ctx, [22, 24, 17, 36, 18, 48, 25, 55], '#071a25', 4.6);
      seam(ctx, [22, 25, 17.5, 36, 18.5, 47, 25, 54], '#79ae9e', 2.2);
      seam(ctx, [22, 26, 18, 36, 19, 47, 25, 53], accent, .65);
      lens(ctx, 16.5, 38, 2.1, accent);bolt(ctx, 22, 20);
    });
    plate(ctx, [26, 31, 38, 31, 42, 44, 39, 55, 32, 65, 25, 55, 22, 44], GRAPHITE);
    plate(ctx, [32, 33, 38, 42, 36, 51, 32, 56, 28, 51, 26, 42], TITANIUM);
    lens(ctx, 32, 43, 5.2, accent);
    seam(ctx, [29, 57, 32, 60, 35, 57], accent, 1.7);
  }
}

function drone(ctx: Ctx, model: 'striker' | 'frost' | 'mender', accent: string) {
  if (model === 'striker') {
    plate(ctx, [24, 5, 30, 18, 39, 25, 43, 35, 38, 44, 28, 38, 24, 43, 20, 38, 10, 44, 5, 35, 9, 25, 18, 18], GRAPHITE);
    mirrored(ctx, 48, () => {
      plate(ctx, [16, 20, 20, 24, 18, 33, 11, 39, 8, 34, 11, 26], CERAMIC);
      plate(ctx, [12, 10, 15, 10, 17, 28, 12, 29], TITANIUM);
      ctx.fillStyle = '#081827';ctx.fillRect(13, 11, 1.5, 15);ctx.fillStyle = accent;ctx.fillRect(12.7, 10, 2, 2);
      seam(ctx, [10, 34, 15, 32], accent, .8);bolt(ctx, 14, 27);
    });
    plate(ctx, [24, 7, 28, 18, 28, 33, 24, 39, 20, 33, 20, 18], CERAMIC);
    lens(ctx, 24, 25, 3.5, accent);vents(ctx, 22.2, 31, 3.6, 2);
    thruster(ctx, 20, 40, 8, 7, accent);
  } else if (model === 'frost') {
    plate(ctx, [24, 5, 33, 14, 41, 20, 39, 33, 34, 40, 24, 47, 14, 40, 9, 33, 7, 20, 15, 14], GRAPHITE);
    for (let index = 0; index < 6; index++) {
      const a = index * Math.PI / 3 - Math.PI / 2;
      ctx.save();ctx.translate(24, 26);ctx.rotate(a);
      plate(ctx, [6, -2, 15, -4, 20, 0, 15, 4, 6, 2], CERAMIC);
      seam(ctx, [10, 0, 17, 0], accent, .85);ctx.restore();
    }
    ctx.strokeStyle = '#3f607d';ctx.lineWidth = 2.2;ctx.beginPath();ctx.arc(24, 26, 10.2, 0, TAU);ctx.stroke();
    lens(ctx, 24, 26, 5.1, accent);
    ctx.fillStyle = accent;ctx.fillRect(22.5, 44, 3, 1.5);
  } else {
    plate(ctx, [24, 7, 34, 12, 40, 22, 40, 31, 33, 42, 24, 47, 15, 42, 8, 31, 8, 22, 14, 12], GRAPHITE);
    mirrored(ctx, 48, () => {
      plate(ctx, [15, 14, 19, 17, 16, 24, 16, 33, 19, 38, 15, 41, 10, 31, 10, 23], CERAMIC);
      seam(ctx, [13, 19, 12, 26, 13, 33], accent, 1.1);
      bolt(ctx, 14, 27);
    });
    ctx.strokeStyle = '#8cb6ad';ctx.lineWidth = 2.2;ctx.beginPath();ctx.arc(24, 27, 10.5, 0, TAU);ctx.stroke();
    ctx.fillStyle = '#10352f';ctx.beginPath();ctx.arc(24, 27, 8.5, 0, TAU);ctx.fill();
    ctx.fillStyle = accent;path(ctx, [22, 20, 26, 20, 26, 25, 31, 25, 31, 29, 26, 29, 26, 34, 22, 34, 22, 29, 17, 29, 17, 25, 22, 25]);ctx.fill();
    if (!compactContexts.has(ctx)) { ctx.fillStyle = '#eaffed';ctx.fillRect(23, 26, 2, 2); }
    thruster(ctx, 20, 41, 8, 6, accent);
  }
}

/** Both detail levels retain the same frame sizes and centered attachment anchors. */
export function makeShipTextures(scene: Phaser.Scene) {
  const bake = (key: string, width: number, height: number, draw: (ctx: Ctx) => void) => {
    for (const compact of [false, true]) {
      const textureKey = compact ? `${key}-compact` : key;
      if (scene.textures.exists(textureKey)) scene.textures.remove(textureKey);
      const texture = scene.textures.createCanvas(textureKey, width * 2, height * 2)!;
      const ctx = texture.context;
      if (compact) compactContexts.add(ctx);
      ctx.scale(2, 2);
      ctx.lineCap = 'butt';ctx.lineJoin = 'bevel';
      draw(ctx);
      texture.refresh();
    }
  };
  for (const module of MODULES) for (const weapon of Object.keys(WEAPON_BASES) as WeaponId[]) {
    bake(`ship-${module.id}-${weapon}`, 88, 104, ctx => ship(ctx, module.id, weapon, hex(module.color), hex(WEAPON_BASES[weapon].color)));
  }
  for (const model of ['focus', 'velocity', 'cascade'] as const) {
    bake(`part-wing-${model}`, 128, 120, ctx => wing(ctx, model, hex(PART_BASES[model].color)));
  }
  for (const model of ['bastion', 'reactor', 'siphon'] as const) {
    bake(`part-body-${model}`, 64, 72, ctx => body(ctx, model, hex(PART_BASES[model].color)));
  }
  for (const model of ['striker', 'frost', 'mender'] as const) {
    bake(`part-drone-${model}`, 48, 52, ctx => drone(ctx, model, hex(PART_BASES[model].color)));
  }
}
