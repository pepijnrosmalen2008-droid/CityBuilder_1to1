import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { pandPolys } from '../../src/core/geom/stijlmesh';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 900);
const tel: Record<string, number> = {};
let vier = 0, nietVier = 0, geenVoor = 0, verbouw = 0;
const lens: Record<number, number> = {};
for (const g of w.gebouwen.values()) {
  tel[`${g.stijl}/${g.type}/n${g.niveau}`] = (tel[`${g.stijl}/${g.type}/n${g.niveau}`] ?? 0) + 1;
  if (g.verbouw) verbouw++;
  if (g.stijl !== 'gracht') continue;
  for (const p of pandPolys(g)) { if (!p.voor) geenVoor++; if (p.poly.length === 4) vier++; else { nietVier++; lens[p.poly.length] = (lens[p.poly.length] ?? 0) + 1; } }
}
console.log(JSON.stringify(tel, null, 0));
console.log({ vier, nietVier, geenVoor, lens, verbouw, gebouwen: w.gebouwen.size, inw: w.stat.inwoners });
for (const g of w.gebouwen.values()) if (g.type === 'villa' || g.type === 'woontoren') console.log(g.type, Math.round(g.centrum.x), Math.round(g.centrum.z), g.lagen.length);
