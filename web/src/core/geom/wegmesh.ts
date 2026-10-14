import { V3, V2, lerp, norm2, bezier2, dist2 } from '../math';
import { Wegennet, Segment, PadPunt } from '../wegen/netwerk';
import { WEGTYPEN, Strook, strookGrenzen, totaleBreedte } from '../wegen/typen';
import { MeshBouwer, MeshData, Prop } from './mesh';
import { ZEENIVEAU } from '../terrain';

const STOEP_H = 0.15;
const BERM_H = 0.12;
const ROK = 1.4; // hoe ver de zijkant van de weg de grond in loopt

interface Rij { x: number; y: number; z: number; rx: number; rz: number; s: number; brug: boolean }

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

/** Richting "weg van de knoop" voor een segment aan knoop k. */
function wegVan(seg: Segment, k: number): V2 {
  const p = seg.a === k ? seg.pad[0] : seg.pad[seg.pad.length - 1];
  return seg.a === k ? { x: p.dx, z: p.dz } : { x: -p.dx, z: -p.dz };
}

function interp(pad: PadPunt[], s: number): Rij {
  for (let i = 0; i < pad.length - 1; i++) {
    if (s <= pad[i + 1].s || i === pad.length - 2) {
      const a = pad[i], b = pad[i + 1];
      const t = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-6, b.s - a.s)));
      const d = norm2({ x: lerp(a.dx, b.dx, t), z: lerp(a.dz, b.dz, t) });
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), rx: -d.z, rz: d.x, s, brug: t < 0.5 ? a.brug : b.brug };
    }
  }
  const a = pad[0];
  return { x: a.x, y: a.y, z: a.z, rx: -a.dz, rz: a.dx, s, brug: a.brug };
}

/** De dwarsdoorsneden van het (bijgesneden) segment. */
export function rijen(net: Wegennet, seg: Segment, stap = 2): Rij[] {
  const ta = net.inkorting(seg, 'a'), tb = net.inkorting(seg, 'b');
  const s0 = ta, s1 = seg.lengte - tb;
  if (s1 - s0 < 0.3) return [];
  const n = Math.max(1, Math.ceil((s1 - s0) / stap));
  const r: Rij[] = [];
  for (let i = 0; i <= n; i++) r.push(interp(seg.pad, s0 + (s1 - s0) * i / n));
  // Bij een doorgaande knoop (graad 2): verstek, zodat de stukken naadloos aansluiten.
  for (const eind of ['a', 'b'] as const) {
    const k = eind === 'a' ? seg.a : seg.b;
    const knoop = net.knopen.get(k)!;
    if (knoop.segs.length !== 2) continue;
    const ander = net.segmenten.get(knoop.segs.find(s => s !== seg.id) ?? -1);
    if (!ander || !ander.pad.length) continue;
    const eigen = wegVan(seg, k), andr = wegVan(ander, k);
    // Voorwaartse richting van dit segment, gemiddeld met de doorlopende richting van het andere.
    const vooruit = eind === 'a' ? norm2({ x: eigen.x - andr.x, z: eigen.z - andr.z }) : norm2({ x: -eigen.x + andr.x, z: -eigen.z + andr.z });
    const rij = eind === 'a' ? r[0] : r[r.length - 1];
    const cos = Math.max(0.5, Math.abs((-rij.rz) * vooruit.x + rij.rx * vooruit.z));
    rij.rx = -vooruit.z / cos; rij.rz = vooruit.x / cos; // verstekfactor houdt de breedte gelijk
    rij.y = knoop.y;
  }
  return r;
}

const P = (r: Rij, o: number, dy = 0): V3 => ({ x: r.x + r.rx * o, y: r.y + dy, z: r.z + r.rz * o });

