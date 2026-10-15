import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { Grondwaarde } from '../../src/core/waarde';
const w = new Wereld(1);
bouwVoorbeeldstad(w, Number(process.argv[2] ?? 1800));
const tel = [0, 0, 0, 0, 0, 0];
let som = 0, n = 0;
const mist = new Map<string, number>();
for (const g of w.gebouwen.values()) { if (!g.klaar) continue; tel[g.niveau ?? 1]++; som += w.grondwaarde.van(g.id).waarde; n++; const m = w.grondwaarde.doelNiveau(g).mist; if (m) mist.set(m, (mist.get(m) ?? 0) + 1); }
console.log('niveaus 1-5:', tel.slice(1).join(' / '), '| gem. grondwaarde', (som / n).toFixed(2), `(€ ${Grondwaarde.euroPerM2(som / n)}/m²)`);
console.log('wat ontbreekt voor een hoger niveau:', JSON.stringify(Object.fromEntries(mist)));
console.log('inwoners', w.stat.inwoners, 'saldo/mnd', Math.round(w.prognose.saldo), 'tevredenheid', w.tevredenheid, 'stat', JSON.stringify(w.hulpdiensten.stat));
