import { V2, V3, lerp, norm2, snijLijnstukken, dist2 } from '../math';
import { Wegennet, Segment } from '../wegen/netwerk';
import { WEGTYPEN, WegTypeId, strookGrenzen, totaleBreedte } from '../wegen/typen';
import { asPunt } from '../geom/wegmesh';

// ════════════════════════════════════════════════════════════════════════════════════
// RIJSTROOKGRAAF
// Uit het wegennet: per segment de rijstroken voor autoverkeer (uit het dwarsprofiel, met hun
// rijrichting), en op elke knoop de verbindingen tussen inkomende en uitgaande stroken met de
// afslagregels zoals in Cities: Skylines (rechts rechtsaf, links linksaf, rechtdoor over alle
// stroken). Verbindingen die elkaar kruisen of op dezelfde strook samenkomen zijn conflicten.
// Grote kruispunten krijgen verkeerslichten met fases per richting.
// ════════════════════════════════════════════════════════════════════════════════════

export type Afslag = 'rechts' | 'rechtdoor' | 'links' | 'keer';

/** Gemeenschappelijk: een spoor waarover een voertuig rijdt (rijstrook of verbinding). */
export interface Spoor {
  id: number;
  pts: V3[]; cum: number[]; lengte: number;
  /** Maximumsnelheid (m/s). */
  vmax: number;
  /** Voertuigen op dit spoor, gesorteerd op afstand (wordt door de simulatie bijgehouden). */
  op: number[];
}

export interface Baan extends Spoor {
  soort: 'baan';
  seg: number; richting: 'A' | 'B';
  /** 0 = meest rechtse strook. */
  index: number; aantal: number;
  van: number; naar: number;
  uit: number[];
  /** Begin en eind van de strook langs de as van het segment (booglengte, in tekenrichting). */
  s0: number; s1: number;
}

export interface Verbinding extends Spoor {
  soort: 'verbinding';
  knoop: number; van: number; naar: number;
  /** Segment waar de verbinding vandaan komt (voor verkeerslichtfases en voorrang). */
  bron: number; doelSeg: number;
  afslag: Afslag;
  conflict: number[];
  /** Voertuigen die op de verbinding rijden of die hem hebben gereserveerd. */
  bezet: number;
}

export interface Lichten {
  knoop: number;
  fases: number[][];
  fase: number; t: number;
  stand: 'groen' | 'oranje' | 'rood';
  groen: number;
}

/** Rangorde van wegtypen voor voorrang en routekeuze. */
export const RANG: Record<WegTypeId, number> = { voetpad: 0, fietspad: 0, woonstraat: 1, straat: 2, straatBus: 2, tramstraat: 2, laan: 3, gow: 4, snelweg: 5 };

const isAuto = (s: string) => s === 'auto' || s === 'gedeeld';

export class Rijstroken {
  sporen = new Map<number, Baan | Verbinding>();
  /** Stroken per segment en richting, van rechts naar links. */
  perSeg = new Map<string, number[]>();
  lichten = new Map<number, Lichten>();
  /** Telt het aantal keren opbouwen (voor de render-laag). */
  teller = 0;
  private volgende = 1;

  constructor(private net: Wegennet) {}

  static sleutel(seg: number, r: 'A' | 'B') { return `${seg}${r}`; }
  stroken(seg: number, r: 'A' | 'B'): Baan[] { return (this.perSeg.get(Rijstroken.sleutel(seg, r)) ?? []).map(id => this.sporen.get(id) as Baan); }
  baan(id: number) { const s = this.sporen.get(id); return s && s.soort === 'baan' ? s : null; }
  verbinding(id: number) { const s = this.sporen.get(id); return s && s.soort === 'verbinding' ? s : null; }

  /** Alles opnieuw opbouwen (na een wijziging in het wegennet). */
  bouw() {
    this.sporen.clear(); this.perSeg.clear(); this.teller++;
    const oudeLichten = this.lichten;
    this.lichten = new Map();
    for (const seg of this.net.segmenten.values()) this.stroken_(seg);
    for (const k of this.net.knopen.values()) this.verbind(k.id);
    for (const k of this.net.knopen.values()) this.maakLichten(k.id, oudeLichten.get(k.id));
  }

  private nieuw<T extends Baan | Verbinding>(s: Omit<T, 'id' | 'cum' | 'lengte' | 'op'>): T {
    const cum = [0];
    for (let i = 1; i < s.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(s.pts[i].x - s.pts[i - 1].x, s.pts[i].y - s.pts[i - 1].y, s.pts[i].z - s.pts[i - 1].z));
    const x = { ...s, id: this.volgende++, cum, lengte: cum[cum.length - 1], op: [] } as unknown as T;
    this.sporen.set(x.id, x);
    return x;
  }

