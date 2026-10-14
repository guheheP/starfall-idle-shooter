import Phaser from 'phaser';
import type { EliteId, Enemy } from './types';

type HullKind = Exclude<Enemy['kind'], 'boss'>;
type Point = [number, number];
interface HullStyle { width: number; height: number; light: string; mid: string; dark: string; energy: string; }

const HULLS: Record<HullKind, HullStyle> = {
  scout: { width: 48, height: 54, light: '#d9a177', mid: '#97634f', dark: '#452e36', energy: '#ffba70' },
  fighter: { width: 72, height: 62, light: '#d7a1a0', mid: '#8b4956', dark: '#382332', energy: '#ff7c85' },
  tank: { width: 88, height: 80, light: '#b4c7d0', mid: '#566b7a', dark: '#253445', energy: '#ffd07b' },
};
const ELITE_LIGHT: Record<EliteId, string> = { vanguard: '#ffb26e', sniper: '#ff91c9', barrage: '#c4a2ff' };
const ELITE_COLOR: Record<EliteId, number> = { vanguard: 0xffa35f, sniper: 0xff80b8, barrage: 0xb992ff };

/** Reusable hard-surface drawing. Apertures have bright interiors and dark bezels, without baked bloom. */
class HullPainter {
  constructor(private ctx: CanvasRenderingContext2D, private style: HullStyle, readonly compact = false) { }

  plate(points: Point[], light = this.style.light, mid = this.style.mid, dark = this.style.dark): void {
    const ctx = this.ctx;
    const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    const metal = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    metal.addColorStop(0, light);
    if (this.compact) metal.addColorStop(.55, mid);
    else {
      metal.addColorStop(.32, mid); metal.addColorStop(.37, mid);
      metal.addColorStop(.39, light); metal.addColorStop(.52, mid);
    }
    metal.addColorStop(1, dark);
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath(); ctx.fillStyle = metal; ctx.fill();
    ctx.strokeStyle = '#091421'; ctx.lineWidth = this.compact ? 1.8 : 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    if (this.compact) return;
    ctx.beginPath(); ctx.moveTo(...points[0]); ctx.lineTo(...points[1]);
    ctx.strokeStyle = '#e0e9e9'; ctx.globalAlpha = .75; ctx.lineWidth = .7; ctx.stroke(); ctx.globalAlpha = 1;
  }

  line(points: Point[], color = '#14222d', width = 1): void {
    if (this.compact && width < 1.2) return;
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(...points[0]); for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  vent(x: number, y: number, width: number, count: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#091622'; ctx.fillRect(x - 1, y - 1, width + 2, count * 2.5 + 1);
    if (this.compact) return;
    for (let index = 0; index < count; index++) {
      ctx.fillStyle = index === 0 ? '#bdcfce' : '#536370'; ctx.fillRect(x, y + index * 2.5, width, .8);
    }
  }

  bolt(x: number, y: number): void {
    if (this.compact) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#0b1724'; ctx.beginPath(); ctx.arc(x, y, 1.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c6d4d6'; ctx.fillRect(x - .55, y - .7, .8, .65);
  }

  aperture(x: number, y: number, width: number, height: number, color = this.style.energy): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#07121f'; ctx.fillRect(x - width / 2 - 1.5, y - height / 2 - 1.5, width + 3, height + 3);
    if (!this.compact) {
      ctx.strokeStyle = '#718190'; ctx.lineWidth = .65; ctx.strokeRect(x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2);
    }
    ctx.fillStyle = color; ctx.fillRect(x - width / 2, y - height / 2, width, height);
    if (this.compact) return;
    ctx.fillStyle = '#fff1d0'; ctx.fillRect(x - width / 2 + .6, y - height / 2 + .5, Math.max(.8, width * .25), Math.max(1, height - 1));
  }

  core(x: number, y: number, radius: number, color = this.style.energy): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a1622'; ctx.beginPath(); ctx.arc(x, y, radius + 2, 0, Math.PI * 2); ctx.fill();
    if (!this.compact) { ctx.strokeStyle = '#afbbc0'; ctx.lineWidth = .8; ctx.stroke(); }
    ctx.strokeStyle = color; ctx.lineWidth = this.compact ? 1.6 : 1; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius * (this.compact ? .65 : .53), 0, Math.PI * 2); ctx.fill();
    if (this.compact) return;
    ctx.fillStyle = '#fff5dd'; ctx.fillRect(x - .9, y - 1.5, 1.8, 1.8);
  }
}

