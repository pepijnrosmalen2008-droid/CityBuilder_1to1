// Meet hoe vloeiend auto's bewegen: sprong van het getekende midden per stap t.o.v. de gereden afstand,
// en de draaiing per stap.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 300);
const vk = w.verkeer;
const pose = (v: any) => {
  const a = vk.punt(v, v.s - v.lengte * 0.18), b = vk.punt(v, v.s - v.lengte * 0.82);
  if (Math.hypot(a.x - b.x, a.z - b.z) < 0.05) return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, h: Math.atan2(a.dz, a.dx), sp: v.spoor };
  return { sp: v.spoor, x: (a.x + b.x) / 2 + -(a.z - b.z) / Math.hypot(a.x - b.x, a.z - b.z) * v.zij, z: (a.z + b.z) / 2 + (a.x - b.x) / Math.hypot(a.x - b.x, a.z - b.z) * v.zij, h: Math.atan2(a.z - b.z, a.x - b.x) };
};
const vorig = new Map<number, { x: number; z: number; h: number; s: number }>();
let slecht = 0, n = 0, maxSprong = 0, maxDraai = 0;
const dt = 1 / 30;
for (let i = 0; i < 1800; i++) {
  vk.stap(dt);
  for (const v of vk.voertuigen.values()) {
    const p = pose(v), o = vorig.get(v.id);
    if (o) {
      const d = Math.hypot(p.x - o.x, p.z - o.z), verwacht = v.v * dt;
      let dh = Math.abs(p.h - o.h); if (dh > Math.PI) dh = 2 * Math.PI - dh;
      n++;
      const sprong = d - verwacht;
      if (sprong > 0.35 || dh > 0.12) { slecht++; if (slecht < 12) { const a = vk.stroken.sporen.get((o as any).sp), b = vk.stroken.sporen.get(v.spoor); console.log('sprong', sprong.toFixed(2), 'draai', (dh * 57.3).toFixed(0), a?.soort, (a as any)?.afslag ?? '', '->', b?.soort, (b as any)?.afslag ?? '', 's', v.s.toFixed(1), 'zij', v.zij.toFixed(2), 'v', v.v.toFixed(1)); } }
      maxSprong = Math.max(maxSprong, sprong); maxDraai = Math.max(maxDraai, dh);
    }
    vorig.set(v.id, p as any);
  }
}
console.log({ stappen: n, sprongen: slecht, aandeel: (slecht / n * 100).toFixed(3) + '%', maxSprong: maxSprong.toFixed(2), maxDraaiGraden: (maxDraai * 180 / Math.PI).toFixed(1) });
