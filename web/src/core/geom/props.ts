import { V3, norm3, sub3 } from '../math';
import { Rng } from '../rng';
import { MeshBouwer, MeshData } from './mesh';

// Modellen voor instanties, in lokale coördinaten: oorsprong op de grond, +Z = voorkant.

interface BoomVorm { stam: number; stamR: number; kroonY: number; kroonR: number; kroonH: number; trossen: number; kaart: number; naald: boolean; berk: boolean }
const VORM: Record<string, BoomVorm> = {
  eik: { stam: 5.5, stamR: 0.38, kroonY: 9.5, kroonR: 5.2, kroonH: 5.2, trossen: 16, kaart: 3.6, naald: false, berk: false },
  linde: { stam: 5, stamR: 0.32, kroonY: 10, kroonR: 4.2, kroonH: 6.2, trossen: 15, kaart: 3.3, naald: false, berk: false },
  berk: { stam: 6, stamR: 0.2, kroonY: 10, kroonR: 2.9, kroonH: 5.5, trossen: 12, kaart: 2.6, naald: false, berk: true },
  den: { stam: 7, stamR: 0.3, kroonY: 11, kroonR: 3.2, kroonH: 7.5, trossen: 0, kaart: 0, naald: true, berk: false },
  plataan: { stam: 5.5, stamR: 0.42, kroonY: 11, kroonR: 5.8, kroonH: 5.8, trossen: 18, kaart: 3.8, naald: false, berk: false },
};

