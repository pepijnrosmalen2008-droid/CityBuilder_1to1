import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { halveBreedte } from '../../src/core/wegen/typen';
import { saturate } from '../../src/core/math';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
const v = { x: -555.35, z: 0 }, n = { x: 1, z: 0 };
for (const s of w.net.segmenten.values()) {
  const hb = halveBreedte(s.type);
  for (let d = 1; d <= 130; d += 1.5) {
    const q = { x: v.x + n.x * d, z: v.z + n.z * d };
    for (let i = 0; i < s.pad.length - 1; i++) {
      const a = s.pad[i], b = s.pad[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
      const t = l2 > 0 ? saturate(((q.x - a.x) * abx + (q.z - a.z) * abz) / l2) : 0;
      if (Math.hypot(q.x - (a.x + abx * t), q.z - (a.z + abz * t)) < hb + 0.3) { console.log('raak seg', s.id, s.type, 'op d', d, 'pad', s.pad.length); d = 999; break; }
    }
  }
}
console.log('terrein', w.terrein.hoogte(-540, 0), w.terrein.binnen(-540, 0, 6));