function drawScout(ctx: CanvasRenderingContext2D, paint: HullPainter): void {
  // Forked interceptor: open gaps between the copper swept blades and the narrow keel.
  paint.plate([[6, 4], [15, 12], [20, 28], [15, 36], [4, 23], [3, 12]]);
  paint.plate([[42, 4], [45, 12], [44, 23], [33, 36], [28, 28], [33, 12]]);
  paint.plate([[24, 8], [29, 18], [31, 33], [24, 51], [17, 33], [19, 18]], '#e4b58b', '#a57655', '#493139');
  paint.plate([[8, 10], [13, 15], [17, 26], [13, 28], [7, 20]], '#c6a083', '#885441', '#493443');
  paint.plate([[40, 10], [41, 20], [35, 28], [31, 26], [35, 15]], '#a28a78', '#765045', '#3a2c3b');
  paint.line([[24, 14], [21, 27], [24, 40]], '#172332', 1.6);
  paint.line([[24, 14], [26, 27]], '#f5d5aa', .8);
  paint.core(24, 31, 3.5);
  paint.vent(7, 16, 4, 3); paint.vent(37, 16, 4, 3);
  paint.aperture(11, 7, 3.5, 2.2); paint.aperture(37, 7, 3.5, 2.2);
  paint.aperture(24, 45, 3.2, 3);
  paint.bolt(11, 28); paint.bolt(37, 28);
  if (!paint.compact) { ctx.fillStyle = '#eed7b1'; ctx.fillRect(22, 20, 4, 1); }
}

function drawFighter(ctx: CanvasRenderingContext2D, paint: HullPainter): void {
  // Wide red gunship: compact center keel, broad chamfered shoulders, twin lower cannon blocks.
  paint.plate([[5, 9], [16, 4], [29, 21], [27, 38], [10, 41], [3, 29]]);
  paint.plate([[67, 9], [69, 29], [62, 41], [45, 38], [43, 21], [56, 4]]);
  paint.plate([[17, 8], [25, 19], [29, 31], [18, 34], [10, 28], [10, 17]], '#c48b87', '#994a57', '#442a3b');
  paint.plate([[55, 8], [62, 17], [62, 28], [54, 34], [43, 31], [47, 19]], '#b07582', '#78384f', '#352336');
  paint.plate([[36, 13], [46, 25], [46, 38], [36, 58], [26, 38], [26, 25]], '#e0b4aa', '#a76260', '#472f3d');
  paint.plate([[36, 20], [40, 28], [40, 36], [36, 43], [32, 36], [32, 28]], '#b9bec4', '#615565', '#273044');
  paint.core(36, 33, 4.5);
  for (const x of [13, 59]) {
    paint.plate([[x - 4, 30], [x + 4, 30], [x + 5, 47], [x - 5, 47]], '#c5b4ae', '#695563', '#273042');
    paint.line([[x, 33], [x, 41]], '#18232e', 2.3); paint.aperture(x, 45, 4.3, 2.3);
    paint.bolt(x - 1, 35);
  }
  paint.aperture(21, 13, 4, 2.4); paint.aperture(51, 13, 4, 2.4);
  paint.vent(11, 18, 5, 4); paint.vent(56, 18, 5, 4);
  paint.line([[28, 44], [36, 49], [44, 44]], '#f3c5ad', .8);
  paint.bolt(10, 10); paint.bolt(62, 10);
  if (!paint.compact) { ctx.fillStyle = '#bf9b8c'; ctx.fillRect(34, 51, 4, 1.4); }
}

function drawTank(_ctx: CanvasRenderingContext2D, paint: HullPainter): void {
  // Industrial siege hull: two heavy rectangular shields and an exposed warm reactor bus.
  paint.plate([[9, 10], [30, 12], [35, 27], [30, 58], [12, 62], [4, 48], [4, 24]]);
  paint.plate([[79, 10], [84, 24], [84, 48], [76, 62], [58, 58], [53, 27], [58, 12]]);
  paint.plate([[14, 16], [27, 17], [28, 31], [25, 49], [12, 51], [9, 42], [9, 26]], '#c9d2d5', '#788992', '#344654');
  paint.plate([[74, 16], [79, 26], [79, 42], [76, 51], [63, 49], [60, 31], [61, 17]], '#a5b9c4', '#5c7180', '#24374b');
  paint.plate([[35, 15], [53, 15], [60, 31], [55, 59], [44, 75], [33, 59], [28, 31]], '#c4a476', '#8e7152', '#3c3941');
  paint.plate([[36, 29], [52, 29], [54, 50], [44, 66], [34, 50]], '#ddd0ad', '#847052', '#323d49');
  paint.core(44, 42, 6.5);
  paint.line([[35, 27], [35, 48], [39, 54]], '#141f2c', 1.3);
  paint.line([[53, 27], [53, 48], [49, 54]], '#141f2c', 1.3);
  for (const x of [18, 70]) {
    paint.vent(x - 4, 24, 8, 6);
    paint.plate([[x - 5, 50], [x + 5, 50], [x + 5, 65], [x - 5, 65]], '#afbfc5', '#5a6978', '#233447');
    paint.aperture(x, 61, 5.5, 3);
    paint.aperture(x, 14, 6, 2.5);
    paint.bolt(x - 6, 21); paint.bolt(x + 6, 46);
  }
  for (const y of [19, 57]) { paint.bolt(38, y); paint.bolt(50, y); }
  paint.line([[38, 63], [44, 69], [50, 63]], '#e9bf7c', 1.1);
}

