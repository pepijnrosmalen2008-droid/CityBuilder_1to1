import { V3, V2, lerp, norm2, bezier2, dist2 } from '../math';
import { Wegennet, Segment, PadPunt } from '../wegen/netwerk';
import { WEGTYPEN, Strook, strookGrenzen, totaleBreedte, randen } from '../wegen/typen';
import { MeshBouwer, MeshData, Prop } from './mesh';
import { ZEENIVEAU } from '../terrain';
import { driehoeken } from '../poly';

export { randen };

const STOEP_H = 0.15;
const BERM_H = 0.12;
const ROK = 1.4; // hoe ver de zijkant van de weg de grond in loopt

const DEKMAT: Record<string, string> = { asfalt: 'asfalt', klinkers: 'klinkers', tegels: 'stoeptegels', rood: 'fietsasfalt' };

function materiaalVoor(s: Strook, dek: string): string {
  switch (s.soort) {
    case 'stoep': return 'stoeptegels';
    case 'fiets': return dek === 'klinkers' ? 'klinkers' : 'fietsasfalt';
    case 'bus': return 'busbaan';
    case 'berm': case 'middenberm': return 'gras';
    default: return DEKMAT[dek];
  }
}
const verhoogd = (s: Strook) => s.soort === 'stoep' ? STOEP_H : s.soort === 'berm' || s.soort === 'middenberm' ? BERM_H : 0;

/** Punt op de as op booglengte s (voorbij de uiteinden: rechtdoor verlengd). */
function asPunt(pad: PadPunt[], s: number): { x: number; y: number; z: number; dx: number; dz: number; brug: boolean } {
  const n = pad.length;
  if (s <= 0) { const a = pad[0]; return { x: a.x + a.dx * s, y: a.y, z: a.z + a.dz * s, dx: a.dx, dz: a.dz, brug: a.brug }; }
  if (s >= pad[n - 1].s) { const a = pad[n - 1], e = s - a.s; return { x: a.x + a.dx * e, y: a.y, z: a.z + a.dz * e, dx: a.dx, dz: a.dz, brug: a.brug }; }
  let i = 0;
  // Binair zoeken.
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pad[m].s <= s) lo = m; else hi = m; }
  i = lo;
  const a = pad[i], b = pad[i + 1];
  const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
  const d = norm2({ x: lerp(a.dx, b.dx, t), z: lerp(a.dz, b.dz, t) });
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), dx: d.x, dz: d.z, brug: t < 0.5 ? a.brug : b.brug };
}

/**
 * Een dwarsdoorsnede met een eigen booglengte voor de linker- en rechterrand. Elke offset o
 * (van -W/2 tot +W/2) ligt op booglengte lerp(sL, sR, (o+W/2)/W): zo kan een wegeinde schuin
 * lopen en volgen alle strookgrenzen dezelfde schuine lijn.
 */
export interface Rij { sL: number; sR: number; W: number }

export function punt(pad: PadPunt[], r: Rij, o: number, dy = 0): V3 {
  const s = lerp(r.sL, r.sR, (o + r.W / 2) / r.W);
  const a = asPunt(pad, s);
  return { x: a.x - a.dz * o, y: a.y + dy, z: a.z + a.dx * o };
}
const rijS = (r: Rij) => (r.sL + r.sR) / 2;

