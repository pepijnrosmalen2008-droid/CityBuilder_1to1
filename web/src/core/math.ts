// Kleine, engine-onafhankelijke vectorhulp. Assen: X = oost, Y = omhoog, Z = zuid (meters).
export interface V2 { x: number; z: number }
export interface V3 { x: number; y: number; z: number }

export const v2 = (x: number, z: number): V2 => ({ x, z });
export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
export const add2 = (a: V2, b: V2): V2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub2 = (a: V2, b: V2): V2 => ({ x: a.x - b.x, z: a.z - b.z });
export const mul2 = (a: V2, s: number): V2 => ({ x: a.x * s, z: a.z * s });
export const dot2 = (a: V2, b: V2) => a.x * b.x + a.z * b.z;
export const cross2 = (a: V2, b: V2) => a.x * b.z - a.z * b.x;
export const len2 = (a: V2) => Math.hypot(a.x, a.z);
export const dist2 = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
export const lerp2 = (a: V2, b: V2, t: number): V2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
export const norm2 = (a: V2): V2 => { const l = Math.hypot(a.x, a.z); return l > 1e-9 ? { x: a.x / l, z: a.z / l } : { x: 1, z: 0 }; };
/** Linkerloodlijn (90° tegen de klok in, van boven gezien met Z naar beneden = naar links t.o.v. rijrichting). */
export const perp2 = (a: V2): V2 => ({ x: a.z, z: -a.x });

export const add3 = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul3 = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const norm3 = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z); return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 1, z: 0 }; };
export const lerp3 = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

export const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
export const saturate = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => { const t = saturate((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Kwadratische Bézier: rechte weg = controlepunt op het midden. */
export function bezier2(a: V2, c: V2, b: V2, t: number): V2 {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, z: u * u * a.z + 2 * u * t * c.z + t * t * b.z };
}

/** Afstand van punt p tot lijnstuk ab, plus de parameter t op ab. */
export function puntTotLijnstuk(p: V2, a: V2, b: V2): { d: number; t: number } {
  const ab = sub2(b, a); const l2 = dot2(ab, ab);
  const t = l2 > 1e-9 ? saturate(dot2(sub2(p, a), ab) / l2) : 0;
  return { d: dist2(p, lerp2(a, b, t)), t };
}

/** Snijden twee lijnstukken elkaar (strikt binnen beide)? Geeft t op het eerste. */
export function snijLijnstukken(a: V2, b: V2, c: V2, d: V2): number | null {
  const r = sub2(b, a), s = sub2(d, c);
  const den = cross2(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross2(sub2(c, a), s) / den;
  const u = cross2(sub2(c, a), r) / den;
  // Half-open: een kruising precies op een tussenpunt telt één keer.
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? t : null;
}

/** Overlappen twee convexe polygonen (SAT)? */
export function polygonenOverlappen(a: V2[], b: V2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const as = { x: q.z - p.z, z: p.x - q.x };
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a) { const d = dot2(v, as); minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const v of b) { const d = dot2(v, as); minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

export function puntInPolygoon(p: V2, poly: V2[]): boolean {
  let binnen = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) binnen = !binnen;
  }
  return binnen;
}

export function polygoonOppervlak(poly: V2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.z - b.x * a.z; }
  return Math.abs(s) * 0.5;
}
