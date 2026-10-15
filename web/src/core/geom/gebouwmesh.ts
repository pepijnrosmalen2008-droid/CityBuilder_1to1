import { V2, V3 } from '../math';
import { Rng } from '../rng';
import { Gebouw, Anker, totaleHoogte } from '../wereld';
import { MeshBouwer, MeshData, Prop } from './mesh';
import { cilinder } from './props';
import { afstandTotLijn, driehoeken, getekendOppervlak, verfijn, zwaartepunt } from '../poly';
import { puntInPolygoon } from '../math';

// Gebouwen op de vorm van hun perceel: elke rand van de footprint wordt een voor-, achter- of
// zijgevel; daken volgen de gevellijn (ook in bochten en op hoeken in verstek).

export const GEVELSTIJLEN = ['baksteenRood', 'baksteenBruin', 'baksteenGeel', 'stuc', 'modernDonker', 'vliesgevel', 'betonband'] as const;
export type GevelStijl = typeof GEVELSTIJLEN[number];
export const PUIEN = 4, LUIFELS = 4, HALTINTEN = 4;

type H = (x: number, z: number) => number;
const OP: V3 = { x: 0, y: 1, z: 0 };
const NEER: V3 = { x: 0, y: -1, z: 0 };

interface Rand { a: V2; b: V2; n: V2; t: V2; L: number; soort: 'voor' | 'achter' | 'zij' }

/** Randen van de footprint met naar buiten wijzende normaal en hun soort. */
function randen(g: Gebouw, poly = g.voet): Rand[] {
  const A = getekendOppervlak(poly);
  const r: Rand[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    const t = { x: dx / L, z: dz / L };
    const n = A > 0 ? { x: t.z, z: -t.x } : { x: -t.z, z: t.x };
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const d = afstandTotLijn(m, g.voorLijn).d;
    // Een rand die naar de straat kijkt en op de rooilijn ligt is een voorgevel.
    const naarStraat = afstandTotLijn({ x: m.x + n.x * 2, z: m.z + n.z * 2 }, g.voorLijn).d < d - 1.5;
    const vanStraat = afstandTotLijn({ x: m.x + n.x * 2, z: m.z + n.z * 2 }, g.voorLijn).d > d + 1.5;
    // Hoekpand: de gevel langs de zijstraat telt ook als voorgevel (ramen, geen blinde muur).
    const zijstraat = (g.zijStraat ?? []).some(z => Math.abs((m.x - z.o.x) * z.n.x + (m.z - z.o.z) * z.n.z) < 0.3 && n.x * z.n.x + n.z * z.n.z < -0.9);
    const soort = zijstraat || (naarStraat && d < g.terug + 1.2) ? 'voor' : vanStraat ? 'achter' : 'zij';
    r.push({ a, b, n, t, L, soort });
  }
  return r;
}

const P3 = (p: V2, y: number): V3 => ({ x: p.x, y, z: p.z });
const N3 = (n: V2): V3 => ({ x: n.x, y: 0, z: n.z });

/** Wand langs een rand; gevelmaterialen krijgen UV's in traveeën en verdiepingen. */
function wand(mb: MeshBouwer, mat: string, r: Rand, y0: number, y1: number, laagVan: number, laagTot: number, travee = 3, uitstek = 0) {
  const a = { x: r.a.x + r.n.x * uitstek, z: r.a.z + r.n.z * uitstek }, b = { x: r.b.x + r.n.x * uitstek, z: r.b.z + r.n.z * uitstek };
  if (mat.startsWith('gevel:')) {
    const n = Math.max(1, Math.round(r.L / travee));
    mb.quad(mat, P3(a, y0), P3(b, y0), P3(b, y1), P3(a, y1), [0, laagVan * 0.5], [n / 2, laagVan * 0.5], [n / 2, laagTot * 0.5], [0, laagTot * 0.5], N3(r.n));
  } else {
    mb.quad(mat, P3(a, y0), P3(b, y0), P3(b, y1), P3(a, y1), [0, y0], [r.L, y0], [r.L, y1], [0, y1], N3(r.n));
  }
}

/** Plat vlak (dak, vloer) als driehoeken; UV in meters. */
function vlak(mb: MeshBouwer, mat: string, poly: V2[], y: number | ((p: V2) => number), boven = true, uv?: (p: V2) => [number, number]) {
  const tri = driehoeken(poly);
  const Y = typeof y === 'number' ? () => y : y;
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [poly[tri[i]], poly[tri[i + 1]], poly[tri[i + 2]]];
    const f = uv ?? ((p: V2) => [p.x, p.z] as [number, number]);
    mb.driehoek(mat, P3(a, Y(a)), P3(b, Y(b)), P3(c, Y(c)), f(a), f(b), f(c), boven ? OP : NEER);
  }
}

