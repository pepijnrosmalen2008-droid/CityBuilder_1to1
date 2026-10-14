import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { band } from '../../src/core/percelen';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
const [px, pz] = (process.argv[2] ?? '-552,0').split(',').map(Number);
for (const s of w.net.segmenten.values()) {
  const A = w.net.knopen.get(s.a)!, B = w.net.knopen.get(s.b)!;
  const minx = Math.min(A.p.x, B.p.x) - 60, maxx = Math.max(A.p.x, B.p.x) + 60, minz = Math.min(A.p.z, B.p.z) - 60, maxz = Math.max(A.p.z, B.p.z) + 60;
  if (px < minx || px > maxx || pz < minz || pz > maxz) continue;
  console.log(`seg ${s.id} ${s.type} (${A.p.x.toFixed(0)},${A.p.z.toFixed(0)})->(${B.p.x.toFixed(0)},${B.p.z.toFixed(0)}) graad ${A.segs.length}/${B.segs.length} L=${s.lengte.toFixed(0)}`);
  for (const z of [1, -1]) {
    const st = w.stroken.get(`${s.id}:${z}`);
    if (!st) { console.log('   zijde', z, 'geen strook'); continue; }
    const ks = [...w.kavels.values()].filter(k => k.strook === `${s.id}:${z}`).sort((a, b) => a.s0 - b.s0);
    console.log('   zijde', z, `s ${st.s0.toFixed(1)}..${st.s1.toFixed(1)}`, 'kavels', ks.map(k => `${k.s0.toFixed(0)}-${k.s1.toFixed(0)}`).join(' '));
    if (process.argv[3] === 'poly') { const p = band(st, st.s0, st.s0 + 12, 0, 50); console.log('     eerste band', p.map(q => `(${q.x.toFixed(0)},${q.z.toFixed(0)})`).join(' ')); }
  }
}
