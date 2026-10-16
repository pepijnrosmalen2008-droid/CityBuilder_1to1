// Parkeren: vakken, aankomen en vertrekken, parkeerverbod.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 400);
const vk = w.verkeer; vk.max = 500;
let fout = 0;
const check = (n: string, ok: boolean, x = '') => { console.log(ok ? 'ok  ' : 'FOUT', n, x); if (!ok) fout++; };
for (let i = 0; i < 20; i++) vk.stap(0.1);
const P = vk.parkeren;
check('vakken', P.vakken.size > 50, `${P.vakken.size} vakken, ${P.bezet} bezet`);
const b0 = P.bezet;
for (let i = 0; i < 3000; i++) vk.stap(0.1);
check('wisselt (aankomen/vertrekken)', P.bezet > 0, `${b0} → ${P.bezet} bezet, ${vk.voertuigen.size} rijdend`);
const seg = [...P.perSeg.keys()][0];
w.net.regels.zetVerbod(seg, ['parkeren']);
vk.stap(0.1);
check('parkeerverbod', !P.perSeg.has(seg));
if (fout) process.exit(1);