function cilinder(mb: MeshBouwer, mat: string, a: V3, b: V3, ra: number, rb: number, zijden = 7) {
  const as = norm3(sub3(b, a));
  const t = Math.abs(as.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  // Twee loodrechte vectoren.
  const u = norm3({ x: as.y * t.z - as.z * t.y, y: as.z * t.x - as.x * t.z, z: as.x * t.y - as.y * t.x });
  const w = { x: as.y * u.z - as.z * u.y, y: as.z * u.x - as.x * u.z, z: as.x * u.y - as.y * u.x };
  const pts: V3[] = [], nrm: V3[] = [], uv: [number, number][] = [], idx: number[] = [];
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  for (let i = 0; i <= zijden; i++) {
    const h = (i / zijden) * Math.PI * 2, c = Math.cos(h), s = Math.sin(h);
    const n = { x: u.x * c + w.x * s, y: u.y * c + w.y * s, z: u.z * c + w.z * s };
    pts.push({ x: a.x + n.x * ra, y: a.y + n.y * ra, z: a.z + n.z * ra }, { x: b.x + n.x * rb, y: b.y + n.y * rb, z: b.z + n.z * rb });
    nrm.push(n, n); uv.push([i / zijden * 2, 0], [i / zijden * 2, L / 2]);
  }
  for (let i = 0; i < zijden; i++) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  // Wikkeling controleren (buitenkant = n).
  const p0 = pts[0], p1 = pts[2], p2 = pts[1];
  const cr = { x: (p1.y - p0.y) * (p2.z - p0.z) - (p1.z - p0.z) * (p2.y - p0.y), y: (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z), z: (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x) };
  if (cr.x * nrm[0].x + cr.y * nrm[0].y + cr.z * nrm[0].z < 0) for (let i = 0; i < idx.length; i += 3) { const t2 = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t2; }
  mb.ruw(mat, pts, nrm, uv, idx);
}

/** Bladkaart: vierkant met normalen die van het kroonmidden af wijzen (zachte, ronde belichting). */
function kaart(mb: MeshBouwer, mat: string, c: V3, as1: V3, as2: V3, r: number, midden: V3) {
  const hoek = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const pts = hoek.map(([a, b]) => ({ x: c.x + (as1.x * a + as2.x * b) * r, y: c.y + (as1.y * a + as2.y * b) * r, z: c.z + (as1.z * a + as2.z * b) * r }));
  const nrm = pts.map(p => norm3({ x: (p.x - midden.x), y: (p.y - midden.y) * 1.4 + 0.6, z: (p.z - midden.z) }));
  mb.ruw(mat, pts, nrm, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
}

export function boomMesh(soort: string, variant: number, laag = false): MeshData {
  const v = VORM[soort] ?? VORM.eik;
  const r = new Rng(soort.length * 977 + variant * 31 + 5);
  const mb = new MeshBouwer();
  const schors = v.berk ? 'schorsBerk' : 'schors';
  const blad = `blad:${soort}`;
  // Stam met lichte buiging.
  const top: V3 = { x: r.range(-0.3, 0.3), y: v.kroonY - (v.naald ? 0 : v.kroonH * 0.35), z: r.range(-0.3, 0.3) };
  cilinder(mb, schors, { x: 0, y: -0.3, z: 0 }, { x: top.x * 0.4, y: v.stam, z: top.z * 0.4 }, v.stamR * 1.15, v.stamR * 0.8);
  cilinder(mb, schors, { x: top.x * 0.4, y: v.stam, z: top.z * 0.4 }, top, v.stamR * 0.8, v.stamR * 0.35, 6);
  const midden: V3 = { x: top.x, y: v.kroonY, z: top.z };

  if (v.naald) {
    // Den: lagen van hangende takkaarten rond de stam, kegelvormig.
    const lagen = laag ? 4 : 7;
    for (let l = 0; l < lagen; l++) {
      const f = l / (lagen - 1);
      const y = v.stam - 1 + f * (v.kroonY + v.kroonH * 0.5 - v.stam);
      const straal = v.kroonR * (1 - f * 0.85);
      const n = laag ? 5 : Math.max(4, Math.round(9 * (1 - f * 0.5)));
      for (let i = 0; i < n; i++) {
        const h = (i / n) * Math.PI * 2 + l * 0.7 + r.range(-0.2, 0.2);
        const d = { x: Math.cos(h), y: 0, z: Math.sin(h) };
        const c = { x: top.x * f + d.x * straal * 0.55, y: y - 0.3, z: top.z * f + d.z * straal * 0.55 };
        const zij = { x: -d.z, y: 0, z: d.x };
        const naarBuiten = norm3({ x: d.x, y: -0.35, z: d.z });
        kaart(mb, blad, c, zij, naarBuiten, straal * 0.6 + 0.6, { x: top.x * f, y: y + 1.5, z: top.z * f });
      }
    }
    cilinder(mb, schors, top, { x: top.x, y: v.kroonY + v.kroonH * 0.55, z: top.z }, v.stamR * 0.35, 0.05, 5);
    return mb.bouw();
  }

  // Hoofdtakken naar de kroon (ver weg niet nodig).
  const takken = laag ? 0 : 4 + r.int(0, 2);
  for (let i = 0; i < takken; i++) {
    const h = (i / takken) * Math.PI * 2 + r.range(-0.3, 0.3);
    const vanY = v.stam + r.range(-0.5, 1.5);
    const eind = { x: midden.x + Math.cos(h) * v.kroonR * 0.55, y: v.kroonY + r.range(-1, 1.5), z: midden.z + Math.sin(h) * v.kroonR * 0.55 };
    cilinder(mb, schors, { x: top.x * 0.4, y: vanY, z: top.z * 0.4 }, eind, v.stamR * 0.45, 0.06, 5);
  }
  // Donkere kern zodat de kroon niet doorzichtig oogt.
  const kern = `bladkern:${soort}`;
  const nU = laag ? 6 : 8, nV = laag ? 4 : 5;
  const pts: V3[] = [], nrm: V3[] = [], uv: [number, number][] = [], idx: number[] = [];
  for (let j = 0; j <= nV; j++) for (let i = 0; i <= nU; i++) {
    const th = (j / nV) * Math.PI, ph = (i / nU) * Math.PI * 2;
    const n = { x: Math.sin(th) * Math.cos(ph), y: Math.cos(th), z: Math.sin(th) * Math.sin(ph) };
    const k = 0.62 + 0.08 * Math.sin(ph * 3 + j);
    pts.push({ x: midden.x + n.x * v.kroonR * k, y: midden.y + n.y * v.kroonH * 0.55 * k, z: midden.z + n.z * v.kroonR * k });
    nrm.push(n); uv.push([i / nU, j / nV]);
  }
  for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) {
    const a = j * (nU + 1) + i, b = a + 1, c = a + nU + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  mb.ruw(kern, pts, nrm, uv, idx);
  // Bladtrossen: drie kruisende kaarten per tros, verdeeld over een ellipsoïde.
  for (let t = 0; t < (laag ? Math.ceil(v.trossen / 3) : v.trossen); t++) {
    const th = Math.acos(r.range(-0.55, 0.95)), ph = r.range(0, Math.PI * 2);
    const c = { x: midden.x + Math.sin(th) * Math.cos(ph) * v.kroonR * 0.72, y: midden.y + Math.cos(th) * v.kroonH * 0.5, z: midden.z + Math.sin(th) * Math.sin(ph) * v.kroonR * 0.72 };
    const s = v.kaart * r.range(0.8, 1.15);
    const a = r.range(0, Math.PI);
    const assen: [V3, V3][] = [
      [{ x: Math.cos(a), y: 0, z: Math.sin(a) }, { x: 0, y: 1, z: 0 }],
      [{ x: -Math.sin(a), y: 0, z: Math.cos(a) }, { x: 0, y: 1, z: 0 }],
      [{ x: Math.cos(a), y: 0, z: Math.sin(a) }, { x: -Math.sin(a), y: 0, z: Math.cos(a) }],
    ];
    for (const [p, q] of laag ? assen.slice(0, 2) : assen) kaart(mb, blad, c, p, q, (laag ? s * 1.25 : s) / 2, midden);
  }
  return mb.bouw();
}

export function lantaarnMesh(dubbel: boolean): MeshData {
  const mb = new MeshBouwer();
  cilinder(mb, 'paal', { x: 0, y: -0.2, z: 0 }, { x: 0, y: 7.2, z: 0 }, 0.09, 0.06, 6);
  for (const s of dubbel ? [1, -1] : [1]) {
    cilinder(mb, 'paal', { x: 0, y: 7.0, z: 0 }, { x: 0, y: 7.5, z: s * 1.4 }, 0.05, 0.045, 5);
    mb.blok('paal', 'paal', { x: 0, y: 0, z: s * 1.7 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.35, 0.7, 7.38, 7.55);
    mb.quad('lamp', { x: -0.15, y: 7.37, z: s * 1.4 }, { x: 0.15, y: 7.37, z: s * 1.4 }, { x: 0.15, y: 7.37, z: s * 2.0 }, { x: -0.15, y: 7.37, z: s * 2.0 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: -1, z: 0 });
  }
  return mb.bouw();
}

export const isBoom = (soort: string) => soort in VORM;

export function propMesh(soort: string, variant: number, laag = false): MeshData {
  if (soort === 'lantaarn') return lantaarnMesh(false);
  if (soort === 'lantaarnDubbel') return lantaarnMesh(true);
  return boomMesh(soort, variant, laag);
}