/** Polygoon naar binnen verschuiven (verstek per hoek). */
function inzet(poly: V2[], w: number): V2[] {
  const A = getekendOppervlak(poly), n = poly.length;
  return poly.map((p, i) => {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const t1 = norm({ x: p.x - a.x, z: p.z - a.z }), t2 = norm({ x: b.x - p.x, z: b.z - p.z });
    // Naar binnen = tegengesteld aan de buitennormaal.
    const n1 = A > 0 ? { x: -t1.z, z: t1.x } : { x: t1.z, z: -t1.x };
    const n2 = A > 0 ? { x: -t2.z, z: t2.x } : { x: t2.z, z: -t2.x };
    const m = norm({ x: n1.x + n2.x, z: n1.z + n2.z });
    const k = Math.max(0.35, m.x * n1.x + m.z * n1.z);
    return { x: p.x + m.x * w / k, z: p.z + m.z * w / k };
  });
}
const norm = (v: V2): V2 => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };

/** Doos rond punt c met assen t (langs) en n (diepte). */
function doos(mb: MeshBouwer, zij: string, top: string, c: V2, t: V2, b: number, d: number, y0: number, y1: number, bodem = false) {
  mb.blok(zij, top, { x: c.x, y: 0, z: c.z }, N3(t), N3({ x: -t.z, z: t.x }), b, d, y0, y1, bodem);
}

/** Opstaande dakrand langs de hele omtrek. */
function dakrand(mb: MeshBouwer, poly: V2[], y: number, h: number, w: number, mat: string) {
  const binnen = inzet(poly, w);
  const n = poly.length, A = getekendOppervlak(poly);
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], ai = binnen[i], bi = binnen[(i + 1) % n];
    const t = norm({ x: b.x - a.x, z: b.z - a.z });
    const uit = A > 0 ? { x: t.z, z: -t.x } : { x: -t.z, z: t.x };
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    mb.quad(mat, P3(a, y), P3(b, y), P3(b, y + h), P3(a, y + h), [0, 0], [L, 0], [L, h], [0, h], N3(uit));
    mb.quad(mat, P3(ai, y), P3(bi, y), P3(bi, y + h), P3(ai, y + h), [0, 0], [L, 0], [L, h], [0, h], N3({ x: -uit.x, z: -uit.z }));
    mb.quad(mat, P3(a, y + h), P3(b, y + h), P3(bi, y + h), P3(ai, y + h), [0, 0], [L, 0], [L, w], [0, w], OP);
  }
}

/** Maaiveld van het perceel, over het terrein gedrapeerd. */
function grond(mb: MeshBouwer, poly: V2[], mat: string, hoogte: H, dy = 0.05) {
  const v = verfijn(poly, driehoeken(poly), 5);
  for (let i = 0; i < v.tri.length; i += 3) {
    const [a, b, c] = [v.p[v.tri[i]], v.p[v.tri[i + 1]], v.p[v.tri[i + 2]]];
    mb.driehoek(mat, { x: a.x, y: hoogte(a.x, a.z) + dy, z: a.z }, { x: b.x, y: hoogte(b.x, b.z) + dy, z: b.z }, { x: c.x, y: hoogte(c.x, c.z) + dy, z: c.z }, [a.x, a.z], [b.x, b.z], [c.x, c.z], OP);
  }
}

function stijlVoor(g: Gebouw, r: Rng): GevelStijl {
  switch (g.vorm) {
    case 'rijwoningen': return r.kies(['baksteenRood', 'baksteenRood', 'baksteenBruin', 'baksteenGeel'] as const);
    case 'appartementen': return r.kies(['baksteenBruin', 'baksteenRood', 'stuc', 'modernDonker', 'baksteenGeel'] as const);
    case 'winkelsMetWonen': return r.kies(['baksteenRood', 'baksteenBruin', 'stuc', 'baksteenGeel'] as const);
    case 'kantoortoren': return r.kies(['vliesgevel', 'vliesgevel', 'betonband', 'modernDonker'] as const);
    default: return 'modernDonker';
  }
}

export function bouwGebouw(g: Gebouw, hoogte: H): { mesh: MeshData; props: Prop[] } {
  const mb = new MeshBouwer();
  const props: Prop[] = [];
  const r = new Rng(g.seed);
  const stijl = stijlVoor(g, r);
  const Y = g.y;

  const grondMat = g.zone === 'industrie' ? 'erfverharding' : g.zone === 'kantoor' || g.zone === 'gemengd' ? 'stoeptegels' : 'tuin';
  grond(mb, g.perceel, grondMat, hoogte);

  if (!g.klaar) { bouwplaats(mb, g, hoogte); return { mesh: mb.bouw(), props }; }

  // Plint van het laagste maaiveld tot het vloerpeil.
  const plint = stijl.startsWith('baksteen') ? 'plint' : 'beton';
  for (const rd of randen(g)) wand(mb, plint, rd, g.yGrond - 0.6, Y, 0, 0, 3, 0.04);

  switch (g.vorm) {
    case 'rijwoningen': rijwoningen(mb, g, r, stijl, hoogte, props); break;
    case 'appartementen': appartementen(mb, g, r, stijl, props); break;
    case 'winkelsMetWonen': winkels(mb, g, r, stijl); break;
    case 'kantoortoren': kantoor(mb, g, r, stijl, props); break;
    case 'bedrijfshal': hal(mb, g, r); break;
  }
  return { mesh: mb.bouw(), props };
}

// ─── Rijwoningen ─────────────────────────────────────────────────────────────────

