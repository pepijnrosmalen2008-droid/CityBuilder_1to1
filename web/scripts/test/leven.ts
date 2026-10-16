// Leven op straat: aantallen, geen sprongen, kosten per stap.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { StraatLeven } from '../../src/core/straatleven';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
const L = new StraatLeven(w.net);
const f = { x: -400, z: 40 };
let maxSprong = 0, stappen = 0;
const vorig = new Map<number, { x: number; z: number }>();
const t0 = performance.now();
for (let i = 0; i < 3000; i++) {
  L.stap(1 / 30, f, 220, 300, 1);
  for (const l of L.lopers) {
    const p = L.plek(l), v = vorig.get(l.id);
    if (v) { maxSprong = Math.max(maxSprong, Math.hypot(p.x - v.x, p.z - v.z)); stappen++; }
    vorig.set(l.id, p);
  }
}
const ms = (performance.now() - t0) / 3000;
const voet = L.lopers.filter(l => l.soort === 'voet').length;
console.log('lopers', L.lopers.length, 'voet', voet, 'fiets', L.lopers.length - voet, 'max verplaatsing per stap', maxSprong.toFixed(2), 'm', 'ms per stap', ms.toFixed(3));
if (L.lopers.length < 100 || maxSprong > 0.5) { console.error('FOUT'); process.exit(1); }