  private stroken_(seg: Segment) {
    const type = WEGTYPEN[seg.type];
    if (!seg.pad.length) return;
    const g = strookGrenzen(type.stroken);
    const W = totaleBreedte(type.stroken);
    const ka = this.net.eindKnip(seg, 'a'), kb = this.net.eindKnip(seg, 'b');
    const L = seg.lengte;
    const vmax = type.snelheid / 3.6;
    for (const r of ['A', 'B'] as const) {
      const lijst = g.filter(x => isAuto(x.s.soort) && x.s.richting === r).map(x => (x.a + x.b) / 2);
      // Van rechts naar links: rechts van de rijrichting = positieve offset voor A, negatief voor B.
      lijst.sort((p, q) => r === 'A' ? q - p : p - q);
      const ids: number[] = [];
      lijst.forEach((o, index) => {
        const f = (o + W / 2) / W;
        const marge = 0.4;
        const sA = lerp(ka.links, ka.rechts, f) + marge, sB = L - lerp(kb.links, kb.rechts, f) - marge;
        if (sB - sA < 1) return;
        const n = Math.max(2, Math.ceil((sB - sA) / 2.5));
        const pts: V3[] = [];
        for (let i = 0; i <= n; i++) {
          const s = lerp(sA, sB, i / n);
          const a = asPunt(seg.pad, s);
          pts.push({ x: a.x - a.dz * o, y: a.y, z: a.z + a.dx * o });
        }
        if (r === 'B') pts.reverse();
        const b = this.nieuw<Baan>({ soort: 'baan', seg: seg.id, richting: r, index, aantal: lijst.length, van: r === 'A' ? seg.a : seg.b, naar: r === 'A' ? seg.b : seg.a, uit: [], pts, vmax, s0: sA, s1: sB });
        ids.push(b.id);
      });
      ids.forEach(id => { const b = this.sporen.get(id) as Baan; b.aantal = ids.length; });
      if (ids.length) this.perSeg.set(Rijstroken.sleutel(seg.id, r), ids);
    }
  }

  /** Richting (genormaliseerd) aan het eind of begin van een spoor. */
  private richting(pts: V3[], eind: boolean): V2 {
    const n = pts.length;
    const a = eind ? pts[Math.max(0, n - 2)] : pts[0], b = eind ? pts[n - 1] : pts[Math.min(n - 1, 1)];
    return norm2({ x: b.x - a.x, z: b.z - a.z });
  }