function rijwoningen(mb: MeshBouwer, g: Gebouw, r: Rng, stijl: GevelStijl, hoogte: H, props: Prop[]) {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length;
  const gevel = `gevel:${stijl}`, muur = `muur:${stijl}`;
  const w = g.breedte / g.eenheden;
  const plat = r.next() < 0.1 || !g.dak;
  const dakMat = r.next() < 0.3 ? 'dakpannenAntraciet' : 'dakpannen';
  for (const rd of randen(g)) wand(mb, rd.soort === 'zij' ? muur : gevel, rd, Y, H, 0, lagen, w / 2);

  if (plat) {
    vlak(mb, 'dakgrind', g.voet, H);
    dakrand(mb, g.voet, H - 0.05, 0.45, 0.25, 'trim');
  } else {
    const tan = Math.tan(42 * Math.PI / 180);
    const nokD = g.terug + g.diepte / 2;
    const dakH = (p: V2, helft: 'voor' | 'achter') => {
      const d = afstandTotLijn(p, g.voorLijn).d;
      const x = helft === 'voor' ? d - g.terug : g.terug + g.diepte - d;
      return H + Math.min(g.diepte / 2, Math.max(0, x)) * tan;
    };
    const uvDak = (helft: 'voor' | 'achter') => (p: V2): [number, number] => {
      const q = afstandTotLijn(p, g.voorLijn, g.voorLijn.map((_, i) => i * 2));
      const d = helft === 'voor' ? q.d - g.terug : g.terug + g.diepte - q.d;
      return [q.s, d / Math.cos(42 * Math.PI / 180)];
    };
    for (const helft of ['voor', 'achter'] as const) {
      const poly = g.dak![helft];
      if (poly.length < 3) continue;
      vlak(mb, dakMat, poly, p => dakH(p, helft), true, uvDak(helft));
      // Topgevels: zijranden van het dakvlak dichtmaken tot aan de dakrand.
      const A = getekendOppervlak(poly);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ha = dakH(a, helft), hb = dakH(b, helft);
        if (Math.abs(ha - hb) < 0.3 && Math.abs(ha - H) < 0.05) continue; // dakrand
        if (Math.abs(ha - hb) < 0.3 && ha > H + 0.5) continue; // nok
        const t = norm({ x: b.x - a.x, z: b.z - a.z });
        const uit = A > 0 ? { x: t.z, z: -t.x } : { x: -t.z, z: t.x };
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        mb.quad(muur, P3(a, H), P3(b, H), P3(b, hb), P3(a, ha), [0, 0], [L, 0], [L, hb - H], [0, ha - H], N3(uit));
      }
    }
    // Nokvorst, goten en boeiboorden.
    const nok = g.dak!.voor.filter(p => Math.abs(afstandTotLijn(p, g.voorLijn).d - nokD) < 0.3);
    for (let i = 0; i < nok.length - 1; i++) {
      const a = nok[i], b = nok[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.2 || L > g.breedte + 2) continue;
      const y = H + (g.diepte / 2) * tan;
      doos(mb, 'dakpannenAntraciet', 'dakpannenAntraciet', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, norm({ x: b.x - a.x, z: b.z - a.z }), L, 0.32, y - 0.12, y + 0.12);
    }
    for (const rd of randen(g)) {
      if (rd.soort === 'zij') continue;
      wand(mb, 'trim', rd, H - 0.28, H + 0.02, 0, 0, 3, 0.18);
      const m = { x: (rd.a.x + rd.b.x) / 2 + rd.n.x * 0.32, z: (rd.a.z + rd.b.z) / 2 + rd.n.z * 0.32 };
      doos(mb, 'metaal', 'metaal', m, rd.t, rd.L, 0.18, H - 0.32, H - 0.16);
    }
    // Dakkapellen en schoorstenen.
    for (const an of g.ankers) {
      if (r.next() > 0.45) continue;
      const bw = Math.min(2.6, w - 1.4);
      if (bw < 1.2) continue;
      const c = { x: an.p.x + an.n.x * 1.7, z: an.p.z + an.n.z * 1.7 };
      const y0 = H + 1.7 * tan, top = y0 + 1.45;
      const diep = (top - H) / tan - 1.7;
      const uit = { x: -an.n.x, z: -an.n.z };
      const vo = c, ac = { x: c.x + an.n.x * diep, z: c.z + an.n.z * diep };
      const L = (p: V2, s: number) => ({ x: p.x + an.t.x * s, z: p.z + an.t.z * s });
      mb.quad('trim', P3(L(vo, -bw / 2), y0), P3(L(vo, bw / 2), y0), P3(L(vo, bw / 2), top), P3(L(vo, -bw / 2), top), [0, 0], [1, 0], [1, 1], [0, 1], N3(uit));
      const vr = { x: vo.x - an.n.x * 0.02, z: vo.z - an.n.z * 0.02 };
      mb.quad('raam', P3(L(vr, -bw / 2 + 0.2), y0 + 0.25), P3(L(vr, bw / 2 - 0.2), y0 + 0.25), P3(L(vr, bw / 2 - 0.2), top - 0.2), P3(L(vr, -bw / 2 + 0.2), top - 0.2), [0, 0], [1, 0], [1, 1], [0, 1], N3(uit));
      for (const s of [-1, 1]) mb.driehoek('trim', P3(L(vo, s * bw / 2), y0), P3(L(vo, s * bw / 2), top), P3(L(ac, s * bw / 2), top), [0, 0], [0, 1], [1, 1], N3({ x: an.t.x * s, z: an.t.z * s }));
      mb.quad('dakgrind', P3(L(vr, -bw / 2 - 0.1), top), P3(L(vr, bw / 2 + 0.1), top), P3(L(ac, bw / 2 + 0.1), top), P3(L(ac, -bw / 2 - 0.1), top), [0, 0], [1, 0], [1, 1], [0, 1], OP);
    }
    for (let i = 0; i < g.ankers.length; i += 2) {
      if (r.next() > 0.5) continue;
      const an = g.ankers[i];
      const c = { x: an.p.x + an.n.x * (g.diepte * 0.62) + an.t.x * w * 0.3, z: an.p.z + an.n.z * (g.diepte * 0.62) + an.t.z * w * 0.3 };
      const yN = H + (g.diepte / 2) * tan;
      doos(mb, muur, 'trimDonker', c, an.t, 0.6, 0.6, yN - 1.4, yN + 0.7);
    }
  }

  // Voordeuren, stoepjes, tuinpaden, hagen, schuttingen, schuurtjes, bomen.
  g.ankers.forEach((an, i) => deur(mb, an, Y, (g.seed + i * 7) % 5));
  for (const an of g.ankers) tuin(mb, g, an, w, r, hoogte, props);
  for (const gr of g.grenzen) {
    // Heg in de voortuin, schutting in de achtertuin.
    const a = (d: number) => ({ x: gr.p.x + gr.n.x * d, z: gr.p.z + gr.n.z * d });
    const lijnstuk = (mat: string, d0: number, d1: number, h: number, dik: number) => {
      if (d1 - d0 < 0.8) return;
      const c = a((d0 + d1) / 2), y = hoogte(c.x, c.z);
      doos(mb, mat, mat, c, gr.n, d1 - d0, dik, y - 0.1, y + h);
    };
    lijnstuk('haag', 0.4, g.terug - 0.2, 0.75, 0.45);
    lijnstuk('hout', g.terug + g.diepte + 0.2, Math.min(gr.d - 0.4, g.terug + g.diepte + 16), 1.8, 0.06);
  }
}

