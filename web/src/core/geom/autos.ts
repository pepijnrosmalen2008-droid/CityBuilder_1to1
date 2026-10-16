import { V3, lerp, clamp } from '../math';
import { MeshBouwer, MeshData, samenvoegen } from './mesh';
import { cilinder } from './props';
import type { VoertuigSoort } from '../verkeer/verkeer';

// ════════════════════════════════════════════════════════════════════════════════════
// VOERTUIGEN
// Procedurele, gladde carrosserieën: een onderbak (gelofte doorsneden met afgeronde hoeken,
// in bovenaanzicht afgerond aan neus en kont) en een cabine (taps toelopend, met glas in de
// zijvlakken, voorruit en achterruit en gelakte stijlen en dak). Wielen met band en velg,
// koplampen, achterlichten, grille, gele Nederlandse kentekenplaten en spiegels.
// Lokale assen: x = vooruit, y = omhoog, z = rechts. Oorsprong = midden op de grond.
// Materiaal 'autolak' krijgt de kleur per voertuig (instantiekleur in de render-laag).
// ════════════════════════════════════════════════════════════════════════════════════

interface Vorm {
  L: number; W: number; wb: number; r: number;
  /** Onderkant, hoogte van de neus (bumper/motorkap voor), gordellijn, dak. */
  bodem: number; neus: number; gordel: number; dak: number;
  /** Achterkant: hoogte van de kontklep (sedan) of gelijk aan de gordel (hatchback). */
  kont: number;
  /** Cabine (fracties van de lengte, 0 = achter, 1 = voor): achterruit onder/boven, voorruit boven/onder. */
  c0: number; c1: number; c2: number; c3: number;
  /** Alleen voor glas in de voorste helft (bestelbus). */
  zijglasTot?: number;
  /** Afronding van de hoeken in bovenaanzicht (hoger = hoekiger). */
  plan: number;
  /** Breedte van het dak t.o.v. de gordellijn (tumblehome). */
  dakBreed?: number;
  /** Afronding achter (standaard gelijk aan plan). */
  planAchter?: number;
}

type Personen = 'hatchback' | 'sedan' | 'stationwagen' | 'suv' | 'bestelbus';
const VORMEN: Record<Personen, Vorm> = {
  hatchback: { L: 4.15, W: 1.78, wb: 2.6, r: 0.31, bodem: 0.17, neus: 0.72, gordel: 0.92, dak: 1.46, kont: 0.95, c0: 0.04, c1: 0.2, c2: 0.62, c3: 0.73, plan: 6 },
  sedan: { L: 4.75, W: 1.83, wb: 2.85, r: 0.32, bodem: 0.16, neus: 0.7, gordel: 0.9, dak: 1.44, kont: 0.98, c0: 0.14, c1: 0.28, c2: 0.6, c3: 0.71, plan: 7 },
  stationwagen: { L: 4.8, W: 1.83, wb: 2.85, r: 0.32, bodem: 0.17, neus: 0.72, gordel: 0.93, dak: 1.48, kont: 0.97, c0: 0.03, c1: 0.06, c2: 0.6, c3: 0.71, plan: 7 },
  suv: { L: 4.6, W: 1.9, wb: 2.75, r: 0.37, bodem: 0.24, neus: 0.92, gordel: 1.12, dak: 1.7, kont: 1.15, c0: 0.04, c1: 0.1, c2: 0.62, c3: 0.72, plan: 6 },
  bestelbus: { L: 5.3, W: 2.0, wb: 3.3, r: 0.34, bodem: 0.2, neus: 1.0, gordel: 1.18, dak: 2.35, kont: 1.18, c0: 0.0, c1: 0.0, c2: 0.76, c3: 0.86, plan: 10, planAchter: 40, zijglasTot: 0.64, dakBreed: 0.95 },
};

/** Breedte in bovenaanzicht op lengtefractie u (0 = achter, 1 = voor). */
function plan(v: Vorm, u: number) {
  const t = Math.abs(u - 0.5) / 0.5;
  const e = u < 0.5 ? v.planAchter ?? v.plan : v.plan;
  return v.W * Math.pow(Math.max(0, 1 - Math.pow(t, e)), 1 / e);
}

/** Bovenkant van de onderbak (motorkap, gordellijn, kofferklep) op lengtefractie u. */
function onderTop(v: Vorm, u: number) {
  if (u > v.c3) return lerp(v.gordel, v.neus, smooth((u - v.c3) / (1 - v.c3)));
  if (u < v.c0) return lerp(v.kont, v.gordel, smooth(u / Math.max(1e-6, v.c0)));
  return v.gordel;
}
const smooth = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/** Cabinehoogte op u (tussen c0 en c3). */
function cabineTop(v: Vorm, u: number) {
  if (u <= v.c0 || u >= v.c3) return onderTop(v, u);
  if (u < v.c1) return lerp(onderTop(v, v.c0), v.dak, (u - v.c0) / Math.max(1e-6, v.c1 - v.c0));
  if (u > v.c2) return lerp(v.dak, onderTop(v, v.c3), (u - v.c2) / (v.c3 - v.c2));
  // Lichte welving van het dak.
  return v.dak - 0.03 * Math.pow((u - (v.c1 + v.c2) / 2) / ((v.c2 - v.c1) / 2 + 1e-6), 2);
}

/**
 * Loft: ringen van punten (allemaal even lang, gesloten), met gladde normalen. `mat(i, j)` geeft
 * het materiaal van het vlak tussen ring i en i+1 en punt j en j+1. `as` = punt binnenin per ring
 * (voor de oriëntatie naar buiten).
 */
function loft(mb: MeshBouwer, ringen: V3[][], as: V3[], mat: (i: number, j: number) => string, gesloten = true) {
  const nI = ringen.length, nJ = ringen[0].length;
  const nrm: V3[][] = ringen.map(r => r.map(() => ({ x: 0, y: 0, z: 0 })));
  const jMax = gesloten ? nJ : nJ - 1;
  const vlakken: { i: number; j: number; n: V3 }[] = [];
  for (let i = 0; i < nI - 1; i++) for (let j = 0; j < jMax; j++) {
    const j2 = (j + 1) % nJ;
    const a = ringen[i][j], b = ringen[i + 1][j], c = ringen[i + 1][j2], d = ringen[i][j2];
    // Normaal via de diagonalen; naar buiten t.o.v. de as.
    const e1 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }, e2 = { x: d.x - b.x, y: d.y - b.y, z: d.z - b.z };
    let n = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
    const m = { x: (a.x + c.x) / 2 - as[i].x, y: (a.y + c.y) / 2 - as[i].y, z: (a.z + c.z) / 2 - as[i].z };
    if (n.x * m.x + n.y * m.y + n.z * m.z < 0) n = { x: -n.x, y: -n.y, z: -n.z };
    const l = Math.hypot(n.x, n.y, n.z) || 1; n = { x: n.x / l, y: n.y / l, z: n.z / l };
    vlakken.push({ i, j, n });
    for (const [ii, jj] of [[i, j], [i + 1, j], [i + 1, j2], [i, j2]]) { const q = nrm[ii][jj]; q.x += n.x; q.y += n.y; q.z += n.z; }
  }
  for (const r of nrm) for (const q of r) { const l = Math.hypot(q.x, q.y, q.z) || 1; q.x /= l; q.y /= l; q.z /= l; }
  for (const { i, j, n } of vlakken) {
    const j2 = (j + 1) % nJ;
    const p = [ringen[i][j], ringen[i + 1][j], ringen[i + 1][j2], ringen[i][j2]];
    const q = [nrm[i][j], nrm[i + 1][j], nrm[i + 1][j2], nrm[i][j2]];
    // Wikkeling zo dat de voorkant naar buiten (n) wijst.
    const cr = { x: (p[1].y - p[0].y) * (p[2].z - p[0].z) - (p[1].z - p[0].z) * (p[2].y - p[0].y), y: (p[1].z - p[0].z) * (p[2].x - p[0].x) - (p[1].x - p[0].x) * (p[2].z - p[0].z), z: (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[1].y - p[0].y) * (p[2].x - p[0].x) };
    const goed = cr.x * n.x + cr.y * n.y + cr.z * n.z >= 0;
    mb.ruw(mat(i, j), p, q, [[0, 0], [1, 0], [1, 1], [0, 1]], goed ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  }
}

