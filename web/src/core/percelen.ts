import { V2, dist2, norm2, lerp, saturate } from './math';
import { Wegennet, Segment } from './wegen/netwerk';
import { halveBreedte, WEGTYPEN } from './wegen/typen';
import { Terrein, ZEENIVEAU } from './terrain';
import { knipHalfvlak, opschonen } from './poly';

// ════════════════════════════════════════════════════════════════════════════════════
// GEVELSTROKEN
// Langs elke straatkant met erftoegang ligt één strook bouwgrond die de weg precies volgt
// (ook in bochten). Op kruispunten wordt de strook afgesneden op de bissectrice met de
// buurweg aan die kant, zodat stroken van verschillende straten elkaar in verstek raken.
// De diepte is maximaal STROOK_DIEPTE, maar nooit meer dan de helft van de afstand tot de
// volgende weg erachter: twee stroken rug aan rug vullen een bouwblok dus helemaal.
// Geen vaste rechthoekige kavels zoals in Cities: Skylines, dus geen gaten.
// ════════════════════════════════════════════════════════════════════════════════════

export const STROOK_DIEPTE = 50;
export const PERCEEL_BREEDTE = 12;

export interface Strook {
  seg: number; zijde: 1 | -1;
  /** Gevellijn (rand van de stoep) en de bijbehorende booglengte. */
  voor: V2[]; s: number[];
  /** Richting naar binnen (weg van de straat) en de diepte per punt. */
  binnen: V2[]; diepte: number[];
  /** Halfvlakken van de afsnijdingen bij de knopen: punt o, normaal n (houd dot(p-o,n) >= 0). */
  knippen: { o: V2; n: V2 }[];
  /** Bruikbaar bereik langs de gevellijn. */
  s0: number; s1: number;
}

const EXTRA = 40; // hoe ver de strook voorbij de knoop doorloopt voordat hij wordt afgesneden

/** Richting weg van de knoop. */
function wegVan(seg: Segment, k: number): V2 {
  const p = seg.a === k ? seg.pad[0] : seg.pad[seg.pad.length - 1];
  return seg.a === k ? { x: p.dx, z: p.dz } : { x: -p.dx, z: -p.dz };
}

/** Afsnijding bij knoop k voor de strook aan `zijde` van segment seg. */
function knip(net: Wegennet, seg: Segment, k: number, zijde: 1 | -1): { o: V2; n: V2 } {
  const knoop = net.knopen.get(k)!;
  const a = wegVan(seg, k);
  // Ligt de strook rechts van de richting weg-van-de-knoop?
  const rechts = (seg.a === k) === (zijde === 1);
  if (knoop.segs.length > 1) {
    // Buurweg aan de strookkant: eerstvolgende in hoekvolgorde.
    const hoek = (v: V2) => Math.atan2(v.z, v.x);
    const h0 = hoek(a);
    let best: V2 | null = null, bh = Infinity, bseg: Segment | null = null;
    for (const sid of knoop.segs) {
      if (sid === seg.id) continue;
      const o = net.segmenten.get(sid);
      if (!o || !o.pad.length) continue;
      const b = wegVan(o, k);
      let d = hoek(b) - h0;
      if (!rechts) d = -d;
      d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (d > 1e-3 && d < bh) { bh = d; best = b; bseg = o; }
    }
    if (best && bseg && Math.abs(a.x + best.x) + Math.abs(a.z + best.z) > 0.05) {
      // Bissectrice tussen de twee wegen, door het snijpunt van beide stoepranden (zodat ook
      // wegen van verschillende breedte netjes in verstek uitkomen).
      const m = norm2({ x: a.x + best.x, z: a.z + best.z });
      let n = { x: -m.z, z: m.x };
      if (n.x * a.x + n.z * a.z < 0) n = { x: -n.x, z: -n.z };
      const ra = rechts ? { x: -a.z, z: a.x } : { x: a.z, z: -a.x };
      let rb = { x: -best.z, z: best.x };
      if (rb.x * a.x + rb.z * a.z < 0) rb = { x: -rb.x, z: -rb.z };
      const hA = halveBreedte(seg.type) + 0.05, hB = halveBreedte(bseg.type) + 0.05;
      const pa = { x: knoop.p.x + ra.x * hA, z: knoop.p.z + ra.z * hA }, pb = { x: knoop.p.x + rb.x * hB, z: knoop.p.z + rb.z * hB };
      const den = a.x * best.z - a.z * best.x;
      let o = { ...knoop.p };
      if (Math.abs(den) > 0.05) {
        const t = ((pb.x - pa.x) * best.z - (pb.z - pa.z) * best.x) / den;
        if (Math.abs(t) < 60) o = { x: pa.x + a.x * t, z: pa.z + a.z * t };
      }
      return { o, n };
    }
  }
  return { o: { ...knoop.p }, n: a };
}

