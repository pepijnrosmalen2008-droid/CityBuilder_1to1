import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
w.verkeer.stap(0.1);
for (const l of [...w.verkeer.stroken.lichten.values()].slice(0, 5)) { const k = w.net.knopen.get(l.knoop)!; console.log('licht', k.p.x.toFixed(0), k.p.z.toFixed(0), 'fases', l.fases.length); }
