import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { afstandTotLijn } from '../../src/core/poly';
import { halveBreedte } from '../../src/core/wegen/typen';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
for (const g of w.economie.gebieden.values()) {
  const b = g.hoofd ? w.economie.bedrijven.get(g.hoofd) : null;
  let d = Infinity; if (b) for (const s of w.net.segmenten.values()) d = Math.min(d, afstandTotLijn(b.p, s.pad).d - halveBreedte(s.type));
  console.log(g.soort, 'hoofd', b ? `${b.naam} @ ${b.p.x.toFixed(0)},${b.p.z.toFixed(0)} afstand tot stoep ${d.toFixed(1)} m` : 'GEEN');
}