/** Dwarsdoorsneden van het segment, met de inkorting per rand aan beide uiteinden. */
export function rijen(net: Wegennet, seg: Segment, stap = 2): Rij[] {
  const W = totaleBreedte(WEGTYPEN[seg.type].stroken);
  const ka = net.eindKnip(seg, 'a'), kb = net.eindKnip(seg, 'b');
  const L = seg.lengte;
  const aL = ka.links, aR = ka.rechts, bL = L - kb.links, bR = L - kb.rechts;
  if (bL - aL < 0.3 || bR - aR < 0.3) return [];
  // Fijner bemonsteren in krappe bochten.
  let kromming = 0;
  for (let i = 1; i < seg.pad.length; i++) kromming = Math.max(kromming, Math.abs(seg.pad[i].dx * seg.pad[i - 1].dz - seg.pad[i].dz * seg.pad[i - 1].dx) / Math.max(0.1, seg.pad[i].s - seg.pad[i - 1].s));
  const st = Math.max(0.6, Math.min(stap, kromming > 0 ? 0.12 / kromming : stap));
  const n = Math.max(1, Math.ceil(Math.max(bL - aL, bR - aR) / st));
  const r: Rij[] = [];
  for (let i = 0; i <= n; i++) r.push({ sL: lerp(aL, bL, i / n), sR: lerp(aR, bR, i / n), W });
  return r;
}

