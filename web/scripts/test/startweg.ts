import { Wereld } from '../../src/core/wereld';
const w = new Wereld(1);
const g = w.terrein.grootte / 2;
for (const z of [0, 120, -120]) {
  const a = { x: -g + 22, z }, b = { x: -g + 320, z };
  const h = [0, 0.25, 0.5, 0.75, 1].map(t => w.terrein.hoogte(a.x + (b.x - a.x) * t, z).toFixed(1));
  console.log(z, 'hoogtes', h.join(' '), 'controleer', w.net.controleer(a, { x: (a.x + b.x) / 2, z }, b, 'snelweg'));
}
