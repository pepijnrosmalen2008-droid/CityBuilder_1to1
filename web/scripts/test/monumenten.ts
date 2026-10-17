// Monumenten bouwen: geldige meshes, hogere grondwaarde in de buurt en meer tevredenheid.
import { Wereld } from '../../src/core/wereld';
import { bouwDienst } from '../../src/core/geom/dienstmesh';
import { DIENSTEN } from '../../src/core/voorzieningen';
const w = new Wereld(1);
w.geld = 1e9;
w.legWeg({ x: -600, z: 0 }, { x: 0, z: 0 }, { x: 600, z: 0 }, 'straat');
const soorten = ['kathedraal', 'koepelgebouw', 'stadhuis', 'fonteinplein'] as const;
let x = -520;
for (const s of soorten) {
  const f = w.voorzieningen.bouw(s, { x, z: 14 + DIENSTEN[s].d / 2 });
  console.log(s, f ?? 'gebouwd');
  x += 250;
}
const vz = w.voorzieningen;
const geluk0 = vz.aanzienGeluk;
for (const d of vz.diensten.values()) { d.voortgang = 1; d.klaar = true; }
let fout = 0;
for (const d of vz.diensten.values()) {
  const r = bouwDienst(d, (x, z) => w.terrein.hoogte(x, z));
  let tri = 0, nan = 0;
  for (const g of r.mesh.groepen) { tri += g.indices.length / 3; for (const v of g.posities) if (!Number.isFinite(v)) nan++; for (const v of g.normalen) if (!Number.isFinite(v)) nan++; }
  console.log(`${d.soort}: ${Math.round(tri / 1000)}k driehoeken, ${r.props.length} props, ${r.mesh.groepen.length} materialen${nan ? `, ${nan} NaN!` : ''}`);
  if (nan || tri < 200) fout++;
}
console.log('tevredenheid uit monumenten', geluk0, '->', vz.aanzienGeluk);
if (vz.aanzienGeluk < 10) fout++;
console.log(fout ? 'FOUT' : 'ok');