export function bouwSegment(net: Wegennet, seg: Segment): { mesh: MeshData; props: Prop[] } {
  const type = WEGTYPEN[seg.type];
  const R = rijen(net, seg);
  const mb = new MeshBouwer();
  const props: Prop[] = [];
  if (R.length < 2) return { mesh: mb.bouw(), props };
  const pad = seg.pad;
  const g = strookGrenzen(type.stroken);
  const W = totaleBreedte(type.stroken);
  const P = (r: Rij, o: number, dy = 0) => punt(pad, r, o, dy);
  const s = R.map(rijS);
  const dek = type.dek;
  const rechts = (r: Rij, teken: number) => { const a = asPunt(pad, rijS(r)); return { x: -a.dz * teken, y: 0, z: a.dx * teken }; };

  // ── Oppervlakken per strook ──
  for (let i = 0; i < g.length; i++) {
    const { a, b, s: st } = g[i];
    const h = verhoogd(st);
    mb.strook(materiaalVoor(st, dek), R.map(r => P(r, a, h)), R.map(r => P(r, b, h)), s, a, b);
    for (const [rand, buur, teken] of [[a, g[i - 1], -1], [b, g[i + 1], 1]] as const) {
      if (!buur) continue;
      const hb = verhoogd(buur.s);
      if (h <= hb) continue;
      mb.band('band', R.map(r => P(r, rand, hb)), R.map(r => P(r, rand, h)), s, R.map(r => rechts(r, teken)));
    }
  }
  // ── Buitenkant: rok de grond in, of brugrand ──
  for (const [o, teken] of [[-W / 2, -1], [W / 2, 1]] as const) {
    const h = verhoogd(teken < 0 ? g[0].s : g[g.length - 1].s);
    mb.band('beton', R.map(r => P(r, o, -(asPunt(pad, rijS(r)).brug ? 1.3 : ROK))), R.map(r => P(r, o, h)), s, R.map(r => rechts(r, teken)));
  }
  // Doodlopend einde: kopse kant dichtmaken.
  for (const eind of ['a', 'b'] as const) {
    const k = eind === 'a' ? seg.a : seg.b;
    if (net.graad(k) !== 1) continue;
    const r = eind === 'a' ? R[0] : R[R.length - 1];
    const os = g.flatMap(x => [x.a, x.b]);
    const voor = asPunt(pad, rijS(r));
    const n = eind === 'a' ? { x: -voor.dx, y: 0, z: -voor.dz } : { x: voor.dx, y: 0, z: voor.dz };
    for (const x of g) {
      const h = verhoogd(x.s);
      mb.band('beton', [P(r, x.a, -ROK), P(r, x.b, -ROK)], [P(r, x.a, h), P(r, x.b, h)], [x.a, x.b], [n, n]);
    }
    void os;
  }

  // ── Bruggen: onderkant, borstwering, pijlers ──
  let i = 0;
  const isBrug = (r: Rij) => asPunt(pad, rijS(r)).brug;
  while (i < R.length) {
    if (!isBrug(R[i])) { i++; continue; }
    let j = i; while (j < R.length && isBrug(R[j])) j++;
    const deel = R.slice(Math.max(0, i - 1), Math.min(R.length, j + 1));
    const ds = deel.map(rijS);
    mb.strook('beton', deel.map(r => P(r, -W / 2, -1.3)), deel.map(r => P(r, W / 2, -1.3)), ds, 0, W, false);
    for (const [o, teken] of [[-W / 2, -1], [W / 2, 1]] as const) {
      const h = verhoogd(teken < 0 ? g[0].s : g[g.length - 1].s);
      const binnen = o - teken * 0.3;
      mb.band('beton', deel.map(r => P(r, o, h)), deel.map(r => P(r, o, h + 1.0)), ds, deel.map(r => rechts(r, teken)));
      mb.band('beton', deel.map(r => P(r, binnen, h)), deel.map(r => P(r, binnen, h + 1.0)), ds, deel.map(r => rechts(r, -teken)));
      mb.strook('beton', deel.map(r => P(r, Math.min(o, binnen), h + 1.0)), deel.map(r => P(r, Math.max(o, binnen), h + 1.0)), ds, 0, 0.3);
      mb.band('metaal', deel.map(r => P(r, o - teken * 0.15, h + 1.0)), deel.map(r => P(r, o - teken * 0.15, h + 1.25)), ds, deel.map(r => rechts(r, teken)));
    }
    const lengte = ds[ds.length - 1] - ds[0];
    const aantal = Math.max(1, Math.round(lengte / 22));
    for (let k = 1; k < aantal + (aantal === 1 ? 1 : 0); k++) {
      const a = asPunt(pad, ds[0] + lengte * k / Math.max(2, aantal));
      const bodem = Math.min(net.terrein.hoogte(a.x, a.z), ZEENIVEAU - 4);
      const ax = { x: -a.dz, y: 0, z: a.dx }, az = { x: a.dx, y: 0, z: a.dz };
      mb.blok('beton', 'beton', { x: a.x, y: 0, z: a.z }, ax, az, W * 0.7, 1.6, bodem - 1, a.y - 1.3);
      mb.blok('beton', 'beton', { x: a.x, y: 0, z: a.z }, ax, az, W * 0.95, 2.2, a.y - 2.0, a.y - 1.3, true);
    }
    i = j;
  }

  // ── Markering ──
  // Een lijn op offset o tussen booglengtes (gemeten op die offset).
  const sOp = (r: Rij, o: number) => lerp(r.sL, r.sR, (o + W / 2) / W);
  const eerste = R[0], laatste = R[R.length - 1];
  const lijnStuk = (o0: number, o1: number, sa: number, sb: number) => {
    const n = Math.max(1, Math.ceil((sb - sa) / 2));
    const rr: Rij[] = [];
    // Rij die op offset (o0+o1)/2 booglengte s heeft (schuin mee met het einde).
    const scheef = (x: number) => { const t = (x - sOp(eerste, (o0 + o1) / 2)) / Math.max(1e-6, sOp(laatste, (o0 + o1) / 2) - sOp(eerste, (o0 + o1) / 2)); return { sL: lerp(eerste.sL, laatste.sL, t), sR: lerp(eerste.sR, laatste.sR, t), W }; };
    for (let k = 0; k <= n; k++) rr.push(scheef(lerp(sa, sb, k / n)));
    mb.strook('markering', rr.map(r => P(r, o0, 0.012)), rr.map(r => P(r, o1, 0.012)), rr.map(rijS), 0, o1 - o0);
  };
  const lijn = (o: number, breed: number, streep: number, gat: number, marge = 0.5) => {
    const s0 = sOp(eerste, o) + marge, s1 = sOp(laatste, o) - marge;
    for (let d = s0; d < s1; d += streep + gat) { const e = Math.min(s1, d + streep); if (e - d > 0.2) lijnStuk(o - breed / 2, o + breed / 2, d, e); }
  };
  const snel = type.snelheid >= 70;
  const rijbaan = (x: Strook) => x.soort === 'auto' || x.soort === 'bus' || x.soort === 'vluchtstrook';
  for (let k = 0; k < g.length - 1; k++) {
    const L = g[k].s, Rr = g[k + 1].s, o = g[k].b;
    if (rijbaan(L) && rijbaan(Rr)) {
      if (L.soort === 'vluchtstrook' || Rr.soort === 'vluchtstrook') lijn(o, 0.2, 1e9, 0);
      else if (L.richting !== Rr.richting) lijn(o, 0.12, 3, 3);
      else lijn(o, snel ? 0.15 : 0.1, snel ? 9 : 3, snel ? 3 : 9);
      if (L.soort === 'bus' || Rr.soort === 'bus') lijn(o, 0.25, 1e9, 0);
    }
    if ((L.soort === 'fiets' && rijbaan(Rr)) || (rijbaan(L) && Rr.soort === 'fiets')) lijn(o, 0.15, 1, 1);
    if (snel && ((L.soort === 'berm' || L.soort === 'middenberm') && rijbaan(Rr))) lijn(o + 0.35, 0.15, 1e9, 0);
    if (snel && (rijbaan(L) && (Rr.soort === 'berm' || Rr.soort === 'middenberm'))) lijn(o - 0.35, 0.15, 1e9, 0);
  }
  for (const x of g) if (x.s.soort === 'tram') {
    const m = (x.a + x.b) / 2;
    for (const o of [m - 0.7175, m + 0.7175]) mb.strook('rail', R.map(r => P(r, o - 0.04, 0.02)), R.map(r => P(r, o + 0.04, 0.02)), s, 0, 0.08);
  }

  // ── Zebrapaden en stopstrepen bij kruispunten ──
  const rd = randen(type.stroken);
  for (const eind of ['a', 'b'] as const) {
    const k = eind === 'a' ? seg.a : seg.b;
    if (net.graad(k) < 3) continue;
    const r = eind === 'a' ? eerste : laatste, richting = eind === 'a' ? 1 : -1;
    const zebraAf = 1.0, zebraL = 3.5;
    if (rd.stoep) for (let o = rd.binnenL + 0.5; o + 0.5 <= rd.binnenR - 0.3; o += 1.0) {
      const sa = sOp(r, o + 0.25) + richting * zebraAf, sb = sa + richting * zebraL;
      lijnStuk(o, o + 0.5, Math.min(sa, sb), Math.max(sa, sb));
    }
    // Stopstreep over de stroken die naar de knoop rijden.
    const naar = eind === 'a' ? 'B' : 'A';
    for (const x of g) {
      if (!(x.s.soort === 'auto' || x.s.soort === 'bus' || x.s.soort === 'gedeeld') || x.s.richting !== naar) continue;
      if (x.s.soort === 'gedeeld') continue;
      const sa = sOp(r, (x.a + x.b) / 2) + richting * (rd.stoep ? zebraAf + zebraL + 0.8 : 1.5);
      lijnStuk(x.a + 0.1, x.b - 0.1, Math.min(sa, sa + richting * 0.4), Math.max(sa, sa + richting * 0.4));
    }
  }

  // ── Straatmeubilair en bomen ──
  const L0 = Math.max(eerste.sL, eerste.sR), L1 = Math.min(laatste.sL, laatste.sR);
  const rotVan = (s: number) => { const a = asPunt(pad, s); return Math.atan2(-a.dz, a.dx); };
  const plek = (s: number, o: number, dy: number) => punt(pad, { sL: s, sR: s, W }, o, dy);
  if (type.bomen) {
    for (const x of g) {
      const berm = x.s.soort === 'berm' || x.s.soort === 'middenberm';
      const stoepBoom = x.s.soort === 'stoep' && x.s.breedte >= 2;
      if (!berm && !stoepBoom) continue;
      if (x.s.soort === 'middenberm' && type.snelheid > 70) continue;
      const o = berm ? (x.a + x.b) / 2 : (x.a < 0 ? x.a + 0.9 : x.b - 0.9);
      const tussen = berm ? 11 : 14;
      for (let d = L0 + 7 + (x.a < 0 ? 0 : tussen / 2); d < L1 - 6; d += tussen) {
        if (asPunt(pad, d).brug) continue;
        const p = plek(d, o, verhoogd(x.s));
        props.push({ soort: (Math.floor(d / tussen) + seg.id) % 3 === 0 ? 'linde' : 'plataan', x: p.x, y: p.y, z: p.z, rot: (d * 1.7) % 6.28, schaal: 0.85 + ((d * 7) % 1) * 0.25, variant: Math.floor(d) % 2 });
      }
    }
  }
  const mid = g.find(x => x.s.soort === 'middenberm');
  let kant = seg.id % 2 === 0 ? 1 : -1;
  for (let d = L0 + 10; d < L1 - 6; d += 32) {
    const rot = rotVan(d);
    if (mid && type.snelheid >= 70) {
      const p = plek(d, (mid.a + mid.b) / 2, BERM_H);
      props.push({ soort: 'lantaarnDubbel', x: p.x, y: p.y, z: p.z, rot, schaal: 1, variant: 0 });
      continue;
    }
    if (W < 5) { if (d % 64 < 32) { const p = plek(d, W / 2 + 0.4, 0); props.push({ soort: 'lantaarn', x: p.x, y: net.terrein.hoogte(p.x, p.z), z: p.z, rot: rot + Math.PI, schaal: 0.75, variant: 0 }); } continue; }
    const st = kant < 0 ? g[0] : g[g.length - 1];
    const o = kant < 0 ? (st.s.soort === 'stoep' ? st.b - 0.45 : -W / 2 + 0.4) : (st.s.soort === 'stoep' ? st.a + 0.45 : W / 2 - 0.4);
    const p = plek(d, o, verhoogd(st.s));
    props.push({ soort: 'lantaarn', x: p.x, y: p.y, z: p.z, rot: kant < 0 ? rot : rot + Math.PI, schaal: 1, variant: 0 });
    kant = -kant as 1 | -1;
  }
  return { mesh: mb.bouw(), props };
}

