import { V2, V3 } from '../math';
import { Rng } from '../rng';
import { Gebouw, Anker, totaleHoogte } from '../wereld';
import { MeshBouwer, MeshData, Prop } from './mesh';
import { cilinder } from './props';
import { DakInfo, villas, terrasflat, woontoren, grachtpanden, rijParams, erker, luifel, houtAccent, portiekflat, galerijflat, appModern, wederopbouwLuifel, bovenBalkons, kantoor30, kantoorToren, sheddak, steigers } from './stijlmesh';
import { afstandTotLijn, driehoeken, getekendOppervlak, verfijn, zwaartepunt } from '../poly';
import { puntInPolygoon } from '../math';

// Gebouwen op de vorm van hun perceel: elke rand van de footprint wordt een voor-, achter- of
// zijgevel; daken volgen de gevellijn (ook in bochten en op hoeken in verstek).

export const GEVELSTIJLEN = ['baksteenRood', 'baksteenBruin', 'baksteenGeel', 'stuc', 'modernDonker', 'vliesgevel', 'betonband', 'grachtRood', 'grachtDonker', 'naoorlogsGeel', 'naoorlogsGrijs', 'betonPaneel', 'witStuc', 'antraciet', 'nieuwRood', 'houtGevel', 'bruin70'] as const;
export type GevelStijl = typeof GEVELSTIJLEN[number];
export const PUIEN = 4, LUIFELS = 4, HALTINTEN = 4;

export type H = (x: number, z: number) => number;
export const OP: V3 = { x: 0, y: 1, z: 0 };
const NEER: V3 = { x: 0, y: -1, z: 0 };

export interface Rand { a: V2; b: V2; n: V2; t: V2; L: number; soort: 'voor' | 'achter' | 'zij' }

/** Randen van de footprint met naar buiten wijzende normaal en hun soort. */
export function randen(g: Gebouw, poly = g.voet): Rand[] {
  const A = getekendOppervlak(poly);
  const r: Rand[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    const t = { x: dx / L, z: dz / L };
    const n = A > 0 ? { x: t.z, z: -t.x } : { x: -t.z, z: t.x };
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    // Richting naar het dichtstbijzijnde punt van de gevellijn (stoeprand): werkt ook als de gevel vlak
    // op de stoeprand staat (winkels, grachtenpanden).
    const c = dichtstbij(m, g.voorLijn);
    const d = Math.hypot(c.x - m.x, c.z - m.z);
    const naar = d > 1e-3 ? (n.x * (c.x - m.x) + n.z * (c.z - m.z)) / d : 1;
    const naarStraat = naar > 0.7, vanStraat = naar < -0.7;
    // Hoekpand: de gevel langs de zijstraat telt ook als voorgevel (ramen, geen blinde muur).
    const zijstraat = (g.zijStraat ?? []).some(z => Math.abs((m.x - z.o.x) * z.n.x + (m.z - z.o.z) * z.n.z) < 0.3 && n.x * z.n.x + n.z * z.n.z < -0.9);
    const soort = zijstraat || (naarStraat && d < g.terug + 1.2) ? 'voor' : vanStraat ? 'achter' : 'zij';
    r.push({ a, b, n, t, L, soort });
  }
  return r;
}

export function dichtstbij(p: V2, lijn: V2[]): V2 {
  let best = lijn[0], bd = Infinity;
  for (let i = 0; i < lijn.length - 1; i++) {
    const a = lijn[i], b = lijn[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2));
    const q = { x: a.x + dx * t, z: a.z + dz * t }, d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

export const P3 = (p: V2, y: number): V3 => ({ x: p.x, y, z: p.z });
export const N3 = (n: V2): V3 => ({ x: n.x, y: 0, z: n.z });

/** Wand langs een rand; gevelmaterialen krijgen UV's in traveeën en verdiepingen. */
export function wand(mb: MeshBouwer, mat: string, r: Rand, y0: number, y1: number, laagVan: number, laagTot: number, travee = 3, uitstek = 0) {
  const a = { x: r.a.x + r.n.x * uitstek, z: r.a.z + r.n.z * uitstek }, b = { x: r.b.x + r.n.x * uitstek, z: r.b.z + r.n.z * uitstek };
  if (mat.startsWith('gevel:')) {
    const n = Math.max(1, Math.round(r.L / travee));
    mb.quad(mat, P3(a, y0), P3(b, y0), P3(b, y1), P3(a, y1), [0, laagVan * 0.5], [n / 2, laagVan * 0.5], [n / 2, laagTot * 0.5], [0, laagTot * 0.5], N3(r.n));
  } else {
    mb.quad(mat, P3(a, y0), P3(b, y0), P3(b, y1), P3(a, y1), [0, y0], [r.L, y0], [r.L, y1], [0, y1], N3(r.n));
  }
}

/** Plat vlak (dak, vloer) als driehoeken; UV in meters. */
export function vlak(mb: MeshBouwer, mat: string, poly: V2[], y: number | ((p: V2) => number), boven = true, uv?: (p: V2) => [number, number]) {
  const tri = driehoeken(poly);
  const Y = typeof y === 'number' ? () => y : y;
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [poly[tri[i]], poly[tri[i + 1]], poly[tri[i + 2]]];
    const f = uv ?? ((p: V2) => [p.x, p.z] as [number, number]);
    mb.driehoek(mat, P3(a, Y(a)), P3(b, Y(b)), P3(c, Y(c)), f(a), f(b), f(c), boven ? OP : NEER);
  }
}

