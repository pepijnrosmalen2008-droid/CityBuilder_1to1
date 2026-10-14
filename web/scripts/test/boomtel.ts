import { boomMesh } from '../../src/core/geom/props';
for (const s of ['eik', 'linde', 'berk', 'den', 'plataan']) {
  const t = [0, 1, 2].map(n => boomMesh(s, 0, n).groepen.map(g => `${g.materiaal.split(':')[0]}=${g.indices.length / 3}`).join(' '));
  console.log(s, t.join(' | '));
}