/** Kruispunt: rijbaanvlak met afgeronde stoephoeken tussen de (schuin afgesneden) wegeinden. */
export function bouwKruispunt(net: Wegennet, knoopId: number): MeshData {
  const mb = new MeshBouwer();
  const knoop = net.knopen.get(knoopId);
  if (!knoop || !net.isKruispunt(knoopId)) return mb.bouw();
  interface Eind { weg: V2; bL: V3; bR: V3; oL: V3; oR: V3; hL: number; hR: number; dek: string }
  const einden: Eind[] = [];
  for (const sid of knoop.segs) {
    const seg = net.segmenten.get(sid)!;
    const R = rijen(net, seg);
    if (!R.length) continue;
    const t = WEGTYPEN[seg.type];
    const r = seg.a === knoopId ? R[0] : R[R.length - 1];
    const rd = randen(t.stroken);
    const g = strookGrenzen(t.stroken);
    const p = (o: number) => punt(seg.pad, r, o);
    const bL = p(rd.binnenL), bR = p(rd.binnenR), oL = p(rd.buitenL), oR = p(rd.buitenR);
    const hL = verhoogd(g[0].s), hR = verhoogd(g[g.length - 1].s);
    const wegV = (() => { const q = seg.a === knoopId ? seg.pad[0] : seg.pad[seg.pad.length - 1]; return seg.a === knoopId ? { x: q.dx, z: q.dz } : { x: -q.dx, z: -q.dz }; })();
    // In "weg-van-de-knoop"-termen: bij uiteinde b zijn links en rechts verwisseld.
    einden.push(seg.b === knoopId
      ? { weg: wegV, bL: bR, bR: bL, oL: oR, oR: oL, hL: hR, hR: hL, dek: t.dek }
      : { weg: wegV, bL, bR, oL, oR, hL, hR, dek: t.dek });
  }
  if (einden.length < 2) return mb.bouw();
  einden.sort((a, b) => Math.atan2(a.weg.z, a.weg.x) - Math.atan2(b.weg.z, b.weg.x));
  const mat = einden.every(e => e.dek === 'klinkers') ? 'klinkers' : 'asfalt';
  const c: V3 = { x: knoop.p.x, y: knoop.y, z: knoop.p.z };

  // Boog tussen twee randpunten; controlepunt op het snijpunt van beide randlijnen (naar de knoop toe).
  const boog = (a: V3, da: V2, b: V3, db: V2, n = 10): V3[] => {
    const den = da.x * db.z - da.z * db.x;
    let ctrl: V2 = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if (Math.abs(den) > 0.05) {
      const t = ((b.x - a.x) * db.z - (b.z - a.z) * db.x) / den;
      const u = ((b.x - a.x) * da.z - (b.z - a.z) * da.x) / den;
      if (t < 0.5 && u < 0.5 && t > -60 && u > -60) ctrl = { x: a.x + da.x * t, z: a.z + da.z * t };
    }
    const r: V3[] = [];
    for (let k = 0; k <= n; k++) { const q = bezier2({ x: a.x, z: a.z }, ctrl, { x: b.x, z: b.z }, k / n); r.push({ x: q.x, y: lerp(a.y, b.y, k / n), z: q.z }); }
    return r;
  };
  const n2 = einden.length === 2;
  const rand: V3[] = [];
  for (let i = 0; i < einden.length; i++) {
    const e = einden[i], f = einden[(i + 1) % einden.length];
    rand.push(e.bL, e.bR);
    // Bij twee wegen (breedteovergang) zijn de randen rechte lijnen: geen boog naar binnen.
    const binnen = n2 ? [e.bR, f.bL] : boog(e.bR, e.weg, f.bL, f.weg);
    rand.push(...binnen.slice(1, -1));
    const hoogte = STOEP_H;
    const buiten = n2 ? [e.oR, f.oL] : boog(e.oR, e.weg, f.oL, f.weg);
    const ss = binnen.map((_, k) => k);
    const naarBinnen = (p: V3) => ({ x: c.x - p.x, y: 0, z: c.z - p.z });
    if (dist2({ x: e.bR.x, z: e.bR.z }, { x: e.oR.x, z: e.oR.z }) > 0.1 && buiten.length === binnen.length) {
      const hmat = 'stoeptegels';
      const L = binnen.map(p => ({ ...p, y: p.y + hoogte })), Rr = buiten.map(p => ({ ...p, y: p.y + hoogte }));
      mb.strook(hmat, L, Rr, ss, 0, 1);
      mb.band('band', binnen, L, ss, binnen.map(naarBinnen));
      mb.band('beton', buiten.map(p => ({ ...p, y: p.y - ROK })), Rr, ss, buiten.map(p => ({ x: -naarBinnen(p).x, y: 0, z: -naarBinnen(p).z })));
    } else {
      mb.band('beton', buiten.map(p => ({ ...p, y: p.y - ROK })), buiten, buiten.map((_, k) => k), buiten.map(p => ({ x: p.x - c.x, y: 0, z: p.z - c.z })));
    }
  }
  // Vlak vullen met oorknippen (werkt ook bij scherpe hoeken, waar een waaier vanuit het midden faalt).
  const vlak = rand.filter((p, i) => dist2({ x: p.x, z: p.z }, { x: rand[(i + 1) % rand.length].x, z: rand[(i + 1) % rand.length].z }) > 0.02);
  const tri = driehoeken(vlak.map(p => ({ x: p.x, z: p.z })));
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, d] = [vlak[tri[i]], vlak[tri[i + 1]], vlak[tri[i + 2]]];
    mb.driehoek(mat, a, b, d, [a.x, a.z], [b.x, b.z], [d.x, d.z], { x: 0, y: 1, z: 0 });
  }
  void c;
  return mb.bouw();
}