function drawElite(ctx: CanvasRenderingContext2D, paint: HullPainter, kind: HullKind, elite: EliteId): void {
  const { width: w, height: h } = HULLS[kind], cx = w / 2, cy = h * .52;
  const color = ELITE_LIGHT[elite];
  if (elite === 'vanguard') {
    // Breacher plates close the lower wing gaps; the heavy pointed plow reads at low zoom.
    for (const side of [-1, 1]) {
      const x = cx + side * w * .26, half = w * .11;
      paint.plate([[x - half, cy - 8], [x + half, cy - 8], [x + half + 1, cy + 10], [x, h - 5], [x - half - 1, cy + 10]], '#e7c6a4', '#915d49', '#49333c');
      paint.line([[x - half + 2, cy - 3], [x, cy + 8], [x + half - 2, cy - 3]], color, 1.8);
      paint.bolt(x, cy - 5);
    }
    paint.plate([[cx, cy - 14], [cx + w * .15, cy - 5], [cx + w * .11, cy + 8], [cx, h - 3], [cx - w * .11, cy + 8], [cx - w * .15, cy - 5]], '#d6b896', '#7d5146', '#3b2a37');
    paint.aperture(cx, cy + 3, w * .1, 3.5, color);
    paint.line([[cx - w * .08, cy + 12], [cx, h - 6], [cx + w * .08, cy + 12]], '#efc395', 1);
  } else if (elite === 'sniper') {
    // An uninterrupted central rail barrel and two narrow outriggers identify the aimed shot.
    const half = Math.max(3, w * .055);
    paint.plate([[cx - half - 2, cy - 15], [cx + half + 2, cy - 15], [cx + half, h - 2], [cx - half, h - 2]], '#d5bfdf', '#6c537a', '#2a2840');
    paint.line([[cx - half + 1, cy - 12], [cx - half + 1, h - 5]], '#e1cbea', .9);
    paint.line([[cx + half - 1, cy - 12], [cx + half - 1, h - 5]], '#a890b9', .9);
    paint.line([[cx, cy - 10], [cx, h - 5]], '#081622', 2.2);
    paint.aperture(cx, h - 4, 3, 2.4, color);
    for (const side of [-1, 1]) {
      const x = cx + side * w * .28;
      paint.plate([[x - 2.7, cy - 9], [x + 2.7, cy - 9], [x + 2, h - 11], [x - 2, h - 11]], '#b2a4c3', '#665173', '#2f2b40');
      paint.line([[x, cy - 6], [x, h - 14]], color, .85);
    }
    paint.core(cx, cy - 12, Math.max(2.2, w * .045), color);
    if (!paint.compact) {
      ctx.fillStyle = '#dba6ce'; ctx.fillRect(cx - w * .11, cy - 10, w * .04, 1); ctx.fillRect(cx + w * .07, cy - 10, w * .04, 1);
    }
  } else {
    // Two proud three-cell pods replace the thin wing shapes with a broad, layered silhouette.
    for (const side of [-1, 1]) {
      const x = cx + side * w * .30, half = w * .13;
      paint.plate([[x - half, cy - 12], [x + half, cy - 12], [x + half + 1, cy - 6], [x + half, cy + 12], [x - half, cy + 12], [x - half - 1, cy - 6]], '#d2c6e8', '#6a5788', '#302a45');
      paint.line([[x - half + 1, cy - 7], [x + half - 1, cy - 7]], '#ada1c5', 1);
      for (let index = 0; index < 3; index++) paint.aperture(x + (index - 1) * half * .65, cy + 6, Math.max(1.7, half * .4), 4, color);
      paint.bolt(x, cy - 9);
    }
    paint.core(cx, cy - 2, Math.max(3, w * .065), color);
    paint.line([[cx - 4, cy + 8], [cx - 4, cy + 13], [cx + 4, cy + 13], [cx + 4, cy + 8]], color, 1);
  }
}

