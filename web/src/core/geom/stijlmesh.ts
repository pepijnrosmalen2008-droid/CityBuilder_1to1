import { V2, V3, puntInPolygoon } from '../math';
import { Rng } from '../rng';
import { Gebouw, Anker, totaleHoogte } from '../wereld';
import { MeshBouwer, Prop } from './mesh';
import { driehoeken, getekendOppervlak, knipHalfvlak, zwaartepunt } from '../poly';
import { LOD } from './lod';
import { H, Rand, randen, wand, vlak, inzet, norm, doos, dakrand, deur, P3, N3, OP, PUIEN, puiUV } from './gebouwmesh';

// ════════════════════════════════════════════════════════════════════════════════════
// GEBOUWTYPES PER BOUWSTIJL
// Grachtenpanden met trap-, hals- en klokgevels, pakhuizen, naoorlogse portiek- en
// galerijflats, wederopbouwwinkels, sheddaken, moderne appartementen met terugliggende
// lagen, en de steigers van een verbouwing.
// ════════════════════════════════════════════════════════════════════════════════════

/** Dak waarop zonnepanelen/groen/installaties mogen (null = schuin dak). */
export interface DakInfo { poly: V2[]; y: number }

interface Pand { poly: V2[]; i: number; voor: Rand | null; diep: number }

/** De panden van een gebouw als losse vierhoeken tussen de pandgrenzen (afgeknipt op een hoek). */
export function pandPolys(g: Gebouw): Pand[] {
  const gr = g.pandGrenzen;
  if (!gr || gr.length < 2) return [{ poly: g.voet, i: 0, voor: randen(g).find(r => r.soort === 'voor') ?? null, diep: g.diepte }];
  const r: Pand[] = [];
  for (let i = 0; i < gr.length - 1; i++) {
    const a = gr[i], b = gr[i + 1];
    const dA = Math.min(g.terug + g.diepte, a.d - 1), dB = Math.min(g.terug + g.diepte, b.d - 1);
    let poly: V2[] = [
      { x: a.p.x + a.n.x * g.terug, z: a.p.z + a.n.z * g.terug }, { x: b.p.x + b.n.x * g.terug, z: b.p.z + b.n.z * g.terug },
      { x: b.p.x + b.n.x * dB, z: b.p.z + b.n.z * dB }, { x: a.p.x + a.n.x * dA, z: a.p.z + a.n.z * dA },
    ];
    for (const z of g.zijStraat ?? []) if (poly.length >= 3) poly = knipHalfvlak(poly, z.o, z.n);
    if (poly.length < 3 || Math.abs(getekendOppervlak(poly)) < 10) continue;
    const rd = randen(g, poly);
    const voor = rd.filter(x => x.soort === 'voor').sort((p, q) => q.L - p.L)[0] ?? null;
    r.push({ poly, i, voor, diep: Math.min(dA, dB) - g.terug });
  }
  return r;
}

/** Anker op de voorgevel (n naar binnen), voor deuren. */
const ankerOp = (x: Rand, s: number): Anker => ({ p: { x: x.a.x + x.t.x * s, z: x.a.z + x.t.z * s }, n: { x: -x.n.x, z: -x.n.z }, t: x.t, d: 0 });

type GevelTop = 'trap' | 'hals' | 'klok' | 'tuit' | 'lijst';

/** Omtrek van een gevel-top in (s langs de gevel, y omhoog), van links onder naar rechts onder. */
function gevelOmtrek(soort: GevelTop, L: number, h: number): [number, number][] {
  const m = L / 2;
  const spiegel = (l: [number, number][]) => [...l, ...l.slice(0, -1).reverse().map(([s, y]) => [L - s, y] as [number, number])];
  switch (soort) {
    case 'trap': {
      const n = 3, top = L * 0.2;
      const pts: [number, number][] = [[0, 0]];
      for (let j = 0; j < n; j++) { const s = (m - top / 2) * j / n, y = h * (j + 1) / (n + 1); pts.push([s, y], [(m - top / 2) * (j + 1) / n, y]); }
      pts.push([m - top / 2, h], [m, h]);
      return spiegel(pts);
    }
    case 'hals': return spiegel([[0, 0], [0, h * 0.18], [L * 0.27, h * 0.42], [L * 0.27, h * 0.84], [m, h]]);
    case 'klok': return spiegel([[0, 0], [0, h * 0.15], [L * 0.1, h * 0.24], [L * 0.2, h * 0.36], [L * 0.24, h * 0.52], [L * 0.25, h * 0.7], [L * 0.31, h * 0.86], [L * 0.4, h * 0.96], [m, h]]);
    case 'tuit': return spiegel([[0, 0], [m - L * 0.08, h * 0.92], [m, h * 0.92]]);
    default: return [[0, 0], [0, h], [L, h], [L, 0]];
  }
}

