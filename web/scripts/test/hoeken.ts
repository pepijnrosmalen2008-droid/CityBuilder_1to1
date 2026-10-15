import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { getekendOppervlak } from '../../src/core/poly';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 900);
let n = 0, slecht = 0;
const lijst: string[] = [];
for (const g of w.gebouwen.values()) {
  n++;
  const p = g.voet, A = Math.sign(getekendOppervlak(p));
  let min = 180;
  for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    const u = { x: a.x - b.x, z: a.z - b.z }, v = { x: c.x - b.x, z: c.z - b.z };
    const lu = Math.hypot(u.x, u.z), lv = Math.hypot(v.x, v.z);
    if (lu < 0.3 || lv < 0.3) continue;
    const cross = (v.x * u.z - v.z * u.x) * A;
    let ang = Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.z * v.z) / lu / lv))) * 180 / Math.PI;
    if (cross < 0) ang = 360 - ang;
    min = Math.min(min, ang);
  }
  if (min < 40) { slecht++; lijst.push(`${g.vorm} ${min.toFixed(0)}° @ ${g.centrum.x.toFixed(0)},${g.centrum.z.toFixed(0)} n=${p.length}`); }
}
console.log('gebouwen', n, 'scherp (<40°)', slecht);
console.log(lijst.slice(0, 30).join('\n'));
for (const g of w.gebouwen.values()) {
  if (Math.abs(g.centrum.x - 97) < 1 && Math.abs(g.centrum.z - 225) < 1 || Math.abs(g.centrum.x + 208) < 1 && Math.abs(g.centrum.z + 49) < 1) {
    console.log(g.vorm, g.voet.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join('  '));
    const st = (w as any).stroken.get(w.kavels.get(g.kavel)!.strook);
    console.log('knippen', JSON.stringify(st.knippen.map((k: any) => [k.o.x.toFixed(1), k.o.z.toFixed(1), k.n.x.toFixed(2), k.n.z.toFixed(2)])), 'terug', g.terug.toFixed(1), 'diepte', g.diepte.toFixed(1));
  }
}
