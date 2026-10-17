import { V2, V3 } from '../math';
import { Rng } from '../rng';
import { Gebouw, totaleHoogte } from '../wereld';
import { MeshBouwer, Prop } from './mesh';
import { LOD } from './lod';
import { Rand, randen, wand, vlak, doos, deur, P3, N3, PUIEN, LUIFELS, puiUV } from './gebouwmesh';
import { pandPolys } from './stijlmesh';
import { cilinder } from './props';
import { gevelMaat } from '../tex/generatoren';

// ════════════════════════════════════════════════════════════════════════════════════
// STADSHART
// Gesloten bouwblokken zoals in een Europese binnenstad (Parijs, Brussel, Berlijn, Den Haag):
// panden van 5-8 lagen tot op de stoep, elk met een eigen gevel (natuursteen, baksteen met
// witte omlijsting, kalksteen), winkelpuien tussen stenen pilasters, een plint- en kroonlijst,
// doorlopende smeedijzeren balkons op de tweede en de bovenste verdieping, en een zinken
// mansardedak met dakkapellen en schoorstenen. Hoekpanden krijgen een toren met een koepel.
// ════════════════════════════════════════════════════════════════════════════════════

const LAAG = 3.2;
const VARIANTEN = ['haussmann', 'haussmannWit', 'gruender', 'haussmann', 'kalksteen', 'haussmannWit'];

const op = (x: Rand, s: number, d: number): V2 => ({ x: x.a.x + x.t.x * s + x.n.x * d, z: x.a.z + x.t.z * s + x.n.z * d });
const norm2 = (v: V2): V2 => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };

/** Lijst langs een gevel (plint of kroonlijst): een balk die `diep` m uitsteekt. */
function lijst(mb: MeshBouwer, mat: string, x: Rand, y0: number, y1: number, diep: number) {
  doos(mb, mat, mat, op(x, x.L / 2, diep / 2 - 0.08), x.t, x.L + 0.06, diep + 0.16, y0, y1);
}

/** Doorlopend balkon met consoles en een smeedijzeren hek. */
function balkon(mb: MeshBouwer, x: Rand, y: number, steen: string) {
  if (x.L < 3) return;
  const L = x.L - 0.5, d = 0.85;
  doos(mb, steen, steen, op(x, x.L / 2, d / 2), x.t, L, d, y - 0.18, y);
  for (let s = 0.6; s < x.L - 0.4; s += 2.4) doos(mb, steen, steen, op(x, s, 0.3), x.t, 0.18, 0.55, y - 0.55, y - 0.18);
  const a = op(x, 0.25, d - 0.03), b = op(x, x.L - 0.25, d - 0.03);
  mb.quad('balustrade', P3(a, y), P3(b, y), P3(b, y + 1.0), P3(a, y + 1.0), [0, 0], [L / 2, 0], [L / 2, 1], [0, 1], N3(x.n));
  for (const s of [0.25, x.L - 0.25]) {
    const p0 = op(x, s, 0), p1 = op(x, s, d - 0.03);
    mb.quad('balustrade', P3(p0, y), P3(p1, y), P3(p1, y + 1.0), P3(p0, y + 1.0), [0, 0], [d / 2, 0], [d / 2, 1], [0, 1], N3(x.t));
  }
}

/**
 * Gevelreliëf in echte geometrie, precies op de ramen van de textuur: dorpels, kroonlijstjes boven
 * elk raam, frontons op de bel-etage, lijsten per verdieping en lisenen op de pandgrenzen. Zo werpen
 * de ornamenten echte schaduw, zoals in de binnensteden van Cities: Skylines II.
 */