/** Bouw de strook voor één kant van een segment. */
export function maakStrook(net: Wegennet, terrein: Terrein, seg: Segment, zijde: 1 | -1): Strook | null {
  if (!WEGTYPEN[seg.type].erf || seg.pad.length < 2) return null;
  const hb = halveBreedte(seg.type) + 0.05;
  const pad = seg.pad;
  // Gevellijn: de as verschoven naar de rand, met verlengstukken voorbij beide knopen.
  const voor: V2[] = [], binnen: V2[] = [], s: number[] = [];
  const P0 = pad[0], P1 = pad[pad.length - 1];
  const extra = (p: typeof P0, t: number) => {
    const n = { x: -p.dz * zijde, z: p.dx * zijde };
    return { v: { x: p.x + p.dx * t + n.x * hb, z: p.z + p.dz * t + n.z * hb }, n };
  };
  for (const t of [-EXTRA, -EXTRA / 2]) { const e = extra(P0, t); voor.push(e.v); binnen.push(e.n); s.push(t); }
  for (const p of pad) {
    if (p.brug) { /* bruggen hebben geen bouwgrond, maar de lijn moet doorlopen */ }
    const n = { x: -p.dz * zijde, z: p.dx * zijde };
    voor.push({ x: p.x + n.x * hb, z: p.z + n.z * hb }); binnen.push(n); s.push(p.s);
  }
  for (const t of [EXTRA / 2, EXTRA]) { const e = extra(P1, t); voor.push(e.v); binnen.push(e.n); s.push(seg.lengte + t); }

  const knippen = [knip(net, seg, seg.a, zijde), knip(net, seg, seg.b, zijde)];

  // Diepte per punt: tot de helft van de afstand tot een andere weg, of tot het water.
  const diepte = voor.map((v, i) => dieptebij(net, terrein, seg, v, binnen[i]));
  // Glad trekken (minimumfilter + middelen) zodat de achterkant geen zaagtand wordt.
  const gl = diepte.map((_, i) => Math.min(...diepte.slice(Math.max(0, i - 2), i + 3)));
  for (let i = 0; i < gl.length; i++) diepte[i] = (gl[Math.max(0, i - 1)] + gl[i] * 2 + gl[Math.min(gl.length - 1, i + 1)]) / 4;
  // Op bruggen geen bouwgrond.
  for (let i = 0; i < pad.length; i++) if (pad[i].brug) diepte[i + 2] = 0;

  // Bruikbaar bereik: waar de gevellijn binnen beide afsnijdingen ligt.
  const binnenKnip = (p: V2) => knippen.every(k => (p.x - k.o.x) * k.n.x + (p.z - k.o.z) * k.n.z >= 0);
  let s0 = Infinity, s1 = -Infinity;
  for (let i = 0; i < voor.length - 1; i++) {
    for (let f = 0; f <= 1; f += 0.125) {
      const p = { x: lerp(voor[i].x, voor[i + 1].x, f), z: lerp(voor[i].z, voor[i + 1].z, f) };
      if (!binnenKnip(p)) continue;
      const ss = lerp(s[i], s[i + 1], f);
      s0 = Math.min(s0, ss); s1 = Math.max(s1, ss);
    }
  }
  if (!(s1 - s0 > 4)) return null;
  return { seg: seg.id, zijde, voor, s, binnen, diepte, knippen, s0, s1 };
}

function dieptebij(net: Wegennet, terrein: Terrein, eigen: Segment, v: V2, n: V2): number {
  let max = STROOK_DIEPTE;
  // Water of kaartrand.
  for (let d = 2; d <= STROOK_DIEPTE; d += 2) {
    const x = v.x + n.x * d, z = v.z + n.z * d;
    if (!terrein.binnen(x, z, 6) || terrein.hoogte(x, z) < ZEENIVEAU + 0.6) { max = Math.max(0, d - 2); break; }
  }
  // Andere wegen achter de strook: tot halverwege.
  const eind = { x: v.x + n.x * (STROOK_DIEPTE * 2 + 30), z: v.z + n.z * (STROOK_DIEPTE * 2 + 30) };
  for (const s of net.segmenten.values()) {
    if (s.id === eigen.id) continue;
    const hb = halveBreedte(s.type);
    // Snelle uitsluiting op de omhullende.
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of s.pad) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    if (Math.max(v.x, eind.x) < x0 - hb || Math.min(v.x, eind.x) > x1 + hb || Math.max(v.z, eind.z) < z0 - hb || Math.min(v.z, eind.z) > z1 + hb) continue;
    for (let d = 1; d <= STROOK_DIEPTE * 2 + 30; d += 1.5) {
      const q = { x: v.x + n.x * d, z: v.z + n.z * d };
      if (d / 2 >= max) break;
      let raak = false;
      for (let i = 0; i < s.pad.length - 1 && !raak; i++) {
        const a = s.pad[i], b = s.pad[i + 1];
        const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
        const t = l2 > 0 ? saturate(((q.x - a.x) * abx + (q.z - a.z) * abz) / l2) : 0;
        if (Math.hypot(q.x - (a.x + abx * t), q.z - (a.z + abz * t)) < hb + 0.3) raak = true;
      }
      if (raak) { max = Math.min(max, Math.max(0, (d - 0.3) / 2)); break; }
    }
  }
  return max;
}

