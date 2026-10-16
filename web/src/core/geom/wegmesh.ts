import { V3, V2, lerp, norm2, bezier2, dist2 } from '../math';
import { Wegennet, Segment, PadPunt } from '../wegen/netwerk';
import { WEGTYPEN, Strook, strookGrenzen, totaleBreedte, randen, profiel, RANG } from '../wegen/typen';
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
    case 'parkeer': return dek === 'klinkers' ? 'asfalt' : 'klinkers';
    default: return DEKMAT[dek];
  }
}
const verhoogd = (s: Strook) => s.soort === 'stoep' ? STOEP_H : s.soort === 'berm' || s.soort === 'middenberm' ? BERM_H : 0;

/** Punt op de as op booglengte s (voorbij de uiteinden: rechtdoor verlengd). */
export function asPunt(pad: PadPunt[], s: number): { x: number; y: number; z: number; dx: number; dz: number; brug: boolean; tunnel: boolean } {
  const n = pad.length;
  if (s <= 0) { const a = pad[0]; return { x: a.x + a.dx * s, y: a.y, z: a.z + a.dz * s, dx: a.dx, dz: a.dz, brug: a.brug, tunnel: a.tunnel }; }
  if (s >= pad[n - 1].s) { const a = pad[n - 1], e = s - a.s; return { x: a.x + a.dx * e, y: a.y, z: a.z + a.dz * e, dx: a.dx, dz: a.dz, brug: a.brug, tunnel: a.tunnel }; }
  let i = 0;
  // Binair zoeken.
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pad[m].s <= s) lo = m; else hi = m; }
  i = lo;
  const a = pad[i], b = pad[i + 1];
  const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
  const d = norm2({ x: lerp(a.dx, b.dx, t), z: lerp(a.dz, b.dz, t) });
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), dx: d.x, dz: d.z, brug: t < 0.5 ? a.brug : b.brug, tunnel: t < 0.5 ? a.tunnel : b.tunnel };
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
  const g = strookGrenzen(profiel(seg.type, seg.om));
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

  // ── Tunnels: portaal (betonnen kop met wanden) waar de weg de grond in gaat ──
  const isTunnel = (r: Rij) => asPunt(pad, rijS(r)).tunnel;
  for (let k = 1; k < R.length; k++) {
    const a = isTunnel(R[k - 1]), b = isTunnel(R[k]);
    if (a === b) continue;
    const r = b ? R[k] : R[k - 1];
    const q = asPunt(pad, rijS(r));
    const uit = b ? { x: -q.dx, y: 0, z: -q.dz } : { x: q.dx, y: 0, z: q.dz };
    const ax = { x: -q.dz, y: 0, z: q.dx };
    const grond = Math.max(net.terrein.hoogte(q.x, q.z), q.y + 6.5);
    const c = { x: q.x, y: 0, z: q.z };
    // Kopwand boven de ingang en een lijst eromheen.
    mb.blok('beton', 'beton', c, ax, { x: q.dx, y: 0, z: q.dz }, W + 2.4, 1.2, q.y + 5.2, grond + 0.6);
    mb.blok('trimDonker', 'beton', { x: c.x + uit.x * 0.62, y: 0, z: c.z + uit.z * 0.62 }, ax, { x: q.dx, y: 0, z: q.dz }, W + 0.4, 0.05, q.y + 4.9, q.y + 5.25);
    for (const kant of [-1, 1]) {
      // Zijwanden van de ingang, schuin aflopend met het talud.
      for (let j = 0; j < 4; j++) {
        const d = j * 3;
        const p = { x: q.x + ax.x * kant * (W / 2 + 0.6) + uit.x * (d + 1.5), y: 0, z: q.z + ax.z * kant * (W / 2 + 0.6) + uit.z * (d + 1.5) };
        const h = Math.max(q.y + 0.5, grond + 0.6 - (grond - q.y) * (d + 3) / 12);
        mb.blok('beton', 'beton', p, uit, ax, 3, 0.8, q.y - 0.5, h);
      }
    }
    // Tunnelbuis: plafond en wanden net binnen de ingang, zodat je geen terrein van onderen ziet.
    const binnen = b ? R.slice(k, Math.min(R.length, k + 6)) : R.slice(Math.max(0, k - 6), k);
    if (binnen.length > 1) {
      const ds = binnen.map(rijS);
      mb.strook('beton', binnen.map(rr => P(rr, W / 2 + 0.3, 5.2)), binnen.map(rr => P(rr, -W / 2 - 0.3, 5.2)), ds, 0, W, false);
      for (const kant of [-1, 1] as const) mb.band('trimDonker', binnen.map(rr => P(rr, kant * (W / 2 + 0.3), -0.2)), binnen.map(rr => P(rr, kant * (W / 2 + 0.3), 5.2)), ds, binnen.map(rr => rechts(rr, -kant)));
    }
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
  // Parkeerhavens: een doorgetrokken lijn langs de rijbaan en witte vakstrepen om de 5,5 m.
  for (let k = 0; k < g.length; k++) {
    const x = g[k];
    if (x.s.soort !== 'parkeer') continue;
    const binnen = x.a < 0 ? x.b : x.a;
    lijn(binnen + (x.a < 0 ? -0.08 : 0.08), 0.1, 1e9, 0, 3);
    const s0 = Math.max(sOp(eerste, x.a), sOp(eerste, x.b)) + 4, s1 = Math.min(sOp(laatste, x.a), sOp(laatste, x.b)) - 4;
    for (let d = s0; d <= s1; d += 5.5) lijnStuk(x.a + 0.08, x.b - 0.08, d, d + 0.1);
  }
  for (const x of g) if (x.s.soort === 'tram') {
    const m = (x.a + x.b) / 2;
    for (const o of [m - 0.7175, m + 0.7175]) mb.strook('rail', R.map(r => P(r, o - 0.04, 0.02)), R.map(r => P(r, o + 0.04, 0.02)), s, 0, 0.08);
  }

  // ── Kruispuntmarkering: fietsoversteek, zebrapad, stopstreep of haaientanden, voorsorteerpijlen ──
  // Van het kruispunt naar buiten, zoals op Nederlandse kruispunten (en in CS2).
  const rd = randen(type.stroken);
  // Driehoek in (offset, booglengte)-coördinaten, altijd met de bovenkant omhoog.
  const drie = (m: string, q: [number, number][], dy = 0.013) => {
    const v = q.map(([o, ss]) => P({ sL: ss, sR: ss, W }, o, dy));
    const ny = (v[1].z - v[0].z) * (v[2].x - v[0].x) - (v[1].x - v[0].x) * (v[2].z - v[0].z);
    if (ny < 0) [v[1], v[2]] = [v[2], v[1]];
    mb.driehoek(m, v[0], v[1], v[2], [v[0].x, v[0].z], [v[1].x, v[1].z], [v[2].x, v[2].z], { x: 0, y: 1, z: 0 });
  };
  const vak = (m: string, o0: number, o1: number, s0: number, s1: number, dy = 0.013) => { drie(m, [[o0, s0], [o1, s0], [o1, s1]], dy); drie(m, [[o0, s0], [o1, s1], [o0, s1]], dy); };
  // Pijl op de weg: lengte langs de rijrichting r (+1/-1), soort rechtdoor/links/rechts (combinaties).
  const pijl = (o: number, s0: number, r: number, soort: { rd: boolean; l: boolean; re: boolean }) => {
    const L = (d: number) => s0 + r * d;
    const zij = (kant: number) => kant * r; // links in rijrichting = negatieve offset bij r=+1
    vak('markering', o - 0.08, o + 0.08, Math.min(L(0), L(soort.rd ? 3.4 : 2.2)), Math.max(L(0), L(soort.rd ? 3.4 : 2.2)));
    if (soort.rd) drie('markering', [[o - 0.45, L(3.4)], [o + 0.45, L(3.4)], [o, L(4.8)]]);
    for (const [aan, kant] of [[soort.l, -1], [soort.re, 1]] as const) {
      if (!aan) continue;
      const k = zij(kant);
      // Schuine arm naar de zijkant met een pijlpunt.
      const ax = o + k * 0.75;
      drie('markering', [[o - 0.08 * Math.sign(k), L(1.8)], [o + 0.08 * Math.sign(k), L(2.2)], [ax, L(2.9)]]);
      drie('markering', [[ax - k * 0.05, L(2.45)], [ax + k * 0.5, L(3.1)], [ax - k * 0.35, L(3.45)]]);
    }
  };
  const knoopTypen = (k: number) => (net.knopen.get(k)?.segs ?? []).map(id => net.segmenten.get(id)?.type).filter((t): t is NonNullable<typeof t> => !!t);
  for (const eind of ['a', 'b'] as const) {
    const k = eind === 'a' ? seg.a : seg.b;
    if (net.graad(k) < 3) continue;
    const r = eind === 'a' ? eerste : laatste, richting = eind === 'a' ? 1 : -1;
    const typen = knoopTypen(k), andere = (net.knopen.get(k)?.segs ?? []).filter(id => id !== seg.id).map(id => net.segmenten.get(id)).filter(Boolean);
    const sb = (o: number) => sOp(r, o);
    let af = 0.3;
    // Fietsoversteek (rood met blokmarkering) als de doorgaande weg fietspaden heeft.
    const fietsW = Math.max(0, ...andere.map(x => Math.max(0, ...profiel(x!.type).filter(q => q.soort === 'fiets').map(q => q.breedte))));
    if (fietsW > 0 && rd.stoep && type.dek !== 'klinkers') {
      const s0 = (o: number) => sb(o) + richting * af, s1 = (o: number) => sb(o) + richting * (af + fietsW);
      const om = (rd.binnenL + rd.binnenR) / 2;
      vak('fietsasfalt', rd.binnenL, rd.binnenR, Math.min(s0(om), s1(om)), Math.max(s0(om), s1(om)), 0.008);
      for (let o = rd.binnenL + 0.1; o + 0.5 <= rd.binnenR; o += 1.0) for (const ss of [s0(o), s1(o) - richting * 0.5]) vak('markering', o, o + 0.5, Math.min(ss, ss + richting * 0.5), Math.max(ss, ss + richting * 0.5));
      af += fietsW + 0.6;
    }
    // Zebrapad (tenzij de oversteekplaats is weggehaald in het verkeersgereedschap).
    const zebraL = 3.5;
    if (rd.stoep && net.regels.regel(seg.id, k, 'oversteek')) {
      for (let o = rd.binnenL + 0.5; o + 0.5 <= rd.binnenR - 0.3; o += 1.0) {
        const sa = sb(o + 0.25) + richting * af, se = sa + richting * zebraL;
        lijnStuk(o, o + 0.5, Math.min(sa, se), Math.max(sa, se));
      }
      af += zebraL + 0.8;
    } else af += 1.2;
    // Stopstreep (verkeerslichten) of haaientanden (voorrang verlenen); gelijkwaardig: niets.
    const naar = eind === 'a' ? 'B' : 'A';
    const lichten = net.heeftLichten(k);
    const bord = net.regels.bord(seg.id, k);
    const ondergeschikt = !lichten && (bord ? bord !== 'voorrang' : RANG[seg.type] < Math.max(...typen.map(t => RANG[t])));
    const stopBord = !lichten && bord === 'stop';
    const inkomend = g.filter(x => (x.s.soort === 'auto' || x.s.soort === 'bus') && x.s.richting === naar);
    for (const x of inkomend) {
      const sa = sb((x.a + x.b) / 2) + richting * af;
      if (lichten || stopBord) { const d = stopBord ? 0.6 : 0.4; lijnStuk(x.a + 0.1, x.b - 0.1, Math.min(sa, sa + richting * d), Math.max(sa, sa + richting * d)); }
      else if (ondergeschikt && !stopBord) for (let o = x.a + 0.2; o + 0.55 <= x.b - 0.1; o += 0.95) drie('markering', [[o, sa], [o + 0.55, sa], [o + 0.275, sa + richting * 0.65]]);
    }
    if (ondergeschikt && !stopBord && !inkomend.length) {
      // Woonstraat (gedeelde rijbaan): haaientanden over de rechterhelft.
      for (const x of g.filter(q => q.s.soort === 'gedeeld' && q.s.richting === naar)) {
        const sa = sb((x.a + x.b) / 2) + richting * af;
        for (let o = x.a + 0.2; o + 0.55 <= x.b - 0.1; o += 0.95) drie('markering', [[o, sa], [o + 0.55, sa], [o + 0.275, sa + richting * 0.65]]);
      }
    }
    // Voorsorteerpijlen bij twee of meer stroken (of ingestelde pijlen): zoals de rijstroken echt lopen.
    const auto = inkomend.filter(x => x.s.soort === 'auto').sort((p, q) => (p.a - q.a) * -richting);
    const lengte = Math.abs(sOp(laatste, 0) - sOp(eerste, 0));
    const eigen = net.regels.heeftPijlen(seg.id, k);
    if ((auto.length >= 2 || eigen) && lengte > af + 14) auto.forEach((x, i) => {
      const o = (x.a + x.b) / 2, s0 = sb(o) + richting * (af + 7.5);
      // i = 0 is de linkse strook; de regels tellen van rechts (0 = rechts).
      const vast = eigen ? net.regels.pijlenVan(seg.id, k, auto.length - 1 - i) : null;
      const soort = vast ? { rd: vast.includes('rechtdoor'), l: vast.includes('links') || vast.includes('keer'), re: vast.includes('rechts') } : { rd: i > 0 || auto.length === 1, l: i === 0, re: i === auto.length - 1 };
      if (soort.rd || soort.l || soort.re) pijl(o, s0, -richting, soort);
    });
  }
  // Eenrichtingsweg: om de 40 m een pijl in de rijrichting.
  if (!g.some(x => x.s.soort === 'auto' && x.s.richting === 'B') !== !g.some(x => x.s.soort === 'auto' && x.s.richting === 'A')) {
    const r = g.some(x => x.s.soort === 'auto' && x.s.richting === 'A') ? 1 : -1;
    const lanes = g.filter(x => x.s.soort === 'auto');
    const a0 = sOp(eerste, 0) + 18, a1 = sOp(laatste, 0) - 18;
    for (let d = a0; d < a1 - 5; d += 40) for (const x of lanes) pijl((x.a + x.b) / 2, d + (r < 0 ? 4.8 : 0), r, { rd: true, l: false, re: false });
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
      // Stoepbomen aan de kant van de rijbaan, weg van de gevels.
      const o = berm ? (x.a + x.b) / 2 : (x.a < 0 ? x.b - 0.8 : x.a + 0.8);
      const tussen = berm ? 11 : 14;
      for (let d = L0 + 7 + (x.a < 0 ? 0 : tussen / 2); d < L1 - 6; d += tussen) {
        if (asPunt(pad, d).brug || asPunt(pad, d).tunnel) continue;
        const p = plek(d, o, verhoogd(x.s));
        props.push({ soort: (Math.floor(d / tussen) + seg.id) % 3 === 0 ? 'linde' : 'plataan', x: p.x, y: p.y, z: p.z, rot: (d * 1.7) % 6.28, schaal: (stoepBoom ? 0.58 : 0.68) + ((d * 7) % 1) * 0.14, variant: Math.floor(d) % 2 });
      }
    }
  }
  const mid = g.find(x => x.s.soort === 'middenberm');
  let kant = seg.id % 2 === 0 ? 1 : -1;
  for (let d = L0 + 10; d < L1 - 6; d += 32) {
    if (asPunt(pad, d).tunnel) continue;
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
  // Straatmeubilair op brede stoepen, tussen de lantaarns: bankjes, afvalbakken, fietsenrekken.
  for (const st of [g[0], g[g.length - 1]]) {
    if (!st || st.s.soort !== 'stoep' || st.s.breedte < 2) continue;
    const links = st.a < 0;
    const o = links ? st.b - 0.6 : st.a + 0.6;
    for (let d = L0 + 26; d < L1 - 14; d += 32) {
      if (asPunt(pad, d).brug || asPunt(pad, d).tunnel) continue;
      const h = Math.abs(Math.sin(seg.id * 12.9898 + d * 0.733) * 43758.5453) % 1;
      if (h < 0.3) continue;
      const soort = h < 0.55 ? 'bank' : h < 0.75 ? 'afvalbak' : h < 0.92 ? 'fietsbeugel' : 'bord';
      const p = plek(d, soort === 'bank' ? (links ? st.a + 0.8 : st.b - 0.8) : o, verhoogd(st.s));
      const r = rotVan(d) + (soort === 'bank' ? (links ? Math.PI : 0) : (links ? 0 : Math.PI));
      props.push({ soort, x: p.x, y: p.y, z: p.z, rot: r, schaal: 1, variant: Math.floor(h * 97) % 6 });
    }
    // Paaltjes bij de kruispunten (tegen parkeren op de stoephoek).
    if (W >= 9) for (const d of [L0 + 2, L0 + 3.5, L1 - 2, L1 - 3.5]) {
      if (d < L0 || d > L1) continue;
      const p = plek(d, o, verhoogd(st.s));
      props.push({ soort: 'paaltje', x: p.x, y: p.y, z: p.z, rot: 0, schaal: 1, variant: 0 });
    }
    // Bushokje langs een weg met busbaan.
    if (g.some(x => x.s.soort === 'bus') && (L1 - L0) > 70) {
      const d = (L0 + L1) / 2 + (links ? -20 : 20);
      const p = plek(d, links ? st.a + 1.3 : st.b - 1.3, verhoogd(st.s));
      props.push({ soort: 'bushokje', x: p.x, y: p.y, z: p.z, rot: rotVan(d) + (links ? Math.PI : 0), schaal: 1, variant: 0 });
    }
  }
  return { mesh: mb.bouw(), props };
}