  private verbind(knoopId: number) {
    const k = this.net.knopen.get(knoopId)!;
    const inkomend: Baan[][] = [], uitgaand: Baan[][] = [];
    for (const sid of k.segs) {
      const seg = this.net.segmenten.get(sid);
      if (!seg) continue;
      const rIn = seg.b === knoopId ? 'A' : 'B', rUit = seg.a === knoopId ? 'A' : 'B';
      // Een lus (a = b) komt niet voor; elk segment levert hoogstens één in- en één uitgaande groep.
      const i = this.stroken(sid, rIn), u = this.stroken(sid, rUit);
      if (i.length) inkomend.push(i);
      if (u.length) uitgaand.push(u);
    }
    const nieuw: Verbinding[] = [];
    const doodlopend = k.segs.length === 1;
    for (const ins of inkomend) {
      const din = this.richting(ins[0].pts, true);
      for (const uits of uitgaand) {
        const zelfde = uits[0].seg === ins[0].seg;
        if (zelfde && !doodlopend) continue;
        const dout = this.richting(uits[0].pts, false);
        const cr = din.x * dout.z - din.z * dout.x, dt = din.x * dout.x + din.z * dout.z;
        const hoek = Math.atan2(cr, dt); // > 0 = rechtsaf
        const afslag: Afslag = zelfde ? 'keer' : k.segs.length === 2 || Math.abs(hoek) < 0.6 ? 'rechtdoor' : hoek > 0 ? 'rechts' : 'links';
        const nIn = ins.length, nUit = uits.length;
        const paren: [number, number][] = [];
        if (afslag === 'rechtdoor') {
          // Elke strook rechtdoor; meer stroken in dan uit: de linkse voegen in.
          for (let i = 0; i < nIn; i++) paren.push([i, Math.min(i, nUit - 1)]);
          // Meer stroken uit dan in: de rechtse strook mag ook naar de extra stroken.
          for (let j = nIn; j < nUit; j++) paren.push([nIn - 1, j]);
        } else if (afslag === 'rechts') {
          paren.push([0, 0]);
          if (nIn >= 3 && nUit >= 2) paren.push([1, 1]);
        } else if (afslag === 'links') {
          paren.push([nIn - 1, nUit - 1]);
          if (nIn >= 3 && nUit >= 2) paren.push([nIn - 2, nUit - 2]);
        } else {
          paren.push([nIn - 1, nUit - 1]);
        }
        for (const [i, j] of paren) {
          const A = ins[i], B = uits[j];
          const p0 = A.pts[A.pts.length - 1], p1 = B.pts[0];
          const d0 = this.richting(A.pts, true), d1 = this.richting(B.pts, false);
          const afst = Math.hypot(p1.x - p0.x, p1.z - p0.z);
          const kk = afslag === 'keer' ? Math.max(4, afst * 1.1) : afst * (afslag === 'rechtdoor' ? 0.35 : 0.42);
          const c0 = { x: p0.x + d0.x * kk, z: p0.z + d0.z * kk }, c1 = { x: p1.x - d1.x * kk, z: p1.z - d1.z * kk };
          const n = Math.max(4, Math.ceil((afst + kk) / 1.6));
          const pts: V3[] = [];
          for (let q = 0; q <= n; q++) {
            const t = q / n, u = 1 - t;
            const x = u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x;
            const z = u * u * u * p0.z + 3 * u * u * t * c0.z + 3 * u * t * t * c1.z + t * t * t * p1.z;
            pts.push({ x, y: lerp(p0.y, p1.y, t), z });
          }
          // Snelheid in de bocht: zijwaartse versnelling hooguit ~2,8 m/s².
          let rmin = Infinity;
          for (let q = 1; q < pts.length - 1; q++) rmin = Math.min(rmin, straal(pts[q - 1], pts[q], pts[q + 1]));
          const vmax = Math.min(Math.max(A.vmax, B.vmax), Math.sqrt(2.8 * rmin), afslag === 'rechtdoor' ? 99 : afslag === 'keer' ? 4 : 9);
          const v = this.nieuw<Verbinding>({ soort: 'verbinding', knoop: knoopId, van: A.id, naar: B.id, bron: A.seg, doelSeg: B.seg, afslag, conflict: [], bezet: 0, pts, vmax: Math.max(3, vmax) });
          A.uit.push(v.id);
          nieuw.push(v);
        }
      }
    }
    // Conflicten: kruisende verbindingen of samenkomen op dezelfde strook (niet vanaf dezelfde strook).
    for (let i = 0; i < nieuw.length; i++) for (let j = i + 1; j < nieuw.length; j++) {
      const a = nieuw[i], b = nieuw[j];
      if (a.van === b.van) continue;
      let c = a.naar === b.naar;
      if (!c) c = kruist(a.pts, b.pts);
      if (c) { a.conflict.push(b.id); b.conflict.push(a.id); }
    }
  }

  /** Verkeerslichten op drukke kruispunten: fases per as (tegenover elkaar liggende armen samen). */
  private maakLichten(knoopId: number, oud?: Lichten) {
    const k = this.net.knopen.get(knoopId)!;
    if (k.segs.length < 3) return;
    const segs = k.segs.map(id => this.net.segmenten.get(id)!).filter(Boolean);
    const rangen = segs.map(s => RANG[s.type]);
    const max = Math.max(...rangen);
    const aantalStraat = rangen.filter(r => r >= 2).length;
    if (!(max >= 3 && aantalStraat >= 2)) return;
    // Armen met inkomend verkeer, gegroepeerd per as.
    const armen = segs.filter(s => this.stroken(s.id, s.b === knoopId ? 'A' : 'B').length).map(s => ({ s, h: Math.atan2(this.net.wegVan(s, knoopId).z, this.net.wegVan(s, knoopId).x) }));
    const fases: number[][] = [];
    const gebruikt = new Set<number>();
    for (const a of armen) {
      if (gebruikt.has(a.s.id)) continue;
      gebruikt.add(a.s.id);
      const fase = [a.s.id];
      let best: typeof a | null = null, bd = 0.8;
      for (const b of armen) {
        if (gebruikt.has(b.s.id)) continue;
        let d = Math.abs(b.h - a.h) - Math.PI; d = Math.abs(((d + Math.PI) % (2 * Math.PI)) - Math.PI);
        d = Math.abs(Math.abs(b.h - a.h) - Math.PI);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) { gebruikt.add(best.s.id); fase.push(best.s.id); }
      fases.push(fase);
    }
    if (fases.length < 2) return;
    const groen = 14 + max * 3;
    this.lichten.set(knoopId, { knoop: knoopId, fases, fase: oud && oud.fase < fases.length ? oud.fase : 0, t: oud?.t ?? (knoopId * 7.3) % groen, stand: 'groen', groen });
  }

