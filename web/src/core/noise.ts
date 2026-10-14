import { hash01, hash32 } from './rng';

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function grad(ix: number, iy: number, seed: number, dx: number, dy: number) {
  const h = hash32(ix, iy, seed) & 7;
  const a = (h / 8) * Math.PI * 2;
  return Math.cos(a) * dx + Math.sin(a) * dy;
}

/** Gradiëntruis; met periode > 0 naadloos herhalend (voor texturen). Uitkomst ~[-0.7, 0.7]. */
export function perlin(x: number, y: number, periode = 0, seed = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const w = (i: number) => (periode > 0 ? ((i % periode) + periode) % periode : i);
  const a = grad(w(x0), w(y0), seed, fx, fy), b = grad(w(x0 + 1), w(y0), seed, fx - 1, fy);
  const c = grad(w(x0), w(y0 + 1), seed, fx, fy - 1), d = grad(w(x0 + 1), w(y0 + 1), seed, fx - 1, fy - 1);
  const u = fade(fx), v = fade(fy);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/** Fractale ruis in [0,1]. u,v in [0,1) voor texturen met basisPeriode cellen; of wereldcoördinaten met periode 0. */
export function fbm(u: number, v: number, basis: number, octaven: number, seed = 0, persistentie = 0.5, herhalend = true): number {
  let som = 0, amp = 1, norm = 0, f = basis;
  for (let o = 0; o < octaven; o++) {
    som += perlin(u * f, v * f, herhalend ? f : 0, seed + o * 101) * amp;
    norm += amp; amp *= persistentie; f *= 2;
  }
  return Math.min(1, Math.max(0, som / norm * 0.85 + 0.5));
}

/** Celruis (Worley), herhalend over `cellen`. Geeft f1, f2 en een vaste waarde per cel. */
export function worley(u: number, v: number, cellen: number, seed = 0) {
  const x = u * cellen, y = v * cellen;
  const cx = Math.floor(x), cy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j;
    const wx = ((gx % cellen) + cellen) % cellen, wy = ((gy % cellen) + cellen) % cellen;
    const px = gx + hash01(wx, wy, seed), py = gy + hash01(wx, wy, seed + 7);
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = hash01(wx, wy, seed + 13); } else if (d < f2) f2 = d;
  }
  return { f1, f2, id };
}