/** Gevel-top als dun schijfje muurwerk voor de dakvoet, met zandstenen afdekking op de treden. */
function gevelTop(mb: MeshBouwer, x: Rand, y: number, soort: GevelTop, h: number, mat: string, hijsbalk: boolean) {
  const omtrek = gevelOmtrek(soort, x.L, h);
  const tri = driehoeken(omtrek.map(([s, yy]) => ({ x: s, z: yy })));
  const P = (s: number, yy: number, d: number): V3 => ({ x: x.a.x + x.t.x * s + x.n.x * d, y: y + yy, z: x.a.z + x.t.z * s + x.n.z * d });
  const dik = 0.35;
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [omtrek[tri[i]], omtrek[tri[i + 1]], omtrek[tri[i + 2]]];
    mb.driehoek(mat, P(a[0], a[1], 0.02), P(b[0], b[1], 0.02), P(c[0], c[1], 0.02), [a[0], a[1]], [b[0], b[1]], [c[0], c[1]], N3(x.n));
    mb.driehoek(mat, P(a[0], a[1], -dik), P(b[0], b[1], -dik), P(c[0], c[1], -dik), [a[0], a[1]], [b[0], b[1]], [c[0], c[1]], N3({ x: -x.n.x, z: -x.n.z }));
  }
  // Randen van de schijf dichtmaken (zichtbaar van opzij) en treden afdekken.
  for (let i = 0; i < omtrek.length - 1; i++) {
    const [s0, y0] = omtrek[i], [s1, y1] = omtrek[i + 1];
    const ds = s1 - s0, dy = y1 - y0, L = Math.hypot(ds, dy);
    if (L < 0.01) continue;
    const uit: V3 = { x: x.t.x * dy / L, y: -ds / L, z: x.t.z * dy / L };
    mb.quad(mat, P(s0, y0, 0.02), P(s1, y1, 0.02), P(s1, y1, -dik), P(s0, y0, -dik), [0, 0], [L, 0], [L, dik], [0, dik], { x: -uit.x, y: -uit.y, z: -uit.z });
    if (Math.abs(dy) < 0.01 && soort !== 'lijst') {
      const m = { x: x.a.x + x.t.x * (s0 + s1) / 2 + x.n.x * -0.15, z: x.a.z + x.t.z * (s0 + s1) / 2 + x.n.z * -0.15 };
      doos(mb, 'trim', 'trim', m, x.t, Math.abs(ds) + 0.1, dik + 0.25, y + y0, y + y0 + 0.14);
    }
  }
  // Zolderluik en (bij woonhuizen en pakhuizen) een hijsbalk.
  const m = x.L / 2, P2 = (s: number, yy: number) => P(s, yy, 0.05);
  const lb = Math.min(0.9, x.L * 0.16), lh = Math.min(1.2, h * 0.3), ly = h * 0.42;
  if (soort !== 'lijst' && h > 2) {
    mb.quad('trim', P2(m - lb / 2 - 0.08, ly - 0.08), P2(m + lb / 2 + 0.08, ly - 0.08), P2(m + lb / 2 + 0.08, ly + lh + 0.08), P2(m - lb / 2 - 0.08, ly + lh + 0.08), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
    mb.quad('raam', P(m - lb / 2, ly, 0.07), P(m + lb / 2, ly, 0.07), P(m + lb / 2, ly + lh, 0.07), P(m - lb / 2, ly + lh, 0.07), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
  }
  if (hijsbalk && h > 2) {
    const c = { x: x.a.x + x.t.x * m + x.n.x * 0.5, z: x.a.z + x.t.z * m + x.n.z * 0.5 };
    doos(mb, 'hout', 'hout', c, { x: x.n.x, z: x.n.z }, 1.3, 0.22, y + h * 0.82, y + h * 0.82 + 0.25);
  }
}

/** Zadeldak met de nok loodrecht op de straat (grachtpand); de gevel-top staat ervoor. */
function dwarsDak(mb: MeshBouwer, p: Pand, y: number, helling: number, dakMat: string, muur: string): number {
  const x = p.voor!;
  const L = x.L, inw = { x: -x.n.x, z: -x.n.z }, D = Math.max(4, p.diep);
  const nokH = (L / 2) * Math.tan(helling * Math.PI / 180);
  const Q = (s: number, d: number, yy: number): V3 => ({ x: x.a.x + x.t.x * s + inw.x * d, y: y + yy, z: x.a.z + x.t.z * s + inw.z * d });
  const sl = Math.hypot(L / 2, nokH);
  // Twee dakvlakken, iets overstekend aan de zijkanten.
  for (const kant of [0, 1]) {
    const s0 = kant ? L + 0.15 : -0.15, yy = -0.15 * Math.tan(helling * Math.PI / 180);
    const buiten: V3 = { x: x.t.x * (kant ? 1 : -1) * nokH / sl, y: (L / 2) / sl, z: x.t.z * (kant ? 1 : -1) * nokH / sl };
    mb.quad(dakMat, Q(s0, 0.1, yy), Q(L / 2, 0.1, nokH), Q(L / 2, D, nokH), Q(s0, D, yy), [0, 0], [sl, 0], [sl, D], [0, D], buiten);
  }
  // Achtergevel-driehoek.
  mb.driehoek(muur, Q(0, D, 0), Q(L, D, 0), Q(L / 2, D, nokH), [0, 0], [L, 0], [L / 2, nokH], N3(inw));
  // Nokvorst.
  const c = { x: x.a.x + x.t.x * L / 2 + inw.x * D / 2, z: x.a.z + x.t.z * L / 2 + inw.z * D / 2 };
  doos(mb, 'dakpannenAntraciet', 'dakpannenAntraciet', c, inw, D, 0.3, y + nokH - 0.1, y + nokH + 0.12);
  return nokH;
}

/**
 * Grachtenpanden (en pakhuizen): elk pand een eigen gevelsteen, hoogte en gevel-top.
 * soort bepaalt de begane grond: woning met stoep, winkelpui, kantoor of pakhuisdeuren.
 */
export function grachtpanden(mb: MeshBouwer, g: Gebouw, hoogte: H, soort: 'wonen' | 'winkel' | 'kantoor' | 'pakhuis') {
  const Y = g.y, Hb = totaleHoogte(g.lagen), lagen = g.lagen.length, hBG = g.lagen[0].hoogte;
  const pakhuis = soort === 'pakhuis';
  const laagH = pakhuis ? 3 : Hb / lagen;
  const gevels = ['grachtRood', 'grachtDonker', 'stuc', 'grachtRood', 'baksteenBruin', 'grachtDonker'];
  const toppen: GevelTop[] = pakhuis ? ['tuit', 'tuit', 'lijst'] : ['trap', 'hals', 'klok', 'hals', 'lijst', 'klok'];
  void hoogte;
  const alle = pandPolys(g);
  for (const p of alle) {
    const r = new Rng(g.seed + p.i * 131 + 7);
    const kop = p === alle[0] || p === alle[alle.length - 1];
    const gevel = pakhuis || p.i % 3 === 0 ? g.gevel! : r.kies(gevels);
    const extra = pakhuis ? 0 : r.kies([-1, 0, 0, 1]) * laagH * (lagen > 2 ? 1 : 0) + r.range(-0.3, 0.6);
    const top = Y + Hb + extra;
    const lagenHier = (top - Y) / laagH;
    const rd = randen(g, p.poly);
    for (const x of rd) {
      const travee = Math.max(1.6, x.L / Math.max(2, Math.round(x.L / 2.1)));
      // Kopgevel aan het eind van de rij: ook ramen (je ziet hem vanaf de straat).
      if (x.soort === 'zij') { if (kop && !pakhuis) wand(mb, `gevel:${gevel}`, x, Y, top, 0, lagenHier, travee); else wand(mb, `muur:${gevel}`, x, Y, top, 0, 0); continue; }
      if (soort === 'winkel' && x.soort === 'voor') {
        mb.quad(`winkelpui:${(g.seed + p.i) % PUIEN}`, P3(x.a, Y), P3(x.b, Y), P3(x.b, Y + hBG), P3(x.a, Y + hBG), ...puiUV(x), N3(x.n));
        wand(mb, `gevel:${gevel}`, x, Y + hBG, top, 0, lagenHier - 1, travee);
        continue;
      }
      wand(mb, `gevel:${gevel}`, x, Y, top, 0, lagenHier, travee);
    }
    // Lijst (kroonlijst) onder de dakvoet.
    if (p.voor) wand(mb, 'trim', p.voor, top - 0.25, top, 0, 0, 3, 0.12);
    const dakMat = r.next() < 0.6 ? 'dakpannenAntraciet' : 'dakpannen';
    if (p.voor && p.poly.length === 4) {
      const nok = dwarsDak(mb, p, top, pakhuis ? 40 : 52, dakMat, `muur:${gevel}`);
      const t = r.kies(toppen);
      gevelTop(mb, p.voor, top, t, t === 'lijst' ? 0.9 : nok + (t === 'tuit' ? 0.4 : 1.1), `muur:${gevel}`, soort === 'wonen' || pakhuis);
    } else {
      vlak(mb, 'dakgrind', p.poly, top);
      dakrand(mb, p.poly, top - 0.05, 0.9, 0.3, `muur:${gevel}`);
    }
    // Begane grond: stoep met deur, kantoorentree of pakhuisdeuren.
    if (p.voor) {
      if (soort === 'wonen' || soort === 'kantoor') deur(mb, ankerOp(p.voor, p.voor.L * (r.next() < 0.5 ? 0.25 : 0.75)), Y, (g.seed + p.i) % 5);
      if (pakhuis) {
        const m = p.voor.L / 2;
        for (let l = 0; l < Math.floor(lagenHier); l++) {
          const y0 = Y + l * laagH + (l === 0 ? 0 : 0.6), y1 = Y + l * laagH + (l === 0 ? 2.8 : 2.4);
          const q = (s: number, yy: number) => P3({ x: p.voor!.a.x + p.voor!.t.x * s + p.voor!.n.x * 0.04, z: p.voor!.a.z + p.voor!.t.z * s + p.voor!.n.z * 0.04 }, yy);
          mb.quad('hout', q(m - 0.8, y0), q(m + 0.8, y0), q(m + 0.8, y1), q(m - 0.8, y1), [0, 0], [1.6, 0], [1.6, y1 - y0], [0, y1 - y0], N3(p.voor.n));
        }
      }
    }
  }
}

// ─── Rijwoningen: stijlvarianten ─────────────────────────────────────────────────

export interface RijParams { helling: number; platKans: number; luifel: boolean; dakkapel: number; erker: boolean; hout: boolean; schoorsteen: boolean; dakMat?: string; dakrand: string }

export function rijParams(g: Gebouw, r: Rng): RijParams {
  const n = g.niveau ?? 1;
  switch (g.type) {
    case 'rijtjes50': return { helling: 28, platKans: n <= 1 ? 0.5 : 0.25, luifel: true, dakkapel: n >= 3 ? 0.25 : 0, erker: false, hout: false, schoorsteen: false, dakMat: 'dakpannenAntraciet', dakrand: 'trim' };
    case 'bloemkool': return { helling: 56, platKans: 0, luifel: false, dakkapel: 0.85, erker: false, hout: true, schoorsteen: false, dakMat: 'dakpannenAntraciet', dakrand: 'trimDonker' };
    case 'vinex': return { helling: r.next() < 0.5 ? 48 : 38, platKans: n >= 4 ? 0.45 : 0.25, luifel: false, dakkapel: 0, erker: false, hout: g.gevel !== 'houtGevel' && r.next() < 0.7, schoorsteen: false, dakMat: 'dakpannenAntraciet', dakrand: 'trimDonker' };
    default: return { helling: 42, platKans: 0.1, luifel: false, dakkapel: n >= 2 ? 0.5 : 0.15, erker: n >= 3, hout: false, schoorsteen: true, dakrand: 'trim' };
  }
}

/** Erker op de begane grond (jaren dertig, vanaf niveau 3). */
export function erker(mb: MeshBouwer, an: Anker, Y: number, w: number, muur: string) {
  if (LOD.ver) return;
  const bw = Math.min(w - 1.8, 3.0);
  if (bw < 1.6) return;
  const s = w * 0.22;
  const c = { x: an.p.x - an.n.x * 0.45 + an.t.x * s, z: an.p.z - an.n.z * 0.45 + an.t.z * s };
  doos(mb, muur, 'trim', c, an.t, bw, 0.9, Y, Y + 0.7);
  doos(mb, 'trim', 'trim', c, an.t, bw, 0.9, Y + 0.7, Y + 0.8);
  // Ramen rondom.
  const uit = { x: -an.n.x, z: -an.n.z };
  const v = (ds: number, d: number) => ({ x: an.p.x + an.t.x * (s + ds) + uit.x * d, z: an.p.z + an.t.z * (s + ds) + uit.z * d });
  mb.quad('raam', P3(v(-bw / 2 + 0.1, 0.92), Y + 0.85), P3(v(bw / 2 - 0.1, 0.92), Y + 0.85), P3(v(bw / 2 - 0.1, 0.92), Y + 2.55), P3(v(-bw / 2 + 0.1, 0.92), Y + 2.55), [0, 0], [1, 0], [1, 1], [0, 1], N3(uit));
  doos(mb, 'trim', 'trim', c, an.t, bw, 0.9, Y + 2.55, Y + 2.75);
  doos(mb, 'dakgrind', 'trimDonker', c, an.t, bw + 0.1, 1.0, Y + 2.75, Y + 2.9);
}

/** Doorlopende betonnen luifel boven de voordeuren (naoorlogs). */
export function luifel(mb: MeshBouwer, an: Anker, Y: number, w: number) {
  if (LOD.ver) return;
  doos(mb, 'beton', 'beton', { x: an.p.x - an.n.x * 0.55, z: an.p.z - an.n.z * 0.55 }, an.t, w + 0.02, 1.1, Y + 2.5, Y + 2.68);
}

/** Houten gevelstuk naast de voordeur (nieuwbouw). */
export function houtAccent(mb: MeshBouwer, an: Anker, Y: number, w: number, hoog: number) {
  if (LOD.ver) return;
  const uit = { x: -an.n.x, z: -an.n.z };
  const v = (s: number) => ({ x: an.p.x + an.t.x * s + uit.x * 0.04, z: an.p.z + an.t.z * s + uit.z * 0.04 });
  const s0 = -w / 2 + 0.05, s1 = -0.75;
  if (s1 - s0 < 0.8) return;
  mb.quad('muur:houtGevel', P3(v(s0), Y), P3(v(s1), Y), P3(v(s1), Y + hoog), P3(v(s0), Y + hoog), [0, 0], [s1 - s0, 0], [s1 - s0, hoog], [0, hoog], N3(uit));
}

// ─── Flats ───────────────────────────────────────────────────────────────────────

const langsteVoor = (rd: Rand[]) => rd.filter(x => x.soort === 'voor').sort((a, b) => b.L - a.L)[0];

/** Portiekflat: platte kap met overstek, glazen trappenhuizen, dichte betonnen balkons. */
export function portiekflat(mb: MeshBouwer, g: Gebouw, r: Rng): DakInfo {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length;
  const rd = randen(g);
  for (const x of rd) wand(mb, x.soort === 'zij' ? `muur:${g.gevel}` : `gevel:${g.gevel}`, x, Y, H, 0, lagen);
  vlak(mb, 'dakgrind', g.voet, H);
  const rand = inzet(g.voet, -0.45);
  vlak(mb, 'trim', rand, H + 0.35); vlak(mb, 'trim', rand, H + 0.02, false);
  for (const x of randen(g, rand)) wand(mb, 'trim', x, H, H + 0.35, 0, 0);
  const v = langsteVoor(rd);
  if (v) {
    const n = Math.max(1, Math.round(v.L / 13));
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * v.L / n;
      const P = (ds: number, d: number) => ({ x: v.a.x + v.t.x * (s + ds) + v.n.x * d, z: v.a.z + v.t.z * (s + ds) + v.n.z * d });
      // Trappenhuis: glasstrook over de hele hoogte, met de entree eronder.
      mb.quad('trim', P3(P(-1.0, 0.03), Y + 2.6), P3(P(1.0, 0.03), Y + 2.6), P3(P(1.0, 0.03), H - 0.6), P3(P(-1.0, 0.03), H - 0.6), [0, 0], [1, 0], [1, 1], [0, 1], N3(v.n));
      mb.quad('raam', P3(P(-0.8, 0.06), Y + 2.8), P3(P(0.8, 0.06), Y + 2.8), P3(P(0.8, 0.06), H - 0.8), P3(P(-0.8, 0.06), H - 0.8), [0, 0], [1, 0], [1, 1], [0, 1], N3(v.n));
      deur(mb, ankerOp(v, s), Y, (g.seed + i) % 5);
      // Balkons links en rechts van het trappenhuis.
      if (LOD.ver) continue;
      let y = Y + g.lagen[0].hoogte;
      for (let l = 1; l < lagen; l++) {
        for (const k of [-1, 1]) {
          const ds = k * Math.min(4, v.L / n / 2 - 1.8);
          if (Math.abs(ds) < 2.2) continue;
          const c = P(ds, 0.7);
          doos(mb, 'beton', 'beton', c, v.t, 3.0, 1.4, y - 0.18, y);
          doos(mb, `muur:${g.gevel}`, 'beton', P(ds, 1.36), v.t, 3.0, 0.12, y, y + 1.0);
        }
        y += g.lagen[l].hoogte;
      }
    }
  }
  void r;
  return { poly: g.voet, y: H };
}

