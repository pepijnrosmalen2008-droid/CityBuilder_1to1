// Meet hoeveel bouwgrond dubbel (overlap) of niet (gat) bedekt is in de voorbeeldstad.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { puntInPolygoon } from '../../src/core/math';
import { halveBreedte } from '../../src/core/wegen/typen';
import { afstandTotLijn } from '../../src/core/poly';

const w = new Wereld(1);
const t0 = Date.now();
bouwVoorbeeldstad(w, Number(process.argv[2] ?? 0));
console.log('opbouw', Date.now() - t0, 'ms;', w.kavels.size, 'percelen,', w.gebouwen.size, 'gebouwen');
const kav = [...w.kavels.values()];
let dubbel = 0, raak = 0, totaal = 0, gat = 0;
const voorbeelden: string[] = [], gaten: string[] = [];
for (let x = -560; x <= 120; x += 2) for (let z = -360; z <= 360; z += 2) {
  const p = { x, z };
  let opWeg = false;
  for (const s of w.net.segmenten.values()) if (afstandTotLijn(p, s.pad).d < halveBreedte(s.type) + 0.3) { opWeg = true; break; }
  if (opWeg) continue;
  totaal++;
  const hits = kav.filter(k => puntInPolygoon(p, k.poly));
  if (hits.length > 1) { dubbel++; if (voorbeelden.length < 6) voorbeelden.push(`(${x},${z}) in ${hits.map(h => `${h.id}@${h.strook}`).join(' + ')}`); }
  if (hits.length >= 1) raak++; else { gat++; if (gaten.length < 40 && (x % 16 === 0) && (z % 16 === 0)) gaten.push(`(${x},${z})`); }
}
console.log(`bouwgrond-punten ${totaal}: bedekt ${(raak / totaal * 100).toFixed(1)}%, dubbel ${(dubbel / totaal * 100).toFixed(2)}%, gat ${(gat / totaal * 100).toFixed(1)}%`);
console.log(voorbeelden.join('\n'));
console.log('gaten bv.', gaten.join(' '));
for (const id of (process.argv[3] ?? '').split(',').filter(Boolean).map(Number)) {
  const s = w.net.segmenten.get(id)!;
  const A = w.net.knopen.get(s.a)!, B = w.net.knopen.get(s.b)!;
  console.log(id, s.type, `(${A.p.x.toFixed(0)},${A.p.z.toFixed(0)})->(${B.p.x.toFixed(0)},${B.p.z.toFixed(0)}) graad ${A.segs.length}/${B.segs.length}`);
  for (const z of [1, -1]) { const st = w.stroken.get(`${id}:${z}`); if (st) console.log('  zijde', z, 'knippen', JSON.stringify(st.knippen.map(k => ({ o: [k.o.x.toFixed(0), k.o.z.toFixed(0)], n: [k.n.x.toFixed(2), k.n.z.toFixed(2)] }))), 's', st.s0.toFixed(1), st.s1.toFixed(1), 'diepte', st.diepte.map(d => d.toFixed(0)).join(',')); }
}
