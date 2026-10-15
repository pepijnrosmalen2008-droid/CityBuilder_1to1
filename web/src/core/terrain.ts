import { fbm, perlin } from './noise';
import { clamp, lerp, smoothstep, V3 } from './math';

export const ZEENIVEAU = 0;

/** Hoogteveld van de kaart. Wereld loopt van -grootte/2 tot +grootte/2 op X en Z. */
export class Terrein {
  readonly grootte: number;
  readonly stap: number;
  readonly n: number; // aantal punten per zijde
  readonly h: Float32Array;
  /** Oorspronkelijke hoogte (voor herstel als een weg verdwijnt). */
  readonly h0: Float32Array;
  /** Gewijzigde gebieden sinds de laatste keer ophalen (voor het opnieuw bouwen van terreinvakken). */
  private vuil: { x0: number; z0: number; x1: number; z1: number }[] = [];

  constructor(grootte = 2048, stap = 4, seed = 1) {
    this.grootte = grootte; this.stap = stap;
    this.n = Math.round(grootte / stap) + 1;
    this.h = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const x = -grootte / 2 + i * stap, z = -grootte / 2 + j * stap;
      this.h[j * this.n + i] = Terrein.natuurlijk(x, z, seed, grootte);
    }
    this.h0 = this.h.slice();
  }

  /** Rivierloop: x als functie van z. */
  static rivierX(z: number) { return 260 + 150 * Math.sin(z / 310) + 60 * Math.sin(z / 97 + 1.3); }

  static natuurlijk(x: number, z: number, seed: number, grootte: number): number {
    const r = Math.hypot(x, z) / (grootte / 2);
    // Glooiend: in het midden vlakker (bouwgebied), aan de randen heuvels.
    const heuvel = fbm(x / 1400, z / 1400, 1, 5, seed, 0.5, false);
    const detail = perlin(x / 90, z / 90, 0, seed + 9) * 1.2;
    let h = 7 + (heuvel - 0.5) * lerp(8, 46, smoothstep(0.25, 1.0, r)) + detail;
    h += smoothstep(0.55, 1.0, r) * 18 * fbm(x / 600, z / 600, 1, 3, seed + 3, 0.5, false);
    // Kust in het zuiden.
    const kust = 700 + perlin(x / 260, 0.5, 0, seed + 5) * 90;
    h = lerp(h, -9, smoothstep(kust - 120, kust + 60, z));
    // Rivier van noord naar de zee.
    const d = Math.abs(x - Terrein.rivierX(z));
    const dal = 1 - smoothstep(18, 140, d);
    h = lerp(h, Math.min(h, 2.5), dal);
    h = lerp(h, -3.5, 1 - smoothstep(12, 34, d));
    return h;
  }

  idx(i: number, j: number) { return clamp(j, 0, this.n - 1) * this.n + clamp(i, 0, this.n - 1); }
  rasterX(x: number) { return (x + this.grootte / 2) / this.stap; }
  wereldX(i: number) { return -this.grootte / 2 + i * this.stap; }

  binnen(x: number, z: number, marge = 0) {
    const g = this.grootte / 2 - marge;
    return x >= -g && x <= g && z >= -g && z <= g;
  }

  /** Bilineaire hoogte; valt exact samen met de driehoeken van het terreinmesh. */
  hoogte(x: number, z: number): number {
    const fx = clamp(this.rasterX(x), 0, this.n - 1.0001), fz = clamp(this.rasterX(z), 0, this.n - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = this.h[j * this.n + i], b = this.h[j * this.n + i + 1];
    const c = this.h[(j + 1) * this.n + i], d = this.h[(j + 1) * this.n + i + 1];
    // Zelfde diagonaal als het mesh (a-d).
    return u >= v ? a + (b - a) * u + (d - b) * v : a + (d - c) * u + (c - a) * v;
  }

  normaal(x: number, z: number): V3 {
    const e = this.stap;
    const hx = this.hoogte(x + e, z) - this.hoogte(x - e, z);
    const hz = this.hoogte(x, z + e) - this.hoogte(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    return { x: -hx / l, y: 2 * e / l, z: -hz / l };
  }

  /** Grondverzet: zet punten binnen `binnen` meter op de doelhoogte en laat tot `uitloop` verder geleidelijk aansluiten. */
  egaliseer(doel: (x: number, z: number) => { h: number; d: number } | null, x0: number, z0: number, x1: number, z1: number, binnen: number, uitloop: number) {
    const i0 = Math.max(0, Math.floor(this.rasterX(x0))), i1 = Math.min(this.n - 1, Math.ceil(this.rasterX(x1)));
    const j0 = Math.max(0, Math.floor(this.rasterX(z0))), j1 = Math.min(this.n - 1, Math.ceil(this.rasterX(z1)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.wereldX(i), z = this.wereldX(j);
      const r = doel(x, z);
      if (!r || r.d > binnen + uitloop) continue;
      const k = j * this.n + i;
      const w = 1 - smoothstep(binnen, binnen + uitloop, r.d);
      this.h[k] = lerp(this.h[k], r.h, w);
    }
    this.markeer(x0, z0, x1, z1);
  }

  /** Terrein binnen `binnen` m niet hoger laten zijn dan de doelhoogte (onder wegen). */
  begrens(doel: (x: number, z: number) => { h: number; d: number } | null, x0: number, z0: number, x1: number, z1: number, binnen: number) {
    const i0 = Math.max(0, Math.floor(this.rasterX(x0))), i1 = Math.min(this.n - 1, Math.ceil(this.rasterX(x1)));
    const j0 = Math.max(0, Math.floor(this.rasterX(z0))), j1 = Math.min(this.n - 1, Math.ceil(this.rasterX(z1)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const r = doel(this.wereldX(i), this.wereldX(j));
      if (!r || r.d > binnen) continue;
      const k = j * this.n + i;
      if (this.h[k] > r.h) this.h[k] = r.h;
    }
    this.markeer(x0, z0, x1, z1);
  }

  markeer(x0: number, z0: number, x1: number, z1: number) { this.vuil.push({ x0, z0, x1, z1 }); }
  haalVuil() { const v = this.vuil; this.vuil = []; return v; }

  /** Straal door de wereld; geeft het eerste raakpunt met het terrein. */
  straal(o: V3, d: V3, max = 6000): V3 | null {
    let t = 0, vorige = o.y - this.hoogte(o.x, o.z);
    if (vorige < 0) return null;
    const stap = 2;
    while (t < max) {
      const tn = t + stap * Math.max(1, t / 400);
      const x = o.x + d.x * tn, y = o.y + d.y * tn, z = o.z + d.z * tn;
      const v = y - this.hoogte(x, z);
      if (v < 0) {
        // Bisectie.
        let a = t, b = tn;
        for (let k = 0; k < 20; k++) {
          const m = (a + b) / 2;
          const vm = o.y + d.y * m - this.hoogte(o.x + d.x * m, o.z + d.z * m);
          if (vm > 0) a = m; else b = m;
        }
        const m = (a + b) / 2;
        return { x: o.x + d.x * m, y: this.hoogte(o.x + d.x * m, o.z + d.z * m), z: o.z + d.z * m };
      }
      vorige = v; t = tn;
    }
    return null;
  }

  /** Bodemmix per punt: [gras, weide, bosgrond, zand/oever] — de render-laag mengt hier texturen mee. */
  bodem(x: number, z: number, bos: number): [number, number, number, number] {
    const h = this.hoogte(x, z);
    const n = this.normaal(x, z);
    const zand = 1 - smoothstep(0.6, 2.6, h + perlin(x / 30, z / 30, 0, 77) * 1.2);
    const helling = smoothstep(0.86, 0.7, n.y);
    const weide = smoothstep(0.45, 0.62, fbm(x / 500, z / 500, 1, 3, 31, 0.5, false)) * (1 - zand);
    let bosgrond = Math.max(bos, helling * 0.6) * (1 - zand);
    let gras = Math.max(0, 1 - zand - weide - bosgrond);
    const som = gras + weide + bosgrond + zand || 1;
    gras /= som; bosgrond /= som;
    return [gras, weide / som, bosgrond, zand / som];
  }
}

/** Bosdichtheid in [0,1] op een wereldpositie. */
export function bosDichtheid(x: number, z: number, terrein: Terrein): number {
  const h = terrein.hoogte(x, z);
  if (h < 1.5) return 0;
  const n = fbm(x / 700, z / 700, 1, 4, 555, 0.55, false);
  const r = Math.hypot(x, z) / (terrein.grootte / 2);
  return smoothstep(0.5, 0.6, n + smoothstep(0.35, 1, r) * 0.08);
}