/** Randen van de rijbaan (binnenkant van de stoepen) en de buitenranden, als offsets. */
export function randen(stroken: Strook[]) {
  const g = strookGrenzen(stroken);
  const W = totaleBreedte(stroken);
  let l = -W / 2, r = W / 2;
  if (g.length > 1 && g[0].s.soort === 'stoep') l = g[0].b;
  if (g.length > 1 && g[g.length - 1].s.soort === 'stoep') r = g[g.length - 1].a;
  return { binnenL: l, binnenR: r, buitenL: -W / 2, buitenR: W / 2, stoep: g.length > 1 && g[0].s.soort === 'stoep' };
}

export function bouwSegment(net: Wegennet, seg: Segment): { mesh: MeshData; props: Prop[] } {
  const type = WEGTYPEN[seg.type];
  const R = rijen(net, seg);
  const mb = new MeshBouwer();
  const props: Prop[] = [];
  if (R.length < 2) return { mesh: mb.bouw(), props };
  const g = strookGrenzen(type.stroken);
  const W = totaleBreedte(type.stroken);
  const s = R.map(r => r.s);
  const dek = type.dek;

  // ── Oppervlakken per strook ──
  for (let i = 0; i < g.length; i++) {
    const { a, b, s: st } = g[i];
    const h = verhoogd(st);
    const mat = materiaalVoor(st, dek);
    mb.strook(mat, R.map(r => P(r, a, h)), R.map(r => P(r, b, h)), s, a, b);
    // Opstaande rand naar een lagere buurstrook (stoeprand, bermband).
    for (const [rand, buur, teken] of [[a, g[i - 1], -1], [b, g[i + 1], 1]] as const) {
      if (!buur) continue;
      const hb = verhoogd(buur.s);
      if (h <= hb) continue;
      mb.band('band', R.map(r => P(r, rand, hb)), R.map(r => P(r, rand, h)), s, R.map(r => ({ x: r.rx * teken, y: 0, z: r.rz * teken })));
    }
  }
  // ── Buitenkant: rok de grond in, of brugrand ──
  for (const [o, teken] of [[-W / 2, -1], [W / 2, 1]] as const) {
    const st = teken < 0 ? g[0].s : g[g.length - 1].s;
    const h = verhoogd(st);
    mb.band('beton', R.map(r => P(r, o, -(r.brug ? 1.3 : ROK))), R.map(r => P(r, o, h)), s, R.map(r => ({ x: r.rx * teken, y: 0, z: r.rz * teken })));
  }

  // ── Bruggen: onderkant, borstwering, pijlers ──
  let i = 0;
  while (i < R.length) {
    if (!R[i].brug) { i++; continue; }
    let j = i; while (j < R.length && R[j].brug) j++;
    const deel = R.slice(Math.max(0, i - 1), Math.min(R.length, j + 1));
    const ds = deel.map(r => r.s);
    mb.strook('beton', deel.map(r => P(r, -W / 2, -1.3)), deel.map(r => P(r, W / 2, -1.3)), ds, 0, W, false);
    for (const [o, teken] of [[-W / 2, -1], [W / 2, 1]] as const) {
      const h = verhoogd(teken < 0 ? g[0].s : g[g.length - 1].s);
      const binnen = o - teken * 0.3;
      mb.band('beton', deel.map(r => P(r, o, h)), deel.map(r => P(r, o, h + 1.0)), ds, deel.map(r => ({ x: r.rx * teken, y: 0, z: r.rz * teken })));
      mb.band('beton', deel.map(r => P(r, binnen, h)), deel.map(r => P(r, binnen, h + 1.0)), ds, deel.map(r => ({ x: -r.rx * teken, y: 0, z: -r.rz * teken })));
      mb.strook('beton', deel.map(r => P(r, Math.min(o, binnen), h + 1.0)), deel.map(r => P(r, Math.max(o, binnen), h + 1.0)), ds, 0, 0.3);
      // Leuning op de borstwering.
      mb.band('metaal', deel.map(r => P(r, o - teken * 0.15, h + 1.0)), deel.map(r => P(r, o - teken * 0.15, h + 1.25)), ds, deel.map(r => ({ x: r.rx * teken, y: 0, z: r.rz * teken })));
    }
    // Pijlers om de ~22 m.
    const lengte = deel[deel.length - 1].s - deel[0].s;
    const aantal = Math.max(1, Math.round(lengte / 22));
    for (let k = 1; k < aantal + (aantal === 1 ? 1 : 0); k++) {
      const r = interp(seg.pad, deel[0].s + lengte * k / Math.max(2, aantal));
      const grond = Math.min(net.terrein.hoogte(r.x, r.z), ZEENIVEAU - 4);
      const bodem = Math.min(grond, net.terrein.hoogte(r.x, r.z));
      const ax = { x: r.rx, y: 0, z: r.rz }, az = { x: -r.rz, y: 0, z: r.rx };
      mb.blok('beton', 'beton', { x: r.x, y: 0, z: r.z }, ax, az, W * 0.7, 1.6, bodem - 1, r.y - 1.3);
      mb.blok('beton', 'beton', { x: r.x, y: 0, z: r.z }, ax, az, W * 0.95, 2.2, r.y - 2.0, r.y - 1.3, true);
    }
    i = j;
  }

  // ── Markering ──
  const lijn = (o: number, breed: number, streep: number, gat: number) => {
    const s0 = R[0].s + 0.5, s1 = R[R.length - 1].s - 0.5;
    for (let d = s0; d < s1; d += streep + gat) {
      const e = Math.min(s1, d + streep);
      if (e - d < 0.2) continue;
      const stukjes = Math.max(1, Math.ceil((e - d) / 2));
      const rr: Rij[] = [];
      for (let k = 0; k <= stukjes; k++) rr.push(interp(seg.pad, d + (e - d) * k / stukjes));
      mb.strook('markering', rr.map(r => P(r, o - breed / 2, 0.012)), rr.map(r => P(r, o + breed / 2, 0.012)), rr.map(r => r.s), 0, breed);
    }
  };
  const snel = type.snelheid >= 70;
  for (let k = 0; k < g.length - 1; k++) {
    const L = g[k].s, Rr = g[k + 1].s, o = g[k].b;
    const rijbaan = (x: Strook) => x.soort === 'auto' || x.soort === 'bus' || x.soort === 'vluchtstrook';
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
  // Tramrails.
  for (const x of g) if (x.s.soort === 'tram') {
    const m = (x.a + x.b) / 2;
    for (const o of [m - 0.7175, m + 0.7175]) mb.strook('rail', R.map(r => P(r, o - 0.04, 0.02)), R.map(r => P(r, o + 0.04, 0.02)), s, 0, 0.08);
  }

  // ── Zebrapaden bij kruispunten ──
  const rd = randen(type.stroken);
  if (rd.stoep) for (const eind of ['a', 'b'] as const) {
    const k = eind === 'a' ? seg.a : seg.b;
    if (net.graad(k) < 3) continue;
    const s0 = eind === 'a' ? R[0].s + 1.2 : R[R.length - 1].s - 1.2 - 3.5;
    const rr = [interp(seg.pad, s0), interp(seg.pad, s0 + 3.5)];
    for (let o = rd.binnenL + 0.5; o + 0.5 <= rd.binnenR - 0.3; o += 1.0)
      mb.strook('markering', rr.map(r => P(r, o, 0.013)), rr.map(r => P(r, o + 0.5, 0.013)), rr.map(r => r.s), 0, 0.5);
  }

  // ── Straatmeubilair en bomen ──
  const L0 = R[0].s, L1 = R[R.length - 1].s;
  const rot = (r: Rij) => Math.atan2(r.rx, r.rz); // kijkrichting = naar rechts van de weg
  if (type.bomen) {
    for (const x of g) {
      const berm = x.s.soort === 'berm' || x.s.soort === 'middenberm';
      const stoepBoom = x.s.soort === 'stoep' && x.s.breedte >= 2;
      if (!berm && !stoepBoom) continue;
      if (x.s.soort === 'middenberm' && type.snelheid > 70) continue;
      const o = berm ? (x.a + x.b) / 2 : (x.a < 0 ? x.a + 0.9 : x.b - 0.9);
      const tussen = berm ? 11 : 14;
      for (let d = L0 + 7 + (x.a < 0 ? 0 : tussen / 2); d < L1 - 6; d += tussen) {
        const r = interp(seg.pad, d);
        if (r.brug) continue;
        const p = P(r, o, verhoogd(x.s));
        props.push({ soort: (Math.floor(d / tussen) + seg.id) % 3 === 0 ? 'linde' : 'plataan', x: p.x, y: p.y, z: p.z, rot: (d * 1.7) % 6.28, schaal: 0.85 + ((d * 7) % 1) * 0.25, variant: Math.floor(d) % 2 });
      }
    }
  }
  // Lantaarnpalen om de ~32 m, afwisselend links en rechts (snelweg: in de middenberm).
  const mid = g.find(x => x.s.soort === 'middenberm');
  let kant = seg.id % 2 === 0 ? 1 : -1;
  for (let d = L0 + 10; d < L1 - 6; d += 32) {
    const r = interp(seg.pad, d);
    if (mid && type.snelheid >= 70) {
      const p = P(r, (mid.a + mid.b) / 2, BERM_H);
      props.push({ soort: 'lantaarnDubbel', x: p.x, y: p.y, z: p.z, rot: rot(r), schaal: 1, variant: 0 });
      continue;
    }
    if (W < 5) { if (d % 64 < 32) { const p = P(r, W / 2 + 0.4, 0); props.push({ soort: 'lantaarn', x: p.x, y: net.terrein.hoogte(p.x, p.z), z: p.z, rot: rot(r) + Math.PI, schaal: 0.75, variant: 0 }); } continue; }
    const st = kant < 0 ? g[0] : g[g.length - 1];
    const o = kant < 0 ? (st.s.soort === 'stoep' ? st.b - 0.45 : -W / 2 + 0.4) : (st.s.soort === 'stoep' ? st.a + 0.45 : W / 2 - 0.4);
    const p = P(r, o, verhoogd(st.s));
    props.push({ soort: 'lantaarn', x: p.x, y: p.y, z: p.z, rot: kant < 0 ? rot(r) : rot(r) + Math.PI, schaal: 1, variant: 0 });
    kant = -kant as 1 | -1;
  }
  return { mesh: mb.bouw(), props };
}

/** Kruispunt: rijbaanvlak met afgeronde stoephoeken tussen de aansluitende wegen. */
export function bouwKruispunt(net: Wegennet, knoopId: number): MeshData {
  const mb = new MeshBouwer();
  const knoop = net.knopen.get(knoopId);
  if (!knoop || knoop.segs.length < 3) return mb.bouw();
  interface Eind { weg: V2; bL: V3; bR: V3; oL: V3; oR: V3; stoep: boolean; dek: string; zij: { hL: number; hR: number } }
  const einden: Eind[] = [];
  for (const sid of knoop.segs) {
    const seg = net.segmenten.get(sid)!;
    const R = rijen(net, seg);
    if (!R.length) continue;
    const t = WEGTYPEN[seg.type];
    const r = seg.a === knoopId ? R[0] : R[R.length - 1];
    const rd = randen(t.stroken);
    const g = strookGrenzen(t.stroken);
    const p = (o: number): V3 => ({ x: r.x + r.rx * o, y: r.y, z: r.z + r.rz * o });
    const omdraaien = seg.b === knoopId;
    const bL = p(rd.binnenL), bR = p(rd.binnenR), oL = p(rd.buitenL), oR = p(rd.buitenR);
    const hL = verhoogd(g[0].s), hR = verhoogd(g[g.length - 1].s);
    einden.push(omdraaien
      ? { weg: wegVan(seg, knoopId), bL: bR, bR: bL, oL: oR, oR: oL, stoep: rd.stoep, dek: t.dek, zij: { hL: hR, hR: hL } }
      : { weg: wegVan(seg, knoopId), bL, bR, oL, oR, stoep: rd.stoep, dek: t.dek, zij: { hL, hR } });
  }
  if (einden.length < 3) return mb.bouw();
  einden.sort((a, b) => Math.atan2(a.weg.z, a.weg.x) - Math.atan2(b.weg.z, b.weg.x));
  const mat = einden.every(e => e.dek === 'klinkers') ? 'klinkers' : 'asfalt';
  const c: V3 = { x: knoop.p.x, y: knoop.y, z: knoop.p.z };

  // Hoekboog tussen de rechterrand van weg i en de linkerrand van weg i+1.
  const boog = (a: V3, da: V2, b: V3, db: V2, n = 8): V3[] => {
    const den = da.x * db.z - da.z * db.x;
    let ctrl: V2 = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if (Math.abs(den) > 0.05) {
      const t = ((b.x - a.x) * db.z - (b.z - a.z) * db.x) / den;
      const u = ((b.x - a.x) * da.z - (b.z - a.z) * da.x) / den;
      if (t < 0 && u < 0 && t > -40 && u > -40) ctrl = { x: a.x + da.x * t, z: a.z + da.z * t };
    }
    const r: V3[] = [];
    for (let k = 0; k <= n; k++) {
      const q = bezier2({ x: a.x, z: a.z }, ctrl, { x: b.x, z: b.z }, k / n);
      r.push({ x: q.x, y: lerp(a.y, b.y, k / n), z: q.z });
    }
    return r;
  };

  const rand: V3[] = [];
  for (let i = 0; i < einden.length; i++) {
    const e = einden[i], f = einden[(i + 1) % einden.length];
    rand.push(e.bL, e.bR);
    const binnen = boog(e.bR, e.weg, f.bL, f.weg);
    rand.push(...binnen.slice(1, -1));
    const hoogte = Math.max(e.zij.hR, f.zij.hL);
    const buiten = boog(e.oR, e.weg, f.oL, f.weg);
    if (dist2({ x: e.bR.x, z: e.bR.z }, { x: e.oR.x, z: e.oR.z }) > 0.1) {
      // Stoep- of bermhoek: strook tussen binnen- en buitenboog.
      const hmat = hoogte >= STOEP_H ? 'stoeptegels' : 'gras';
      const L = binnen.map(p => ({ ...p, y: p.y + hoogte })), Rr = buiten.map(p => ({ ...p, y: p.y + hoogte }));
      const ss = binnen.map((_, k) => k);
      mb.strook(hmat, L, Rr, ss, 0, 1);
      mb.band('band', binnen, L, ss, binnen.map(p => ({ x: c.x - p.x, y: 0, z: c.z - p.z })));
      mb.band('beton', buiten.map(p => ({ ...p, y: p.y - ROK })), Rr, ss, buiten.map(p => ({ x: p.x - c.x, y: 0, z: p.z - c.z })));
    } else {
      mb.band('beton', buiten.map(p => ({ ...p, y: p.y - ROK })), buiten, buiten.map((_, k) => k), buiten.map(p => ({ x: p.x - c.x, y: 0, z: p.z - c.z })));
    }
  }
  // Waaier vanuit het midden.
  for (let i = 0; i < rand.length; i++) {
    const a = rand[i], b = rand[(i + 1) % rand.length];
    mb.driehoek(mat, c, a, b, [c.x, c.z], [a.x, a.z], [b.x, b.z], { x: 0, y: 1, z: 0 });
  }
  return mb.bouw();
}