/** Galerijflat: lange schijf met doorlopende galerijen en een trap-/liftoren aan de kop. */
export function galerijflat(mb: MeshBouwer, g: Gebouw): DakInfo {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length;
  const rd = randen(g);
  for (const x of rd) wand(mb, x.soort === 'zij' ? `muur:${g.gevel}` : `gevel:${g.gevel}`, x, Y, H, 0, lagen);
  vlak(mb, 'dakgrind', g.voet, H);
  dakrand(mb, g.voet, H - 0.1, 0.6, 0.3, 'beton');
  const v = langsteVoor(rd);
  if (v) {
    let y = Y + g.lagen[0].hoogte;
    const m = { x: (v.a.x + v.b.x) / 2, z: (v.a.z + v.b.z) / 2 };
    for (let l = 1; l < lagen; l++) {
      // Galerijvloer en dichte borstwering.
      doos(mb, 'beton', 'beton', { x: m.x + v.n.x * 0.9, z: m.z + v.n.z * 0.9 }, v.t, v.L, 1.8, y - 0.22, y);
      doos(mb, 'trim', 'beton', { x: m.x + v.n.x * 1.74, z: m.z + v.n.z * 1.74 }, v.t, v.L, 0.12, y, y + 1.05);
      y += g.lagen[l].hoogte;
    }
    // Trap- en liftoren aan de kop.
    const c = { x: v.b.x + v.t.x * 2.4 + v.n.x * 0.4, z: v.b.z + v.t.z * 2.4 + v.n.z * 0.4 };
    if (puntInPolygoon(c, g.perceel)) doos(mb, 'beton', 'dakgrind', c, v.t, 4.6, 5, Y, H + 2.6);
    deur(mb, ankerOp(v, v.L / 2), Y, g.seed % 5);
  }
  return { poly: g.voet, y: H };
}