/** Plat stuk bestrating over het terrein: rechthoek in het assenstelsel van een anker. */
function plaat(mb: MeshBouwer, mat: string, an: Anker, d0: number, d1: number, s0: number, s1: number, hoogte: H, dy = 0.08) {
  const q = (d: number, s: number) => { const x = an.p.x + an.n.x * d + an.t.x * s, z = an.p.z + an.n.z * d + an.t.z * s; return { x, y: hoogte(x, z) + dy, z }; };
  const a = q(d0, s0), b = q(d0, s1), c = q(d1, s1), e = q(d1, s0);
  // Volgorde zo dat de normaal omhoog wijst.
  const cr = (b.x - a.x) * (e.z - a.z) - (b.z - a.z) * (e.x - a.x);
  if (cr > 0) mb.quad(mat, a, e, c, b, [a.x, a.z], [e.x, e.z], [c.x, c.z], [b.x, b.z], OP);
  else mb.quad(mat, a, b, c, e, [a.x, a.z], [b.x, b.z], [c.x, c.z], [e.x, e.z], OP);
}

/** Struik: afgeplatte bol van een paar lagen (goedkoop, één materiaal). */
function struik(mb: MeshBouwer, c: V2, y: number, r: number, h: number) {
  cilinder(mb, 'haag', { x: c.x, y, z: c.z }, { x: c.x, y: y + h * 0.55, z: c.z }, r * 0.75, r, 7);
  cilinder(mb, 'haag', { x: c.x, y: y + h * 0.55, z: c.z }, { x: c.x, y: y + h, z: c.z }, r, r * 0.35, 7);
}

/**
 * Voor- en achtertuin van één woning: lage haag langs de stoep met een opening voor het tuinpad,
 * stoepje en pad, terras achter het huis, gazon (het perceel), struiken, soms een parasol,
 * een schuurtje en een boom, en achterin een haag of schutting.
 */