/** Afgeronde rechthoek als doorsnede (kloksgewijs van onder-midden, rechts omhoog, links omlaag). */
function doorsnede(x: number, w: number, y0: number, y1: number, rO: number, rB: number, k: number, ys?: number): V3[] {
  const h = w / 2, pts: V3[] = [];
  const hoek = (cz: number, cy: number, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= k; i++) { const a = lerp(a0, a1, i / k); pts.push({ x, y: cy + Math.sin(a) * r, z: cz + Math.cos(a) * r }); }
  };
  rO = Math.min(rO, h * 0.9, (y1 - y0) * 0.3); rB = Math.min(rB, h * 0.9, (y1 - y0) * 0.3);
  // Optioneel een extra punt op de zijkant (scheiding dorpel/bumper en lak).
  const split = ys === undefined ? null : clamp(ys, y0 + rO + 0.005, y1 - rB - 0.005);
  hoek(h - rO, y0 + rO, rO, -Math.PI / 2, 0);
  if (split !== null) pts.push({ x, y: split, z: h });
  hoek(h - rB, y1 - rB, rB, 0, Math.PI / 2);
  hoek(-h + rB, y1 - rB, rB, Math.PI / 2, Math.PI);
  if (split !== null) pts.push({ x, y: split, z: -h });
  hoek(-h + rO, y0 + rO, rO, Math.PI, Math.PI * 1.5);
  return pts;
}

/** Cabinedoorsnede: taps (tumblehome), afgeronde bovenhoeken. Punten: 0..k rechts onder → boven, dan links. */
function cabineDoorsnede(x: number, wOnder: number, wBoven: number, y0: number, y1: number, r: number, k: number): V3[] {
  const pts: V3[] = [];
  const hb = wBoven / 2, ho = wOnder / 2;
  r = Math.min(r, hb * 0.8, (y1 - y0) * 0.45);
  pts.push({ x, y: y0, z: ho });
  for (let i = 0; i <= k; i++) { const a = lerp(0, Math.PI / 2, i / k); pts.push({ x, y: y1 - r + Math.sin(a) * r, z: hb - r + Math.cos(a) * r }); }
  for (let i = 0; i <= k; i++) { const a = lerp(Math.PI / 2, Math.PI, i / k); pts.push({ x, y: y1 - r + Math.sin(a) * r, z: -hb + r + Math.cos(a) * r }); }
  pts.push({ x, y: y0, z: -ho });
  return pts;
}

export type VelgStijl = 'spaak5' | 'spaak10' | 'spaak6' | 'staal' | 'vracht';

/** Een wiel van een voertuig (plek in voertuigcoördinaten). */
export interface WielPlek { x: number; z: number; r: number; b: number; laag: boolean; stijl: VelgStijl }
/** Als dit gezet is, tekent wiel() niets maar onthoudt het de plek (losse, draaiende wielen). */
let VERZAMEL: WielPlek[] | null = null;

/** Voertuig zonder wielen plus de plekken van de wielen (de render-laag laat ze draaien). */
export function voertuigZonderWielen(soort: VoertuigSoort, laag = false): { mesh: MeshData; wielen: WielPlek[] } {
  VERZAMEL = [];
  try { const mesh = voertuigMesh(soort, laag); return { mesh, wielen: VERZAMEL }; } finally { VERZAMEL = null; }
}

/** Los wiel met de as door de oorsprong (as langs z; buitenkant naar +z bij kant 1). */
export function losWiel(w: WielPlek, kant: 1 | -1): MeshData {
  const mb = new MeshBouwer();
  wiel(mb, 0, kant * 1e-4, w.r, w.b, w.laag, w.stijl);
  const m = mb.bouw();
  for (const g of m.groepen) for (let i = 1; i < g.posities.length; i += 3) g.posities[i] -= w.r;
  return m;
}

/**
 * Wiel: band als omwentelingslichaam (bolle zijwand, afgerond loopvlak), verdiepte velg met
 * spaken, naafdop, remschijf en remklauw erachter. x, z = midden van het wiel; de buitenkant
 * wijst naar het teken van z.
 */
