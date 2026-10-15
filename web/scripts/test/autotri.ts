import { voertuigMesh } from '../../src/core/geom/autos';
for (const s of ['hatchback', 'sedan', 'stationwagen', 'suv', 'bestelbus', 'vrachtwagen', 'bus'] as const) {
  const t = (l: boolean) => voertuigMesh(s, l).groepen.reduce((n, g) => n + g.indices.length / 3, 0);
  console.log(s, 'driehoeken', t(false), 'ver weg', t(true));
}