  /**
   * Lichten laten lopen. Verkeersafhankelijk (zoals detectielussen): groen wordt na een minimum
   * afgebroken als er voor de groene richting niemand meer komt en er elders iemand wacht.
   * `vraag(knoop, segment)` = aantal naderende voertuigen uit dat segment.
   */
  stapLichten(dt: number, vraag?: (knoop: number, seg: number) => number) {
    for (const l of this.lichten.values()) {
      l.t += dt;
      const ORANJE = 3, ALLROOD = 1.5, MIN = 6;
      if (vraag && l.stand === 'groen' && l.t > MIN && l.t < l.groen) {
        const hier = l.fases[l.fase].reduce((n, s) => n + vraag(l.knoop, s), 0);
        let elders = 0;
        l.fases.forEach((f, i) => { if (i !== l.fase) elders += f.reduce((n, s) => n + vraag(l.knoop, s), 0); });
        if (hier === 0 && elders > 0) l.t = l.groen;
      }
      // Geen vraag voor de volgende fase: die overslaan.
      if (vraag && l.t >= l.groen + ORANJE + ALLROOD && l.fases.length > 2) {
        for (let k = 1; k < l.fases.length; k++) {
          const f = (l.fase + k) % l.fases.length;
          if (l.fases[f].some(s => vraag(l.knoop, s) > 0)) { l.fase = (f - 1 + l.fases.length) % l.fases.length; break; }
        }
      }
      if (l.t < l.groen) l.stand = 'groen';
      else if (l.t < l.groen + ORANJE) l.stand = 'oranje';
      else if (l.t < l.groen + ORANJE + ALLROOD) l.stand = 'rood';
      else { l.t = 0; l.fase = (l.fase + 1) % l.fases.length; l.stand = 'groen'; }
    }
  }

  /** Stand van het licht voor verkeer uit segment `bron` op knoop k (null = geen lichten). */
  lichtVoor(k: number, bron: number): 'groen' | 'oranje' | 'rood' | null {
    const l = this.lichten.get(k);
    if (!l) return null;
    if (!l.fases[l.fase].includes(bron)) return 'rood';
    return l.stand;
  }

  /** Punt en richting op een spoor op afstand s. */
  static op(sp: Spoor, s: number): { x: number; y: number; z: number; dx: number; dz: number; dy: number } {
    const c = sp.cum, p = sp.pts;
    if (s <= 0) { const d = norm2({ x: p[1].x - p[0].x, z: p[1].z - p[0].z }); return { ...p[0], dx: d.x, dz: d.z, dy: 0 }; }
    if (s >= sp.lengte) { const n = p.length; const d = norm2({ x: p[n - 1].x - p[n - 2].x, z: p[n - 1].z - p[n - 2].z }); return { ...p[n - 1], dx: d.x, dz: d.z, dy: 0 }; }
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const a = p[lo], b = p[lo + 1], f = (s - c[lo]) / Math.max(1e-6, c[lo + 1] - c[lo]);
    const l = Math.max(1e-6, c[lo + 1] - c[lo]);
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f), dx: (b.x - a.x) / l, dz: (b.z - a.z) / l, dy: (b.y - a.y) / l };
  }

  /** Dichtstbijzijnde afstand op een baan bij punt p (voor in- en uitstappen). */
  static projecteer(b: Spoor, p: V2): number {
    let best = Infinity, s = 0;
    for (let i = 0; i < b.pts.length - 1; i++) {
      const a = b.pts[i], c = b.pts[i + 1];
      const abx = c.x - a.x, abz = c.z - a.z, l2 = abx * abx + abz * abz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2)) : 0;
      const d = Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
      if (d < best) { best = d; s = b.cum[i] + (b.cum[i + 1] - b.cum[i]) * t; }
    }
    return s;
  }
}

function straal(a: V3, b: V3, c: V3): number {
  const ab = dist2(a, b), bc = dist2(b, c), ca = dist2(c, a);
  const opp2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
  return opp2 < 1e-6 ? Infinity : (ab * bc * ca) / (2 * opp2);
}

function kruist(a: V3[], b: V3[]): boolean {
  // De eerste en laatste stukjes overslaan: verbindingen vanaf naast elkaar liggende stroken raken
  // elkaar daar bijna, maar kruisen niet.
  for (let i = 1; i < a.length - 2; i++) for (let j = 1; j < b.length - 2; j++) {
    if (snijLijnstukken(a[i], a[i + 1], b[j], b[j + 1]) !== null) return true;
  }
  return false;
}
