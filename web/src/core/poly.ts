import { V2, dist2, sub2, dot2 } from './math';

// Polygoonhulp: afknippen met een halfvlak, driehoeken maken (oorknippen), oppervlakte, afstanden.

/** Getekende oppervlakte in het x,z-vlak (positief = tegen de klok in met x rechts en z omhoog). */
export function getekendOppervlak(p: V2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.z - b.x * a.z; }
  return s / 2;
}

/** Houd het deel van de polygoon waar dot(p - o, n) >= 0 (Sutherland–Hodgman). */
export function knipHalfvlak(poly: V2[], o: V2, n: V2): V2[] {
  const r: V2[] = [];
  const d = (p: V2) => (p.x - o.x) * n.x + (p.z - o.z) * n.z;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = d(a), db = d(b);
    if (da >= 0) r.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); r.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); }
  }
  return opschonen(r);
}

/** Dubbele en bijna-dubbele punten verwijderen. */
export function opschonen(p: V2[], eps = 0.05): V2[] {
  const r: V2[] = [];
  for (const q of p) if (!r.length || dist2(r[r.length - 1], q) > eps) r.push(q);
  while (r.length > 1 && dist2(r[0], r[r.length - 1]) <= eps) r.pop();
  return r;
}

/** Oorknippen; geeft indices (driehoeken tegen de klok in in het x,z-vlak, d.w.z. naar boven gericht in Y-op). */
export function driehoeken(p: V2[]): number[] {
  const n = p.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  if (getekendOppervlak(p) < 0) idx.reverse();
  const r: number[] = [];
  const cross = (a: V2, b: V2, c: V2) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const binnen = (q: V2, a: V2, b: V2, c: V2) => cross(a, b, q) >= -1e-9 && cross(b, c, q) >= -1e-9 && cross(c, a, q) >= -1e-9;
  let veilig = 0;
  while (idx.length > 3 && veilig++ < 5000) {
    let gevonden = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = p[ia], b = p[ib], c = p[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let leeg = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (binnen(p[j], a, b, c)) { leeg = false; break; } }
      if (!leeg) continue;
      r.push(ia, ib, ic); idx.splice(i, 1); gevonden = true; break;
    }
    if (!gevonden) { // Gedegenereerd: rest als waaier.
      for (let i = 1; i < idx.length - 1; i++) r.push(idx[0], idx[i], idx[i + 1]);
      return r;
    }
  }
  if (idx.length === 3) r.push(idx[0], idx[1], idx[2]);
  return r;
}

/** Kortste afstand van p tot een polylijn, plus de booglengte van het voetpunt. */
export function afstandTotLijn(p: V2, lijn: V2[], s?: number[]): { d: number; s: number } {
  let best = Infinity, bs = 0;
  for (let i = 0; i < lijn.length - 1; i++) {
    const a = lijn[i], b = lijn[i + 1];
    const ab = sub2(b, a), l2 = dot2(ab, ab);
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot2(sub2(p, a), ab) / l2)) : 0;
    const d = Math.hypot(p.x - (a.x + ab.x * t), p.z - (a.z + ab.z * t));
    if (d < best) { best = d; bs = s ? s[i] + (s[i + 1] - s[i]) * t : 0; }
  }
  return { d: best, s: bs };
}

export function zwaartepunt(p: V2[]): V2 {
  let a = 0, x = 0, z = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length], c = q.x * r.z - r.x * q.z;
    a += c; x += (q.x + r.x) * c; z += (q.z + r.z) * c;
  }
  if (Math.abs(a) < 1e-9) { const s = p.reduce((m, q) => ({ x: m.x + q.x, z: m.z + q.z }), { x: 0, z: 0 }); return { x: s.x / p.length, z: s.z / p.length }; }
  return { x: x / (3 * a), z: z / (3 * a) };
}

/** Driehoeken opdelen tot de randen korter zijn dan `max` (om over het terrein te draperen). */
export function verfijn(p: V2[], tri: number[], max: number): { p: V2[]; tri: number[] } {
  const pts = p.slice();
  let t = tri.slice();
  for (let ronde = 0; ronde < 6; ronde++) {
    const nieuw: number[] = [];
    let iets = false;
    const midden = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let m = midden.get(k);
      if (m === undefined) { m = pts.length; pts.push({ x: (pts[a].x + pts[b].x) / 2, z: (pts[a].z + pts[b].z) / 2 }); midden.set(k, m); }
      return m;
    };
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i], b = t[i + 1], c = t[i + 2];
      const lab = dist2(pts[a], pts[b]), lbc = dist2(pts[b], pts[c]), lca = dist2(pts[c], pts[a]);
      const m = Math.max(lab, lbc, lca);
      if (m <= max) { nieuw.push(a, b, c); continue; }
      iets = true;
      // Langste rand halveren.
      if (m === lab) { const d = mid(a, b); nieuw.push(a, d, c, d, b, c); }
      else if (m === lbc) { const d = mid(b, c); nieuw.push(a, b, d, a, d, c); }
      else { const d = mid(c, a); nieuw.push(a, b, d, d, b, c); }
    }
    t = nieuw;
    if (!iets) break;
  }
  return { p: pts, tri: t };
}