function tuin(mb: MeshBouwer, g: Gebouw, an: Anker, w: number, r: Rng, hoogte: H, props: Prop[]) {
  const P = (d: number, s: number): V2 => ({ x: an.p.x + an.n.x * d + an.t.x * s, z: an.p.z + an.n.z * d + an.t.z * s });
  const yv = (p: V2) => hoogte(p.x, p.z);
  const half = w / 2 - 0.15;
  // ── Voortuin (d < 0: tussen gevel en stoep) ──
  if (g.terug > 1) plaat(mb, 'stoeptegels', an, -g.terug, -0.9, -0.55, 0.55, hoogte);
  plaat(mb, 'stoeptegels', an, -0.9, 0, -0.8, 0.8, hoogte, 0.12);
  if (g.terug > 1.8) {
    // Lage haag langs de stoep, met een opening voor het pad.
    const d = -g.terug + 0.3;
    for (const [s0, s1] of [[-half, -0.8], [0.8, half]]) {
      if (s1 - s0 < 0.6) continue;
      const c = P(d, (s0 + s1) / 2);
      doos(mb, 'haag', 'haag', c, an.t, s1 - s0, 0.45, yv(c) - 0.1, yv(c) + 0.7);
    }
    // Struikje in de voortuin.
    if (r.next() < 0.6) { const c = P(-g.terug * 0.5, r.kies([-1, 1]) * Math.min(half - 0.7, 2.2)); struik(mb, c, yv(c), 0.45, 0.9); }
  }
  // Container naast de deur.
  if (g.terug > 1.6 && r.next() < 0.5) {
    const c = P(-0.6, Math.min(half - 0.4, 1.5));
    doos(mb, 'trimDonker', 'trimDonker', c, an.t, 0.6, 0.7, yv(c), yv(c) + 1.05);
  }
  // ── Achtertuin ──
  const eind = an.d - g.terug - 0.3; // achtergrens van het perceel, gemeten vanaf de voorgevel
  const achter = eind - g.diepte;
  if (achter < 2) return;
  const terras = Math.min(3, achter * 0.35);
  plaat(mb, r.next() < 0.7 ? 'stoeptegels' : 'grind', an, g.diepte, g.diepte + terras, -half, half, hoogte);
  if (terras > 2 && r.next() < 0.3) {
    // Parasol op het terras.
    const c = P(g.diepte + terras * 0.6, r.range(-half * 0.5, half * 0.5)), y = yv(c);
    cilinder(mb, 'trim', { x: c.x, y, z: c.z }, { x: c.x, y: y + 2.2, z: c.z }, 0.03, 0.03, 4);
    cilinder(mb, r.next() < 0.5 ? 'trim' : 'dakpannen', { x: c.x, y: y + 1.8, z: c.z }, { x: c.x, y: y + 2.35, z: c.z }, 1.3, 0.05, 8);
  }
  // Struiken langs de zijkant.
  const nS = Math.min(4, Math.floor(achter / 4));
  for (let i = 0; i < nS; i++) {
    if (r.next() < 0.35) continue;
    const d = g.diepte + terras + 1 + (achter - terras - 2) * (i + 0.5) / nS;
    const c = P(d, (i % 2 ? 1 : -1) * (half - 0.6));
    struik(mb, c, yv(c), r.range(0.4, 0.7), r.range(0.8, 1.6));
  }
  // Schuurtje achterin.
  if (achter > 5 && r.next() < 0.7) {
    const sb = Math.min(2.4, w - 1.2);
    const c = P(eind - 1.5, (r.next() < 0.5 ? -1 : 1) * Math.max(0, half - sb / 2 - 0.2)), y = yv(c);
    doos(mb, 'hout', 'dakgrind', c, an.t, sb, 2.2, y, y + 2.3);
  }
  // Boom.
  if (achter > 7 && r.next() < 0.45) {
    const c = P(g.diepte + terras + (achter - terras) * 0.5, r.range(-half * 0.4, half * 0.4));
    props.push({ soort: r.kies(['berk', 'eik', 'linde'] as const), x: c.x, y: yv(c), z: c.z, rot: r.range(0, 6.28), schaal: r.range(0.45, 0.7), variant: r.int(0, 1) });
  }
  // Achtergrens: haag of schutting.
  if (achter > 3.5) {
    const c = P(eind - 0.2, 0), y = yv(c);
    if (r.next() < 0.45) doos(mb, 'haag', 'haag', c, an.t, w, 0.6, y - 0.1, y + 1.7);
    else doos(mb, 'hout', 'hout', c, an.t, w, 0.06, y - 0.1, y + 1.8);
  }
}

function deur(mb: MeshBouwer, an: Anker, Y: number, kleur: number) {
  const uit = { x: -an.n.x, z: -an.n.z };
  const p = (s: number, d: number) => ({ x: an.p.x + an.t.x * s + uit.x * d, z: an.p.z + an.t.z * s + uit.z * d });
  const q = (mat: string, s0: number, s1: number, y0: number, y1: number, d: number) =>
    mb.quad(mat, P3(p(s0, d), Y + y0), P3(p(s1, d), Y + y0), P3(p(s1, d), Y + y1), P3(p(s0, d), Y + y1), [0, 0], [1, 0], [1, 1], [0, 1], N3(uit));
  q('trim', -0.62, 0.62, 0, 2.55, 0.05);
  q(`deur:${kleur}`, -0.5, 0.5, 0, 2.3, 0.07);
  q('raam', -0.5, 0.5, 2.36, 2.5, 0.07);
  doos(mb, 'beton', 'beton', p(0, 0.45), an.t, 1.4, 0.8, Y - 0.3, Y + 0.02);
}

// ─── Appartementen ───────────────────────────────────────────────────────────────

