import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, Number(process.argv[2] ?? 600));
const h = w.hulpdiensten;
console.log('diensten', [...w.voorzieningen.diensten.values()].filter(d => ['brandweer', 'politie', 'ziekenhuis', 'gezondheidscentrum'].includes(d.soort)).map(d => `${d.soort}@${d.p.x.toFixed(0)},${d.p.z.toFixed(0)}`).join(' '));
w.verkeer.max = 500;
for (let i = 0; i < 20 * 300; i++) {
  w.stap(0.05);
  for (const inc of h.incidenten.values()) if (inc.soort === 'brand' && Math.floor(inc.t) % 30 === 0 && Math.floor(inc.t) !== Math.floor(inc.t - 0.05)) {
    const z = (h as any).inzetten.get(inc.inzet); const v = z && w.verkeer.voertuigen.get(z.voertuig);
    console.log(`  brand ${inc.id} t ${inc.t.toFixed(0)} ernst ${inc.ernst.toFixed(2)} inzet ${z ? z.fase : '-'} wagen ${v ? `v=${v.v.toFixed(1)} ri ${v.ri}/${v.route.length} vast ${v.vast.toFixed(0)}` : '-'} dekking ${h.dekkingVan(inc.gebouw).brand.toFixed(2)}`);
  }
  if (i % 1200 === 0) {
    const hulp = [...w.verkeer.voertuigen.values()].filter(v => ['politie', 'ambulance', 'brandweer'].includes(v.soort));
    console.log(`t=${(i * 0.05).toFixed(0)} incidenten ${[...h.incidenten.values()].map(x => x.soort[0] + (x.inzet ? '*' : '')).join('')} | hulpvoertuigen ${hulp.length} (sirene ${hulp.filter(v => v.sirene).length}) | stat ${JSON.stringify(h.stat, (k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v)}`);
  }
}
for (const inc of h.incidenten.values()) console.log('open incident', inc.soort, 't', inc.t.toFixed(0), 'ernst', inc.ernst.toFixed(2), 'inzet', inc.inzet);
console.log('tevredenheid', w.tevredenheid, 'gebouwen', w.gebouwen.size);
