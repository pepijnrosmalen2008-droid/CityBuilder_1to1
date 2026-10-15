// Meet de duur van een simulatiestap (gemiddeld en de ergste pieken) bij normale snelheid.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 900);
w.snelheid = Number(process.argv[2] ?? 1);
w.verkeer.max = 650;
const tijden: number[] = [];
const max: Record<string, number> = {};
const meet = (naam: string, obj: any, fn: string) => { const o = obj[fn].bind(obj); obj[fn] = (...a: any[]) => { const t = performance.now(); const r = o(...a); max[naam] = Math.max(max[naam] ?? 0, performance.now() - t); return r; }; };
meet('verkeer', w.verkeer, 'stap'); meet('economie', w.economie, 'stap'); meet('voorzieningen', w.voorzieningen, 'stap'); meet('hulpdiensten', w.hulpdiensten, 'stap'); meet('grondwaarde', w.grondwaarde, 'stap'); meet('statistiek', w, 'berekenStatistiek');
const per: Record<string, number> = {};
for (let i = 0; i < 1800; i++) {
  const t0 = performance.now();
  w.stap(1 / 60);
  tijden.push(performance.now() - t0);
}
tijden.sort((a, b) => a - b);
const gem = tijden.reduce((a, b) => a + b, 0) / tijden.length;
console.log({ gemMs: gem.toFixed(2), p99: tijden[Math.floor(tijden.length * 0.99)].toFixed(1), max: tijden[tijden.length - 1].toFixed(1), voertuigen: w.verkeer.voertuigen.size });
console.log('max per onderdeel (ms)', Object.fromEntries(Object.entries(max).map(([k, v]) => [k, v.toFixed(1)])));