/** Moderne appartementen: donkere plint, gestapelde glazen balkons, terugliggende bovenste laag(en). */
export function appModern(mb: MeshBouwer, g: Gebouw, r: Rng, props: Prop[]): DakInfo {
  const Y = g.y, lagen = g.lagen.length;
  const hL = g.lagen.map(l => l.hoogte);
  const yL = (i: number) => Y + hL.slice(0, i).reduce((a, b) => a + b, 0);
  // Trappen: hoofdvolume, bij veel lagen een smallere toren erop, en een penthouse.
  const tot = lagen - (lagen >= 4 ? 1 : 0);
  const knik = lagen >= 9 ? Math.round(lagen * 0.55) : tot;
  const delen: { poly: V2[]; van: number; tot: number; mat: string }[] = [];
  delen.push({ poly: g.voet, van: 0, tot: knik, mat: `gevel:${g.gevel}` });
  let poly = g.voet;
  if (knik < tot) { poly = inzet(g.voet, 2.2); delen.push({ poly, van: knik, tot, mat: `gevel:${g.gevel}` }); }
  if (tot < lagen) { const pp = inzet(poly, 2.4); if (Math.abs(getekendOppervlak(pp)) > 40) { delen.push({ poly: pp, van: tot, tot: lagen, mat: 'gevel:vliesgevel' }); poly = pp; } }
  for (const d of delen) {
    for (const x of randen(g, d.poly)) {
      // Plint van donkere steen of glas op de begane grond.
      if (d.van === 0) { wand(mb, x.soort === 'voor' ? 'gevel:antraciet' : 'muur:antraciet', x, Y, yL(1), 0, 1); wand(mb, x.soort === 'zij' ? `muur:${g.gevel}` : d.mat, x, yL(1), yL(d.tot), 1, d.tot); }
      else wand(mb, x.soort === 'zij' && !d.mat.includes('vlies') ? `muur:${g.gevel}` : d.mat, x, yL(d.van), yL(d.tot), d.van, d.tot);
    }
    vlak(mb, 'dakgrind', d.poly, yL(d.tot));
    dakrand(mb, d.poly, yL(d.tot) - 0.05, 1.05, 0.25, 'trimDonker');
  }
  // Glazen balkons, om en om verspringend.
  const v = langsteVoor(randen(g));
  if (v && !LOD.ver) {
    const n = Math.max(1, Math.floor(v.L / 5.5));
    for (let l = 1; l < knik; l++) for (let i = 0; i < n; i++) {
      const s = (i + 0.5 + (l % 2 ? 0.25 : -0.25)) * v.L / n;
      if (s < 1.6 || s > v.L - 1.6) continue;
      const y = yL(l), bb = Math.min(3.6, v.L / n - 1.2);
      const P = (ds: number, d: number) => ({ x: v.a.x + v.t.x * (s + ds) + v.n.x * d, z: v.a.z + v.t.z * (s + ds) + v.n.z * d });
      doos(mb, 'trimDonker', 'beton', P(0, 0.9), v.t, bb, 1.8, y - 0.2, y);
      mb.quad('glas', P3(P(-bb / 2, 1.8), y), P3(P(bb / 2, 1.8), y), P3(P(bb / 2, 1.8), y + 1.05), P3(P(-bb / 2, 1.8), y + 1.05), [0, 0], [1, 0], [1, 1], [0, 1], N3(v.n));
      for (const k of [-1, 1]) mb.quad('glas', P3(P(k * bb / 2, 0), y), P3(P(k * bb / 2, 1.8), y), P3(P(k * bb / 2, 1.8), y + 1.05), P3(P(k * bb / 2, 0), y + 1.05), [0, 0], [1, 0], [1, 1], [0, 1], N3({ x: v.t.x * k, z: v.t.z * k }));
    }
    // Entree met luifel en, vanaf niveau 4, bomen in grote bakken.
    const m = ankerOp(v, v.L / 2);
    deur(mb, m, Y, 3);
    doos(mb, 'trimDonker', 'trimDonker', { x: m.p.x - m.n.x * 1.2, z: m.p.z - m.n.z * 1.2 }, v.t, 5, 2.4, Y + 3.0, Y + 3.2);
    if ((g.niveau ?? 1) >= 4 && g.terug > 2.5) for (const k of [-1, 1]) {
      const c = { x: m.p.x - m.n.x * g.terug * 0.55 + v.t.x * k * 5, z: m.p.z - m.n.z * g.terug * 0.55 + v.t.z * k * 5 };
      doos(mb, 'beton', 'tuin', c, v.t, 1.6, 1.6, Y - 0.1, Y + 0.6);
      props.push({ soort: 'linde', x: c.x, y: Y + 0.5, z: c.z, rot: r.range(0, 6), schaal: 0.55, variant: r.int(0, 1) });
    }
  }
  return { poly, y: yL(lagen) };
}