/** Full and compact two-times-resolution hulls share frame sizes and centered anchors. */
export function makeEnemyTextures(scene: Phaser.Scene): void {
  for (const kind of ['scout', 'fighter', 'tank'] as const) {
    const style = HULLS[kind];
    for (const elite of [undefined, 'vanguard', 'sniper', 'barrage'] as const) {
      const baseKey = elite ? `${kind}-elite-${elite}` : `${kind}-metal`;
      for (const compact of [false, true]) {
        const key = compact ? `${baseKey}-compact` : baseKey;
        if (scene.textures.exists(key)) continue;
        const texture = scene.textures.createCanvas(key, style.width * 2, style.height * 2);
        if (!texture) continue;
        const ctx = texture.context;
        ctx.scale(2, 2); const paint = new HullPainter(ctx, style, compact);
        if (kind === 'scout') drawScout(ctx, paint);
        else if (kind === 'fighter') drawFighter(ctx, paint);
        else drawTank(ctx, paint);
        if (elite) drawElite(ctx, paint, kind, elite);
        texture.refresh();
      }
    }
  }
}

/** A single graphics object for localized machinery lights. No attack timers or simulation data are changed. */
export class EnemyVisuals {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(5.2).setBlendMode(Phaser.BlendModes.ADD);
  }

  render(enemies: readonly Enemy[], time: number, enabled: boolean): void {
    const g = this.graphics;
    g.clear();
    if (!enabled) return;
    for (const enemy of enemies) {
      if (enemy.kind === 'boss') continue;
      const style = HULLS[enemy.kind], scale = (enemy.kind === 'fighter' ? .98 : 1.02) * (enemy.elite ? 1.08 : 1);
      const angle = enemy.kind === 'tank' ? 0 : Math.cos(enemy.age * .7 + enemy.id) * .05;
      const point = (x: number, y: number) => ({
        x: enemy.x + (x * Math.cos(angle) - y * Math.sin(angle)) * scale,
        y: enemy.y + (x * Math.sin(angle) + y * Math.cos(angle)) * scale,
      });
      const color = enemy.elite ? ELITE_COLOR[enemy.elite] : enemy.kind === 'scout' ? 0xffba70 : enemy.kind === 'fighter' ? 0xff7c85 : 0xffd07b;
      // The scene supplies frozen elapsed time while paused, so machinery never animates through pause.
      const rearX = enemy.kind === 'scout' ? 13 : enemy.kind === 'fighter' ? 15 : 26;
      const rearY = enemy.kind === 'scout' ? -20 : enemy.kind === 'fighter' ? -18 : -26;
      for (const side of [-1, 1]) {
        const length = 3 + (Math.sin(time * 19 + enemy.id + side) + 1) * 2;
        const from = point(side * rearX, rearY), end = point(side * rearX, rearY - length);
        g.lineStyle(enemy.kind === 'tank' ? 4 : 3, color, .10); g.lineBetween(from.x, from.y, end.x, end.y);
        g.lineStyle(.9, 0xffdcb8, .38); g.lineBetween(from.x, from.y, end.x, end.y + 1);
      }
      const progress = enemy.elite ? Math.max(0, Math.min(1, enemy.charge ?? 0)) : Math.max(0, Math.min(1, 1 - enemy.shotTimer / .32));
      if (progress <= 0) continue;
      let apertures: [number, number][];
      if (enemy.elite === 'sniper') apertures = [[0, style.height / 2 - 4]];
      else if (enemy.elite === 'barrage') apertures = [-1, 1].flatMap(side => [-1, 0, 1].map(index => [side * style.width * .30 + index * style.width * .13 * .65, style.height * .02 + 6] as [number, number]));
      else if (enemy.elite === 'vanguard') apertures = [[0, style.height * .02 + 3]];
      else if (enemy.kind === 'tank') apertures = [[-26, 21], [26, 21]];
      else if (enemy.kind === 'fighter') apertures = [[-23, 14], [23, 14]];
      else apertures = [[0, 18]];
      for (const [x, y] of apertures) {
        const p = point(x, y), radius = 1.5 + progress * 2.1;
        g.fillStyle(color, progress * .18); g.fillCircle(p.x, p.y, radius + 1.5);
        g.lineStyle(.8, color, progress * .85); g.strokeCircle(p.x, p.y, radius);
        g.fillStyle(0xffefda, progress * .9); g.fillCircle(p.x, p.y, .9 + progress * .45);
      }
    }
  }
}