/** Lijstje langs de gevel (dorpel, kroonlijstje): voorkant, boven- en onderkant, 6 driehoeken. */
function richel(mb: MeshBouwer, mat: string, x: Rand, s: number, b: number, diep: number, y0: number, y1: number) {
  const a0 = op(x, s - b / 2, 0), b0 = op(x, s + b / 2, 0), a1 = op(x, s - b / 2, diep), b1 = op(x, s + b / 2, diep);
  mb.quad(mat, P3(a1, y0), P3(b1, y0), P3(b1, y1), P3(a1, y1), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
  mb.quad(mat, P3(a0, y1), P3(b0, y1), P3(b1, y1), P3(a1, y1), [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 1, z: 0 });
  mb.quad(mat, P3(a0, y0), P3(b0, y0), P3(b1, y0), P3(a1, y0), [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: -1, z: 0 });
}

function gevelReliëf(mb: MeshBouwer, x: Rand, gevel: string, y0: number, top: number, lagen: number, steen: string, balkons: Set<number>) {
  if (x.L < 2.5 || lagen < 1) return;
  const m = gevelMaat(gevel);
  const n = Math.max(1, Math.round(x.L / 3)), bw = x.L / n, g = bw / 3;
  const hs = (top - y0) / lagen, f = hs / 3;
  const w = m.rb * g, ow = Math.max(0.1, m.ow) * g;
  for (let i = 0; i < lagen; i++) {
    const yb = y0 + i * hs, ys = yb + m.borst * f, yt = yb + (m.borst + m.rh) * f;
    // Lijst op de verdiepingsvloer (niet waar al een balkon ligt).
    if (i > 0 && !balkons.has(i)) lijst(mb, steen, x, yb - 0.06, yb + 0.12, 0.13);
    const fronton = i === 1 && lagen >= 3 && gevel !== 'gruender';
    for (let j = 0; j < n; j++) {
      const s = (j + 0.5) * bw;
      if (!balkons.has(i)) richel(mb, steen, x, s, w + 0.3, 0.2, ys - 0.12, ys);
      // Neggekanten: smalle stenen omlijsting die iets uitsteekt.
      if (m.ow > 0) for (const k of [-1, 1]) {
        // Alleen voorkant en zijkanten (de bovenkant zit onder het kroonlijstje): 6 driehoeken.
        const s0 = s + k * w / 2, s1 = s + k * (w / 2 + ow), y1 = yt + ow * 0.6;
        const a0 = op(x, s0, 0), a1 = op(x, s0, 0.07), b0 = op(x, s1, 0), b1 = op(x, s1, 0.07);
        mb.quad(steen, P3(a1, ys), P3(b1, ys), P3(b1, y1), P3(a1, y1), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
        mb.quad(steen, P3(a0, ys), P3(a1, ys), P3(a1, y1), P3(a0, y1), [0, 0], [1, 0], [1, 1], [0, 1], { x: -x.t.x * k, y: 0, z: -x.t.z * k });
        mb.quad(steen, P3(b0, ys), P3(b1, ys), P3(b1, y1), P3(b0, y1), [0, 0], [1, 0], [1, 1], [0, 1], { x: x.t.x * k, y: 0, z: x.t.z * k });
      }
      const wc = w + 2 * ow + 0.25, yc = yt + ow * 0.6;
      richel(mb, steen, x, s, wc, 0.26, yc, yc + 0.16);
      if (fronton) {
        const hp = 0.42, d = 0.24, yf = yc + 0.16;
        const a = op(x, s - wc / 2, d), b = op(x, s + wc / 2, d), c = op(x, s, d), a0 = op(x, s - wc / 2, 0), b0 = op(x, s + wc / 2, 0), c0 = op(x, s, 0);
        mb.driehoek(steen, P3(a, yf), P3(b, yf), P3(c, yf + hp), [0, 0], [1, 0], [0.5, 1], N3(x.n));
        mb.quad(steen, P3(a, yf), P3(c, yf + hp), P3(c0, yf + hp), P3(a0, yf), [0, 0], [1, 0], [1, 1], [0, 1], { x: -x.t.x * hp, y: wc / 2, z: -x.t.z * hp });
        mb.quad(steen, P3(c, yf + hp), P3(b, yf), P3(b0, yf), P3(c0, yf + hp), [0, 0], [1, 0], [1, 1], [0, 1], { x: x.t.x * hp, y: wc / 2, z: x.t.z * hp });
      }
    }
  }
  // Lisenen op de pandgrenzen.
  if (x.L > 6) for (const s of [0.3, x.L - 0.3]) doos(mb, steen, steen, op(x, s, 0.07), x.t, 0.6, 0.14, y0, top - 0.55);
}

/** Koepel (halve bol) met rand, lantaarn en een vergulde top. */
export function koepel(mb: MeshBouwer, mat: string, c: V3, r: number, h: number, n = 16) {
  const ringen = 7;
  for (let j = 0; j < ringen; j++) {
    const f0 = (j / ringen) * Math.PI / 2, f1 = ((j + 1) / ringen) * Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const P = (a: number, f: number): V3 => ({ x: c.x + Math.cos(a) * r * Math.cos(f), y: c.y + h * Math.sin(f), z: c.z + Math.sin(a) * r * Math.cos(f) });
      const m = (a0 + a1) / 2, fm = (f0 + f1) / 2;
      mb.quad(mat, P(a0, f0), P(a1, f0), P(a1, f1), P(a0, f1), [i / n * 4, j / ringen], [(i + 1) / n * 4, j / ringen], [(i + 1) / n * 4, (j + 1) / ringen], [i / n * 4, (j + 1) / ringen], { x: Math.cos(m) * Math.cos(fm), y: Math.sin(fm), z: Math.sin(m) * Math.cos(fm) });
    }
  }
  // Lantaarn en spits.
  cilinder(mb, 'natuursteenWit', { x: c.x, y: c.y + h - 0.1, z: c.z }, { x: c.x, y: c.y + h + 1.1, z: c.z }, r * 0.22, r * 0.2, 10);
  cilinder(mb, mat, { x: c.x, y: c.y + h + 1.1, z: c.z }, { x: c.x, y: c.y + h + 2.4, z: c.z }, r * 0.24, 0.04, 10);
  cilinder(mb, 'goud', { x: c.x, y: c.y + h + 2.3, z: c.z }, { x: c.x, y: c.y + h + 2.9, z: c.z }, 0.12, 0.02, 6);
}

/** Achthoekige hoektoren met ramen, kroonlijst en koepel. */
function hoektoren(mb: MeshBouwer, c: V2, R: number, y0: number, y1: number, gevel: string, steen: string, dakMat: string) {
  const n = 8, pts: V2[] = [];
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; pts.push({ x: c.x + Math.cos(a) * R, z: c.z + Math.sin(a) * R }); }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b.x - a.x, b.z - a.z);
    const t = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const m = { x: (a.x + b.x) / 2 - c.x, z: (a.z + b.z) / 2 - c.z };
    const nn = norm2(m);
    const rd: Rand = { a, b, n: nn, t, L, soort: 'voor' };
    wand(mb, `gevel:${gevel}`, rd, y0, y1, 0, (y1 - y0) / LAAG, L);
  }
  // Kroonlijst en dak.
  for (const [ya, yb, rr] of [[y1 - 0.5, y1, R + 0.35], [y0 - 0.3, y0, R + 0.15]] as const) {
    const q: V2[] = pts.map(p => ({ x: c.x + (p.x - c.x) * rr / R, z: c.z + (p.z - c.z) * rr / R }));
    for (let i = 0; i < n; i++) {
      const a = q[i], b = q[(i + 1) % n];
      mb.quad(steen, P3(a, ya), P3(b, ya), P3(b, yb), P3(a, yb), [0, 0], [1, 0], [1, 1], [0, 1], N3(norm2({ x: (a.x + b.x) / 2 - c.x, z: (a.z + b.z) / 2 - c.z })));
    }
    vlak(mb, steen, q, yb);
    vlak(mb, steen, q, ya, false);
  }
  koepel(mb, dakMat, { x: c.x, y: y1, z: c.z }, R * 1.02, R * 1.15);
}