/** Punt, richting naar binnen en diepte op booglengte s. */
export function opStrook(st: Strook, s: number): { p: V2; n: V2; d: number; t: V2 } {
  const S = st.s;
  let i = 0;
  while (i < S.length - 2 && S[i + 1] < s) i++;
  const f = saturate((s - S[i]) / Math.max(1e-6, S[i + 1] - S[i]));
  const p = { x: lerp(st.voor[i].x, st.voor[i + 1].x, f), z: lerp(st.voor[i].z, st.voor[i + 1].z, f) };
  const n = norm2({ x: lerp(st.binnen[i].x, st.binnen[i + 1].x, f), z: lerp(st.binnen[i].z, st.binnen[i + 1].z, f) });
  const t = norm2({ x: st.voor[i + 1].x - st.voor[i].x, z: st.voor[i + 1].z - st.voor[i].z });
  return { p, n, d: lerp(st.diepte[i], st.diepte[i + 1], f), t };
}

/**
 * Band tussen afstand a en b vanaf de gevellijn, tussen booglengtes s0 en s1, afgesneden met de
 * zijgrenzen (loodrecht op de gevellijn bij s0 en s1) en de knoopafsnijdingen.
 * `b` mag 'diepte' zijn: dan volgt hij de strookdiepte (min een marge).
 */
export function band(st: Strook, s0: number, s1: number, a: number, b: number | ((d: number) => number), zijGrens = true): V2[] {
  const ext = 6;
  const sa = s0 - (zijGrens ? ext : 0), sb = s1 + (zijGrens ? ext : 0);
  const rijen: number[] = [sa];
  for (const s of st.s) if (s > sa && s < sb) rijen.push(s);
  rijen.push(sb);
  // Fijner bemonsteren voor gladde bochten.
  const fijn: number[] = [];
  for (let i = 0; i < rijen.length; i++) {
    fijn.push(rijen[i]);
    if (i < rijen.length - 1 && rijen[i + 1] - rijen[i] > 2.5) {
      const n = Math.ceil((rijen[i + 1] - rijen[i]) / 2.5);
      for (let k = 1; k < n; k++) fijn.push(lerp(rijen[i], rijen[i + 1], k / n));
    }
  }
  const voorkant: V2[] = [], achterkant: V2[] = [];
  for (const s of fijn) {
    const q = opStrook(st, s);
    const bb = typeof b === 'number' ? Math.min(b, q.d) : b(q.d);
    const aa = Math.min(a, bb);
    voorkant.push({ x: q.p.x + q.n.x * aa, z: q.p.z + q.n.z * aa });
    achterkant.push({ x: q.p.x + q.n.x * bb, z: q.p.z + q.n.z * bb });
  }
  let poly = opschonen([...voorkant, ...achterkant.reverse()]);
  if (zijGrens) {
    const A = opStrook(st, s0), B = opStrook(st, s1);
    poly = knipHalfvlak(poly, A.p, A.t);
    poly = knipHalfvlak(poly, B.p, { x: -B.t.x, z: -B.t.z });
  }
  for (const k of st.knippen) poly = knipHalfvlak(poly, k.o, k.n);
  return poly;
}

/** Deel het bruikbare bereik op in percelen van ongeveer PERCEEL_BREEDTE. */
export function verdeel(s0: number, s1: number, breedte = PERCEEL_BREEDTE): [number, number][] {
  const L = s1 - s0;
  const n = Math.max(1, Math.round(L / breedte));
  const r: [number, number][] = [];
  for (let i = 0; i < n; i++) r.push([s0 + (L * i) / n, s0 + (L * (i + 1)) / n]);
  return r;
}

export const stroomSleutel = (seg: number, zijde: number) => `${seg}:${zijde}`;
export { dist2 };