/** Wederopbouwwinkels: doorlopende betonnen luifel, platte kap met dunne overstek. */
export function wederopbouwLuifel(mb: MeshBouwer, g: Gebouw) {
  if (LOD.ver) return;
  const hBG = g.lagen[0].hoogte, Y = g.y;
  for (const x of randen(g).filter(q => q.soort === 'voor')) {
    const m = { x: (x.a.x + x.b.x) / 2 + x.n.x * 1.1, z: (x.a.z + x.b.z) / 2 + x.n.z * 1.1 };
    doos(mb, 'beton', 'beton', m, x.t, x.L, 2.2, Y + hBG - 0.55, Y + hBG - 0.3);
    doos(mb, 'trim', 'trim', { x: m.x + x.n.x * 1.08, z: m.z + x.n.z * 1.08 }, x.t, x.L, 0.06, Y + hBG - 0.55, Y + hBG - 0.15);
  }
}

/** Glazen balkons op de verdiepingen boven de winkels (modern gemengd). */
export function bovenBalkons(mb: MeshBouwer, g: Gebouw) {
  if (LOD.ver) return;
  const Y = g.y;
  const v = langsteVoor(randen(g));
  if (!v) return;
  const n = Math.max(1, Math.floor(v.L / 6));
  let y = Y + g.lagen[0].hoogte;
  for (let l = 1; l < g.lagen.length; l++) {
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * v.L / n, bb = Math.min(3.4, v.L / n - 1.4);
      if (bb < 1.5) continue;
      const P = (ds: number, d: number) => ({ x: v.a.x + v.t.x * (s + ds) + v.n.x * d, z: v.a.z + v.t.z * (s + ds) + v.n.z * d });
      doos(mb, 'trimDonker', 'beton', P(0, 0.6), v.t, bb, 1.2, y - 0.15, y);
      mb.quad('glas', P3(P(-bb / 2, 1.2), y), P3(P(bb / 2, 1.2), y), P3(P(bb / 2, 1.2), y + 1.0), P3(P(-bb / 2, 1.2), y + 1.0), [0, 0], [1, 0], [1, 1], [0, 1], N3(v.n));
    }
    y += g.lagen[l].hoogte;
  }
}

/** Jaren-dertig kantoor: baksteen, natuurstenen plint, kroonlijst en een statige entree. */
export function kantoor30(mb: MeshBouwer, g: Gebouw): DakInfo {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length;
  const rd = randen(g);
  for (const x of rd) {
    wand(mb, 'beton', x, Y, Y + 1.0, 0, 0, 3, 0.05);
    wand(mb, x.soort === 'zij' ? `muur:${g.gevel}` : `gevel:${g.gevel}`, x, Y, H, 0, lagen);
  }
  vlak(mb, 'dakgrind', g.voet, H);
  dakrand(mb, g.voet, H - 0.1, 1.2, 0.5, 'trim');
  const v = langsteVoor(rd);
  if (v) {
    const m = ankerOp(v, v.L / 2);
    doos(mb, 'beton', 'beton', { x: m.p.x - m.n.x * 0.35, z: m.p.z - m.n.z * 0.35 }, v.t, 4.2, 0.7, Y, Y + 4.2);
    mb.quad('glas', P3({ x: m.p.x - m.n.x * 0.72 - v.t.x * 1.3, z: m.p.z - m.n.z * 0.72 - v.t.z * 1.3 }, Y), P3({ x: m.p.x - m.n.x * 0.72 + v.t.x * 1.3, z: m.p.z - m.n.z * 0.72 + v.t.z * 1.3 }, Y), P3({ x: m.p.x - m.n.x * 0.72 + v.t.x * 1.3, z: m.p.z - m.n.z * 0.72 + v.t.z * 1.3 }, Y + 3.4), P3({ x: m.p.x - m.n.x * 0.72 - v.t.x * 1.3, z: m.p.z - m.n.z * 0.72 - v.t.z * 1.3 }, Y + 3.4), [0, 0], [1, 0], [1, 1], [0, 1], N3(v.n));
  }
  return { poly: g.voet, y: H };
}