/**
 * Mansardedak op een pand (vierhoek met voorgevel): steile onderkant, flauwe bovenkant; de zijkanten
 * zijn brandmuren (buren sluiten aan). Met dakkapellen en schoorstenen.
 */
function mansarde(mb: MeshBouwer, poly: V2[], voor: Rand, top: number, muur: string, steen: string, r: Rng, kop: [boolean, boolean]) {
  if (poly.length !== 4) {
    vlak(mb, 'zink', poly, top + 0.05);
    return;
  }
  // Zoek de voorgevel in de vierhoek.
  let iv = 0, bd = Infinity;
  for (let i = 0; i < 4; i++) { const d = Math.hypot(poly[i].x - voor.a.x, poly[i].z - voor.a.z) + Math.hypot(poly[(i + 1) % 4].x - voor.b.x, poly[(i + 1) % 4].z - voor.b.z); if (d < bd) { bd = d; iv = i; } }
  const A = poly[iv], B = poly[(iv + 1) % 4], C = poly[(iv + 2) % 4], D = poly[(iv + 3) % 4];
  const inF = { x: -voor.n.x, z: -voor.n.z };
  const mAB = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, mCD = { x: (C.x + D.x) / 2, z: (C.z + D.z) / 2 };
  const diep = Math.hypot(mAB.x - mCD.x, mAB.z - mCD.z);
  const inB = norm2({ x: mAB.x - mCD.x, z: mAB.z - mCD.z });
  const d1 = 1.0, h1 = 2.9, d2 = Math.min(2.6, Math.max(0, diep / 2 - d1 - 0.8)), h2 = d2 > 0.3 ? 0.9 : 0;
  const sch = (p: V2, v: V2, d: number): V2 => ({ x: p.x + v.x * d, z: p.z + v.z * d });
  const A1 = sch(A, inF, d1), B1 = sch(B, inF, d1), C1 = sch(C, inB, d1), D1 = sch(D, inB, d1);
  const A2 = sch(A1, inF, d2), B2 = sch(B1, inF, d2), C2 = sch(C1, inB, d2), D2 = sch(D1, inB, d2);
  const y1 = top + h1, y2 = y1 + h2;
  const helling = (n: V2, h: number, d: number): V3 => { const l = Math.hypot(h, d) || 1; return { x: n.x * h / l, y: d / l, z: n.z * h / l }; };
  const nF = voor.n, nB = { x: -inB.x, z: -inB.z };
  const uv = (L: number, H: number): [[number, number], [number, number], [number, number], [number, number]] => [[0, 0], [L, 0], [L, H], [0, H]];
  const LF = Math.hypot(B.x - A.x, B.z - A.z), LB = Math.hypot(D.x - C.x, D.z - C.z);
  mb.quad('zink', P3(A, top), P3(B, top), P3(B1, y1), P3(A1, y1), ...uv(LF, Math.hypot(h1, d1)), helling(nF, h1, d1));
  mb.quad('zink', P3(C, top), P3(D, top), P3(D1, y1), P3(C1, y1), ...uv(LB, Math.hypot(h1, d1)), helling(nB, h1, d1));
  if (h2 > 0) {
    mb.quad('zink', P3(A1, y1), P3(B1, y1), P3(B2, y2), P3(A2, y2), ...uv(LF, d2), helling(nF, h2, d2));
    mb.quad('zink', P3(C1, y1), P3(D1, y1), P3(D2, y2), P3(C2, y2), ...uv(LB, d2), helling(nB, h2, d2));
    vlak(mb, 'zink', [A2, B2, C2, D2], y2);
  } else vlak(mb, 'zink', [A1, B1, C1, D1], y1);
  // Brandmuren aan de zijkanten (doorlopend metselwerk, iets boven het dak uit).
  const zijkant = (P: V2, Q: V2, P1: V2, Q1: V2, P2: V2, Q2: V2, buiten: V2) => {
    mb.quad(muur, P3(P, top), P3(Q, top), P3(Q1, y1 + 0.15), P3(P1, y1 + 0.15), [0, 0], [1, 0], [1, 1], [0, 1], N3(buiten));
    if (h2 > 0) mb.quad(muur, P3(P1, y1), P3(Q1, y1), P3(Q2, y2 + 0.15), P3(P2, y2 + 0.15), [0, 0], [1, 0], [1, 1], [0, 1], N3(buiten));
  };
  const zijB = norm2({ x: B.x - A.x, z: B.z - A.z });
  zijkant(B, C, B1, C1, B2, C2, zijB);
  zijkant(D, A, D1, A1, D2, A2, { x: -zijB.x, z: -zijB.z });
  if (LOD.ver) return;
  // Dakkapellen op de voorkant (en wat minder op de achterkant).
  const kapellen = (P: V2, Q: V2, n: V2, achter: boolean) => {
    const L = Math.hypot(Q.x - P.x, Q.z - P.z);
    const t = { x: (Q.x - P.x) / L, z: (Q.z - P.z) / L };
    const aantal = Math.floor((L - 1) / 3);
    if (aantal < 1) return;
    const inw = { x: -n.x, z: -n.z };
    const rond = r.next() < 0.35;
    for (let i = 0; i < aantal; i++) {
      if (achter && i % 2) continue;
      const s = (L - aantal * 3) / 2 + (i + 0.5) * 3;
      const voorP = { x: P.x + t.x * s + inw.x * 0.45, z: P.z + t.z * s + inw.z * 0.45 };
      const ya = top + 0.4, yb = top + 2.15, b = 1.05;
      // Lichaam van de dakkapel (tot in het dak).
      doos(mb, steen, steen, { x: voorP.x + inw.x * 0.6, z: voorP.z + inw.z * 0.6 }, t, b + 0.3, 1.2, ya, yb);
      // Raam met kozijn.
      const q = (sd: number, d: number) => ({ x: voorP.x + t.x * sd + n.x * d, z: voorP.z + t.z * sd + n.z * d });
      mb.quad('raam', P3(q(-b / 2 + 0.1, 0.01), ya + 0.25), P3(q(b / 2 - 0.1, 0.01), ya + 0.25), P3(q(b / 2 - 0.1, 0.01), yb - 0.15), P3(q(-b / 2 + 0.1, 0.01), yb - 0.15), [0, 0], [1, 0], [1, 1], [0, 1], N3(n));
      // Kapje: driehoekig fronton of rond (zink).
      if (rond) {
        for (let k = 0; k < 6; k++) {
          const a0 = Math.PI * k / 6, a1 = Math.PI * (k + 1) / 6;
          const R = (b + 0.3) / 2;
          const p0 = q(Math.cos(a0) * R, 0), p1 = q(Math.cos(a1) * R, 0);
          const p0b = { x: p0.x + inw.x * 1.2, z: p0.z + inw.z * 1.2 }, p1b = { x: p1.x + inw.x * 1.2, z: p1.z + inw.z * 1.2 };
          mb.quad('zink', P3(p0, yb + Math.sin(a0) * 0.45), P3(p1, yb + Math.sin(a1) * 0.45), P3(p1b, yb + Math.sin(a1) * 0.45), P3(p0b, yb + Math.sin(a0) * 0.45), [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 1, z: 0 });
          mb.driehoek(steen, P3(q(0, 0), yb), P3(p0, yb + Math.sin(a0) * 0.45), P3(p1, yb + Math.sin(a1) * 0.45), [0, 0], [1, 0], [1, 1], N3(n));
        }
      } else {
        const hw = (b + 0.4) / 2, nok = yb + 0.5;
        mb.driehoek(steen, P3(q(-hw, 0.02), yb), P3(q(hw, 0.02), yb), P3(q(0, 0.02), nok), [0, 0], [1, 0], [0.5, 1], N3(n));
        for (const sg of [-1, 1]) {
          const e0 = q(sg * hw, 0.05), e1 = q(0, 0.05);
          mb.quad('zink', P3(e0, yb), P3(e1, nok), P3({ x: e1.x + inw.x * 1.3, z: e1.z + inw.z * 1.3 }, nok), P3({ x: e0.x + inw.x * 1.3, z: e0.z + inw.z * 1.3 }, yb), [0, 0], [1, 0], [1, 1], [0, 1], { x: t.x * sg, y: 1, z: t.z * sg });
        }
      }
    }
  };
  kapellen(A, B, nF, false);
  if (diep > 9) kapellen(C, D, nB, true);
  // Schoorstenen op de brandmuren (met potten), niet aan het eind van het blok.
  const yS = (h2 > 0 ? y2 : y1);
  for (const [P, Q, P2, Q2, isKop] of [[B, C, B2, C2, kop[1]], [D, A, D2, A2, kop[0]]] as const) {
    if (isKop) continue;
    const m = { x: (P2.x + Q2.x) / 2, z: (P2.z + Q2.z) / 2 };
    const t = norm2({ x: Q.x - P.x, z: Q.z - P.z });
    const lang = Math.min(2.6, Math.hypot(Q2.x - P2.x, Q2.z - P2.z) * 0.6);
    doos(mb, muur, steen, m, t, lang, 0.7, yS - 0.5, yS + 1.4);
    doos(mb, steen, steen, m, t, lang + 0.15, 0.85, yS + 1.4, yS + 1.55);
    const pots = Math.max(2, Math.round(lang / 0.6));
    for (let k = 0; k < pots; k++) {
      const s = (k + 0.5) / pots * lang - lang / 2;
      const c = { x: m.x + t.x * s, y: yS + 1.55, z: m.z + t.z * s };
      cilinder(mb, 'schoorsteenpot', c, { x: c.x, y: c.y + 0.45, z: c.z }, 0.13, 0.1, 6);
    }
  }
}

