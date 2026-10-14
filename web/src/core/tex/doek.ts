// Engine-onafhankelijke textuurdata: RGBA8-buffers. Albedo is sRGB; normaal en orm zijn lineair.
// orm volgt glTF: R = occlusie, G = ruwheid, B = metaal.

export interface TexData {
  b: number; h: number;
  albedo: Uint8ClampedArray;
  normaal?: Uint8ClampedArray;
  orm?: Uint8ClampedArray;
  alfa: boolean;
}

export type C = [number, number, number];
export const K = (r: number, g: number, b: number): C => [r, g, b];
export const mix = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: C, s: number): C => [a[0] * s, a[1] * s, a[2] * s];
export const frac = (x: number) => x - Math.floor(x);
export const glad01 = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const wikkel = (a: number, m: number) => ((a % m) + m) % m;

export function hsv(h: number, s: number, v: number): C {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) { case 0: return [v, t, p]; case 1: return [q, v, p]; case 2: return [p, v, t]; case 3: return [p, q, v]; case 4: return [t, p, v]; default: return [v, p, q]; }
}

/** Werkbuffer: kleur, hoogte (voor de normal map), gladheid, metaalheid en optioneel alfa. */
export class Doek {
  kleur: Float32Array; hoogte: Float32Array; glad: Float32Array; metaal: Float32Array; alfa?: Float32Array;
  constructor(readonly W: number, readonly H: number, metAlfa = false) {
    const n = W * H;
    this.kleur = new Float32Array(n * 3); this.hoogte = new Float32Array(n); this.glad = new Float32Array(n); this.metaal = new Float32Array(n);
    if (metAlfa) this.alfa = new Float32Array(n);
  }
  I(x: number, y: number) { return wikkel(y, this.H) * this.W + wikkel(x, this.W); }
  zet(x: number, y: number, k: C, h: number, glad: number, metaal = 0, alfa = 1) {
    const i = y * this.W + x;
    this.kleur[i * 3] = k[0]; this.kleur[i * 3 + 1] = k[1]; this.kleur[i * 3 + 2] = k[2];
    this.hoogte[i] = h; this.glad[i] = glad; this.metaal[i] = metaal;
    if (this.alfa) this.alfa[i] = alfa;
  }
  naarTex(normaalSterkte: number, metOrm = true): TexData {
    const { W, H } = this, n = W * H;
    const albedo = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      albedo[i * 4] = this.kleur[i * 3] * 255; albedo[i * 4 + 1] = this.kleur[i * 3 + 1] * 255; albedo[i * 4 + 2] = this.kleur[i * 3 + 2] * 255;
      albedo[i * 4 + 3] = this.alfa ? this.alfa[i] * 255 : 255;
    }
    const r: TexData = { b: W, h: H, albedo, alfa: !!this.alfa };
    if (normaalSterkte > 0) {
      const nm = new Uint8ClampedArray(n * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (this.hoogte[this.I(x + 1, y)] - this.hoogte[this.I(x - 1, y)]) * normaalSterkte;
        const dy = (this.hoogte[this.I(x, y + 1)] - this.hoogte[this.I(x, y - 1)]) * normaalSterkte;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * W + x) * 4;
        // Textuur-v loopt omhoog in de mesh (y=0 is de onderste rij), vandaar +dy.
        nm[i] = (-dx / l * 0.5 + 0.5) * 255; nm[i + 1] = (-dy / l * 0.5 + 0.5) * 255; nm[i + 2] = (1 / l * 0.5 + 0.5) * 255; nm[i + 3] = 255;
      }
      r.normaal = nm;
    }
    if (metOrm) {
      const o = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) {
        // Holtes (lage hoogte) krijgen wat occlusie.
        o[i * 4] = (0.72 + 0.28 * Math.min(1, this.hoogte[i] * 1.4)) * 255;
        o[i * 4 + 1] = (1 - this.glad[i]) * 255; o[i * 4 + 2] = this.metaal[i] * 255; o[i * 4 + 3] = 255;
      }
      r.orm = o;
    }
    return r;
  }
}
