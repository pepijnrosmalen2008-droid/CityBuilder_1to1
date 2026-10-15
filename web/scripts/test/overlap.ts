// Zoekt gebouwen waarvan de footprints elkaar overlappen (vooral op hoeken).
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { pandPolys } from '../../src/core/geom/stijlmesh';
import { puntInPolygoon } from '../../src/core/math';
const w = new Wereld(1);
bouwVoorbeeldstad(w, Number(process.argv[2] ?? 900));
type P = { x: number; z: number }[];
const vormen = new Map<number, P[]>();
for (const g of w.gebouwen.values()) vormen.set(g.id, g.pandGrenzen ? pandPolys(g).map(p => p.poly) : [g.voet]);
const box = (ps: P[]) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of ps) for (const q of p) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); } return { x0, x1, z0, z1 }; };
const lijst = [...w.gebouwen.values()];
let n = 0;
const voorbeelden: string[] = [];
for (let i = 0; i < lijst.length; i++) for (let j = i + 1; j < lijst.length; j++) {
  const a = lijst[i], b = lijst[j];
  const A = vormen.get(a.id)!, B = vormen.get(b.id)!;
  const ba = box(A), bb = box(B);
  if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.z1 < bb.z0 || bb.z1 < ba.z0) continue;
  let opp = 0;
  for (let x = Math.max(ba.x0, bb.x0); x < Math.min(ba.x1, bb.x1); x += 0.5) for (let z = Math.max(ba.z0, bb.z0); z < Math.min(ba.z1, bb.z1); z += 0.5) {
    const p = { x, z };
    if (A.some(q => puntInPolygoon(p, q)) && B.some(q => puntInPolygoon(p, q))) opp += 0.25;
  }
  if (opp > 1) { n++; if (voorbeelden.length < 12) voorbeelden.push(`${a.type}#${a.id} x ${b.type}#${b.id} ${opp.toFixed(1)} m2 @ ${Math.round(a.centrum.x)},${Math.round(a.centrum.z)} zelfdeStrook=${w.kavels.get(a.kavel)?.strook === w.kavels.get(b.kavel)?.strook}`); }
}
console.log('overlappende paren', n, 'van', lijst.length, 'gebouwen');
for (const v of voorbeelden) console.log(v);
// Perceel (tuin, schuur, schutting) van het ene gebouw over het grondvlak van een ander.
let np = 0; const vb2: string[] = [];
for (const a of lijst) for (const b of lijst) {
  if (a === b) continue;
  const ba = box([a.perceel]), bb = box(vormen.get(b.id)!);
  if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.z1 < bb.z0 || bb.z1 < ba.z0) continue;
  let opp = 0;
  for (let x = Math.max(ba.x0, bb.x0); x < Math.min(ba.x1, bb.x1); x += 0.5) for (let z = Math.max(ba.z0, bb.z0); z < Math.min(ba.z1, bb.z1); z += 0.5) {
    const p = { x, z };
    if (puntInPolygoon(p, a.perceel) && vormen.get(b.id)!.some(q => puntInPolygoon(p, q))) opp += 0.25;
  }
  if (opp > 2) { np++; if (vb2.length < 10) vb2.push(`perceel ${a.type}#${a.id} over ${b.type}#${b.id} ${opp.toFixed(1)} m2 @ ${Math.round(b.centrum.x)},${Math.round(b.centrum.z)}`); }
}
console.log('percelen over andere gebouwen', np);
for (const v of vb2) console.log(v);
