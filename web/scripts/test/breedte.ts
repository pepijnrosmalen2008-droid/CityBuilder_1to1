import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
const b = [...w.kavels.values()].map(k => k.s1 - k.s0).sort((a, c) => a - c);
console.log('kavels', b.length, 'stroken', (w as any).stroken.size, 'breedte p10/50/90', b[Math.floor(b.length * .1)].toFixed(1), b[Math.floor(b.length * .5)].toFixed(1), b[Math.floor(b.length * .9)].toFixed(1), 'max', b[b.length - 1].toFixed(1));
console.log('segmenten', w.net.segmenten.size);