/** Kantoortoren met plint (sokkel) en, bij hoge torens, een smallere toren en een kroon. */
export function kantoorToren(mb: MeshBouwer, g: Gebouw): DakInfo {
  const Y = g.y, lagen = g.lagen.length, hL = g.lagen.map(l => l.hoogte);
  const yL = (i: number) => Y + hL.slice(0, i).reduce((a, b) => a + b, 0);
  const sokkel = lagen >= 9 ? 3 : lagen;
  const kroon = lagen >= 12 ? lagen - 2 : lagen;
  const delen = [{ poly: g.voet, van: 0, tot: sokkel }];
  let poly = g.voet;
  if (sokkel < lagen) { const t = inzet(g.voet, 3); if (Math.abs(getekendOppervlak(t)) > 120) { poly = t; delen.push({ poly, van: sokkel, tot: kroon }); } else delen[0].tot = kroon; }
  if (kroon < lagen) { const t = inzet(poly, 1.8); if (Math.abs(getekendOppervlak(t)) > 60) { poly = t; delen.push({ poly, van: kroon, tot: lagen }); } else delen[delen.length - 1].tot = lagen; }
  delen[delen.length - 1].tot = lagen;
  for (const d of delen) {
    for (const x of randen(g, d.poly)) {
      if (d.van === 0) { wand(mb, 'glas', x, Y, yL(1), 0, 0); wand(mb, `gevel:${g.gevel}`, x, yL(1), yL(d.tot), 1, d.tot, g.gevel === 'vliesgevel' ? 3.6 : 3); }
      else wand(mb, `gevel:${g.gevel}`, x, yL(d.van), yL(d.tot), d.van, d.tot, g.gevel === 'vliesgevel' ? 3.6 : 3);
    }
    vlak(mb, 'dakgrind', d.poly, yL(d.tot));
    dakrand(mb, d.poly, yL(d.tot) - 0.1, 1.1, 0.35, g.gevel === 'vliesgevel' ? 'metaal' : 'trimDonker');
  }
  // Hoogste niveau: een spits op de kroon.
  const top = yL(lagen);
  if ((g.niveau ?? 1) >= 5 && lagen >= 12) { const c = zwaartepunt(poly); doos(mb, 'metaal', 'metaal', c, { x: 1, z: 0 }, 0.6, 0.6, top, top + 14); }
  return { poly, y: top };
}

/** Bedrijfshal met sheddak (zaagtand): schuine dakvlakken met glas op het noorden. */
export function sheddak(mb: MeshBouwer, g: Gebouw): DakInfo | null {
  const Y = g.y, H = Y + totaleHoogte(g.lagen);
  const rd = randen(g);
  for (const x of rd) wand(mb, x.soort === 'voor' ? `gevel:${g.gevel}` : `muur:${g.gevel}`, x, Y, H, 0, 3);
  const v = langsteVoor(rd);
  if (!v || g.voet.length !== 4) { vlak(mb, 'golfdak', g.voet, H); dakrand(mb, g.voet, H - 0.05, 0.6, 0.2, 'trimDonker'); return { poly: g.voet, y: H }; }
  const inw = { x: -v.n.x, z: -v.n.z };
  // Diepte van het gebouw langs de normaal van de voorgevel.
  const diep = Math.max(...g.voet.map(p => (p.x - v.a.x) * inw.x + (p.z - v.a.z) * inw.z));
  const Q = (s: number, d: number, y: number): V3 => ({ x: v.a.x + v.t.x * s + inw.x * d, y, z: v.a.z + v.t.z * s + inw.z * d });
  const tand = 7, hT = 2.6;
  const n = Math.max(1, Math.round(diep / tand)), dt = diep / n;
  for (let i = 0; i < n; i++) {
    const d0 = i * dt, d1 = d0 + dt;
    // Schuin vlak van laag (d0) naar hoog (d1), dan glas recht naar beneden.
    mb.quad('golfdak', Q(0, d0, H), Q(v.L, d0, H), Q(v.L, d1, H + hT), Q(0, d1, H + hT), [0, 0], [v.L, 0], [v.L, dt], [0, dt], { x: -inw.x * hT, y: dt, z: -inw.z * hT });
    mb.quad('lichtstraat', Q(0, d1, H), Q(v.L, d1, H), Q(v.L, d1, H + hT), Q(0, d1, H + hT), [0, 0], [v.L, 0], [v.L, hT], [0, hT], N3(inw));
    for (const [s, k] of [[0, -1], [v.L, 1]] as const) mb.driehoek(`muur:${g.gevel}`, Q(s, d0, H), Q(s, d1, H), Q(s, d1, H + hT), [0, 0], [dt, 0], [dt, hT], N3({ x: v.t.x * k, z: v.t.z * k }));
  }
  // Laaddeuren.
  for (let s = 4; s + 2 < v.L; s += 9) {
    const P = (ds: number) => ({ x: v.a.x + v.t.x * (s + ds) + v.n.x * 0.04, z: v.a.z + v.t.z * (s + ds) + v.n.z * 0.04 });
    mb.quad('roldeur', P3(P(-1.8), Y), P3(P(1.8), Y), P3(P(1.8), Y + 4.2), P3(P(-1.8), Y + 4.2), [0, 0], [3.6, 0], [3.6, 4.2], [0, 4.2], N3(v.n));
  }
  return null;
}