/** Polygoon naar binnen verschuiven (verstek per hoek). */
export function inzet(poly: V2[], w: number): V2[] {
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
export const norm = (v: V2): V2 => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };

/** Doos rond punt c met assen t (langs) en n (diepte). */
export function doos(mb: MeshBouwer, zij: string, top: string, c: V2, t: V2, b: number, d: number, y0: number, y1: number, bodem = false) {
  mb.blok(zij, top, { x: c.x, y: 0, z: c.z }, N3(t), N3({ x: -t.z, z: t.x }), b, d, y0, y1, bodem);
}

/** Opstaande dakrand langs de hele omtrek. */
export function dakrand(mb: MeshBouwer, poly: V2[], y: number, h: number, w: number, mat: string) {
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

/** Grondvlakken van buurgebouwen: tuinspullen en schuttingen komen daar niet (hoekpercelen raken elkaar soms net). */
let BUREN: V2[][] = [];
export const bijBuur = (p: V2) => BUREN.some(v => puntInPolygoon(p, v));

export function bouwGebouw(g: Gebouw, hoogte: H, buren: V2[][] = []): { mesh: MeshData; props: Prop[] } {
  BUREN = buren;
  const mb = new MeshBouwer();
  const props: Prop[] = [];
  const r = new Rng(g.seed);
  const stijl = (g.gevel ?? stijlVoor(g, r)) as GevelStijl;
  const Y = g.y;

  const grondMat = g.zone === 'industrie' ? 'erfverharding' : g.zone === 'kantoor' || g.zone === 'gemengd' ? 'stoeptegels' : 'tuin';
  grond(mb, g.perceel, grondMat, hoogte);

  if (!g.klaar) { bouwplaats(mb, g, hoogte); return { mesh: mb.bouw(), props }; }

  // Plint van het laagste maaiveld tot het vloerpeil.
  const plint = stijl.startsWith('baksteen') ? 'plint' : 'beton';
  for (const rd of randen(g)) wand(mb, plint, rd, g.yGrond - 0.6, Y, 0, 0, 3, 0.04);

  let dak: DakInfo | null = { poly: g.voet, y: g.y + totaleHoogte(g.lagen) };
  switch (g.type) {
    case 'grachtpand': grachtpanden(mb, g, hoogte, 'wonen'); rijErf(mb, g, r, hoogte, props, g.breedte / g.eenheden, false); dak = null; break;
    case 'grachtblok': grachtpanden(mb, g, hoogte, 'wonen'); dak = null; break;
    case 'grachtWinkel': grachtpanden(mb, g, hoogte, 'winkel'); dak = null; break;
    case 'grachtKantoor': grachtpanden(mb, g, hoogte, 'kantoor'); dak = null; break;
    case 'pakhuis': grachtpanden(mb, g, hoogte, 'pakhuis'); dak = null; break;
    case 'portiekflat': dak = portiekflat(mb, g, r); break;
    case 'villa': villas(mb, g); rijErf(mb, g, r, hoogte, props, g.breedte / g.eenheden, false); dak = null; break;
    case 'terrasflat': dak = terrasflat(mb, g); break;
    case 'woontoren': dak = woontoren(mb, g, r); break;
    case 'galerijflat': dak = galerijflat(mb, g); break;
    case 'appModern': dak = appModern(mb, g, r, props); break;
    case 'wederopbouw': winkels(mb, g, r, stijl, false); wederopbouwLuifel(mb, g); break;
    case 'gemengdModern': winkels(mb, g, r, stijl); bovenBalkons(mb, g); break;
    case 'kantoor30': dak = kantoor30(mb, g); break;
    case 'kantoorBeton': case 'kantoorGlas': dak = kantoorToren(mb, g); break;
    case 'sheddak': dak = sheddak(mb, g); break;
    default:
      switch (g.vorm) {
        case 'rijwoningen': rijwoningen(mb, g, r, stijl, hoogte, props); dak = null; break;
        case 'appartementen': appartementen(mb, g, r, stijl, props); break;
        case 'winkelsMetWonen': winkels(mb, g, r, stijl); break;
        case 'kantoortoren': kantoor(mb, g, r, stijl, props); break;
        case 'bedrijfshal': hal(mb, g, r); dak = null; break;
      }
  }
  if (g.vorm !== 'rijwoningen' && g.ankers.length) inrichting(mb, g, r, hoogte, props);
  if (dak) {
    platDak(mb, g, dak);
    const n = g.niveau ?? 1;
    if (n < 3 && !g.dakBeleid?.zon && !g.dakBeleid?.groen) dakInstallaties(mb, g, dak);
  }
  if (g.verbouw) steigers(mb, g, hoogte);
  return { mesh: mb.bouw(), props };
}

/** Luchtbehandelingskasten en afvoeren op een plat dak (vanaf niveau 3 liggen er zonnepanelen). */
function dakInstallaties(mb: MeshBouwer, g: Gebouw, dak: DakInfo) {
  const H = dak.y;
  const vrij = inzet(dak.poly, 2.2);
  if (Math.abs(getekendOppervlak(vrij)) < 40) return;
  const r = new Rng(g.seed + 77);
  const c = zwaartepunt(vrij);
  const t = randen(g).find(x => x.soort === 'voor')?.t ?? { x: 1, z: 0 }, n = { x: -t.z, z: t.x };
  const kern = g.vorm === 'kantoortoren' && !g.type ? inzet(g.voet, Math.min(6, g.diepte * 0.3)) : null;
  const geplaatst: V2[] = [];
  const doel = 2 + r.int(0, 3);
  for (let i = 0; i < 30 && geplaatst.length < doel; i++) {
    const p = { x: c.x + t.x * r.range(-14, 14) + n.x * r.range(-9, 9), z: c.z + t.z * r.range(-14, 14) + n.z * r.range(-9, 9) };
    const b = r.range(1.8, 3.4), d = r.range(1.3, 2.2), h = r.range(1.0, 1.8);
    const hoeken = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: p.x + t.x * u * b / 2 + n.x * v * d / 2, z: p.z + t.z * u * b / 2 + n.z * v * d / 2 }));
    if (!hoeken.every(q => puntInPolygoon(q, vrij)) || (kern && hoeken.some(q => puntInPolygoon(q, kern)))) continue;
    if (geplaatst.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 4)) continue;
    geplaatst.push(p);
    doos(mb, 'metaal', 'metaal', p, t, b, d, H, H + h);
    // Ventilator bovenop en een kanaal naar beneden.
    doos(mb, 'trimDonker', 'trimDonker', { x: p.x + t.x * b * 0.22, z: p.z + t.z * b * 0.22 }, t, Math.min(1.1, b * 0.4), Math.min(1.1, d * 0.6), H + h, H + h + 0.25);
    if (r.next() < 0.6) doos(mb, 'metaal', 'metaal', { x: p.x - t.x * (b / 2 + 0.5), z: p.z - t.z * (b / 2 + 0.5) }, t, 1.0, 0.5, H, H + h * 0.6);
  }
  // Een paar afvoerpijpjes.
  for (let i = 0; i < 3; i++) {
    const p = { x: c.x + t.x * r.range(-10, 10) + n.x * r.range(-6, 6), z: c.z + t.z * r.range(-10, 10) + n.z * r.range(-6, 6) };
    if (!puntInPolygoon(p, vrij) || geplaatst.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 2.5)) continue;
    cilinder(mb, 'metaal', { x: p.x, y: H, z: p.z }, { x: p.x, y: H + 1.2, z: p.z }, 0.12, 0.12, 6);
  }
}

