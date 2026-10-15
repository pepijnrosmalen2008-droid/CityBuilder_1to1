// Telt driehoeken en materiaalgroepen van alle gebouwen (detail en ver).
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { bouwGebouw } from '../../src/core/geom/gebouwmesh';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 900);
const h = (x: number, z: number) => w.terrein.hoogte(x, z);
for (const ver of [false, true]) {
  let tri = 0; const mats = new Map<string, number>(); let props = 0;
  const t0 = performance.now();
  for (const g of w.gebouwen.values()) {
    const r = (bouwGebouw as any)(g, h, [], ver);
    props += r.props.length;
    for (const gr of r.mesh.groepen) { tri += gr.indices.length / 3; mats.set(gr.materiaal, (mats.get(gr.materiaal) ?? 0) + gr.indices.length / 3); }
  }
  console.log(ver ? 'VER' : 'DETAIL', 'driehoeken', Math.round(tri / 1000) + 'k', 'materialen', mats.size, 'props', props, 'ms', Math.round(performance.now() - t0));
  console.log([...mats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([m, n]) => `${m}:${Math.round(n / 1000)}k`).join(' '));
}
