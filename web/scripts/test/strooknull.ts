import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { maakStrook } from '../../src/core/percelen';
import { WEGTYPEN } from '../../src/core/wegen/typen';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
let n = 0;
for (const s of w.net.segmenten.values()) for (const z of [1, -1] as const) {
  if (!WEGTYPEN[s.type].erf) continue;
  const st = maakStrook(w.net, w.terrein, s, z);
  if (!st) { n++; if (n < 8) console.log('null', s.id, s.type, z, 'L', s.lengte.toFixed(0), 'a', w.net.knopen.get(s.a)!.segs.length, 'b', w.net.knopen.get(s.b)!.segs.length); }
}
console.log('null', n);