// ─── Rijwoningen ─────────────────────────────────────────────────────────────────

function rijwoningen(mb: MeshBouwer, g: Gebouw, r: Rng, stijl: GevelStijl, hoogte: H, props: Prop[]) {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length;
  const gevel = `gevel:${stijl}`, muur = `muur:${stijl}`;
  const w = g.breedte / g.eenheden;
  const rp = rijParams(g, r);
  const plat = r.next() < rp.platKans || !g.dak;
  const dakMat = rp.dakMat ?? (r.next() < 0.3 ? 'dakpannenAntraciet' : 'dakpannen');
  const helling = rp.helling * Math.PI / 180;
  for (const rd of randen(g)) wand(mb, rd.soort === 'zij' ? muur : gevel, rd, Y, H, 0, lagen, w / 2);

  if (plat) {
    vlak(mb, 'dakgrind', g.voet, H);
    dakrand(mb, g.voet, H - 0.05, rp.dakrand === 'trimDonker' ? 0.7 : 0.45, 0.25, rp.dakrand);
    if (g.dakBeleid?.groen || (g.niveau ?? 1) >= 5 || ((g.niveau ?? 1) === 4 && g.seed % 3 === 0)) vlak(mb, 'tuin', inzet(g.voet, 0.4), H + 0.1);
  } else {
    const tan = Math.tan(helling);
    const nokD = g.terug + g.diepte / 2;
    const dakH = (p: V2, helft: 'voor' | 'achter') => {
      const d = afstandTotLijn(p, g.voorLijn).d;
      const x = helft === 'voor' ? d - g.terug : g.terug + g.diepte - d;
      return H + Math.min(g.diepte / 2, Math.max(0, x)) * tan;
    };
    const uvDak = (helft: 'voor' | 'achter') => (p: V2): [number, number] => {
      const q = afstandTotLijn(p, g.voorLijn, g.voorLijn.map((_, i) => i * 2));
      const d = helft === 'voor' ? q.d - g.terug : g.terug + g.diepte - q.d;
      return [q.s, d / Math.cos(helling)];
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
    // Regenpijpen (zink) van de goot naar beneden op elke woningscheiding, en ontluchtingspijpjes op het achterdak.
    for (const gr of g.grenzen) {
      const p = { x: gr.p.x + gr.n.x * (g.terug - 0.12), z: gr.p.z + gr.n.z * (g.terug - 0.12) };
      cilinder(mb, 'metaal', { x: p.x, y: Y - 0.1, z: p.z }, { x: p.x, y: H - 0.2, z: p.z }, 0.05, 0.05, 6);
    }
    for (const an of g.ankers) {
      const d = g.diepte * 0.72, p = { x: an.p.x + an.n.x * d + an.t.x * w * 0.25, z: an.p.z + an.n.z * d + an.t.z * w * 0.25 };
      const y = H + (g.terug + g.diepte - afstandTotLijn(p, g.voorLijn).d) * tan;
      cilinder(mb, 'trimDonker', { x: p.x, y: y - 0.3, z: p.z }, { x: p.x, y: y + 0.55, z: p.z }, 0.06, 0.06, 6);
    }
    // Niveau 3+: zonnepanelen op het voordakvlak (in plaats van een dakkapel).
    const panelen = (g.niveau ?? 1) >= 3 || !!g.dakBeleid?.zon;
    if (panelen) for (const an of g.ankers) {
      const P = (d: number, s: number) => { const p = { x: an.p.x + an.n.x * d + an.t.x * s, z: an.p.z + an.n.z * d + an.t.z * s }; return { x: p.x, y: dakH(p, 'voor') + 0.07, z: p.z }; };
      const kol = Math.max(1, Math.floor((w - 1) / 1.05)), rij = Math.max(1, Math.floor((g.diepte / 2 - 1.2) / 1.75 * 1.05));
      for (let i = 0; i < kol; i++) for (let j = 0; j < Math.min(3, rij); j++) {
        const s0 = -kol * 1.05 / 2 + i * 1.05 + 0.03, d0 = 0.7 + j * 1.75 * 0.75;
        const a = P(d0, s0), b = P(d0, s0 + 1.0), c = P(d0 + 1.25, s0 + 1.0), e = P(d0 + 1.25, s0);
        mb.quad('zonnepaneel', a, b, c, e, [0, 0], [1, 0], [1, 1], [0, 1], { x: -an.n.x, y: 1.2, z: -an.n.z });
      }
    }
    // Dakkapellen en schoorstenen.
    for (const an of g.ankers) {
      if (panelen || r.next() > rp.dakkapel) continue;
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
      if (!rp.schoorsteen || r.next() > 0.5) continue;
      const an = g.ankers[i];
      const c = { x: an.p.x + an.n.x * (g.diepte * 0.62) + an.t.x * w * 0.3, z: an.p.z + an.n.z * (g.diepte * 0.62) + an.t.z * w * 0.3 };
      const yN = H + (g.diepte / 2) * tan;
      doos(mb, muur, 'trimDonker', c, an.t, 0.6, 0.6, yN - 1.4, yN + 0.7);
    }
  }

  // Per woning: erker, luifel of houten gevelstuk, afhankelijk van stijl en niveau.
  for (const an of g.ankers) {
    if (rp.erker && g.terug > 2.2 && r.next() < 0.7) erker(mb, an, Y, w, muur);
    if (rp.luifel) luifel(mb, an, Y, w);
    if (rp.hout) houtAccent(mb, an, Y, w, Math.min(H - Y, 5.9));
  }
  rijErf(mb, g, r, hoogte, props, w, true);
}

/** Voortuinen, achtertuinen en erfgrenzen van een rij woningen. */
function rijErf(mb: MeshBouwer, g: Gebouw, r: Rng, hoogte: H, props: Prop[], w: number, deuren: boolean) {
  const Y = g.y;
  // Voordeuren, stoepjes, tuinpaden, hagen, schuttingen, schuurtjes, bomen.
  if (deuren) g.ankers.forEach((an, i) => deur(mb, an, Y, (g.seed + i * 7) % 5));
  for (const an of g.ankers) tuin(mb, g, an, w, r, hoogte, props);
  // Erfgrenzen: heg in de voortuin, schutting in de achtertuin tot het einde van het perceel.
  const binnenPerceel = (p: V2) => puntInPolygoon(p, g.perceel);
  const lijnstuk = (gr: Anker, mat: string, d0: number, d1: number, h: number, dik: number, zij = 0) => {
    const a = (d: number) => ({ x: gr.p.x + gr.n.x * d + gr.t.x * zij, z: gr.p.z + gr.n.z * d + gr.t.z * zij });
    // Niet buiten het perceel (hoekpercelen lopen schuin af).
    while (d1 - d0 > 0.8 && (!binnenPerceel(a(d1 - 0.2)) || bijBuur(a(d1 - 0.2)))) d1 -= 1;
    if (d1 - d0 < 0.8) return;
    // In stukken, zodat de schutting het terrein volgt.
    const n = Math.max(1, Math.ceil((d1 - d0) / 6));
    for (let i = 0; i < n; i++) {
      const e0 = d0 + (d1 - d0) * i / n, e1 = d0 + (d1 - d0) * (i + 1) / n;
      const c = a((e0 + e1) / 2), y = hoogte(c.x, c.z);
      if (bijBuur(c)) continue;
      doos(mb, mat, mat, c, gr.n, e1 - e0 + 0.02, dik, y - 0.15, y + h);
    }
  };
  const achterEind = (gr: Anker) => gr.d - 0.3;
  // Achter: per erfgrens een schutting (1,6 m) of een beukenhaag; zo wordt het geen streepjescode.
  const achter = (gr: Anker, zij = 0) => {
    const h = Math.abs(Math.sin(gr.p.x * 12.9898 + gr.p.z * 78.233) * 43758.5453) % 1;
    if (h < 0.35) lijnstuk(gr, 'haag', g.terug + g.diepte + 0.3, achterEind(gr), 1.4, 0.5, zij);
    else lijnstuk(gr, 'schutting', g.terug + g.diepte + 0.2, achterEind(gr), 1.6, 0.06, zij);
  };
  for (const gr of g.grenzen) {
    lijnstuk(gr, 'haag', 0.4, g.terug - 0.2, 0.75, 0.45);
    achter(gr);
  }
  // Buitenste grenzen van de rij: binnen het eigen perceel (0,15 m), langs een zijstraat een hoge heg.
  (g.zijden ?? []).forEach((gr, i) => {
    const zij = i === 0 ? 0.15 : -0.15;
    const langsStraat = (g.zijStraat ?? []).some(z => Math.abs((gr.p.x - z.o.x) * z.n.x + (gr.p.z - z.o.z) * z.n.z) < 6);
    if (langsStraat) return;
    lijnstuk(gr, 'haag', 0.4, g.terug - 0.2, 0.75, 0.45, zij);
    achter(gr, zij);
  });
  // Hoekhuis: hoge heg langs de zijstraat, van de achtergevel tot achter in de tuin.
  for (const z of g.zijStraat ?? []) {
    const t = { x: -z.n.z, z: z.n.x };
    const pts = g.perceel.map(p => (p.x - z.o.x) * t.x + (p.z - z.o.z) * t.z);
    const a0 = Math.min(...pts), a1 = Math.max(...pts);
    // De perceelrand langs de zijstraat ligt op de kleinste afstand tot de straat.
    const rand = Math.min(...g.perceel.map(p => (p.x - z.o.x) * z.n.x + (p.z - z.o.z) * z.n.z)) + 0.4;
    for (let s = a0; s < a1; s += 3) {
      const c = { x: z.o.x + t.x * (s + 1.5) + z.n.x * rand, z: z.o.z + t.z * (s + 1.5) + z.n.z * rand };
      if (!binnenPerceel(c) || puntInPolygoon(c, g.voet) || bijBuur(c)) continue;
      // Alleen naast de tuin, niet voor de voorgevel.
      if (afstandTotLijn(c, g.voorLijn).d < g.terug + 0.5) continue;
      const y = hoogte(c.x, c.z);
      doos(mb, 'haag', 'haag', c, t, 3.02, 0.6, y - 0.1, y + 1.6);
    }
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
export function struik(mb: MeshBouwer, c: V2, y: number, r: number, h: number) {
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
    if (!bijBuur(c)) struik(mb, c, yv(c), r.range(0.4, 0.7), r.range(0.8, 1.6));
  }
  // Schuurtje achterin.
  if (achter > 5 && r.next() < 0.7) {
    const sb = Math.min(2.4, w - 1.2);
    const c = P(eind - 1.5, (r.next() < 0.5 ? -1 : 1) * Math.max(0, half - sb / 2 - 0.2)), y = yv(c);
    if (!bijBuur(c) && !bijBuur(P(eind - 0.3, 0))) doos(mb, 'hout', 'dakgrind', c, an.t, sb, 2.2, y, y + 2.3);
  }
  // Boom.
  if (achter > 7 && r.next() < 0.45) {
    const c = P(g.diepte + terras + (achter - terras) * 0.5, r.range(-half * 0.4, half * 0.4));
    if (!bijBuur(c)) props.push({ soort: r.kies(['berk', 'eik', 'linde'] as const), x: c.x, y: yv(c), z: c.z, rot: r.range(0, 6.28), schaal: r.range(0.45, 0.7), variant: r.int(0, 1) });
  }
  // Achtergrens: haag of schutting.
  if (achter > 3.5 && !bijBuur(P(eind - 0.2, -half)) && !bijBuur(P(eind - 0.2, half))) {
    const c = P(eind - 0.2, 0), y = yv(c);
    if (r.next() < 0.45) doos(mb, 'haag', 'haag', c, an.t, w, 0.6, y - 0.1, y + 1.7);
    else doos(mb, 'schutting', 'schutting', c, an.t, w, 0.06, y - 0.1, y + 1.6);
  }
}

export function deur(mb: MeshBouwer, an: Anker, Y: number, kleur: number) {
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

export function appartementen(mb: MeshBouwer, g: Gebouw, r: Rng, stijl: GevelStijl, props: Prop[]) {
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

export function winkels(mb: MeshBouwer, g: Gebouw, r: Rng, stijl: GevelStijl, luifels = true) {
  const Y = g.y, H = Y + totaleHoogte(g.lagen), lagen = g.lagen.length, hBG = g.lagen[0].hoogte;
  for (const x of randen(g)) {
    if (x.soort !== 'voor') { wand(mb, x.soort === 'zij' ? `muur:${stijl}` : `gevel:${stijl}`, x, Y, H, 0, lagen); continue; }
    const n = Math.max(1, Math.round(x.L / 6)), pw = x.L / n;
    for (let i = 0; i < n; i++) {
      const a = { x: x.a.x + x.t.x * i * pw, z: x.a.z + x.t.z * i * pw }, b = { x: x.a.x + x.t.x * (i + 1) * pw, z: x.a.z + x.t.z * (i + 1) * pw };
      mb.quad(`winkelpui:${r.int(0, PUIEN - 1)}`, P3(a, Y), P3(b, Y), P3(b, Y + hBG), P3(a, Y + hBG), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
      if (luifels && r.next() < 0.7 && pw > 2) {
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

export function kantoor(mb: MeshBouwer, g: Gebouw, r: Rng, stijl: GevelStijl, props: Prop[]) {
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

export function hal(mb: MeshBouwer, g: Gebouw, r: Rng) {
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

// ─── Inrichting van het erf (geen tuinen) ───────────────────────────────────────

/**
 * De rest van het perceel achter (en voor) een gebouw zonder tuinen: parkeerplaats bij kantoren,
 * binnentuin met speelplek en fietsenhok bij flats, binnenplaats bij winkels, opslagterrein met
 * containers en hekwerk bij bedrijfshallen.
 */
function inrichting(mb: MeshBouwer, g: Gebouw, r: Rng, hoogte: H, props: Prop[]) {
  const an = g.ankers[0];
  const P = (d: number, s: number): V2 => ({ x: an.p.x + an.n.x * d + an.t.x * s, z: an.p.z + an.n.z * d + an.t.z * s });
  const yv = (p: V2) => hoogte(p.x, p.z);
  const binnen = (p: V2) => puntInPolygoon(p, g.perceel) && !puntInPolygoon(p, g.voet) && !bijBuur(p);
  const half = g.breedte / 2 - 0.8;
  const d0 = g.diepte + 1, d1 = an.d - g.terug - 0.6; // achter het gebouw, gemeten vanaf de voorgevel
  const diep = d1 - d0;
  // Breedte waarbinnen een rechthoek (d0..d1) helemaal op het perceel ligt.
  const vrij = (da: number, db: number) => {
    let h = half;
    while (h > 2 && ![P(da, -h), P(da, h), P(db, -h), P(db, h)].every(binnen)) h -= 1;
    return h;
  };
  const boom = (p: V2, schaal = r.range(0.55, 0.8)) => { if (binnen(p)) props.push({ soort: r.kies(['linde', 'eik', 'berk'] as const), x: p.x, y: yv(p), z: p.z, rot: r.range(0, 6.28), schaal, variant: r.int(0, 1) }); };
  const struikje = (p: V2) => { if (binnen(p)) struik(mb, p, yv(p), r.range(0.5, 0.8), r.range(0.8, 1.3)); };

  // Voorkant: plantenbakken of een boom bij brede voorstukken.
  if (g.terug > 2.2 && g.vorm !== 'winkelsMetWonen') {
    for (let s = -half + 2; s <= half - 2; s += 7) {
      if (Math.abs(s) < 3) continue; // entree vrijlaten
      const c = P(-g.terug * 0.5, s);
      if (!binnen(c)) continue;
      if (g.vorm === 'bedrijfshal') continue;
      if (r.next() < 0.5) boom(c, 0.5); else doos(mb, 'beton', 'haag', c, an.t, 2.4, 1.0, yv(c), yv(c) + 0.6);
    }
  }
  if (diep < 3) return;

  switch (g.vorm) {
    case 'kantoortoren': {
      // Parkeerplaats: één of twee rijen vakken van 2,5 × 5 m met een rijbaan ertussen.
      const h = vrij(d0, d1);
      if (h < 4) break;
      plaat(mb, 'asfalt', an, d0, d1, -h, h, hoogte, 0.09);
      const rijen = diep >= 17 ? [d0 + 0.5, d1 - 5.5] : diep >= 7 ? [d1 - 5.5] : [];
      for (const rd of rijen) {
        for (let s = -h + 0.3; s <= h - 0.2; s += 2.5) plaat(mb, 'markering', an, rd, rd + 5, s - 0.06, s + 0.06, hoogte, 0.11);
        // Wat geparkeerde auto's.
        for (let s = -h + 1.55; s < h - 1.2; s += 2.5) {
          if (r.next() < 0.45) continue;
          const c = P(rd + 2.5, s), y = yv(c);
          const kleur = r.kies(['trimDonker', 'trim', 'metaal', 'kraan', 'dakpannen'] as const);
          doos(mb, kleur, kleur, c, an.n, 4.3, 1.8, y + 0.25, y + 0.95);
          doos(mb, 'glas', kleur, P(rd + 2.7, s), an.n, 2.4, 1.6, y + 0.95, y + 1.45);
        }
      }
      // Bomen langs de achterrand.
      for (let s = -h + 3; s < h - 2; s += 9) boom(P(d1 + 0.2, s));
      break;
    }
    case 'appartementen': {
      // Binnentuin: pad, bomen, speelplek, bankjes en een fietsenhok.
      const h = vrij(d0, d1);
      if (h < 3) break;
      plaat(mb, 'stoeptegels', an, d0, d0 + 1.6, -h, h, hoogte);
      if (diep > 6) {
        const ps = r.range(-h * 0.4, h * 0.4);
        plaat(mb, 'stoeptegels', an, d0 + 1.6, d1, ps - 0.8, ps + 0.8, hoogte);
        // Fietsenhok tegen de achtergevel.
        const fh = Math.min(10, h * 0.8);
        const c = P(d0 + 2.6, ps > 0 ? -h + fh / 2 + 0.3 : h - fh / 2 - 0.3), y = yv(c);
        doos(mb, 'hout', 'golfdak', c, an.t, fh, 2.4, y, y + 2.3);
        if (diep > 12) {
          // Speelplek met zandbak en klimrek.
          const sp = P(d0 + diep * 0.6, ps > 0 ? -h * 0.5 : h * 0.5);
          if (binnen(sp)) {
            const ys = yv(sp);
            plaat(mb, 'grind', an, d0 + diep * 0.6 - 3, d0 + diep * 0.6 + 3, (ps > 0 ? -h * 0.5 : h * 0.5) - 3, (ps > 0 ? -h * 0.5 : h * 0.5) + 3, hoogte, 0.1);
            doos(mb, 'kraan', 'hout', sp, an.t, 2.2, 1.4, ys, ys + 2.2);
            doos(mb, 'hout', 'hout', { x: sp.x + an.t.x * 1.8, z: sp.z + an.t.z * 1.8 }, an.t, 0.3, 2.8, ys, ys + 1.6);
          }
        }
        // Bankjes langs het pad.
        for (const k of [-1, 1]) { const c2 = P(d0 + diep * 0.35, ps + k * 1.6), y2 = yv(c2); if (binnen(c2)) doos(mb, 'hout', 'hout', c2, an.n, 1.8, 0.5, y2 + 0.35, y2 + 0.5); }
      }
      for (let i = 0; i < Math.min(6, Math.floor(h * diep / 120) + 1); i++) boom(P(r.range(d0 + 3, d1 - 1), r.range(-h + 1, h - 1)));
      for (let s = -h + 1; s < h; s += 4) if (r.next() < 0.5) struikje(P(d1 - 0.6, s));
      break;
    }
    case 'winkelsMetWonen': {
      // Binnenplaats: bestrating, containers, fietsen, een boom.
      const h = vrij(d0, d1);
      if (h < 2.5) break;
      plaat(mb, 'stoeptegels', an, d0, d1, -h, h, hoogte);
      for (let s = -h + 1; s < h - 1; s += 3.2) {
        if (r.next() < 0.5) continue;
        const c = P(d0 + 0.8, s), y = yv(c);
        doos(mb, r.next() < 0.5 ? 'trimDonker' : 'kraan', 'trimDonker', c, an.t, 1.3, 1.0, y, y + 1.3);
      }
      if (diep > 6) boom(P(d0 + diep * 0.6, r.range(-h * 0.5, h * 0.5)), 0.6);
      for (let s = -h + 2; s < h - 2; s += 6) if (r.next() < 0.4) struikje(P(d1 - 0.5, s));
      break;
    }
    case 'bedrijfshal': {
      // Opslagterrein met hekwerk, containers en pallets.
      const h = vrij(d0, d1);
      if (h < 3) break;
      plaat(mb, 'erfverharding', an, d0, d1, -h, h, hoogte, 0.07);
      for (let i = 0; i < Math.floor(h * diep / 40); i++) {
        const d = r.range(d0 + 2, d1 - 2), s = r.range(-h + 2, h - 2), c = P(d, s);
        if (!binnen(c)) continue;
        const y = yv(c);
        if (r.next() < 0.6) {
          const kl = `golfplaat:${r.int(0, HALTINTEN - 1)}`;
          const stapel = r.next() < 0.35 ? 2 : 1;
          for (let k = 0; k < stapel; k++) doos(mb, kl, kl, c, an.t, 6.1, 2.45, y + k * 2.6, y + k * 2.6 + 2.6);
        } else {
          for (let k = 0; k < r.int(1, 3); k++) doos(mb, 'hout', 'hout', { x: c.x + an.t.x * k * 1.4, z: c.z + an.t.z * k * 1.4 }, an.t, 1.2, 1.0, y, y + r.range(0.5, 1.6));
        }
      }
      // Hekwerk langs zijkanten en achterkant.
      const hek = (a: V2, b: V2) => {
        const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 1) return;
        const ya = yv(a), yb = yv(b);
        mb.quad('hekwerk', { x: a.x, y: ya, z: a.z }, { x: b.x, y: yb, z: b.z }, { x: b.x, y: yb + 2.2, z: b.z }, { x: a.x, y: ya + 2.2, z: a.z }, [0, 0], [L / 3.5, 0], [L / 3.5, 1], [0, 1], N3({ x: -(b.z - a.z) / L, z: (b.x - a.x) / L }));
      };
      hek(P(d0, -h), P(d1, -h)); hek(P(d1, -h), P(d1, h)); hek(P(d1, h), P(d0, h));
      break;
    }
  }
}

/**
 * Hoger niveau op een plat dak: vanaf niveau 3 zonnepanelen (op het zuiden, licht schuin),
 * vanaf niveau 4 bij flats en kantoren een groen dak met een dakterras.
 */
function platDak(mb: MeshBouwer, g: Gebouw, dak: DakInfo) {
  const n = g.niveau ?? 1;
  const zon = n >= 3 || !!g.dakBeleid?.zon, groenBeleid = !!g.dakBeleid?.groen;
  if (!zon && !groenBeleid) return;
  const H = dak.y;
  const vrij = inzet(dak.poly, 1.6);
  const kern = g.vorm === 'kantoortoren' && !g.type ? inzet(g.voet, Math.min(6, g.diepte * 0.3)) : null;
  const xs = vrij.map(p => p.x), zs = vrij.map(p => p.z);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const groen = groenBeleid || ((n >= 5 || (n === 4 && g.seed % 2 === 0)) && (g.vorm === 'appartementen' || g.vorm === 'kantoortoren'));
  if (groen && Math.abs(getekendOppervlak(vrij)) > 40) vlak(mb, 'tuin', vrij, H + 0.12);
  const midden = zwaartepunt(dak.poly);
  if (zon) for (let x = x0; x < x1 - 1; x += 1.15) for (let z = z0; z < z1 - 1.6; z += 2.4) {
    const hoeken = [{ x, z }, { x: x + 1.05, z }, { x: x + 1.05, z: z + 1.6 }, { x, z: z + 1.6 }];
    if (!hoeken.every(p => puntInPolygoon(p, vrij))) continue;
    if (kern && hoeken.some(p => puntInPolygoon(p, kern))) continue;
    // Bij een groen dak alleen panelen op de helft (de andere helft is het terras).
    if (groen && x + 0.5 < midden.x) continue;
    const y = H + (groen ? 0.2 : 0.1);
    // Schuin naar het zuiden (+z): noordkant hoger.
    mb.quad('zonnepaneel', { x, y: y + 0.55, z }, { x: x + 1.05, y: y + 0.55, z }, { x: x + 1.05, y: y + 0.15, z: z + 1.6 }, { x, y: y + 0.15, z: z + 1.6 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: 1, z: 0.3 });
  }
  if (groen) {
    // Dakterras: houten vlonder en een paar plantenbakken.
    const c = { x: (x0 + midden.x) / 2, z: midden.z };
    doos(mb, 'hout', 'hout', c, { x: 1, z: 0 }, Math.min(6, (midden.x - x0) * 0.8), Math.min(5, (z1 - z0) * 0.6), H, H + 0.25);
    for (const dz of [-1, 1]) doos(mb, 'haag', 'beton', { x: c.x, z: c.z + dz * Math.min(3, (z1 - z0) * 0.35) }, { x: 1, z: 0 }, 2.5, 0.6, H, H + 0.9);
  }
}
