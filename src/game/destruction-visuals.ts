import Phaser from 'phaser';
import type { GameEvent } from './types';

interface Burst { image: Phaser.GameObjects.Image; age: number; life: number; }
const FRAMES = 12;
const CAPACITY = 24;

/** Baked expanding plasma clouds. A fixed sprite pool bounds dense simultaneous kills. */
export class DestructionVisuals {
  private bursts: Burst[] = [];
  private spare: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {
    for (let frame = 0; frame < FRAMES; frame++) {
      const key = `thermal-burst-${frame}`;
      if (scene.textures.exists(key)) continue;
      const texture = scene.textures.createCanvas(key, 192, 192)!;
      const ctx = texture.context;
      const progress = (frame + .4) / FRAMES;
      const radius = 10 + Math.sqrt(progress) * 66;
      const fade = Math.pow(1 - progress, .7);
      const cloud = (x: number, y: number, r: number, hot: boolean) => {
        const light = ctx.createRadialGradient(x, y, r * .03, x, y, r);
        if (hot) {
          light.addColorStop(0, `rgba(255,${Math.round(252-progress*115)},${Math.round(216-progress*164)},${fade * .85})`);
          light.addColorStop(.17, `rgba(255,${Math.round(222-progress*60)},${Math.round(141-progress*85)},${fade * .8})`);
          light.addColorStop(.44, `rgba(255,130,55,${fade * .7})`);
          light.addColorStop(.72, `rgba(163,55,41,${fade * .35})`);
        } else {
          light.addColorStop(0, `rgba(168,80,44,${fade * .5})`);
          light.addColorStop(.4, `rgba(89,51,47,${fade * .48})`);
          light.addColorStop(.7, `rgba(36,29,40,${fade * .3})`);
        }
        light.addColorStop(1, 'rgba(20,16,32,0)');
        ctx.fillStyle = light; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      };
      // Lobes expand from the same origin each frame, rather than flickering between random shapes.
      for (let lobe = 0; lobe < 7; lobe++) {
        const angle = lobe * Math.PI * 2 / 7 + .4;
        const spread = radius * (.32 + progress * .13);
        cloud(96 + Math.cos(angle) * spread, 96 + Math.sin(angle) * spread * .8,
          radius * (.5 + (lobe % 3) * .055), false);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let lobe = 0; lobe < 5; lobe++) {
        const angle = lobe * Math.PI * 2 / 5 + .8;
        cloud(96 + Math.cos(angle) * radius * .3, 96 + Math.sin(angle) * radius * .25,
          radius * (.47 - progress * .09), true);
      }
      // Fine curling edges give the hot gas a surface instead of a uniform glow disk.
      for (let filament = 0; filament < 8; filament++) {
        const angle = filament * Math.PI / 4 + progress * .5;
        const r = radius * (.46 + filament % 3 * .06);
        ctx.save(); ctx.translate(96, 96); ctx.rotate(angle);
        ctx.strokeStyle = `rgba(255,${Math.round(207-progress*55)},110,${fade*.5})`; ctx.lineWidth = .7 + fade * .6;
        ctx.beginPath(); ctx.moveTo(r * .52, -r * .3);
        ctx.bezierCurveTo(r * 1.1, -r * .32, r * 1.25, r * .15, r * .81, r * .28); ctx.stroke();
        ctx.restore();
      }
      const flash = Math.max(0, 1 - progress * 3.6);
      cloud(96, 96, Math.max(3, radius * .48), true);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,249,211,${flash * .8})`;
        ctx.beginPath(); ctx.ellipse(96, 96, radius * 1.2, 1.2 + flash * 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,239,178,${flash * .55})`;
        ctx.beginPath(); ctx.ellipse(96, 96, 1, radius * .7, 0, 0, Math.PI * 2); ctx.fill();
      }
      texture.refresh();
    }
  }

  event(event: GameEvent, enabled: boolean): void {
    if (!enabled || event.x === undefined || event.y === undefined) return;
    if (event.kind !== 'kill' && event.kind !== 'explosion') return;
    let image = this.spare.pop();
    if (!image && this.bursts.length >= CAPACITY) image = this.bursts.shift()!.image;
    if (!image) image = this.scene.add.image(0, 0, 'thermal-burst-0').setDepth(11.8);
    const boss = event.kind === 'kill' && event.boss;
    const size = boss ? 160 : event.kind === 'explosion' ? Math.min(115, Math.max(28, (event.value ?? 65) * .75)) : event.elite ? 57 : 32;
    image.setTexture('thermal-burst-0').setPosition(event.x, event.y).setScale(size / 76).setAlpha(boss ? .96 : .85).setVisible(true);
    this.bursts.push({ image, age: 0, life: boss ? .85 : event.elite ? .58 : .38 });
  }

  render(dt: number, enabled: boolean): void {
    if (!enabled) {
      for (const burst of this.bursts) { burst.image.setVisible(false); this.spare.push(burst.image); }
      this.bursts.length = 0;
      return;
    }
    for (let index = this.bursts.length - 1; index >= 0; index--) {
      const burst = this.bursts[index];
      burst.age += dt;
      if (burst.age >= burst.life) {
        burst.image.setVisible(false); this.spare.push(burst.image); this.bursts.splice(index, 1);
      } else burst.image.setTexture(`thermal-burst-${Math.min(FRAMES - 1, Math.floor(burst.age / burst.life * FRAMES))}`);
    }
  }
}
