// Zoneren zoals CS: bouwblok vullen, rechthoek selecteren, weghalen.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
const leeg = [...w.kavels.values()].filter(k => !k.gebouw);
console.log('kavels', w.kavels.size, 'leeg', leeg.length);
let t0 = performance.now();
const k = leeg[Math.floor(leeg.length / 2)];
const blok = w.blokVan(k);
console.log('blok', blok.length, 'ms', (performance.now() - t0).toFixed(1));
const z = k.zone === 'kantoor' ? 'winkel' : 'kantoor';
const n = w.zoneerKavels(blok, z as any);
console.log('gezoneerd', n, 'alle', blok.every(id => { const x = w.kavels.get(id)!; return x.zone === z || !!x.gebouw; }));
t0 = performance.now();
const m = k.voor;
const sel = w.kavelsIn([{ x: m.x - 40, z: m.z - 40 }, { x: m.x + 40, z: m.z - 40 }, { x: m.x + 40, z: m.z + 40 }, { x: m.x - 40, z: m.z + 40 }]);
console.log('rechthoek', sel.length, 'ms', (performance.now() - t0).toFixed(1));
const weg = w.zoneerKavels(sel, 'geen');
console.log('weg', weg, 'op punt', w.kavelOp(m)?.id === k.id || w.kavelOp(m) !== null);
if (!blok.length || !sel.length) { console.error('FOUT'); process.exit(1); }