/** Steigers rondom een gebouw dat verbouwd wordt (zoals in CS2 bij het opwaarderen), met bouwhek. */
export function steigers(mb: MeshBouwer, g: Gebouw, hoogte: H) {
  const Y = g.y, top = Y + totaleHoogte(g.lagen) + (g.dak || g.type === 'grachtpand' ? 3.5 : 1.2);
  const rd = randen(g);
  for (const x of rd) {
    const a = { x: x.a.x + x.n.x * 1.1 - x.t.x * 1.1, z: x.a.z + x.n.z * 1.1 - x.t.z * 1.1 }, b = { x: x.b.x + x.n.x * 1.1 + x.t.x * 1.1, z: x.b.z + x.n.z * 1.1 + x.t.z * 1.1 };
    const L = x.L + 2.2;
    mb.quad('steiger', P3(a, Y), P3(b, Y), P3(b, top), P3(a, top), [0, 0], [L, 0], [L, top - Y], [0, top - Y], N3(x.n));
    // Steigerplanken per verdieping.
    for (let y = Y + 2; y < top; y += 2) doos(mb, 'hout', 'hout', { x: (a.x + b.x) / 2 - x.n.x * 0.4, z: (a.z + b.z) / 2 - x.n.z * 0.4 }, x.t, L, 0.6, y - 0.04, y);
  }
  for (const x of rd.filter(q => q.soort === 'voor')) {
    const d = Math.max(0.6, Math.min(2.5, g.terug - 0.4));
    const a = { x: x.a.x + x.n.x * d, z: x.a.z + x.n.z * d }, b = { x: x.b.x + x.n.x * d, z: x.b.z + x.n.z * d };
    const ya = hoogte(a.x, a.z), yb = hoogte(b.x, b.z);
    mb.quad('hekwerk', P3(a, ya), P3(b, yb), P3(b, yb + 2), P3(a, ya + 2), [0, 0], [x.L / 3.5, 0], [x.L / 3.5, 1], [0, 1], N3(x.n));
  }
  void OP; void norm;
}

// ─── Villa's, terrasflats en woontorens ──────────────────────────────────────────

/** Schilddak op een rechthoek (voor links, voor rechts, achter rechts, achter links) met overstek. */
function schilddak(mb: MeshBouwer, h: V2[], y: number, helling: number, mat: string) {
  const [F0, F1, , B0] = h;
  const t = norm({ x: F1.x - F0.x, z: F1.z - F0.z }), inw = norm({ x: B0.x - F0.x, z: B0.z - F0.z });
  const w = Math.hypot(F1.x - F0.x, F1.z - F0.z), d = Math.hypot(B0.x - F0.x, B0.z - F0.z);
  const o = 0.45;
  const P = (s: number, e: number): V2 => ({ x: F0.x + t.x * s + inw.x * e, z: F0.z + t.z * s + inw.z * e });
  const a = P(-o, -o), b = P(w + o, -o), c = P(w + o, d + o), e = P(-o, d + o);
  const hI = Math.min(w, d) / 2 + o, tan = Math.tan(helling * Math.PI / 180);
  const top = y + hI * tan - o * tan;
  const R0 = P(Math.min(w / 2, hI - o), d / 2), R1 = P(Math.max(w / 2, w - hI + o), d / 2);
  const yy = y - o * tan;
  const buiten = (n: V2): V3 => ({ x: n.x, y: 1.2, z: n.z });
  mb.quad(mat, P3(a, yy), P3(b, yy), P3(R1, top), P3(R0, top), [0, 0], [w, 0], [w, 4], [0, 4], buiten({ x: -inw.x, z: -inw.z }));
  mb.quad(mat, P3(c, yy), P3(e, yy), P3(R0, top), P3(R1, top), [0, 0], [w, 0], [w, 4], [0, 4], buiten(inw));
  mb.driehoek(mat, P3(e, yy), P3(a, yy), P3(R0, top), [0, 0], [d, 0], [d / 2, 4], buiten({ x: -t.x, z: -t.z }));
  mb.driehoek(mat, P3(b, yy), P3(c, yy), P3(R1, top), [0, 0], [d, 0], [d / 2, 4], buiten(t));
  // Onderkant van het overstek.
  vlak(mb, 'trim', [a, b, c, e], yy, false);
}

/** Vrijstaande villa's: per kavel een huis met tuin rondom, schilddak (klassiek) of kubus met uitkragende verdieping (nieuwbouw), en een garage. */
export function villas(mb: MeshBouwer, g: Gebouw) {
  const Y = g.y, hL = g.lagen.map(l => l.hoogte);
  const H1 = Y + hL[0], H = Y + hL.reduce((a, b) => a + b, 0);
  for (const p of pandPolys(g)) {
    const x = p.voor;
    if (!x || p.poly.length !== 4) continue;
    const r = new Rng(g.seed + p.i * 97);
    const inw = { x: -x.n.x, z: -x.n.z };
    const w = Math.min(11.5, x.L - 6.5), d = Math.min(p.diep, 11);
    if (w < 6) continue;
    const links = r.next() < 0.5;
    const s0 = links ? 1.6 : x.L - 1.6 - w;
    const Q = (s: number, e: number): V2 => ({ x: x.a.x + x.t.x * s + inw.x * e, z: x.a.z + x.t.z * s + inw.z * e });
    const huis = [Q(s0, 0), Q(s0 + w, 0), Q(s0 + w, d), Q(s0, d)];
    const modern = g.stijl === 'nieuwbouw';
    if (modern) {
      // Begane grond en een verschoven bovenverdieping (uitkraging).
      const k = r.range(1.2, 2.2) * (links ? 1 : -1);
      const boven = [Q(s0 + k, -0.8), Q(s0 + w + k * 0.4, -0.8), Q(s0 + w + k * 0.4, d - 1.5), Q(s0 + k, d - 1.5)];
      for (const rr of randen(g, huis)) wand(mb, rr.soort === 'zij' ? `gevel:${g.gevel}` : `gevel:${g.gevel}`, rr, Y, H1, 0, 1, 2.6);
      vlak(mb, 'dakgrind', huis, H1);
      const mat2 = g.gevel === 'witStuc' ? 'gevel:houtGevel' : 'gevel:witStuc';
      for (const rr of randen(g, boven)) wand(mb, mat2, rr, H1, H, 1, 2, 2.6);
      vlak(mb, 'trimDonker', boven, H1 - 0.02, false);
      vlak(mb, r.next() < 0.5 ? 'tuin' : 'dakgrind', boven, H);
      dakrand(mb, boven, H - 0.05, 0.35, 0.2, 'trimDonker');
    } else {
      for (const rr of randen(g, huis)) wand(mb, rr.soort === 'zij' ? `gevel:${g.gevel}` : `gevel:${g.gevel}`, rr, Y, H, 0, 2, 2.6);
      wand(mb, 'trim', randen(g, huis).find(q => q.soort === 'voor') ?? randen(g, huis)[0], H - 0.25, H, 0, 0, 3, 0.15);
      schilddak(mb, huis, H, 38, r.next() < 0.5 ? 'dakpannen' : 'dakpannenAntraciet');
      // Schoorsteen.
      const c = Q(s0 + w * 0.7, d * 0.6);
      doos(mb, `muur:${g.gevel}`, 'trimDonker', c, x.t, 0.7, 0.7, H, H + Math.min(w, d) / 2 * 0.78 + 1.2);
    }
    // Garage met plat dak in de ruimste zijstrook, oprit ervoor.
    const gs = links ? s0 + w + 0.4 : s0 - 3.6;
    const garage = [Q(gs, 1), Q(gs + 3.2, 1), Q(gs + 3.2, 7), Q(gs, 7)];
    if (gs > 0.3 && gs + 3.2 < x.L - 0.3) {
      for (const rr of randen(g, garage)) wand(mb, rr.soort === 'voor' ? 'roldeur' : `muur:${g.gevel}`, rr, Y, Y + 2.8, 0, 0);
      vlak(mb, 'dakgrind', garage, Y + 2.8);
      dakrand(mb, garage, Y + 2.75, 0.25, 0.15, modern ? 'trimDonker' : 'trim');
      const yv = Y - 0.02;
      vlak(mb, 'klinkers', [Q(gs, -g.terug + 0.1), Q(gs + 3.2, -g.terug + 0.1), Q(gs + 3.2, 1), Q(gs, 1)], yv + 0.08);
    }
    deur(mb, ankerOp(x, s0 + w * (links ? 0.3 : 0.7)), Y, (g.seed + p.i) % 5);
  }
}

