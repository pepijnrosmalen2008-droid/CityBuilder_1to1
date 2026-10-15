import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { lerp2, dist2 } from '../../src/core/math';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
for (const s of w.net.segmenten.values()) {
  const A = w.net.knopen.get(s.a)!, B = w.net.knopen.get(s.b)!;
  const d = dist2(s.c, lerp2(A.p, B.p, 0.5));
  if (d > 8) { const m = s.pad[Math.floor(s.pad.length / 2)]; console.log(s.id, s.type, s.naam, 'midden', m.x.toFixed(0), m.z.toFixed(0), 'bol', d.toFixed(0)); }
}