/** Kruispunt: rijbaanvlak met afgeronde stoephoeken tussen de (schuin afgesneden) wegeinden. */
export function bouwKruispunt(net: Wegennet, knoopId: number): MeshData {
  const mb = new MeshBouwer();
  const knoop = net.knopen.get(knoopId);
  if (!knoop || !net.isKruispunt(knoopId)) return mb.bouw();
  interface Laag { soort: string; p: V3 }
  interface Eind { weg: V2; bL: V3; bR: V3; oL: V3; oR: V3; lL: Laag[]; lR: Laag[]; hL: number; hR: number; dek: string }
  const einden: Eind[] = [];
  for (const sid of knoop.segs) {
    const seg = net.segmenten.get(sid)!;
    const R = rijen(net, seg);
    if (!R.length) continue;
    const t = WEGTYPEN[seg.type];
    const r = seg.a === knoopId ? R[0] : R[R.length - 1];
    const rd = randen(t.stroken);
    const g = strookGrenzen(profiel(seg.type, seg.om));
    const p = (o: number) => punt(seg.pad, r, o);
    const bL = p(rd.binnenL), bR = p(rd.binnenR), oL = p(rd.buitenL), oR = p(rd.buitenR);
    const hL = verhoogd(g[0].s), hR = verhoogd(g[g.length - 1].s);
    // Fietspad direct naast de rijbaan: loopt op het kruispunt als rode boog op wegniveau om de hoek.
    const motor = (q: Strook) => q.soort === 'auto' || q.soort === 'bus' || q.soort === 'tram' || q.soort === 'gedeeld';
    const i0 = g.findIndex(x => motor(x.s)), i1 = g.length - 1 - [...g].reverse().findIndex(x => motor(x.s));
    // Lagen van de rijbaan naar buiten (berm, fietspad, stoep) met hun buitenrand, per kant.
    const lagenL = i0 > 0 ? g.slice(0, i0).reverse().map(x => ({ soort: x.s.soort, p: p(x.a) })) : [];
    const lagenR = i0 >= 0 && i1 < g.length - 1 ? g.slice(i1 + 1).map(x => ({ soort: x.s.soort, p: p(x.b) })) : [];
    const wegV = (() => { const q = seg.a === knoopId ? seg.pad[0] : seg.pad[seg.pad.length - 1]; return seg.a === knoopId ? { x: q.dx, z: q.dz } : { x: -q.dx, z: -q.dz }; })();
    // In "weg-van-de-knoop"-termen: bij uiteinde b zijn links en rechts verwisseld.
    einden.push(seg.b === knoopId
      ? { weg: wegV, bL: bR, bR: bL, oL: oR, oR: oL, lL: lagenR, lR: lagenL, hL: hR, hR: hL, dek: t.dek }
      : { weg: wegV, bL, bR, oL, oR, lL: lagenL, lR: lagenR, hL, hR, dek: t.dek });
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
      // Fietsboog: rood asfalt op wegniveau om de hoek, met de berm ertussen als beide wegen die hebben.
      let rand0 = binnen;
      const ka = e.lR.findIndex(l => l.soort === 'fiets'), kb = f.lL.findIndex(l => l.soort === 'fiets');
      if (!n2 && ka >= 0 && kb >= 0) {
        const binA = ka > 0 ? e.lR[ka - 1].p : e.bR, binB = kb > 0 ? f.lL[kb - 1].p : f.bL;
        const fBin = boog(binA, e.weg, binB, f.weg), fBuit = boog(e.lR[ka].p, e.weg, f.lL[kb].p, f.weg);
        if (fBin.length === binnen.length && fBuit.length === binnen.length) {
          if (ka > 0 || kb > 0) {
            // Berm tussen rijbaan en fietspad: gras, iets verhoogd met een band aan beide kanten.
            const Bb = binnen.map(p => ({ ...p, y: p.y + BERM_H })), Bf = fBin.map(p => ({ ...p, y: p.y + BERM_H }));
            mb.strook('gras', Bb, Bf, ss, 0, 1);
            mb.band('band', binnen, Bb, ss, binnen.map(naarBinnen));
            mb.band('band', fBin, Bf, ss, fBin.map(p => ({ x: -naarBinnen(p).x, y: 0, z: -naarBinnen(p).z })));
          }
          mb.strook('fietsasfalt', fBin.map(p => ({ ...p, y: p.y + 0.004 })), fBuit.map(p => ({ ...p, y: p.y + 0.004 })), ss, 0, 1);
          rand0 = fBuit;
        }
      }
      const L = rand0.map(p => ({ ...p, y: p.y + hoogte })), Rr = buiten.map(p => ({ ...p, y: p.y + hoogte }));
      mb.strook(hmat, L, Rr, ss, 0, 1);
      mb.band('band', rand0, L, ss, rand0.map(naarBinnen));
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
