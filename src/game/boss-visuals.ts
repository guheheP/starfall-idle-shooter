import type Phaser from 'phaser';
import type { Enemy } from './types';

export const bossTexture = (enemy: Enemy): string => `flagship-${enemy.pattern ?? 'fan'}-${enemy.phase === 2 ? 2 : 1}`;
export function bossCoreNodes(enemy: Enemy): { x: number; y: number; radius: number }[] {
  const center = { x: enemy.x, y: enemy.y + 1.12, radius: enemy.phase === 2 ? 25 : 20 };
  if (enemy.pattern === 'spiral') return enemy.phase === 2 ? [center, ...Array.from({ length: 3 }, (_, index) => {
    const angle = index * Math.PI * 2 / 3;
    return { x: enemy.x + Math.cos(angle) * 35.84, y: center.y + Math.sin(angle) * 35.84, radius: 7 };
  })] : [center];
  return [center, ...[-1, 1].map(side => ({ x: enemy.x + side * 90.72, y: enemy.y - 22.4, radius: 13 }))];
}

/** Three mechanical silhouettes, with opened armor in phase two. Combat bounds stay in the simulation. */
export function makeBossTextures(scene: Phaser.Scene): void {
  for (const pattern of ['fan', 'spiral', 'cross'] as const) for (const phase of [1, 2]) {
    const texture = scene.textures.createCanvas(`flagship-${pattern}-${phase}`, 460, 264)!;
    const ctx = texture.context;
    ctx.scale(2, 2);
    const hot = phase === 2;
    const accent = pattern === 'fan' ? '#ffc27c' : pattern === 'spiral' ? '#c1a3ff' : '#79e0ce';
    const plate = (points: number[], light = '#a9bbc6', dark = '#263849') => {
      const fill = ctx.createLinearGradient(0, 8, 230, 130);
      fill.addColorStop(0, light); fill.addColorStop(.33, dark); fill.addColorStop(.49, light); fill.addColorStop(1, dark);
      ctx.beginPath(); ctx.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = '#101c2a'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(points[0], points[1]); ctx.lineTo(points[2], points[3]); ctx.lineTo(points[4], points[5]);
      ctx.strokeStyle = '#dcecf2'; ctx.lineWidth = .7; ctx.stroke();
    };
    const core = (x: number, y: number, radius: number) => {
      ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = hot ? 12 : 7;
      ctx.fillStyle = '#0b1728'; ctx.beginPath(); ctx.arc(x, y, radius + 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b1c0cc'; ctx.lineWidth = 2.8; ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = accent; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      const light = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, radius);
      light.addColorStop(0, '#fff6eb'); light.addColorStop(.22, accent); light.addColorStop(.75, accent); light.addColorStop(1, '#293542');
      ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x, y, radius * .66, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const seam = (x: number, y: number, length: number, vertical = false) => {
      ctx.fillStyle = '#0b1725'; ctx.fillRect(x - 2, y - 2, vertical ? 6 : length + 4, vertical ? length + 4 : 6);
      ctx.fillStyle = accent; ctx.fillRect(x, y, vertical ? 2 : length, vertical ? length : 2);
    };
    const bolts = (points: [number, number][]) => {
      for (const [x, y] of points) {
        ctx.fillStyle = '#071423'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#bdcdd1'; ctx.fillRect(x - .7, y - .8, 1.4, 1);
      }
    };

    if (pattern === 'fan') {
      // Swept gunship shoulders and an amber fan of narrow apertures.
      for (const side of [-1, 1]) {
        const point = (x: number, y: number) => [115 + side * x, y];
        const offset = hot ? 7 : 0;
        plate([point(38 + offset, 29), point(91 + offset, 13), point(110, 36), point(99, 77), point(47 + offset, 84), point(27 + offset, 58)].flat());
        plate([point(47 + offset, 40), point(93, 25), point(102, 39), point(85, 58), point(48 + offset, 64)].flat(), '#d3c5ac', '#5a4a45');
        for (let index = 0; index < 4; index++) seam(115 + side * (54 + index * 9), 49 + index * 2, 7, true);
        core(115 + side * 81, 46, 9);
      }
      plate([115, 13, 142, 38, 145, 72, 129, 108, 115, 124, 101, 108, 85, 72, 88, 38], '#d7b7a2', '#563e45');
      plate([115, 28, 130, 50, 125, 88, 115, 106, 105, 88, 100, 50], '#d8cec0', '#5c4948');
      const count = hot ? 7 : 5;
      for (let index = 0; index < count; index++) {
        const x = 115 + (index - (count - 1) / 2) * (hot ? 25 : 33);
        seam(x, 76 + Math.abs(x - 115) * .055, hot ? 13 : 9, true);
      }
      core(115, 67, hot ? 16 : 13);
      bolts([[20, 36], [48, 25], [182, 25], [210, 36], [101, 99], [129, 99]]);
    } else if (pattern === 'spiral') {
      // A coil reactor and three curved metallic blade arms.
      ctx.fillStyle = '#102236'; ctx.beginPath(); ctx.arc(115, 67, 47, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9aa7c2'; ctx.lineWidth = hot ? 7 : 12; ctx.stroke();
      ctx.strokeStyle = '#263449'; ctx.lineWidth = 3; ctx.stroke();
      for (let index = 0; index < 3; index++) {
        ctx.save(); ctx.translate(115, 67); ctx.rotate(index * Math.PI * 2 / 3);
        const shift = hot ? 7 : 0;
        plate([-13 - shift, -42 - shift, -8 - shift, -61, 21 - shift, -59, 38 - shift, -31, 23 - shift, -33, 11 - shift, -44 - shift], '#c8c5df', '#41405b');
        ctx.strokeStyle = accent; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(-3 - shift, -52); ctx.quadraticCurveTo(18, -54, 28, -36); ctx.stroke();
        ctx.restore();
      }
      for (let index = 0; index < 12; index++) {
        const angle = index * Math.PI / 6;
        ctx.save(); ctx.translate(115, 67); ctx.rotate(angle);
        ctx.fillStyle = index % 3 ? '#52677c' : accent; ctx.fillRect(31, -2, hot ? 8 : 5, 3); ctx.restore();
      }
      if (hot) {
        ctx.strokeStyle = accent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(115, 67, 25, 0, Math.PI * 2); ctx.stroke();
        for (let index = 0; index < 3; index++) {
          const angle = index * Math.PI * 2 / 3;
          core(115 + Math.cos(angle) * 32, 67 + Math.sin(angle) * 32, 4.5);
        }
      }
      core(115, 67, hot ? 20 : 17);
      bolts([[74, 58], [88, 99], [150, 91], [147, 37]]);
    } else {
      // Four thick fortress plates retract to expose the cross-shaped bus.
      ctx.fillStyle = '#132938'; ctx.fillRect(76, 32, 78, 72);
      ctx.fillStyle = '#214553'; ctx.fillRect(103, 17, 24, 109); ctx.fillRect(29, 56, 172, 24);
      const shift = hot ? 10 : 0;
      plate([91, 8, 139, 8, 147, 27 - shift, 129, 43 - shift, 101, 43 - shift, 83, 27 - shift]);
      plate([91, 126, 139, 126, 147, 102 + shift, 130, 87 + shift, 100, 87 + shift, 83, 102 + shift]);
      plate([22 - shift, 38, 63 - shift, 28, 85 - shift, 44, 85 - shift, 84, 62 - shift, 102, 22 - shift, 92, 12, 65], '#b7c8c8', '#304a50');
      plate([208 + shift, 38, 167 + shift, 28, 145 + shift, 44, 145 + shift, 84, 168 + shift, 102, 208 + shift, 92, 218, 65], '#8caaae', '#263e4a');
      for (const side of [-1, 1]) {
        const x = 115 + side * (53 + shift);
        for (let index = 0; index < 4; index++) seam(x - 6, 48 + index * 10, 12);
        core(115 + side * 81, 46, 8);
      }
      ctx.strokeStyle = hot ? accent : '#47747b'; ctx.lineWidth = hot ? 5 : 2;
      ctx.beginPath(); ctx.moveTo(115, 36); ctx.lineTo(115, 96); ctx.moveTo(84, 67); ctx.lineTo(146, 67); ctx.stroke();
      plate([115, 42, 139, 67, 115, 94, 91, 67], '#bbd8cf', '#3a565b');
      core(115, 67, hot ? 15 : 11);
      bolts([[31, 44], [55, 90], [175, 90], [199, 44], [99, 18], [131, 18], [99, 116], [131, 116]]);
    }
    texture.refresh();
  }
}