function appartementen(mb: MeshBouwer, g: Gebouw, r: Rng, stijl: GevelStijl, props: Prop[]) {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length;
  const rd = randen(g);
  for (const x of rd) wand(mb, x.soort === 'zij' ? `muur:${stijl}` : `gevel:${stijl}`, x, Y, H, 0, lagen);
  vlak(mb, 'dakgrind', g.voet, H);
  dakrand(mb, g.voet, H - 0.1, 0.8, 0.35, stijl === 'modernDonker' ? 'trimDonker' : 'trim');
  const c = zwaartepunt(g.voet);
  const voorRanden = rd.filter(x => x.soort === 'voor');
  const lang = voorRanden.reduce((m, x) => (x.L > (m?.L ?? 0) ? x : m), voorRanden[0] as Rand | undefined);
  const t = lang?.t ?? { x: 1, z: 0 };
  if (puntInPolygoon(c, g.voet)) {
    doos(mb, `muur:${stijl}`, 'dakgrind', c, t, 3.2, 4.5, H, H + 3.0);
    doos(mb, 'metaal', 'metaal', { x: c.x + t.x * 4, z: c.z + t.z * 4 }, t, 2.2, 1.6, H, H + 1.3);
  }
  // Balkons aan de voorgevel(s), per ~6 m, vanaf de eerste verdieping.
  const hek = r.next() < 0.5 ? 'glas' : 'metaal';
  for (const x of voorRanden) {
    const n = Math.floor(x.L / 6);
    if (n < 1) continue;
    let y = Y + g.lagen[0].hoogte;
    for (let l = 1; l < lagen; l++) {
      for (let i = 0; i < n; i++) {
        const s = (i + 0.5) * x.L / n, bb = Math.min(4.2, x.L / n - 1.2);
        const m = { x: x.a.x + x.t.x * s + x.n.x * 0.75, z: x.a.z + x.t.z * s + x.n.z * 0.75 };
        doos(mb, 'beton', 'beton', m, x.t, bb, 1.5, y - 0.2, y);
        const v = (sd: number, d: number) => ({ x: x.a.x + x.t.x * (s + sd) + x.n.x * d, z: x.a.z + x.t.z * (s + sd) + x.n.z * d });
        mb.quad(hek, P3(v(-bb / 2, 1.5), y), P3(v(bb / 2, 1.5), y), P3(v(bb / 2, 1.5), y + 1.05), P3(v(-bb / 2, 1.5), y + 1.05), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
        for (const sg of [-1, 1]) mb.quad(hek, P3(v(sg * bb / 2, 0), y), P3(v(sg * bb / 2, 1.5), y), P3(v(sg * bb / 2, 1.5), y + 1.05), P3(v(sg * bb / 2, 0), y + 1.05), [0, 0], [1, 0], [1, 1], [0, 1], N3({ x: x.t.x * sg, z: x.t.z * sg }));
      }
      y += g.lagen[l].hoogte;
    }
  }
  // Entree met luifel midden op de langste voorgevel.
  if (lang) {
    const m = { x: (lang.a.x + lang.b.x) / 2, z: (lang.a.z + lang.b.z) / 2 };
    const v = (s: number, d: number) => ({ x: m.x + lang.t.x * s + lang.n.x * d, z: m.z + lang.t.z * s + lang.n.z * d });
    mb.quad('glas', P3(v(-1.4, 0.04), Y), P3(v(1.4, 0.04), Y), P3(v(1.4, 0.04), Y + 2.7), P3(v(-1.4, 0.04), Y + 2.7), [0, 0], [1, 0], [1, 1], [0, 1], N3(lang.n));
    doos(mb, 'trimDonker', 'trimDonker', v(0, 1.0), lang.t, 4, 2.0, Y + 2.85, Y + 3.05);
    if (g.terug > 3) { const p = v(Math.min(lang.L / 2 - 1.5, 5), g.terug * 0.6); props.push({ soort: 'linde', x: p.x, y: Y - 0.1, z: p.z, rot: r.range(0, 6), schaal: 0.7, variant: r.int(0, 1) }); }
  }
}

// ─── Winkels met wonen ───────────────────────────────────────────────────────────

function winkels(mb: MeshBouwer, g: Gebouw, r: Rng, stijl: GevelStijl) {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length, hBG = g.lagen[0].hoogte;
  for (const x of randen(g)) {
    if (x.soort !== 'voor') { wand(mb, x.soort === 'zij' ? `muur:${stijl}` : `gevel:${stijl}`, x, Y, H, 0, lagen); continue; }
    const n = Math.max(1, Math.round(x.L / 6)), pw = x.L / n;
    for (let i = 0; i < n; i++) {
      const a = { x: x.a.x + x.t.x * i * pw, z: x.a.z + x.t.z * i * pw }, b = { x: x.a.x + x.t.x * (i + 1) * pw, z: x.a.z + x.t.z * (i + 1) * pw };
      mb.quad(`winkelpui:${r.int(0, PUIEN - 1)}`, P3(a, Y), P3(b, Y), P3(b, Y + hBG), P3(a, Y + hBG), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
      if (r.next() < 0.7 && pw > 2) {
        const l = r.int(0, LUIFELS - 1), yl = Y + hBG - 0.55;
        const v = (s: number, d: number) => ({ x: x.a.x + x.t.x * (i * pw + s) + x.n.x * d, z: x.a.z + x.t.z * (i * pw + s) + x.n.z * d });
        mb.quad(`luifel:${l}`, P3(v(0.3, 0), yl), P3(v(pw - 0.3, 0), yl), P3(v(pw - 0.3, 1.6), yl - 0.75), P3(v(0.3, 1.6), yl - 0.75), [0, 0], [pw - 0.6, 0], [pw - 0.6, 1], [0, 1], { x: x.n.x, y: 1, z: x.n.z });
        mb.quad(`luifel:${l}`, P3(v(0.3, 1.6), yl - 0.75), P3(v(pw - 0.3, 1.6), yl - 0.75), P3(v(pw - 0.3, 1.6), yl - 1.0), P3(v(0.3, 1.6), yl - 1.0), [0, 0], [pw - 0.6, 0], [pw - 0.6, 0.3], [0, 0.3], N3(x.n));
      }
    }
    wand(mb, `gevel:${stijl}`, x, Y + hBG, H, 0, lagen - 1);
    wand(mb, 'trim', x, Y + hBG, Y + hBG + 0.35, 0, 0, 3, 0.15);
  }
  vlak(mb, 'dakgrind', g.voet, H);
  dakrand(mb, g.voet, H - 0.05, 0.9, 0.3, `muur:${stijl}`);
}

// ─── Kantoor ─────────────────────────────────────────────────────────────────────

function kantoor(mb: MeshBouwer, g: Gebouw, r: Rng, stijl: GevelStijl, props: Prop[]) {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length, hBG = g.lagen[0].hoogte;
  const lobby = inzet(g.voet, 0.9);
  for (const x of randen(g, lobby)) wand(mb, 'glas', x, Y, Y + hBG, 0, 0);
  const cz = zwaartepunt(g.voet);
  for (const p of g.voet) { const d = norm({ x: cz.x - p.x, z: cz.z - p.z }); doos(mb, 'beton', 'beton', { x: p.x + d.x * 0.45, z: p.z + d.z * 0.45 }, d, 0.6, 0.6, Y, Y + hBG); }
  vlak(mb, 'beton', g.voet, Y + hBG - 0.35, false);
  for (const x of randen(g)) wand(mb, 'beton', x, Y + hBG - 0.35, Y + hBG, 0, 0);
  for (const x of randen(g)) wand(mb, `gevel:${stijl}`, x, Y + hBG, H, 0, lagen - 1, stijl === 'vliesgevel' ? 3.6 : 3);
  vlak(mb, 'dakgrind', g.voet, H);
  dakrand(mb, g.voet, H - 0.1, 1.1, 0.35, stijl === 'vliesgevel' ? 'metaal' : 'trimDonker');
  const kern = inzet(g.voet, Math.min(6, g.diepte * 0.3));
  if (Math.abs(getekendOppervlak(kern)) > 20) { vlak(mb, 'metaal', kern, H + 2.6); for (const x of randen(g, kern)) wand(mb, 'metaal', x, H, H + 2.6, 0, 0); }
  void r; void props;
}

// ─── Bedrijfshal ─────────────────────────────────────────────────────────────────

function hal(mb: MeshBouwer, g: Gebouw, r: Rng) {
  const Y = g.y, H = Y + totaleHoogte(g.lagen);
  const muur = `golfplaat:${r.int(0, HALTINTEN - 1)}`;
  const rd = randen(g);
  for (const x of rd) wand(mb, muur, x, Y, H, 0, 0);
  vlak(mb, 'golfdak', g.voet, H);
  dakrand(mb, g.voet, H - 0.05, 0.6, 0.2, 'trimDonker');
  // Lichtstraten op het dak.
  const c = zwaartepunt(g.voet);
  const voor = rd.find(x => x.soort === 'voor');
  const t = voor?.t ?? { x: 1, z: 0 }, n = voor ? { x: -voor.n.x, z: -voor.n.z } : { x: 0, z: 1 };
  for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) {
    const p = { x: c.x + t.x * i * 6 + n.x * j * 6, z: c.z + t.z * i * 6 + n.z * j * 6 };
    if (!puntInPolygoon(p, inzet(g.voet, 2.5))) continue;
    doos(mb, 'lichtstraat', 'lichtstraat', p, t, 2.5, 3.5, H, H + 0.5);
  }
  // Laaddeuren met luifel aan de voorkant, kantoorgevel op het eerste stuk.
  for (const x of rd.filter(q => q.soort === 'voor')) {
    const kop = Math.min(7.5, x.L * 0.35);
    const k = { ...x, b: { x: x.a.x + x.t.x * kop, z: x.a.z + x.t.z * kop }, L: kop };
    wand(mb, 'gevel:modernDonker', k, Y, Y + 7.2, 0, 2, 3, 0.04);
    for (let s = kop + 3; s + 2 < x.L; s += 5.5) {
      const m = { x: x.a.x + x.t.x * s, z: x.a.z + x.t.z * s };
      const v = (sd: number, d: number) => ({ x: m.x + x.t.x * sd + x.n.x * d, z: m.z + x.t.z * sd + x.n.z * d });
      mb.quad('roldeur', P3(v(-1.8, 0.04), Y), P3(v(1.8, 0.04), Y), P3(v(1.8, 0.04), Y + 4.2), P3(v(-1.8, 0.04), Y + 4.2), [0, 0], [3.6, 0], [3.6, 4.2], [0, 4.2], N3(x.n));
      doos(mb, 'beton', 'beton', v(0, 1.2), x.t, 3.8, 2.4, Y - 0.2, Y + 1.1);
      doos(mb, 'trimDonker', 'trimDonker', v(0, 1.0), x.t, 4.4, 2.0, Y + 4.8, Y + 5.0);
    }
  }
}

// ─── Bouwplaats ──────────────────────────────────────────────────────────────────

function bouwplaats(mb: MeshBouwer, g: Gebouw, hoogte: H) {
  const Y = g.y, lagen = g.lagen.length, H = totaleHoogte(g.lagen);
  const klaar = Math.min(lagen, Math.floor(g.voortgang * lagen * 1.05));
  const rd = randen(g);
  for (const x of rd) wand(mb, 'beton', x, g.yGrond - 0.4, Y, 0, 0);
  vlak(mb, 'beton', g.voet, Y + 0.02);
  let y = Y;
  for (let l = 0; l < klaar; l++) {
    const h = g.lagen[l].hoogte;
    vlak(mb, 'beton', g.voet, y + h);
    vlak(mb, 'beton', g.voet, y + h - 0.3, false);
    for (const x of rd) wand(mb, 'beton', x, y + h - 0.3, y + h, 0, 0);
    for (const x of rd) for (let s = 0.3; s < x.L; s += 5) {
      const p = { x: x.a.x + x.t.x * s - x.n.x * 0.3, z: x.a.z + x.t.z * s - x.n.z * 0.3 };
      doos(mb, 'beton', 'beton', p, x.t, 0.35, 0.35, y, y + h - 0.3);
    }
    y += h;
  }
  const st = Math.max(2.5, y - Y + 1.2);
  for (const x of rd) {
    const a = { x: x.a.x + x.n.x * 1.2 - x.t.x * 1.2, z: x.a.z + x.n.z * 1.2 - x.t.z * 1.2 }, b = { x: x.b.x + x.n.x * 1.2 + x.t.x * 1.2, z: x.b.z + x.n.z * 1.2 + x.t.z * 1.2 };
    const L = x.L + 2.4;
    mb.quad('steiger', P3(a, Y), P3(b, Y), P3(b, Y + st), P3(a, Y + st), [0, 0], [L, 0], [L, st], [0, st], N3(x.n));
  }
  // Bouwhek op de rooilijn en een bouwkeet.
  for (const x of rd.filter(q => q.soort === 'voor')) {
    const d = Math.max(0.5, g.terug - 0.5);
    const a = { x: x.a.x + x.n.x * d, z: x.a.z + x.n.z * d }, b = { x: x.b.x + x.n.x * d, z: x.b.z + x.n.z * d };
    const ya = hoogte(a.x, a.z), yb = hoogte(b.x, b.z);
    mb.quad('hekwerk', P3(a, ya), P3(b, yb), P3(b, yb + 2), P3(a, ya + 2), [0, 0], [x.L / 3.5, 0], [x.L / 3.5, 1], [0, 1], N3(x.n));
    if (x.L > 8 && g.terug > 2.5) { const c = { x: b.x - x.t.x * 3.5 - x.n.x * 1.4, z: b.z - x.t.z * 3.5 - x.n.z * 1.4 }; doos(mb, 'keet', 'trimDonker', c, x.t, 6, 2.4, hoogte(c.x, c.z), hoogte(c.x, c.z) + 2.6); }
  }
  // Torenkraan bij hogere gebouwen.
  if (H > 11 && rd.length) {
    const x = rd.find(q => q.soort === 'achter') ?? rd[0];
    const m = { x: (x.a.x + x.b.x) / 2 + x.n.x * 3.5, z: (x.a.z + x.b.z) / 2 + x.n.z * 3.5 };
    const top = Y + H + 9;
    doos(mb, 'kraan', 'kraan', m, x.t, 1.6, 1.6, Y, top);
    const hoek = (g.seed % 628) / 100, ca = Math.cos(hoek), sa = Math.sin(hoek);
    const giek = (L: number, b: number, y0: number, y1: number) => doos(mb, 'kraan', 'kraan', { x: m.x + ca * L / 2, z: m.z + sa * L / 2 }, { x: ca, z: sa }, Math.abs(L), b, y0, y1);
    giek(34, 1.1, top, top + 1.4);
    giek(-12, 1.4, top, top + 1.0);
    doos(mb, 'beton', 'beton', { x: m.x - ca * 10, z: m.z - sa * 10 }, { x: ca, z: sa }, 2.5, 2.5, top - 2.2, top);
    doos(mb, 'kraan', 'kraan', m, { x: ca, z: sa }, 1.2, 1.2, top + 1.4, top + 5);
    doos(mb, 'glas', 'kraan', { x: m.x + ca * 1.8, z: m.z + sa * 1.8 }, { x: ca, z: sa }, 1.8, 1.8, top - 2.2, top);
  }
}
