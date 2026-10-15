import { V3, lerp, clamp } from '../math';
import { MeshBouwer, MeshData } from './mesh';
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

const VORMEN: Record<Exclude<VoertuigSoort, 'vrachtwagen' | 'bus'>, Vorm> = {
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
function doorsnede(x: number, w: number, y0: number, y1: number, rO: number, rB: number, k: number): V3[] {
  const h = w / 2, pts: V3[] = [];
  const hoek = (cz: number, cy: number, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= k; i++) { const a = lerp(a0, a1, i / k); pts.push({ x, y: cy + Math.sin(a) * r, z: cz + Math.cos(a) * r }); }
  };
  rO = Math.min(rO, h * 0.9, (y1 - y0) * 0.45); rB = Math.min(rB, h * 0.9, (y1 - y0) * 0.45);
  hoek(h - rO, y0 + rO, rO, -Math.PI / 2, 0);
  hoek(h - rB, y1 - rB, rB, 0, Math.PI / 2);
  hoek(-h + rB, y1 - rB, rB, Math.PI / 2, Math.PI);
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

function wiel(mb: MeshBouwer, x: number, z: number, r: number, b: number, laag: boolean) {
  const kant = Math.sign(z);
  const zi = z - kant * b / 2, zu = z + kant * b / 2;
  cilinder(mb, 'rubber', { x, y: r, z: zi }, { x, y: r, z: zu }, r, r, laag ? 8 : 16);
  // Zijkant van de band en de velg.
  const n = laag ? 8 : 16;
  const schijf = (zz: number, rr: number, mat: string) => {
    const c = { x, y: r, z: zz };
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      mb.driehoek(mat, c, { x: x + Math.cos(a0) * rr, y: r + Math.sin(a0) * rr, z: zz }, { x: x + Math.cos(a1) * rr, y: r + Math.sin(a1) * rr, z: zz }, [0, 0], [1, 0], [1, 1], { x: 0, y: 0, z: kant });
    }
  };
  schijf(zu, r, 'rubber');
  schijf(zu + kant * 0.005, r * 0.66, 'velg');
  if (!laag) { schijf(zu + kant * 0.01, r * 0.2, 'autotrim'); }
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
  // Onderbak.
  const us: number[] = [];
  for (let i = 0; i <= nU; i++) us.push(0.5 - 0.5 * Math.cos(i / nU * Math.PI)); // dichter bij de uiteinden
  const ringen = us.map(u => doorsnede(xVan(u), Math.max(0.05, plan(v, u)), v.bodem, onderTop(v, u), 0.12, laag ? 0.1 : 0.16, k));
  const as = us.map(u => ({ x: xVan(u), y: (v.bodem + onderTop(v, u)) / 2, z: 0 }));
  loft(mb, ringen, as, () => 'autolak');
  // Kopse kanten dicht (achter en voor).
  for (const [i, uit] of [[0, -1], [ringen.length - 1, 1]] as const) {
    const r = ringen[i], c = as[i];
    for (let j = 0; j < r.length; j++) { const a = r[j], b = r[(j + 1) % r.length]; mb.driehoek('autolak', c, a, b, [0, 0], [1, 0], [1, 1], { x: uit, y: 0, z: 0 }); }
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
  const cas = cu.map(u => ({ x: xVan(u), y: onderTop(v, u) + 0.2, z: 0 }));
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
  const zW = v.W / 2 - 0.13;
  for (const x of [-v.wb / 2, v.wb / 2]) for (const z of [-zW, zW]) wiel(mb, x + (soort === 'bestelbus' ? 0.25 : 0.1), z, v.r, 0.22, laag);
  if (laag) return mb.bouw();
  // Lampen, grille, platen, spiegels: vlak op de carrosserie (steken een centimeter uit).
  const xV = v.L / 2, xA = -v.L / 2;
  const voorX = (z: number) => { let u = 1; while (u > 0.5 && plan(v, u) / 2 < Math.abs(z)) u -= 0.0025; return xVan(u); };
  const achterX = (z: number) => { let u = 0; while (u < 0.5 && plan(v, u) / 2 < Math.abs(z)) u += 0.0025; return xVan(u); };
  const zijZ = (x: number) => plan(v, x / v.L + 0.5) / 2;
  const hL = v.neus - 0.11;
  const hA = soort === 'bestelbus' ? 0.95 : Math.min(v.kont, v.gordel) - 0.1;
  for (const s of [-1, 1]) {
    // Koplamp in twee stukjes, schuin meelopend met de neus.
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
    kastje(mb, 'autolak', { x: xm, y: v.gordel + 0.13, z: s * (zb + 0.12) }, 0.1, 0.13, 0.17);
    kastje(mb, 'autotrim', { x: xm + 0.01, y: v.gordel + 0.06, z: s * (zb + 0.04) }, 0.06, 0.04, 0.1);
    // Wielkasten: donkere boog op de zijkant boven elk wiel.
    for (const xw of [-v.wb / 2 + (soort === 'bestelbus' ? 0.25 : 0.1), v.wb / 2 + (soort === 'bestelbus' ? 0.25 : 0.1)]) {
      const n = 10, R0 = v.r + 0.02, R1 = v.r + 0.09;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n;
        const p = (a: number, R: number) => { const x = xw + Math.cos(a) * R; const z = s * (zijZ(x) + 0.006); return { x, y: v.r + Math.sin(a) * R, z }; };
        mb.quad('autotrim', p(a0, R0), p(a1, R0), p(a1, R1), p(a0, R1), [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
      }
    }
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
  kastje(mb, 'autotrim', { x: xV - 0.1, y: v.bodem + 0.07, z: 0 }, 0.2, 0.1, v.W * 0.82);
  kastje(mb, 'autotrim', { x: xA + 0.1, y: v.bodem + 0.07, z: 0 }, 0.2, 0.1, v.W * 0.82);
  return mb.bouw();
}

function vrachtwagen(laag: boolean): MeshData {
  const mb = new MeshBouwer();
  const L = 9.6, W = 2.5;
  // Cabine voorop (gelakt), laadbak (wit) erachter.
  const cabL = 2.3, xc = L / 2 - cabL / 2;
  const ringen: V3[][] = [], as: V3[] = [];
  const n = laag ? 2 : 6;
  for (let i = 0; i <= n; i++) {
    const x = xc - cabL / 2 + cabL * i / n;
    const u = i / n;
    ringen.push(doorsnede(x, W - (u > 0.85 ? (u - 0.85) * 1.2 : 0), 0.55, 3.25 - (u > 0.9 ? (u - 0.9) * 2 : 0), 0.1, 0.25, laag ? 1 : 3));
    as.push({ x, y: 1.9, z: 0 });
  }
  loft(mb, ringen, as, () => 'autolak');
  for (const [i, uit] of [[0, -1], [ringen.length - 1, 1]] as const) {
    const r = ringen[i], c = as[i];
    for (let j = 0; j < r.length; j++) mb.driehoek('autolak', c, r[j], r[(j + 1) % r.length], [0, 0], [1, 0], [1, 1], { x: uit, y: 0, z: 0 });
  }
  // Voorruit en zijruitjes.
  const xf = L / 2 + 0.005;
  mb.quad('autoglas', { x: xf, y: 1.95, z: -1.1 }, { x: xf, y: 1.95, z: 1.1 }, { x: xf - 0.12, y: 3.0, z: 1.05 }, { x: xf - 0.12, y: 3.0, z: -1.05 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 1, y: 0.1, z: 0 });
  for (const s of [-1, 1]) mb.quad('autoglas', { x: xf - 0.3, y: 2.0, z: s * (W / 2 + 0.005) }, { x: xf - 1.2, y: 2.0, z: s * (W / 2 + 0.005) }, { x: xf - 1.2, y: 2.85, z: s * (W / 2 + 0.005) }, { x: xf - 0.35, y: 2.85, z: s * (W / 2 + 0.005) }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 0, z: s });
  // Laadbak.
  const bakL = L - cabL - 0.25;
  mb.blok('laadbak', 'laadbak', { x: -L / 2 + bakL / 2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, bakL, W, 1.05, 3.75, true);
  mb.blok('autotrim', 'autotrim', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, L - 0.4, 1.0, 0.55, 1.05, true);
  for (const x of [L / 2 - 1.3, -L / 2 + 2.4, -L / 2 + 1.1]) for (const z of [-1.0, 1.0]) wiel(mb, x, z, 0.5, 0.32, laag);
  if (!laag) {
    for (const s of [-1, 1]) {
      kastje(mb, 'koplamp', { x: L / 2 + 0.01, y: 0.85, z: s * 0.95 }, 0.06, 0.18, 0.35);
      kastje(mb, 'achterlicht', { x: -L / 2 - 0.01, y: 1.2, z: s * 1.0 }, 0.06, 0.15, 0.3);
      kastje(mb, 'autotrim', { x: L / 2 - 0.4, y: 2.55, z: s * (W / 2 + 0.25) }, 0.08, 0.45, 0.06);
    }
    kastje(mb, 'autotrim', { x: L / 2 + 0.01, y: 1.3, z: 0 }, 0.05, 0.55, 1.6);
    kastje(mb, 'kenteken', { x: -L / 2 - 0.02, y: 0.9, z: 0 }, 0.03, 0.11, 0.52);
  }
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
  for (const x of [L / 2 - 2.6, -L / 2 + 3.2]) for (const z of [-1.0, 1.0]) wiel(mb, x, z, 0.48, 0.3, laag);
  if (!laag) for (const s of [-1, 1]) { kastje(mb, 'koplamp', { x: L / 2 + 0.01, y: 0.75, z: s * 0.95 }, 0.05, 0.15, 0.35); kastje(mb, 'achterlicht', { x: -L / 2 - 0.01, y: 0.95, z: s * 1.05 }, 0.05, 0.4, 0.2); }
  return mb.bouw();
}

/** Mesh voor een voertuigsoort (laag = eenvoudig, voor ver weg). */
export function voertuigMesh(soort: VoertuigSoort, laag = false): MeshData {
  if (soort === 'vrachtwagen') return vrachtwagen(laag);
  if (soort === 'bus') return bus(laag);
  return personenauto(soort, laag);
}

/** Plekken van de remlichten (voor een aparte, oplichtende laag). */
export function remlichten(soort: VoertuigSoort): MeshData {
  const mb = new MeshBouwer();
  if (soort === 'vrachtwagen' || soort === 'bus') {
    const L = soort === 'bus' ? 12 : 9.6;
    for (const s of [-1, 1]) kastje(mb, 'remlicht', { x: -L / 2 - 0.03, y: soort === 'bus' ? 0.95 : 1.2, z: s * 1.0 }, 0.04, 0.16, 0.32);
    return mb.bouw();
  }
  const v = VORMEN[soort];
  const hA = soort === 'bestelbus' ? 0.95 : Math.min(v.kont, v.gordel) - 0.1;
  for (const s of [-1, 1]) {
    const zm = s * (v.W / 2 - 0.3);
    let u = 0; while (u < 0.5 && plan(v, u) / 2 < Math.abs(zm)) u += 0.0025;
    kastje(mb, 'remlicht', { x: (u - 0.5) * v.L + 0.02, y: hA, z: zm }, 0.06, soort === 'bestelbus' ? 0.44 : 0.16, 0.42);
  }
  return mb.bouw();
}
