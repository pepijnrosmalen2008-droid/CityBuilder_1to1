import { Terrein } from '../../src/core/terrain';
import { rijkdom, Grondstof } from '../../src/core/economie';
const t = new Terrein(2048, 4, 1);
for (const s of ['landbouw', 'bosbouw', 'olie', 'delfstoffen'] as Grondstof[]) {
  const best: [number, number, number][] = [];
  for (let x = -960; x <= 960; x += 80) for (let z = -960; z <= 960; z += 80) {
    let r = 0; for (let dx = -60; dx <= 60; dx += 30) for (let dz = -60; dz <= 60; dz += 30) r += rijkdom(t, s, x + dx, z + dz);
    best.push([r / 25, x, z]);
  }
  best.sort((a, b) => b[0] - a[0]);
  console.log(s, best.slice(0, 8).map(([r, x, z]) => `(${x},${z}) ${r.toFixed(2)}`).join('  '));
}
