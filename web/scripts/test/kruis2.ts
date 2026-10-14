import { Wegennet } from '../../src/core/wegen/netwerk';
import { snijLijnstukken } from '../../src/core/math';
const n = Wegennet.curve({ x: -580, z: 240 }, { x: -220, z: 240 }, { x: 140, z: 240 }, 64);
const o = Wegennet.curve({ x: -560, z: 40 }, { x: -560, z: 200 }, { x: -560, z: 360 }, 32);
let hits = 0;
for (let i = 0; i < n.length - 1; i++) for (let j = 0; j < o.length - 1; j++) { const t = snijLijnstukken(n[i], n[i + 1], o[j], o[j + 1]); if (t !== null) { hits++; console.log(i, j, t); } }
console.log('hits', hits, n[1], n[2], o[25], o[26]);
