// Tekent wegen + kavels als SVG: node scripts/draai.mjs scripts/test/kaart.ts uit.svg x0 z0 grootte
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad, bouwTestKruisingen } from '../../src/core/demo';
import { halveBreedte } from '../../src/core/wegen/typen';
import { writeFileSync } from 'fs';
const [uit, X, Z, G] = process.argv.slice(2);
const x0 = Number(X), z0 = Number(Z), g = Number(G);
const w = new Wereld(1);
if (process.argv[6] === 'test') bouwTestKruisingen(w); else bouwVoorbeeldstad(w, Number(process.argv[6] ?? 0));
const k = 800 / g;
const P = (p: { x: number; z: number }) => `${((p.x - x0) * k).toFixed(1)},${((p.z - z0) * k).toFixed(1)}`;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#cfe3c0"/>`;
const kl = ['#e6a', '#6ae', '#ea6', '#a6e', '#6ea', '#ae6'];
for (const kv of w.kavels.values()) svg += `<polygon points="${kv.poly.map(P).join(' ')}" fill="${kl[kv.id % 6]}" fill-opacity="0.55" stroke="#333" stroke-width="0.6"/>`;
for (const gb of w.gebouwen.values()) svg += `<polygon points="${gb.voet.map(P).join(' ')}" fill="#844" stroke="#000" stroke-width="0.8"/>`;
for (const s of w.net.segmenten.values()) svg += `<polyline points="${s.pad.map(P).join(' ')}" fill="none" stroke="#555" stroke-opacity="0.8" stroke-width="${(halveBreedte(s.type) * 2 * k).toFixed(1)}"/>`;
writeFileSync(uit, svg + '</svg>');