/** Terrasflat (jaren zeventig): elke laag springt aan de voorkant terug, met plantenbakken op de terrassen. */
export function terrasflat(mb: MeshBouwer, g: Gebouw): DakInfo {
  const Y = g.y, lagen = g.lagen.length, hL = g.lagen.map(l => l.hoogte);
  const yL = (i: number) => Y + hL.slice(0, i).reduce((a, b) => a + b, 0);
  const v = randen(g).filter(x => x.soort === 'voor').sort((a, b) => b.L - a.L)[0];
  let poly = g.voet;
  for (let l = 0; l < lagen; l++) {
    if (v && l >= 2) {
      const inw = { x: -v.n.x, z: -v.n.z }, k = 2.4 * (l - 1);
      const o = { x: (v.a.x + v.b.x) / 2 + inw.x * k, z: (v.a.z + v.b.z) / 2 + inw.z * k };
      const nieuw = knipHalfvlak(g.voet, o, inw);
      if (nieuw.length >= 3 && Math.abs(getekendOppervlak(nieuw)) > 60) poly = nieuw;
    }
    for (const x of randen(g, poly)) wand(mb, x.soort === 'zij' ? `muur:${g.gevel}` : `gevel:${g.gevel}`, x, yL(l), yL(l + 1), l, l + 1);
    vlak(mb, 'stoeptegels', poly, yL(l + 1));
    // Plantenbak langs de terrasrand van de laag eronder.
    const vv = randen(g, poly).filter(x => x.soort === 'voor').sort((a, b) => b.L - a.L)[0];
    if (vv && l >= 1 && l < lagen - 1) {
      const m = { x: (vv.a.x + vv.b.x) / 2 - vv.n.x * 0.4 + vv.n.x * 2.4, z: (vv.a.z + vv.b.z) / 2 - vv.n.z * 0.4 + vv.n.z * 2.4 };
      doos(mb, 'beton', 'haag', m, vv.t, vv.L - 0.4, 0.7, yL(l + 1), yL(l + 1) + 0.75);
    }
  }
  dakrand(mb, poly, yL(lagen) - 0.05, 0.6, 0.3, 'trimDonker');
  if (v) deur(mb, ankerOp(v, v.L / 2), Y, 2);
  return { poly, y: yL(lagen) };
}

/** Woontoren (niveau 5): plint van twee lagen, slanke toren met balkons rondom en een glazen kroon. */
export function woontoren(mb: MeshBouwer, g: Gebouw, r: Rng): DakInfo {
  const Y = g.y, lagen = g.lagen.length, hL = g.lagen.map(l => l.hoogte);
  const yL = (i: number) => Y + hL.slice(0, i).reduce((a, b) => a + b, 0);
  const plint = Math.min(2, lagen - 1);
  let toren = inzet(g.voet, 3);
  if (Math.abs(getekendOppervlak(toren)) < 140) toren = g.voet;
  let kroon = inzet(toren, 1.4);
  if (Math.abs(getekendOppervlak(kroon)) < 80) kroon = toren;
  const kroonVan = Math.max(plint + 1, lagen - 2);
  const delen = [
    { poly: g.voet, van: 0, tot: plint, mat: 'gevel:antraciet' },
    { poly: toren, van: plint, tot: kroonVan, mat: `gevel:${g.gevel}` },
    { poly: kroon, van: kroonVan, tot: lagen, mat: 'gevel:vliesgevel' },
  ];
  for (const d of delen) {
    if (d.tot <= d.van) continue;
    for (const x of randen(g, d.poly)) wand(mb, d.mat, x, yL(d.van), yL(d.tot), d.van, d.tot, d.mat.includes('vlies') ? 3.6 : 3);
    vlak(mb, d.poly === g.voet ? 'tuin' : 'dakgrind', d.poly, yL(d.tot));
    dakrand(mb, d.poly, yL(d.tot) - 0.05, 1.05, 0.25, 'trimDonker');
  }
  // Balkons rondom de toren, om de laag verspringend.
  if (!LOD.ver) for (const x of randen(g, toren)) {
    const n = Math.max(1, Math.floor(x.L / 6));
    for (let l = plint + 1; l < kroonVan; l++) for (let i = 0; i < n; i++) {
      if ((l + i) % 2) continue;
      const s = (i + 0.5) * x.L / n, bb = Math.min(3.4, x.L / n - 1);
      if (bb < 1.6) continue;
      const P = (ds: number, dd: number) => ({ x: x.a.x + x.t.x * (s + ds) + x.n.x * dd, z: x.a.z + x.t.z * (s + ds) + x.n.z * dd });
      const y = yL(l);
      doos(mb, 'trimDonker', 'beton', P(0, 0.75), x.t, bb, 1.5, y - 0.18, y);
      mb.quad('glas', P3(P(-bb / 2, 1.5), y), P3(P(bb / 2, 1.5), y), P3(P(bb / 2, 1.5), y + 1.05), P3(P(-bb / 2, 1.5), y + 1.05), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
    }
  }
  const v = randen(g).filter(x => x.soort === 'voor').sort((a, b) => b.L - a.L)[0];
  if (v) deur(mb, ankerOp(v, v.L / 2), Y, 3);
  void r;
  return { poly: kroon, y: yL(lagen) };
}
