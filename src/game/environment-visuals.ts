import Phaser from 'phaser';
import type { SectorDefinition } from './sectors';
import { WORLD_WIDTH as W, WORLD_HEIGHT as H } from './types';

/** Quiet silhouettes and colored atmosphere keep each sector recognizable behind the barrage. */
export class EnvironmentVisuals {
  private structures: Phaser.GameObjects.Graphics;
  private haze: Phaser.GameObjects.Image[];
  private signature = '';
  private elapsed = 0;
  constructor(scene: Phaser.Scene) {
    this.structures = scene.add.graphics().setDepth(.6);
    this.haze = [scene.add.image(0, 0, 'glow'), scene.add.image(0, 0, 'glow')];
    for (const light of this.haze) light.setDepth(.4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.08);
  }

  render(dt: number, sector: SectorDefinition, viewWidth: number, viewHeight: number, painted = false): void {
    this.elapsed += dt;
    const left = (W - viewWidth) / 2, top = (H - viewHeight) / 2;
    const color = sector.color;
    for (let index = 0; index < this.haze.length; index++) {
      this.haze[index].setTint(color).setScale(index ? 7 : 11)
        .setPosition(left + viewWidth * (index ? .88 : .15) + Math.sin(this.elapsed * .06 + index) * 12,
          top + viewHeight * (index ? .24 : .1)).setAlpha(index ? .075 : .055);
    }
    const signature = `${sector.id}:${viewWidth}:${viewHeight}:${painted}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const graphics = this.structures;
    graphics.clear();
    // The authored landmarks carry these sectors; keep the combat center quiet.
    if (painted) return;
    const ring = (x: number, y: number, radius: number) => {
      graphics.lineStyle(1.5, color, .12); graphics.strokeEllipse(x, y, radius * 2.7, radius * .8);
      graphics.lineStyle(1, 0x8ca8c0, .06); graphics.strokeEllipse(x, y, radius * 2.9, radius * .9);
    };
    if (sector.id === 'frontier') {
      const x = left + viewWidth * .16, y = top + 175;
      graphics.fillStyle(0x16293e, .2); graphics.fillCircle(x, y, 79);
      graphics.lineStyle(1.5, color, .12); graphics.strokeCircle(x, y, 81);
      ring(x, y, 82);
      graphics.lineStyle(1, color, .1); graphics.lineBetween(x - 120, y + 40, x - 60, y + 13);
    } else if (sector.id === 'ion' || sector.id === 'aurora') {
      for (let ribbon = 0; ribbon < 4; ribbon++) {
        const points = Array.from({ length: 25 }, (_, index) => {
          const amount = index / 24;
          return { x: left + viewWidth * amount,
            y: top + 95 + ribbon * 30 + Math.sin(amount * Math.PI * 1.8 + ribbon * .28) * (35 + ribbon * 8) };
        });
        graphics.lineStyle(26 - ribbon * 4, color, .018); graphics.strokePoints(points, false);
        graphics.lineStyle(2, color, .07); graphics.strokePoints(points, false);
      }
      if (sector.id === 'aurora') {
        const x = left + viewWidth * .1, y = top + 270;
        graphics.lineStyle(1, color, .13);
        for (let index = 0; index < 3; index++) graphics.strokeEllipse(x, y, 155 + index * 25, 220 + index * 35);
      }
    } else if (sector.id === 'wreckage') {
      const x = left + viewWidth * .16, y = top + 190;
      const hull = [{x:x-95,y:y-24},{x:x-36,y:y-67},{x:x+54,y:y-50},{x:x+103,y:y+2},
        {x:x+70,y:y+24},{x:x+36,y:y+3},{x:x-24,y:y+53},{x:x-75,y:y+27}];
      graphics.fillStyle(0x304051, .19); graphics.fillPoints(hull, true);
      graphics.lineStyle(1.1, color, .14); graphics.strokePoints(hull, true);
      graphics.lineStyle(8, 0x0b1725, .65); graphics.lineBetween(x - 64, y + 8, x + 62, y - 27);
      graphics.lineStyle(1, color, .1); graphics.lineBetween(x - 60, y - 13, x + 59, y - 44);
      for (let index = 0; index < 12; index++) {
        const dx = left + viewWidth * ((index * .173 + .12) % 1), dy = top + 100 + (index * 67) % 300;
        const size = 3 + index % 4 * 2;
        graphics.fillStyle(index % 2 ? 0x3e4957 : 0x5b5346, .23);
        graphics.fillTriangle(dx-size,dy-2,dx+size,dy+size,dx+2,dy-size);
        graphics.lineStyle(.7, color, .14); graphics.lineBetween(dx-size,dy-2,dx+2,dy-size);
      }
    } else {
      const x = left + viewWidth * .14, y = top + 235;
      graphics.fillStyle(0x040b16, .5); graphics.fillCircle(x, y, 80);
      ring(x, y, 86);
      for (let index = 0; index < 3; index++) {
        graphics.lineStyle(index ? 1 : 3, color, index ? .1 : .05);
        graphics.beginPath(); graphics.arc(x, y, 86 + index * 8, -.6, Math.PI * 1.5, false); graphics.strokePath();
      }
      graphics.lineStyle(1, color, .08); graphics.lineBetween(left + viewWidth * .8, top + 115, left + viewWidth * .95, top + 350);
    }
  }
}