/**
 * Stadsblok: één gebouw met meerdere panden (pandGrenzen). `soort` bepaalt de begane grond:
 * winkelpuien (gemengd), kantoorentree of woonhuis met voordeur.
 */
export function stadsblok(mb: MeshBouwer, g: Gebouw, soort: 'wonen' | 'winkel' | 'kantoor', props: Prop[] = []) {
  const Y = g.y, hBG = g.lagen[0].hoogte, nL = g.lagen.length;
  const alle = pandPolys(g);
  const basisTop = Y + totaleHoogte(g.lagen);
  let hoekGedaan = false;
  for (const p of alle) {
    const r = new Rng(g.seed + p.i * 977 + 3);
    const gevel = p.i % 3 === 0 && g.gevel ? g.gevel : r.kies(VARIANTEN);
    const steen = gevel === 'gruender' || gevel === 'haussmannWit' ? 'natuursteenWit' : 'natuursteen';
    const lagen = Math.max(3, nL + r.kies([-1, 0, 0, 0, 1]));
    const top = Math.max(Y + hBG + LAAG * 2, basisTop + (lagen - nL) * LAAG);
    const lagenBoven = Math.round((top - Y - hBG) / LAAG);
    const kop: [boolean, boolean] = [p === alle[0], p === alle[alle.length - 1]];
    const rd = randen(g, p.poly);
    for (const x of rd) {
      if (x.soort === 'zij') {
        const isKop = (kop[0] || kop[1]) && x.L > 4;
        wand(mb, isKop ? `gevel:${gevel}` : `muur:${gevel}`, x, Y, top, 0, isKop ? lagenBoven + 1 : 0, 3);
        continue;
      }
      if (x.soort === 'achter') { wand(mb, `gevel:${gevel}`, x, Y, top, 0, lagenBoven + 1, 3); continue; }
      // Voorgevel. Begane grond: winkelpuien tussen stenen pilasters, of een sokkel met deur.
      if (soort === 'winkel' || (soort === 'kantoor' && x.L > 8)) {
        const n = Math.max(1, Math.round(x.L / 5)), pw = x.L / n;
        for (let i = 0; i < n; i++) {
          const a = op(x, i * pw + 0.25, 0.02), b = op(x, (i + 1) * pw - 0.25, 0.02);
          mb.quad(soort === 'kantoor' ? 'glas' : `winkelpui:${(g.seed + p.i * 3 + i) % PUIEN}`, P3(a, Y), P3(b, Y), P3(b, Y + hBG - 0.4), P3(a, Y + hBG - 0.4), ...puiUV(x), N3(x.n));
          // Markies (zonnescherm) boven een deel van de winkels.
          if (soort === 'winkel' && !LOD.ver && r.next() < 0.45) {
            const l = r.int(0, LUIFELS - 1), yl = Y + hBG - 0.6;
            const q = (s: number, d: number) => op(x, i * pw + s, d);
            mb.quad(`luifel:${l}`, P3(q(0.35, 0.05), yl), P3(q(pw - 0.35, 0.05), yl), P3(q(pw - 0.35, 1.5), yl - 0.7), P3(q(0.35, 1.5), yl - 0.7), [0, 0], [pw - 0.7, 0], [pw - 0.7, 1], [0, 1], { x: x.n.x, y: 1, z: x.n.z });
          }
        }
        for (let i = 0; i <= n; i++) doos(mb, steen, steen, op(x, Math.min(x.L - 0.25, Math.max(0.25, i * pw)), 0.12), x.t, 0.5, 0.3, Y, Y + hBG);
        wand(mb, steen, x, Y + hBG - 0.4, Y + hBG, 0, 0, 3, 0.05);
      } else {
        wand(mb, `gevel:${gevel}`, x, Y, Y + hBG, 0, 1, 3);
        deur(mb, { p: op(x, x.L / 2, 0), n: { x: -x.n.x, z: -x.n.z }, t: x.t, d: 0 }, Y, (g.seed + p.i) % 5);
      }
      // Verdiepingen, plintlijst en kroonlijst.
      wand(mb, `gevel:${gevel}`, x, Y + hBG, top, 0, lagenBoven, 3);
      lijst(mb, steen, x, Y + hBG, Y + hBG + 0.35, 0.22);
      lijst(mb, steen, x, top - 0.55, top - 0.25, 0.3);
      lijst(mb, steen, x, top - 0.25, top, 0.55);
      if (!LOD.ver) {
        if (lagenBoven >= 3) balkon(mb, x, Y + hBG + LAAG, steen);
        if (lagenBoven >= 4) balkon(mb, x, top - LAAG, steen);
        const hs = (top - Y - hBG) / lagenBoven;
        const bk = new Set<number>();
        if (lagenBoven >= 3) bk.add(Math.round(LAAG / hs));
        if (lagenBoven >= 4) bk.add(Math.round((top - LAAG - Y - hBG) / hs));
        gevelReliëf(mb, x, gevel, Y + hBG, top, lagenBoven, steen, bk);
        // Vlaggen aan de gevel (kantoren en enkele andere panden).
        if (x.L > 6 && r.next() < (gevel === 'kalksteen' || soort === 'kantoor' ? 0.65 : 0.18)) {
          const variant = r.int(0, 3), rot = Math.atan2(x.n.x, x.n.z);
          for (const s of x.L > 12 && soort === 'kantoor' ? [x.L * 0.3, x.L * 0.7] : [x.L / 2]) {
            const q = op(x, s, 0.05);
            props.push({ soort: 'vlag', x: q.x, y: Y + hBG + LAAG * 1.55, z: q.z, rot, schaal: 1, variant });
          }
        }
      }
    }
    if (p.voor) mansarde(mb, p.poly, p.voor, top, `muur:${gevel}`, steen, r, kop);
    else vlak(mb, 'zink', p.poly, top);
    // Hoekpand: toren met koepel op de hoek van twee straten.
    if (!hoekGedaan && (g.zijStraat?.length ?? 0) > 0 && (kop[0] || kop[1]) && new Rng(g.seed + 5).next() < 0.45) {
      const voor = rd.filter(x => x.soort === 'voor');
      for (let i = 0; i < voor.length && !hoekGedaan; i++) for (let j = 0; j < voor.length; j++) {
        const e1 = voor[i], e2 = voor[j];
        if (Math.hypot(e1.b.x - e2.a.x, e1.b.z - e2.a.z) > 0.05) continue;
        if (e1.n.x * e2.n.x + e1.n.z * e2.n.z > 0.75) continue;
        const bis = norm2({ x: -(e1.n.x + e2.n.x), z: -(e1.n.z + e2.n.z) });
        const R = 3.2;
        const c = { x: e1.b.x + bis.x * R * 0.55, z: e1.b.z + bis.z * R * 0.55 };
        hoektoren(mb, c, R, Y + hBG, top + LAAG, gevel, steen, r.next() < 0.55 ? 'koper' : 'zink');
        hoekGedaan = true;
        break;
      }
    }
  }
}