function wiel(mb: MeshBouwer, x: number, z: number, r: number, b: number, laag: boolean, stijl: VelgStijl = 'spaak5') {
  if (VERZAMEL) { VERZAMEL.push({ x, z, r, b, laag, stijl }); return; }
  const kant = Math.sign(z) || 1;
  const N = laag ? 8 : 22;
  const P = (rho: number, a: number, hoek: number): V3 => ({ x: x + Math.cos(hoek) * rho, y: r + Math.sin(hoek) * rho, z: z + kant * a });
  // Bandprofiel (straal, axiale positie), van binnen naar buiten.
  const prof: [number, number][] = laag
    ? [[0.68 * r, -b / 2], [r, -b / 2], [r, b / 2], [0.68 * r, b / 2]]
    : [[0.68 * r, -b / 2 + 0.01], [0.8 * r, -b / 2 - 0.006], [0.92 * r, -b / 2 + 0.004], [0.985 * r, -b / 2 + 0.03], [r, -b / 2 + 0.06], [r, b / 2 - 0.06], [0.985 * r, b / 2 - 0.03], [0.92 * r, b / 2 - 0.004], [0.8 * r, b / 2 + 0.006], [0.68 * r, b / 2 - 0.01]];
  // Normaal per profielpunt (loodrecht op het profiel, naar buiten).
  const pn = prof.map((_, i) => {
    const a = prof[Math.max(0, i - 1)], c = prof[Math.min(prof.length - 1, i + 1)];
    let dr = c[0] - a[0], da = c[1] - a[1];
    const l = Math.hypot(dr, da) || 1; dr /= l; da /= l;
    // Loodrecht: (da, -dr) wijst naar buiten (grotere straal) op het loopvlak.
    return [da, -dr] as [number, number];
  });
  for (let i = 0; i < N; i++) {
    const h0 = (i / N) * Math.PI * 2, h1 = ((i + 1) / N) * Math.PI * 2;
    for (let j = 0; j < prof.length - 1; j++) {
      const pts = [P(prof[j][0], prof[j][1], h0), P(prof[j][0], prof[j][1], h1), P(prof[j + 1][0], prof[j + 1][1], h1), P(prof[j + 1][0], prof[j + 1][1], h0)];
      const nr = (k: number, h: number): V3 => ({ x: Math.cos(h) * pn[k][0], y: Math.sin(h) * pn[k][0], z: kant * pn[k][1] });
      const nrm = [nr(j, h0), nr(j, h1), nr(j + 1, h1), nr(j + 1, h0)];
      const m = { x: (pts[0].x + pts[2].x) / 2 - x, y: (pts[0].y + pts[2].y) / 2 - r, z: 0 };
      const n0 = { x: nrm[0].x + nrm[2].x, y: nrm[0].y + nrm[2].y, z: nrm[0].z + nrm[2].z };
      void m;
      const cr = { x: (pts[1].y - pts[0].y) * (pts[2].z - pts[0].z) - (pts[1].z - pts[0].z) * (pts[2].y - pts[0].y), y: (pts[1].z - pts[0].z) * (pts[2].x - pts[0].x) - (pts[1].x - pts[0].x) * (pts[2].z - pts[0].z), z: (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) - (pts[1].y - pts[0].y) * (pts[2].x - pts[0].x) };
      const goed = cr.x * n0.x + cr.y * n0.y + cr.z * n0.z >= 0;
      mb.ruw('rubber', pts, nrm, [[0, 0], [1, 0], [1, 1], [0, 1]], goed ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    }
  }
  // Vlakke ring/schijf op axiale positie a, tussen straal r0 en r1, met normaal naar buiten.
  const ring = (mat: string, a: number, r0: number, r1: number, n = N) => {
    const buiten = { x: 0, y: 0, z: kant };
    for (let i = 0; i < n; i++) {
      const h0 = (i / n) * Math.PI * 2, h1 = ((i + 1) / n) * Math.PI * 2;
      if (r0 < 1e-4) mb.driehoek(mat, P(0, a, 0), P(r1, a, h0), P(r1, a, h1), [0, 0], [1, 0], [1, 1], buiten);
      else mb.quad(mat, P(r0, a, h0), P(r1, a, h0), P(r1, a, h1), P(r0, a, h1), [0, 0], [1, 0], [1, 1], [0, 1], buiten);
    }
  };
  const voor = b / 2;
  if (laag) { ring(stijl === 'staal' || stijl === 'vracht' ? 'velgDonker' : 'velg', voor - 0.02, 0, 0.68 * r, N); return; }
  const velgMat = stijl === 'staal' ? 'velgDonker' : 'velg';
  // Velgrand (lip) en verdiepte bedding.
  ring(velgMat, voor - 0.012, 0.6 * r, 0.69 * r);
  const bed = (a0: number, a1: number, rr: number) => {
    for (let i = 0; i < N; i++) {
      const h0 = (i / N) * Math.PI * 2, h1 = ((i + 1) / N) * Math.PI * 2;
      const n0 = { x: -Math.cos(h0), y: -Math.sin(h0), z: 0 };
      mb.quad(velgMat, P(rr, a0, h0), P(rr, a1, h0), P(rr, a1, h1), P(rr, a0, h1), [0, 0], [1, 0], [1, 1], [0, 1], n0);
    }
  };
  bed(voor - 0.012, voor - 0.09, 0.6 * r);
  // Achter de spaken: donker, met remschijf en klauw.
  ring('wielkast', voor - 0.1, 0, 0.6 * r);
  ring('remschijf', voor - 0.085, 0.16 * r, 0.5 * r);
  const klauwH = Math.PI * 0.8;
  const kc = P(0.47 * r, voor - 0.07, klauwH);
  mb.blok(stijl === 'spaak10' ? 'remklauw' : 'autotrim', stijl === 'spaak10' ? 'remklauw' : 'autotrim', { x: kc.x, y: 0, z: kc.z }, { x: -Math.sin(klauwH), y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.12 * r * 2, 0.05, kc.y - 0.07, kc.y + 0.07, true);
  // Spaken.
  const spaken = stijl === 'spaak10' ? 10 : stijl === 'spaak6' ? 6 : stijl === 'staal' || stijl === 'vracht' ? 0 : 5;
  const breedte = stijl === 'spaak10' ? 0.06 * r : 0.13 * r;
  for (let i = 0; i < spaken; i++) {
    const h = (i / spaken) * Math.PI * 2 + (stijl === 'spaak10' ? (i % 2) * 0.12 : 0) + 0.3;
    const t = { x: -Math.sin(h), y: Math.cos(h) }; // dwars op de spaak
    const pt = (rho: number, w: number, a: number): V3 => { const p = P(rho, a, h); return { x: p.x + t.x * w, y: p.y + t.y * w, z: p.z }; };
    const a0 = voor - 0.01, a1 = voor - 0.075;
    const binnen = 0.17 * r, buiten = 0.6 * r, wB = breedte * 0.75, wU = breedte * 0.5;
    // Voorkant (licht gebogen: midden iets naar voren) en zijkanten.
    mb.quad(velgMat, pt(binnen, -wB, a0), pt(buiten, -wU, a0 - 0.015), pt(buiten, wU, a0 - 0.015), pt(binnen, wB, a0), [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: kant });
    for (const sg of [-1, 1]) mb.quad(velgMat, pt(binnen, sg * wB, a0), pt(buiten, sg * wU, a0 - 0.015), pt(buiten, sg * wU, a1), pt(binnen, sg * wB, a1), [0, 0], [1, 0], [1, 1], [0, 1], { x: t.x * sg, y: t.y * sg, z: 0 });
  }
  if (stijl === 'staal' || stijl === 'vracht') {
    // Stalen velg: gesloten schijf met ventilatiegaten (donker) en een grote naaf.
    ring(velgMat, voor - 0.04, 0.16 * r, 0.6 * r);
    for (let i = 0; i < 8; i++) {
      const h = (i / 8) * Math.PI * 2;
      const c = P(0.42 * r, voor - 0.038, h);
      const g = 0.05 * r;
      mb.quad('wielkast', { x: c.x - g, y: c.y - g, z: c.z }, { x: c.x + g, y: c.y - g, z: c.z }, { x: c.x + g, y: c.y + g, z: c.z }, { x: c.x - g, y: c.y + g, z: c.z }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: kant });
    }
  }
  // Naaf met naafdop.
  ring(velgMat, voor - 0.006, 0, 0.17 * r, 12);
  ring('autotrim', voor - 0.004, 0, 0.06 * r, 10);
}

/** Kastje (lampen, platen, spiegels). */
function kastje(mb: MeshBouwer, mat: string, c: V3, lx: number, ly: number, lz: number) {
  mb.blok(mat, mat, { x: c.x, y: 0, z: c.z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, lx, lz, c.y - ly / 2, c.y + ly / 2, true);
}

function personenauto(soort: keyof typeof VORMEN, laag: boolean): MeshData {
  const v = VORMEN[soort];
  const mb = new MeshBouwer();
  const nU = laag ? 7 : 22, k = laag ? 1 : 3;
  const xVan = (u: number) => (u - 0.5) * v.L;
  // Wielen en wielkasten.
  const off = soort === 'bestelbus' ? 0.25 : 0.1;
  const wielX = [-v.wb / 2 + off, v.wb / 2 + off];
  const boogR = v.r + 0.06;
  /** Onderkant van de carrosserie: boven elk wiel uitgespaard als een boog. */
  const onderkant = (x: number) => {
    let y = v.bodem;
    for (const xw of wielX) {
      const d = Math.abs(x - xw);
      if (d < boogR) y = Math.max(y, v.r + Math.sqrt(boogR * boogR - d * d) * 0.98);
      else if (d < boogR + 0.04) y = Math.max(y, lerp(v.r, v.bodem, (d - boogR) / 0.04));
    }
    return y;
  };
  // Onderbak: dwarsdoorsneden dicht bij de uiteinden en rond de wielkasten.
  const us: number[] = [];
  // Niet helemaal tot 0 en 1: daar lopen de doorsneden samen tot een lijn (donkere naad in het midden).
  for (let i = 0; i <= nU; i++) us.push(lerp(0.0025, 0.9975, 0.5 - 0.5 * Math.cos(i / nU * Math.PI)));
  if (!laag) for (const xw of wielX) for (let i = 0; i <= 14; i++) {
    const x = xw + (i / 14 * 2 - 1) * (boogR + 0.03);
    us.push(x / v.L + 0.5);
  }
  us.sort((a, b) => a - b);
  const uniek = us.filter((u, i) => i === 0 || u - us[i - 1] > 0.002);
  const bumper = (u: number) => u < 0.07 || u > 0.93;
  const ringen = uniek.map(u => {
    const x = xVan(u), y0 = laag ? v.bodem : onderkant(x);
    return doorsnede(x, Math.max(0.05, plan(v, u)), y0, onderTop(v, u), 0.1, laag ? 0.1 : 0.16, k, laag ? undefined : (bumper(u) ? v.bodem + 0.24 : y0 > v.bodem + 0.01 ? y0 + 0.02 : v.bodem + 0.14));
  });
  const as = uniek.map(u => ({ x: xVan(u), y: (v.bodem + onderTop(v, u)) / 2, z: 0 }));
  // Ringindeling: boog rechtsonder (0..k), splitspunt (k+1), ..., splitspunt links (3k+4), boog linksonder.
  loft(mb, ringen, as, (_i, j) => laag ? 'autolak' : (j <= k || j >= 3 * k + 4 ? 'autotrim' : 'autolak'));
  // Kopse kanten dicht (achter en voor).
  for (const [i, uit] of [[0, -1], [ringen.length - 1, 1]] as const) {
    const r = ringen[i], c = as[i];
    for (let j = 0; j < r.length; j++) { const a = r[j], b = r[(j + 1) % r.length]; mb.driehoek(!laag && (a.y < v.bodem + 0.2 || b.y < v.bodem + 0.2) ? 'autotrim' : 'autolak', c, a, b, [0, 0], [1, 0], [1, 1], { x: uit, y: 0, z: 0 }); }
  }
  // Wielkastvoering: donkere halve cilinder in de uitsparing.
  if (!laag) for (const xw of wielX) for (const s of [-1, 1]) {
    const zb = plan(v, xw / v.L + 0.5) / 2;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n;
      const p = (a: number, z: number) => ({ x: xw + Math.cos(a) * boogR * 0.98, y: v.r + Math.sin(a) * boogR * 0.98, z });
      const m = (a0 + a1) / 2;
      mb.quad('wielkast', p(a0, s * (zb - 0.01)), p(a1, s * (zb - 0.01)), p(a1, s * (zb - 0.42)), p(a0, s * (zb - 0.42)), [0, 0], [1, 0], [1, 1], [0, 1], { x: -Math.cos(m), y: -Math.sin(m), z: 0 });
    }
  }
  // Cabine: van c0 tot c3, met glas in de zijkant (behalve de B-stijl), voorruit en achterruit.
  const cu: number[] = [];
  const nC = laag ? 4 : 16;
  for (let i = 0; i <= nC; i++) cu.push(lerp(v.c0 + 0.005, v.c3 - 0.005, i / nC));
  const bStijl = (v.c1 + v.c2) / 2 + 0.03;
  if (!laag) { cu.push(...[bStijl - 0.012, bStijl + 0.012, v.c1, v.c2].filter(u => u > v.c0 + 0.01 && u < v.c3 - 0.01)); cu.sort((a, b) => a - b); }
  const cr = cu.map(u => {
    const w = plan(v, u) - 0.02;
    return cabineDoorsnede(xVan(u), w * 0.97, w * (v.dakBreed ?? 0.8), onderTop(v, u) - 0.02, Math.max(onderTop(v, u) + 0.01, cabineTop(v, u)), laag ? 0.06 : 0.12, k);
  });
  // As midden in de cabinedoorsnede: bij voor- en achterruit is de cabine laag; een vast punt erboven
  // zou die vlakken binnenstebuiten zetten (dan zie je door de ruit heen).
  const cas = cu.map(u => ({ x: xVan(u), y: (onderTop(v, u) - 0.02 + Math.max(onderTop(v, u) + 0.01, cabineTop(v, u))) / 2 - 0.05, z: 0 }));
  loft(mb, cr, cas, (i, j) => {
    const u = (cu[i] + cu[i + 1]) / 2;
    const zij = j === 0 || j === cr[0].length - 2; // rechter en linker zijvlak
    const boven = j === k + 1; // dak / voorruit / achterruit (tussen de afgeronde hoeken)
    const voorruit = u > v.c2 + 0.004, achterruit = u < v.c1 - 0.004 && v.c1 > v.c0 + 0.02;
    if (zij) {
      if (v.zijglasTot !== undefined && u < v.zijglasTot) return 'autolak';
      if (Math.abs(u - bStijl) < 0.014) return 'autotrim';
      if (u < v.c0 + 0.03 || u > v.c3 - 0.03) return 'autolak';
      return 'autoglas';
    }
    if (boven) return voorruit || achterruit ? 'autoglas' : 'autolak';
    return 'autolak'; // A-, C-stijlen en dakrand
  }, false);
  // Kopse kanten van de cabine dicht (bij een bestelbus is de achterkant een hoge wand).
  for (const [i, uit] of [[0, -1], [cr.length - 1, 1]] as const) {
    const r = cr[i];
    const c = { x: r[0].x, y: (r[0].y + Math.max(...r.map(p => p.y))) / 2, z: 0 };
    for (let j = 0; j < r.length - 1; j++) mb.driehoek(uit > 0 ? 'autoglas' : 'autolak', c, r[j], r[j + 1], [0, 0], [1, 0], [1, 1], { x: uit, y: 0, z: 0 });
    mb.driehoek('autolak', c, r[r.length - 1], r[0], [0, 0], [1, 0], [1, 1], { x: uit, y: 0, z: 0 });
  }
  // Wielen.
  const zW = v.W / 2 - 0.135;
  const stijl: VelgStijl = soort === 'bestelbus' ? 'staal' : soort === 'suv' ? 'spaak6' : soort === 'sedan' ? 'spaak10' : 'spaak5';
  for (const x of wielX) for (const z of [-zW, zW]) wiel(mb, x, z, v.r, soort === 'suv' ? 0.24 : 0.22, laag, stijl);
  if (laag) return mb.bouw();
  // Lampen, grille, platen, spiegels: vlak op de carrosserie (steken een centimeter uit).
  const xV = v.L / 2, xA = -v.L / 2;
  const voorX = (z: number) => { let u = 1; while (u > 0.5 && plan(v, u) / 2 < Math.abs(z)) u -= 0.0025; return xVan(u); };
  const achterX = (z: number) => { let u = 0; while (u < 0.5 && plan(v, u) / 2 < Math.abs(z)) u += 0.0025; return xVan(u); };
  const zijZ = (x: number) => plan(v, x / v.L + 0.5) / 2;
  const hL = v.neus - 0.11;
  const hA = soort === 'bestelbus' ? 0.95 : Math.min(v.kont, v.gordel) - 0.1;
  for (const s of [-1, 1]) {
    // Koplamp: donkere behuizing, lens in twee stukjes en een led-dagrijlicht erboven.
    { const zm = s * (v.W / 2 - 0.44); kastje(mb, 'autotrim', { x: voorX(zm) - 0.03, y: hL, z: zm }, 0.05, 0.17, 0.37); kastje(mb, 'koplamp', { x: voorX(zm) - 0.014, y: hL + 0.078, z: zm }, 0.03, 0.022, 0.33); }
    for (const [z0, z1] of [[0.28, 0.45], [0.45, 0.6]]) {
      const zm = s * (v.W / 2 - (z0 + z1) / 2);
      kastje(mb, 'koplamp', { x: voorX(zm) - 0.035, y: hL, z: zm }, 0.06, 0.12, z1 - z0 + 0.01);
    }
    // Achterlicht: breed, loopt een stukje om de hoek.
    for (const [z0, z1] of [[0.12, 0.32], [0.32, 0.55]]) {
      const zm = s * (v.W / 2 - (z0 + z1) / 2);
      kastje(mb, 'achterlicht', { x: achterX(zm) + 0.035, y: hA, z: zm }, 0.06, soort === 'bestelbus' ? 0.42 : 0.15, z1 - z0 + 0.01);
    }
    // Spiegel tegen de deur, met een steuntje.
    const xm = xVan(v.c3) - 0.12, zb = zijZ(xm) - 0.03;
    kastje(mb, 'autolak', { x: xm, y: v.gordel + 0.13, z: s * (zb + 0.11) }, 0.09, 0.11, 0.15);
    kastje(mb, 'autoglas', { x: xm - 0.046, y: v.gordel + 0.13, z: s * (zb + 0.11) }, 0.006, 0.085, 0.12);
    kastje(mb, 'autotrim', { x: xm + 0.01, y: v.gordel + 0.06, z: s * (zb + 0.04) }, 0.06, 0.04, 0.1);
    // Deurnaden en deurgrepen.
    const deuren = soort === 'bestelbus' ? [xVan(v.zijglasTot ?? 0.6)] : [xVan(v.c3) + 0.02, xVan((v.c1 + v.c2) / 2 + 0.03), ...(soort === 'hatchback' ? [] : [xVan(v.c1) + 0.08])];
    for (const xd of deuren) {
      const z = s * (zijZ(xd) + 0.004);
      mb.quad('autotrim', { x: xd - 0.008, y: v.bodem + 0.18, z }, { x: xd + 0.008, y: v.bodem + 0.18, z }, { x: xd + 0.008, y: v.gordel - 0.03, z }, { x: xd - 0.008, y: v.gordel - 0.03, z }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
      kastje(mb, 'velg', { x: xd - 0.3, y: v.gordel - 0.12, z: s * (zijZ(xd - 0.3) + 0.01) }, 0.18, 0.03, 0.02);
    }
  }
  // Grille, kentekenplaten, bumpers.
  kastje(mb, 'autotrim', { x: voorX(0) - 0.035, y: hL - 0.16, z: 0 }, 0.06, 0.2, v.W * 0.4);
  kastje(mb, 'kenteken', { x: voorX(0) - 0.012, y: v.bodem + 0.24, z: 0 }, 0.03, 0.11, 0.52);
  kastje(mb, 'kenteken', { x: achterX(0) + 0.012, y: soort === 'bestelbus' ? 0.55 : v.bodem + 0.4, z: 0 }, 0.03, 0.11, 0.52);
  // Chromen lijst langs de onderkant van de zijruiten.
  for (const s of [-1, 1]) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const u0 = lerp(v.c0 + 0.03, v.c3 - 0.03, i / n), u1 = lerp(v.c0 + 0.03, v.c3 - 0.03, (i + 1) / n);
      if (v.zijglasTot !== undefined && u1 < v.zijglasTot) continue;
      const z0 = s * ((plan(v, u0) - 0.02) * 0.97 / 2 + 0.004), z1 = s * ((plan(v, u1) - 0.02) * 0.97 / 2 + 0.004);
      const y0 = onderTop(v, u0), y1 = onderTop(v, u1);
      mb.quad('chroom', { x: xVan(u0), y: y0 - 0.005, z: z0 }, { x: xVan(u1), y: y1 - 0.005, z: z1 }, { x: xVan(u1), y: y1 + 0.02, z: z1 }, { x: xVan(u0), y: y0 + 0.02, z: z0 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
    }
  }
  // ── Details ──
  const hatch = soort !== 'sedan' && soort !== 'bestelbus';
  // Luchthapper onderin de bumper met mistlampen, chromen lat en logo op de grille.
  kastje(mb, 'autotrim', { x: voorX(0) - 0.03, y: v.bodem + 0.13, z: 0 }, 0.06, 0.1, v.W * 0.52);
  for (const s of [-1, 1]) kastje(mb, 'koplamp', { x: voorX(s * (v.W / 2 - 0.22)) - 0.02, y: v.bodem + 0.14, z: s * (v.W / 2 - 0.22) }, 0.04, 0.05, 0.12);
  kastje(mb, 'chroom', { x: voorX(0) - 0.012, y: hL - 0.12, z: 0 }, 0.03, 0.016, v.W * 0.38);
  kastje(mb, 'chroom', { x: voorX(0) - 0.006, y: hL - 0.05, z: 0 }, 0.02, 0.07, 0.1);
  // Achter: doorlopende lichtbalk (moderne hatchbacks, stationwagens, SUV's), logo, uitlaat.
  if (hatch) kastje(mb, 'achterlicht', { x: achterX(0) + 0.022, y: hA + 0.045, z: 0 }, 0.03, 0.026, v.W * 0.62);
  kastje(mb, 'chroom', { x: achterX(0) + 0.008, y: hA - 0.07, z: 0 }, 0.02, 0.06, 0.09);
  if (soort !== 'bestelbus') {
    const zU = v.W / 2 - 0.42;
    cilinder(mb, 'chroom', { x: xA + 0.3, y: v.bodem + 0.06, z: zU }, { x: achterX(zU) - 0.02, y: v.bodem + 0.06, z: zU }, 0.035, 0.035, 8);
    if (soort === 'sedan' || soort === 'suv') cilinder(mb, 'chroom', { x: xA + 0.3, y: v.bodem + 0.06, z: -zU }, { x: achterX(-zU) - 0.02, y: v.bodem + 0.06, z: -zU }, 0.035, 0.035, 8);
  }
  // Ruitenwisser op de achterruit.
  if (hatch && v.c1 > v.c0 + 0.015) {
    const u = v.c0 + (v.c1 - v.c0) * 0.3;
    kastje(mb, 'autotrim', { x: xVan(u) + 0.02, y: cabineTop(v, u) + 0.012, z: -0.08 }, 0.03, 0.018, 0.42);
  }
  // Haaienvin-antenne achter op het dak.
  { const u = v.c1 + 0.05; const y = cabineTop(v, u); kastje(mb, 'autotrim', { x: xVan(u), y: y + 0.025, z: 0 }, 0.16, 0.05, 0.06); kastje(mb, 'autotrim', { x: xVan(u) + 0.02, y: y + 0.06, z: 0 }, 0.08, 0.03, 0.04); }
  // Dakrails (stationwagen, SUV).
  if (soort === 'stationwagen' || soort === 'suv') for (const s of [-1, 1]) {
    const n = 8, u0 = v.c1 + 0.02, u1 = v.c2 - 0.03;
    for (let i = 0; i < n; i++) {
      const ua = lerp(u0, u1, i / n), ub = lerp(u0, u1, (i + 1) / n), um = (ua + ub) / 2;
      const zr = s * ((plan(v, um) - 0.02) * (v.dakBreed ?? 0.8) / 2 - 0.09);
      kastje(mb, i === 0 || i === n - 1 ? 'autotrim' : 'chroom', { x: xVan(um), y: cabineTop(v, um) + 0.05, z: zr }, xVan(ub) - xVan(ua) + 0.01, 0.025, 0.035);
    }
    for (const u of [u0 + 0.01, u1 - 0.01]) kastje(mb, 'autotrim', { x: xVan(u), y: cabineTop(v, u) + 0.025, z: s * ((plan(v, u) - 0.02) * (v.dakBreed ?? 0.8) / 2 - 0.09) }, 0.08, 0.05, 0.045);
  }
  // SUV: zwarte wielkastranden en een beschermlijst onderlangs.
  if (soort === 'suv') for (const s of [-1, 1]) {
    for (const xw of wielX) {
      const zb = s * (plan(v, xw / v.L + 0.5) / 2 + 0.006), n = 12, r0 = boogR + 0.005, r1 = boogR + 0.075;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n;
        const p = (a: number, r: number) => ({ x: xw + Math.cos(a) * r, y: v.r + Math.sin(a) * r, z: zb });
        mb.quad('autotrim', p(a0, r0), p(a0, r1), p(a1, r1), p(a1, r0), [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
      }
    }
    const x0 = wielX[0] + boogR + 0.08, x1 = wielX[1] - boogR - 0.08;
    kastje(mb, 'autotrim', { x: (x0 + x1) / 2, y: v.bodem + 0.12, z: s * (zijZ((x0 + x1) / 2) + 0.004) }, x1 - x0, 0.12, 0.02);
  }
  void xV; void xA;
  return mb.bouw();
}

/**
 * Bakwagen (zoals een DAF/Volvo-distributietruck): cabine voorover met grote voorruit, grille, zonneklep,
 * windkap, spiegels en opstappen; chassisbalken, dieseltank, dubbel gemonteerde achterwielen met
 * spatborden en zijafscherming; laadbak met hoekprofielen, ribben en achterdeuren.
 */
function vrachtwagen(laag: boolean, brandweer = false): MeshData {
  const mb = new MeshBouwer();
  const L = 9.6, W = 2.5;
  const cabL = 2.25, xF = L / 2, xR = xF - cabL;
  const cabY0 = 1.05, cabY1 = 3.3;
  const k = laag ? 1 : 3;
  const xVoorWiel = L / 2 - 1.35, achter = [-L / 2 + 2.6, -L / 2 + 1.25];
  // Cabine: gelofte doorsneden, voorkant iets naar achteren hellend en afgerond.
  const n = laag ? 2 : 8;
  const ringen: V3[][] = [], as: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = lerp(xR, xF, u);
    const terug = u > 0.8 ? (u - 0.8) / 0.2 : 0;
    ringen.push(doorsnede(x, W - terug * terug * 0.14, cabY0, cabY1 - terug * terug * 0.12, 0.12, 0.28, k));
    as.push({ x, y: (cabY0 + cabY1) / 2, z: 0 });
  }
  loft(mb, ringen, as, () => 'autolak');
  for (const [i, uit] of [[0, -1], [ringen.length - 1, 1]] as const) {
    const r = ringen[i], c = as[i];
    for (let j = 0; j < r.length; j++) mb.driehoek('autolak', c, r[j], r[(j + 1) % r.length], [0, 0], [1, 0], [1, 1], { x: uit, y: 0, z: 0 });
  }
  // Chassis: twee balken over de hele lengte.
  for (const z of [-0.45, 0.45]) kastje(mb, 'autotrim', { x: -0.3, y: 0.82, z }, L - 1.2, 0.28, 0.12);
  // Laadbak (dichte opbouw).
  const bakX0 = -L / 2, bakX1 = xR - 0.2, bakL = bakX1 - bakX0, bakY0 = 1.05, bakY1 = brandweer ? 3.15 : 3.8;
  const bakMat = brandweer ? 'autolak' : 'laadbak';
  mb.blok(bakMat, bakMat, { x: (bakX0 + bakX1) / 2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, bakL, W, bakY0, bakY1, true);
  // Wielen: voor enkel, achter tandem met dubbellucht.
  for (const z of [-1.0, 1.0]) wiel(mb, xVoorWiel, z, 0.5, 0.32, laag, 'vracht');
  for (const x of achter) for (const z of [-1.0, 1.0, -0.66, 0.66]) wiel(mb, x, z, 0.5, 0.3, laag || Math.abs(z) < 0.8, 'vracht');
  if (laag) {
    mb.quad('autoglas', { x: xF + 0.01, y: 2.0, z: -1.05 }, { x: xF + 0.01, y: 2.0, z: 1.05 }, { x: xF - 0.08, y: 3.0, z: 1.0 }, { x: xF - 0.08, y: 3.0, z: -1.0 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 1, y: 0.1, z: 0 });
    return mb.bouw();
  }
  const zKant = W / 2 + 0.004;
  // Voorruit met zwarte rand, zonneklep erboven.
  mb.quad('autotrim', { x: xF + 0.004, y: 1.9, z: -1.12 }, { x: xF + 0.004, y: 1.9, z: 1.12 }, { x: xF - 0.1, y: 3.04, z: 1.06 }, { x: xF - 0.1, y: 3.04, z: -1.06 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 1, y: 0.1, z: 0 });
  mb.quad('autoglas', { x: xF + 0.012, y: 1.96, z: -1.06 }, { x: xF + 0.012, y: 1.96, z: 1.06 }, { x: xF - 0.09, y: 2.98, z: 1.0 }, { x: xF - 0.09, y: 2.98, z: -1.0 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 1, y: 0.1, z: 0 });
  kastje(mb, 'autotrim', { x: xF - 0.02, y: 3.1, z: 0 }, 0.28, 0.08, 2.15);
  // Grille met chromen lamellen, logo, koplampen en een stevige bumper.
  kastje(mb, 'autotrim', { x: xF + 0.02, y: 1.5, z: 0 }, 0.05, 0.62, 1.5);
  for (let y = 1.26; y < 1.8; y += 0.11) kastje(mb, 'chroom', { x: xF + 0.05, y, z: 0 }, 0.02, 0.025, 1.44);
  kastje(mb, 'chroom', { x: xF + 0.06, y: 1.86, z: 0 }, 0.02, 0.07, 0.3);
  kastje(mb, 'autotrim', { x: xF + 0.02, y: 0.78, z: 0 }, 0.3, 0.5, W - 0.04);
  for (const s of [-1, 1]) {
    kastje(mb, 'koplamp', { x: xF + 0.18, y: 0.86, z: s * 0.88 }, 0.04, 0.2, 0.42);
    kastje(mb, 'politieoranje', { x: xF + 0.18, y: 0.86, z: s * 1.14 }, 0.04, 0.12, 0.1);
    kastje(mb, 'koplamp', { x: xF + 0.18, y: 0.66, z: s * 0.6 }, 0.04, 0.08, 0.2);
  }
  kastje(mb, 'kenteken', { x: xF + 0.18, y: 0.66, z: 0 }, 0.02, 0.11, 0.52);
  for (const s of [-1, 1]) {
    // Zijruit en kleine achterruit in de deur, deurnaad, greep.
    mb.quad('autoglas', { x: xF - 0.25, y: 2.05, z: s * zKant }, { x: xF - 1.25, y: 2.05, z: s * zKant }, { x: xF - 1.25, y: 2.95, z: s * zKant }, { x: xF - 0.35, y: 2.95, z: s * zKant }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
    mb.quad('autoglas', { x: xF - 1.45, y: 2.25, z: s * zKant }, { x: xF - 1.85, y: 2.25, z: s * zKant }, { x: xF - 1.85, y: 2.85, z: s * zKant }, { x: xF - 1.45, y: 2.85, z: s * zKant }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
    for (const xd of [xF - 0.15, xF - 1.35]) mb.quad('autotrim', { x: xd - 0.01, y: 1.1, z: s * (zKant + 0.002) }, { x: xd + 0.01, y: 1.1, z: s * (zKant + 0.002) }, { x: xd + 0.01, y: 3.0, z: s * (zKant + 0.002) }, { x: xd - 0.01, y: 3.0, z: s * (zKant + 0.002) }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
    kastje(mb, 'chroom', { x: xF - 1.15, y: 1.85, z: s * (zKant + 0.02) }, 0.22, 0.04, 0.03);
    // Opstappen onder de deur.
    for (const y of [0.55, 0.85]) kastje(mb, 'autotrim', { x: xF - 0.75, y, z: s * (W / 2 - 0.12) }, 0.6, 0.05, 0.24);
    // Spiegels: arm en groot spiegelhuis met een kleinere eronder.
    kastje(mb, 'autotrim', { x: xF - 0.25, y: 2.75, z: s * (W / 2 + 0.17) }, 0.05, 0.04, 0.32);
    kastje(mb, 'autotrim', { x: xF - 0.25, y: 2.55, z: s * (W / 2 + 0.34) }, 0.09, 0.42, 0.2);
    kastje(mb, 'autotrim', { x: xF - 0.25, y: 2.15, z: s * (W / 2 + 0.32) }, 0.08, 0.2, 0.17);
    // Spatbord voorwiel (zwarte boog als drie plaatjes).
    for (const [dx, y, lx] of [[-0.45, 1.12, 0.35], [0, 1.18, 0.6], [0.45, 1.12, 0.35]] as const) kastje(mb, 'autotrim', { x: xVoorWiel + dx, y, z: s * (W / 2 - 0.15) }, lx, 0.05, 0.36);
    // Spatborden achter over de tandem en zijafscherming tussen de assen.
    kastje(mb, 'autotrim', { x: (achter[0] + achter[1]) / 2, y: 1.12, z: s * (W / 2 - 0.15) }, achter[0] - achter[1] + 1.25, 0.05, 0.4);
    const g0 = achter[0] + 0.65, g1 = xVoorWiel - 0.65;
    for (const y of [0.55, 0.85]) kastje(mb, 'velg', { x: (g0 + g1) / 2, y, z: s * (W / 2 - 0.05) }, g1 - g0, 0.1, 0.04);
    // Oranje zijmarkeringslichten langs de bak.
    for (let x = bakX0 + 0.4; x < bakX1; x += 1.6) kastje(mb, 'politieoranje', { x, y: 1.1, z: s * (W / 2 + 0.01) }, 0.08, 0.04, 0.02);
  }
  // Dieseltank en accubak.
  kastje(mb, 'velg', { x: (achter[0] + xVoorWiel) / 2 + 0.3, y: 0.78, z: 0.98 }, 1.3, 0.5, 0.45);
  kastje(mb, 'autotrim', { x: (achter[0] + xVoorWiel) / 2 + 0.3, y: 0.78, z: -0.98 }, 0.8, 0.45, 0.4);
  // Uitlaat achter de cabine.
  kastje(mb, 'velg', { x: xR - 0.08, y: 2.2, z: -1.05 }, 0.12, 2.3, 0.12);
  if (!brandweer) {
    // Windkap op het dak tot de hoogte van de bak.
    const d0 = xR + 0.25, d1 = xF - 0.5;
    const P = (x: number, y: number, z: number): V3 => ({ x, y, z });
    for (const s of [-1, 1]) mb.quad('autolak', P(d0, cabY1, s * 1.05), P(d1, cabY1, s * 1.05), P(d0, bakY1 - 0.02, s * 1.0), P(d0, bakY1 - 0.02, s * 1.0), [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
    mb.quad('autolak', P(d1, cabY1, -1.05), P(d1, cabY1, 1.05), P(d0, bakY1 - 0.02, 1.0), P(d0, bakY1 - 0.02, -1.0), [0, 0], [1, 0], [1, 1], [0, 1], { x: 1, y: 1.2, z: 0 });
    // Laadbak: hoekprofielen, boven- en onderregel, ribben, achterdeuren met sluitstangen.
    for (const x of [bakX0, bakX1]) for (const z of [-W / 2, W / 2]) kastje(mb, 'velg', { x, y: (bakY0 + bakY1) / 2, z }, 0.09, bakY1 - bakY0, 0.09);
    for (const y of [bakY0 + 0.04, bakY1 - 0.04]) for (const z of [-W / 2, W / 2]) kastje(mb, 'velg', { x: (bakX0 + bakX1) / 2, y, z }, bakL, 0.09, 0.07);
    for (const s of [-1, 1]) for (let x = bakX0 + 1.1; x < bakX1 - 0.5; x += 1.1) mb.quad('velg', { x: x - 0.02, y: bakY0 + 0.1, z: s * (W / 2 + 0.004) }, { x: x + 0.02, y: bakY0 + 0.1, z: s * (W / 2 + 0.004) }, { x: x + 0.02, y: bakY1 - 0.1, z: s * (W / 2 + 0.004) }, { x: x - 0.02, y: bakY1 - 0.1, z: s * (W / 2 + 0.004) }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
    const xa = bakX0 - 0.006;
    mb.quad('autotrim', { x: xa, y: bakY0 + 0.1, z: -0.012 }, { x: xa, y: bakY0 + 0.1, z: 0.012 }, { x: xa, y: bakY1 - 0.1, z: 0.012 }, { x: xa, y: bakY1 - 0.1, z: -0.012 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: -1, y: 0, z: 0 });
    for (const z of [-0.85, -0.35, 0.35, 0.85]) kastje(mb, 'velg', { x: bakX0 - 0.03, y: (bakY0 + bakY1) / 2, z }, 0.04, bakY1 - bakY0 - 0.3, 0.04);
    for (const z of [-1.1, 1.1]) for (const y of [bakY0 + 0.5, (bakY0 + bakY1) / 2, bakY1 - 0.5]) kastje(mb, 'velg', { x: bakX0 - 0.03, y, z }, 0.05, 0.12, 0.08);
  } else {
    // Brandweer: rolluiken, reflecterende strepen, ladder op het dak.
    for (const s of [-1, 1]) {
      const z = s * (W / 2 + 0.006);
      for (let i = 0; i < 4; i++) {
        const x0 = bakX0 + 0.3 + i * (bakL - 0.5) / 4, x1 = x0 + (bakL - 0.5) / 4 - 0.12;
        mb.quad('velg', { x: x0, y: 1.25, z }, { x: x1, y: 1.25, z }, { x: x1, y: 2.85, z }, { x: x0, y: 2.85, z }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
        for (let y = 1.4; y < 2.85; y += 0.16) mb.quad('autotrim', { x: x0, y, z: z + s * 0.002 }, { x: x1, y, z: z + s * 0.002 }, { x: x1, y: y + 0.015, z: z + s * 0.002 }, { x: x0, y: y + 0.015, z: z + s * 0.002 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
      }
      mb.quad('kenteken', { x: bakX0, y: 1.08, z }, { x: xF - 0.1, y: 1.08, z }, { x: xF - 0.1, y: 1.2, z }, { x: bakX0, y: 1.2, z }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
      mb.quad('turbinewit', { x: bakX0, y: 2.95, z }, { x: bakX1, y: 2.95, z }, { x: bakX1, y: 3.05, z }, { x: bakX0, y: 3.05, z }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
    }
    for (const z of [-0.45, 0.45]) kastje(mb, 'velg', { x: -0.6, y: 3.42, z }, L - 1.6, 0.1, 0.08);
    for (let x = -L / 2 + 1.2; x < L / 2 - 2.2; x += 0.45) kastje(mb, 'velg', { x, y: 3.42, z: 0 }, 0.05, 0.05, 0.9);
    for (const x of [-L / 2 + 1.5, L / 2 - 3]) kastje(mb, 'autotrim', { x, y: 3.25, z: 0 }, 0.2, 0.2, 1.0);
  }
  // Achter: onderrijbeveiliging, achterlichten, kenteken.
  kastje(mb, 'autotrim', { x: -L / 2 + 0.1, y: 0.62, z: 0 }, 0.14, 0.14, W - 0.3);
  for (const s of [-1, 1]) kastje(mb, 'achterlicht', { x: -L / 2 - 0.01, y: 1.2, z: s * 1.0 }, 0.06, 0.15, 0.3);
  kastje(mb, 'kenteken', { x: -L / 2 - 0.02, y: 0.9, z: 0 }, 0.03, 0.11, 0.52);
  return mb.bouw();
}

function bus(laag: boolean): MeshData {
  const mb = new MeshBouwer();
  const L = 12, W = 2.55;
  const ringen: V3[][] = [], as: V3[] = [];
  const n = laag ? 3 : 10;
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = (u - 0.5) * L;
    const w = W * (1 - Math.pow(Math.abs(u - 0.5) / 0.5, 14) * 0.08);
    ringen.push(doorsnede(x, w, 0.32, 3.05, 0.12, 0.3, laag ? 1 : 3));
    as.push({ x, y: 1.6, z: 0 });
  }
  // Raamband in glas, onderkant gelakt.
  const k = laag ? 1 : 3;
  loft(mb, ringen, as, (i, j) => {
    const jRechts = k + 2, jLinks = ringen[0].length - k - 3;
    void i;
    return j === jRechts || j === jLinks ? 'autoglas' : 'autolak';
  });
  for (const [i, uit] of [[0, -1], [ringen.length - 1, 1]] as const) {
    const r = ringen[i], c = as[i];
    for (let j = 0; j < r.length; j++) mb.driehoek(uit > 0 ? 'autolak' : 'autolak', c, r[j], r[(j + 1) % r.length], [0, 0], [1, 0], [1, 1], { x: uit, y: 0, z: 0 });
  }
  const xf = L / 2 + 0.01;
  mb.quad('autoglas', { x: xf, y: 1.1, z: -1.15 }, { x: xf, y: 1.1, z: 1.15 }, { x: xf, y: 2.85, z: 1.15 }, { x: xf, y: 2.85, z: -1.15 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 1, y: 0, z: 0 });
  for (const x of [L / 2 - 2.6, -L / 2 + 3.2]) for (const z of [-1.0, 1.0]) wiel(mb, x, z, 0.48, 0.3, laag, 'vracht');
  if (!laag) for (const s of [-1, 1]) { kastje(mb, 'koplamp', { x: L / 2 + 0.01, y: 0.75, z: s * 0.95 }, 0.05, 0.15, 0.35); kastje(mb, 'achterlicht', { x: -L / 2 - 0.01, y: 0.95, z: s * 1.05 }, 0.05, 0.4, 0.2); }
  return mb.bouw();
}

/** Band langs de zijkant van een personenauto/bus (striping), tussen hoogtes y0 en y1. */
function band(mb: MeshBouwer, v: Vorm, mat: string, y0: number, y1: number, u0 = 0.06, u1 = 0.94, blok = 0) {
  const n = 24;
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const ua = lerp(u0, u1, i / n), ub = lerp(u0, u1, (i + 1) / n);
    // Blokken (geblokt patroon): om en om twee rijen.
    const rijen = blok ? [[y0, (y0 + y1) / 2, i % 2], [(y0 + y1) / 2, y1, (i + 1) % 2]] : [[y0, y1, 1]];
    for (const [ya, yb, aan] of rijen) {
      if (!aan) continue;
      const za = s * (plan(v, ua) / 2 + 0.006), zb = s * (plan(v, ub) / 2 + 0.006);
      mb.quad(mat, { x: (ua - 0.5) * v.L, y: ya, z: za }, { x: (ub - 0.5) * v.L, y: ya, z: zb }, { x: (ub - 0.5) * v.L, y: yb, z: zb }, { x: (ua - 0.5) * v.L, y: yb, z: za }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
    }
  }
}

/** Lichtbalk op het dak (zwaailichten uit; de brandende lampen zijn een aparte laag). */
function lichtbalk(mb: MeshBouwer, x: number, y: number, breed: number) {
  kastje(mb, 'autotrim', { x, y: y + 0.05, z: 0 }, 0.32, 0.1, breed);
  for (const z of [-breed / 2 + 0.2, breed / 2 - 0.2]) kastje(mb, 'zwaailichtUit', { x, y: y + 0.15, z }, 0.26, 0.12, 0.34);
}

/** Mesh voor een voertuigsoort (laag = eenvoudig, voor ver weg). */
export function voertuigMesh(soort: VoertuigSoort, laag = false): MeshData {
  if (soort === 'vrachtwagen') return vrachtwagen(laag);
  if (soort === 'brandweer') {
    const m = vrachtwagen(laag, true);
    if (laag) return m;
    const mb = new MeshBouwer();
    lichtbalk(mb, 9.6 / 2 - 1.2, 3.3, 1.9);
    return samenvoegen([m, mb.bouw()]);
  }
  if (soort === 'bus') return bus(laag);
  if (soort === 'politie' || soort === 'ambulance') {
    const basis: Personen = soort === 'politie' ? 'stationwagen' : 'bestelbus';
    const v = VORMEN[basis];
    const m = personenauto(basis, laag);
    if (laag) return m;
    const mb = new MeshBouwer();
    if (soort === 'politie') {
      // Nederlandse politiestriping: blauwe band met oranje lijn erboven.
      band(mb, v, 'politieblauw', 0.42, 0.68, 0.08, 0.92);
      band(mb, v, 'politieoranje', 0.7, 0.76, 0.08, 0.92);
      lichtbalk(mb, (v.c1 + v.c2) / 2 * v.L - v.L / 2, v.dak, 1.2);
    } else {
      band(mb, v, 'ambulanceblauw', 0.55, 0.95, 0.06, 0.95, 1);
      lichtbalk(mb, (v.c3 - 0.5) * v.L - 0.35, v.dak, 1.6);
    }
    return samenvoegen([m, mb.bouw()]);
  }
  return personenauto(soort, laag);
}

/** Brandende zwaailichten (blauw), voor de knipperende laag. */
export function zwaailichten(soort: VoertuigSoort): MeshData {
  const mb = new MeshBouwer();
  let x = 0, y = 0, breed = 1.2;
  if (soort === 'brandweer') { x = 9.6 / 2 - 1.2; y = 3.3; breed = 1.9; }
  else if (soort === 'politie') { const v = VORMEN.stationwagen; x = (v.c1 + v.c2) / 2 * v.L - v.L / 2; y = v.dak; }
  else if (soort === 'ambulance') { const v = VORMEN.bestelbus; x = (v.c3 - 0.5) * v.L - 0.35; y = v.dak; breed = 1.6; }
  for (const z of [-breed / 2 + 0.2, breed / 2 - 0.2]) kastje(mb, 'zwaailicht', { x, y: y + 0.15, z }, 0.28, 0.14, 0.36);
  return mb.bouw();
}

/** Plekken van de remlichten (voor een aparte, oplichtende laag). */
export function remlichten(soort: VoertuigSoort): MeshData {
  const mb = new MeshBouwer();
  if (soort === 'vrachtwagen' || soort === 'bus' || soort === 'brandweer') {
    const L = soort === 'bus' ? 12 : 9.6;
    for (const s of [-1, 1]) kastje(mb, 'remlicht', { x: -L / 2 - 0.03, y: soort === 'bus' ? 0.95 : 1.2, z: s * 1.0 }, 0.04, 0.16, 0.32);
    return mb.bouw();
  }
  if (soort === 'politie') soort = 'stationwagen';
  if (soort === 'ambulance') soort = 'bestelbus';
  const v = VORMEN[soort];
  const hA = soort === 'bestelbus' ? 0.95 : Math.min(v.kont, v.gordel) - 0.1;
  for (const s of [-1, 1]) {
    const zm = s * (v.W / 2 - 0.3);
    let u = 0; while (u < 0.5 && plan(v, u) / 2 < Math.abs(zm)) u += 0.0025;
    kastje(mb, 'remlicht', { x: (u - 0.5) * v.L + 0.02, y: hA, z: zm }, 0.06, soort === 'bestelbus' ? 0.44 : 0.16, 0.42);
  }
  return mb.bouw();
}
