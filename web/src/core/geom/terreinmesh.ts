import { Terrein, bosDichtheid } from '../terrain';

/** Eén terreinvak: raster met normalen en een bodemmix per hoekpunt (gras, weide, bosgrond, zand). */
export interface TerreinVak { i0: number; j0: number; n: number; posities: Float32Array; normalen: Float32Array; bodem: Float32Array; indices: Uint32Array }

export const VAK_CELLEN = 64;

const bosCache = new WeakMap<Terrein, Float32Array>();
function bos(t: Terrein): Float32Array {
  let b = bosCache.get(t);
  if (!b) {
    b = new Float32Array(t.n * t.n);
    for (let j = 0; j < t.n; j++) for (let i = 0; i < t.n; i++) b[j * t.n + i] = bosDichtheid(t.wereldX(i), t.wereldX(j), t);
    bosCache.set(t, b);
  }
  return b;
}

export function bouwTerreinVak(t: Terrein, vi: number, vj: number): TerreinVak {
  const i0 = vi * VAK_CELLEN, j0 = vj * VAK_CELLEN;
  const n = Math.min(VAK_CELLEN, t.n - 1 - i0), m = Math.min(VAK_CELLEN, t.n - 1 - j0);
  const B = bos(t);
  const nv = (n + 1) * (m + 1);
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), bod = new Float32Array(nv * 4);
  let k = 0;
  for (let j = 0; j <= m; j++) for (let i = 0; i <= n; i++, k++) {
    const gi = i0 + i, gj = j0 + j;
    const x = t.wereldX(gi), z = t.wereldX(gj), y = t.h[gj * t.n + gi];
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const hx = t.h[t.idx(gi + 1, gj)] - t.h[t.idx(gi - 1, gj)], hz = t.h[t.idx(gi, gj + 1)] - t.h[t.idx(gi, gj - 1)];
    const l = Math.hypot(hx, 2 * t.stap, hz);
    nrm[k * 3] = -hx / l; nrm[k * 3 + 1] = 2 * t.stap / l; nrm[k * 3 + 2] = -hz / l;
    const w = t.bodem(x, z, B[gj * t.n + gi]);
    bod.set(w, k * 4);
  }
  const idx = new Uint32Array(n * m * 6);
  let q = 0;
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    // Diagonaal a-d, zoals Terrein.hoogte(); tegen de klok in van boven gezien (+Y).
    idx[q++] = a; idx[q++] = d; idx[q++] = b;
    idx[q++] = a; idx[q++] = c; idx[q++] = d;
  }
  return { i0, j0, n, posities: pos, normalen: nrm, bodem: bod, indices: idx };
}

export const aantalVakken = (t: Terrein) => Math.ceil((t.n - 1) / VAK_CELLEN);
