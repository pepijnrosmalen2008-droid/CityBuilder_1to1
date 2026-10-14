import { Wereld } from '../../src/core/wereld';
const w = new Wereld(1); w.geld = 1e9;
console.log(w.legWeg({ x: -560, z: 40 }, { x: -560, z: 200 }, { x: -560, z: 360 }, 'straat'));
console.log(w.legWeg({ x: -580, z: 240 }, { x: -220, z: 240 }, { x: 140, z: 240 }, 'tramstraat'));
for (const k of w.net.knopen.values()) console.log('knoop', k.id, k.p.x.toFixed(1), k.p.z.toFixed(1), 'graad', k.segs.length);
