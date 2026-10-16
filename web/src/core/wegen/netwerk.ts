import { V2, bezier2, dist2, lerp2, norm2, sub2, snijLijnstukken, puntTotLijnstuk , lerp } from '../math';
import { Terrein, ZEENIVEAU } from '../terrain';
import { WegTypeId, halveBreedte, randen, WEGTYPEN, HOEKSTRAAL, totaleBreedte } from './typen';

/** Knoop; `niveau` = hoogte boven (of onder, negatief) het maaiveld in meters. */
export interface Knoop { id: number; p: V2; y: number; niveau: number; segs: number[] }

/** Eén bemonsterd punt op de as van een segment. */
export interface PadPunt { x: number; y: number; z: number; dx: number; dz: number; s: number; brug: boolean; tunnel: boolean }

export interface Segment {
  id: number;
  a: number; b: number;
  /** Controlepunt van de kwadratische Bézier (rechte weg: midden). */
  c: V2;
  type: WegTypeId;
  naam: string;
  lengte: number;
  pad: PadPunt[];
  /** Rijrichting omgekeerd (eenrichtingsweg die tegen de tekenrichting in loopt). */
  om?: boolean;
}

export const PAD_STAP = 4;
export const MIN_SEGMENT = 6;

export type NetEvent = { soort: 'seg+' | 'seg-'; id: number } | { soort: 'knoop~'; id: number };

export class Wegennet {
  knopen = new Map<number, Knoop>();
  segmenten = new Map<number, Segment>();
  private volgende = 1;
  events: NetEvent[] = [];
  /** Telt elke wijziging aan segmenten (voor afgeleide structuren zoals de rijstrookgraaf). */
  versie = 0;
  /** Geeft een nieuwe straatnaam voor een type (ingesteld door de wereld). */
  naamGever: (type: WegTypeId) => string = t => t;

  constructor(public terrein: Terrein) {}

  // ─── Geometrie ────────────────────────────────────────────────────────────────

  static curve(a: V2, c: V2, b: V2, n = 48): V2[] {
    const r: V2[] = [];
    for (let i = 0; i <= n; i++) r.push(bezier2(a, c, b, i / n));
    return r;
  }

  /** Bemonster de Bézier op (bijna) gelijke booglengte. */
  static bemonster(a: V2, c: V2, b: V2, stap = PAD_STAP): { p: V2; d: V2; s: number; t: number }[] {
    const fijn = 96;
    const pts: V2[] = [], len: number[] = [0];
    for (let i = 0; i <= fijn; i++) pts.push(bezier2(a, c, b, i / fijn));
    for (let i = 1; i <= fijn; i++) len.push(len[i - 1] + dist2(pts[i - 1], pts[i]));
    const L = len[fijn];
    const n = Math.max(1, Math.round(L / stap));
    const r: { p: V2; d: V2; s: number; t: number }[] = [];
    let k = 0;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * L;
      while (k < fijn - 1 && len[k + 1] < s) k++;
      const seg = len[k + 1] - len[k];
      const f = seg > 1e-9 ? (s - len[k]) / seg : 0;
      const t = (k + f) / fijn;
      const p = lerp2(pts[k], pts[k + 1], f);
      // Raaklijn van de Bézier: 2(1-t)(c-a) + 2t(b-c).
      const d = norm2({ x: (1 - t) * (c.x - a.x) + t * (b.x - c.x), z: (1 - t) * (c.z - a.z) + t * (b.z - c.z) });
      r.push({ p, d, s, t });
    }
    return r;
  }

  knoopHoogte(p: V2): number {
    const t = this.terrein;
    let h = 0, n = 0;
    for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) { h += t.hoogte(p.x + dx, p.z + dz); n++; }
    h /= n;
    return h < ZEENIVEAU + 0.8 ? ZEENIVEAU + 7 : h;
  }

  /** Hoogteprofiel: volgt het (gladgestreken) terrein, gaat met een brug over water en diepe dalen. */
  private berekenPad(seg: Segment) {
    const A = this.knopen.get(seg.a)!, B = this.knopen.get(seg.b)!;
    const m = Wegennet.bemonster(A.p, seg.c, B.p);
    const t = this.terrein;
    const ruw = m.map(q => { const h = t.hoogte(q.p.x, q.p.z); return h < ZEENIVEAU + 0.8 ? ZEENIVEAU + 7 : h; });
    let gl = ruw.slice();
    for (let pass = 0; pass < 4; pass++) {
      const n = gl.slice();
      for (let i = 1; i < gl.length - 1; i++) {
        let s = 0, w = 0;
        for (let k = -3; k <= 3; k++) { const j = Math.min(gl.length - 1, Math.max(0, i + k)); s += gl[j]; w++; }
        n[i] = Math.max(s / w, ruw[i] < ZEENIVEAU + 0.8 ? ZEENIVEAU + 7 : -1e9);
      }
      gl = n;
    }
    const n = m.length - 1;
    const y0 = gl[0], y1 = gl[n];
    const verhoogd = A.niveau !== 0 || B.niveau !== 0;
    seg.pad = m.map((q, i) => {
      const u = n ? i / n : 0;
      // Op maaiveld: het gladgestreken terrein volgen. Verhoogd/verdiept: rechte helling tussen de knopen.
      const y = verhoogd ? lerp(A.y, B.y, u) : gl[i] + (A.y - y0) * (1 - u) + (B.y - y1) * u;
      const grond = t.hoogte(q.p.x, q.p.z);
      return { x: q.p.x, y, z: q.p.z, dx: q.d.x, dz: q.d.z, s: q.s, brug: grond < y - 2.2, tunnel: verhoogd && grond > y + 4.5 };
    });
    // Tunnelstukjes van één monster wegpoetsen.
    for (let i = 0; i < seg.pad.length; i++) {
      if (!seg.pad[i].tunnel) continue;
      let j = i; while (j < seg.pad.length && seg.pad[j].tunnel) j++;
      if (j - i < 3) for (let k = i; k < j; k++) seg.pad[k].tunnel = false;
      i = j;
    }
    // Brugstukjes van één monster wegpoetsen, brug pas vanaf 3 monsters (12 m).
    for (let i = 0; i < seg.pad.length; i++) {
      if (!seg.pad[i].brug) continue;
      let j = i; while (j < seg.pad.length && seg.pad[j].brug) j++;
      if (j - i < 3) for (let k = i; k < j; k++) seg.pad[k].brug = false;
      i = j;
    }
    seg.lengte = m[n].s;
  }

  /** Hoogte van het wegdek en afstand tot de as van segment seg op (x, z); null op bruggen en in tunnels. */
  private wegdekBij(seg: Segment, x: number, z: number): { h: number; d: number } | null {
    const pad = seg.pad;
    let best = Infinity, h = 0, brug = false;
    for (let i = 0; i < pad.length - 1; i++) {
      const a = pad[i], b = pad[i + 1];
      const q = puntTotLijnstuk({ x, z }, a, b);
      if (q.d < best) { best = q.d; h = lerp(a.y, b.y, q.t); brug = a.brug || b.brug || a.tunnel || b.tunnel; }
    }
    return brug ? null : { h: h - 0.08, d: best };
  }

  private omhulling(seg: Segment, r: number) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of seg.pad) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { x0: x0 - r, z0: z0 - r, x1: x1 + r, z1: z1 + r };
  }

  /** Grondverzet onder de weg (niet onder bruggen). */
  private egaliseer(seg: Segment) {
    const hb = halveBreedte(seg.type);
    const o = this.omhulling(seg, hb + 14);
    this.terrein.egaliseer((x, z) => this.wegdekBij(seg, x, z), o.x0, o.z0, o.x1, o.z1, hb + 0.8, 12);
    // De uitloop kan het terrein onder wegen in de buurt (andere kant van een bocht, een
    // kruising) weer ophogen: daar het terrein nooit boven het wegdek laten uitkomen.
    for (const s of this.segmenten.values()) {
      if (!s.pad.length) continue;
      const hs = halveBreedte(s.type);
      const b = this.omhulling(s, hs + 1.5);
      if (b.x1 < o.x0 || b.x0 > o.x1 || b.z1 < o.z0 || b.z0 > o.z1) continue;
      this.terrein.begrens((x, z) => this.wegdekBij(s, x, z), Math.max(b.x0, o.x0), Math.max(b.z0, o.z0), Math.min(b.x1, o.x1), Math.min(b.z1, o.z1), hs + 1.0);
    }
  }

  // ─── Topologie ────────────────────────────────────────────────────────────────

  graad(knoopId: number) { return this.knopen.get(knoopId)?.segs.length ?? 0; }

  /** Straal van het kruispuntvlak: breedste aansluitende weg. */
  kruispuntStraal(knoopId: number): number {
    const k = this.knopen.get(knoopId);
    if (!k) return 0;
    let m = 0;
    for (const s of k.segs) m = Math.max(m, halveBreedte(this.segmenten.get(s)!.type));
    return m + 1.5;
  }

  /** Is deze knoop een kruispunt met een eigen vlak (graad 3+, of een overgang tussen wegtypen)? */
  isKruispunt(knoopId: number): boolean {
    const k = this.knopen.get(knoopId);
    if (!k) return false;
    if (k.segs.length >= 3) return true;
    if (k.segs.length === 2) { const [a, b] = k.segs.map(s => this.segmenten.get(s)!); return !!a && !!b && a.type !== b.type; }
    return false;
  }

  /**
   * Inkorting per wegrand aan één uiteinde (links/rechts t.o.v. de tekenrichting), in meters langs de as.
   * Elke rand wordt afgesneden waar hij de rand van de buurweg aan die kant raakt; op een kruispunt
   * komt daar de hoekstraal bij. Bij een knik in dezelfde weg kan de buitenrand negatief zijn
   * (verlengen): zo sluiten de stukken precies in verstek aan.
   */
  eindKnip(seg: Segment, eind: 'a' | 'b'): { links: number; rechts: number } {
    const id = eind === 'a' ? seg.a : seg.b;
    const k = this.knopen.get(id);
    if (!k || k.segs.length < 2 || !seg.pad.length) return { links: 0, rechts: 0 };
    const kruis = this.isKruispunt(id);
    const a = this.wegVan(seg, id);
    const rdA = randen(WEGTYPEN[seg.type].stroken);
    const hoek = (v: V2) => Math.atan2(v.z, v.x);
    const r: { links: number; rechts: number } = { links: 0, rechts: 0 };
    for (const kantVanWeg of [1, -1] as const) { // 1 = rechts van "weg-van-de-knoop"
      // Buur aan die kant: eerstvolgende in hoekvolgorde.
      let best: Segment | null = null, bh = Infinity;
      for (const sid of k.segs) {
        if (sid === seg.id) continue;
        const o = this.segmenten.get(sid);
        if (!o || !o.pad.length) continue;
        let d = (hoek(this.wegVan(o, id)) - hoek(a)) * kantVanWeg;
        d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (d > 1e-3 && d < bh) { bh = d; best = o; }
      }
      // Kant van de tekenrichting: bij uiteinde a is "rechts van weg-van-knoop" ook rechts.
      const tekenRechts = (eind === 'a') === (kantVanWeg === 1);
      let t = 0;
      if (best) {
        const b = this.wegVan(best, id);
        const rdB = randen(WEGTYPEN[best.type].stroken);
        const eA = tekenRechts ? rdA.binnenR : -rdA.binnenL;
        // De buur ziet ons aan zijn andere kant.
        const buurTekenRechts = (best.a === id) === (kantVanWeg === -1);
        const eB = buurTekenRechts ? rdB.binnenR : -rdB.binnenL;
        const rA = { x: -a.z * kantVanWeg, z: a.x * kantVanWeg };
        const rB = { x: b.z * kantVanWeg, z: -b.x * kantVanWeg };
        const pa = { x: k.p.x + rA.x * eA, z: k.p.z + rA.z * eA }, pb = { x: k.p.x + rB.x * eB, z: k.p.z + rB.z * eB };
        const den = a.x * b.z - a.z * b.x;
        if (Math.abs(den) > 0.03) t = ((pb.x - pa.x) * b.z - (pb.z - pa.z) * b.x) / den;
        if (kruis) t = Math.max(1.5, t + HOEKSTRAAL[seg.type]);
        else t = Math.max(-eA * 3, t);
      }
      r[tekenRechts ? 'rechts' : 'links'] = Math.min(t, seg.lengte * 0.45);
    }
    // Berekend op de rijbaanranden; lineair doortrekken naar de buitenranden (stoep, berm).
    const W = totaleBreedte(WEGTYPEN[seg.type].stroken);
    const m = (r.rechts - r.links) / Math.max(0.1, rdA.binnenR - rdA.binnenL);
    return { links: r.links + m * (-W / 2 - rdA.binnenL), rechts: r.rechts + m * (W / 2 - rdA.binnenR) };
  }

  /** Richting weg van knoop k langs het segment. */
  wegVan(seg: Segment, k: number): V2 {
    const p = seg.a === k ? seg.pad[0] : seg.pad[seg.pad.length - 1];
    return seg.a === k ? { x: p.dx, z: p.dz } : { x: -p.dx, z: -p.dz };
  }

  knoopBij(p: V2, straal: number): Knoop | null {
    let best: Knoop | null = null, bd = straal;
    for (const k of this.knopen.values()) { const d = dist2(k.p, p); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  segmentBij(p: V2, marge = 0): { seg: Segment; t: number; d: number } | null {
    let best: { seg: Segment; t: number; d: number } | null = null;
    for (const seg of this.segmenten.values()) {
      const hb = halveBreedte(seg.type) + marge;
      const A = this.knopen.get(seg.a)!, B = this.knopen.get(seg.b)!;
      const c = Wegennet.curve(A.p, seg.c, B.p, 32);
      for (let i = 0; i < c.length - 1; i++) {
        const q = puntTotLijnstuk(p, c[i], c[i + 1]);
        if (q.d <= hb && (!best || q.d < best.d)) best = { seg, t: (i + q.t) / (c.length - 1), d: q.d };
      }
    }
    return best;
  }

  private nieuweKnoop(p: V2, niveau = 0): Knoop {
    const k: Knoop = { id: this.volgende++, p: { ...p }, y: this.knoopHoogte(p) + niveau, niveau, segs: [] };
    this.knopen.set(k.id, k);
    return k;
  }

  private nieuwSegment(a: Knoop, c: V2, b: Knoop, type: WegTypeId, naam = ''): Segment {
    const seg: Segment = { id: this.volgende++, a: a.id, b: b.id, c: { ...c }, type, naam, lengte: 0, pad: [] };
    this.segmenten.set(seg.id, seg);
    a.segs.push(seg.id); b.segs.push(seg.id);
    this.berekenPad(seg);
    this.egaliseer(seg);
    this.events.push({ soort: 'seg+', id: seg.id }); this.versie++;
    this.meldKnoop(a.id); this.meldKnoop(b.id);
    return seg;
  }

  private meldKnoop(id: number) {
    this.events.push({ soort: 'knoop~', id });
    // Aansluitende segmenten moeten mee (inkorting verandert met de graad).
    for (const s of this.knopen.get(id)?.segs ?? []) this.events.push({ soort: 'seg+', id: s }); this.versie++;
  }

  verwijderSegment(id: number) {
    const seg = this.segmenten.get(id);
    if (!seg) return;
    this.segmenten.delete(id);
    this.events.push({ soort: 'seg-', id }); this.versie++;
    for (const kid of [seg.a, seg.b]) {
      const k = this.knopen.get(kid);
      if (!k) continue;
      k.segs = k.segs.filter(s => s !== id);
      if (k.segs.length === 0) { this.knopen.delete(kid); this.events.push({ soort: 'knoop~', id: kid }); }
      else this.meldKnoop(kid);
    }
  }

  /** Splits een segment op parameter t; geeft de nieuwe knoop en de twee helften. */
  splits(segId: number, t: number): { knoop: Knoop; delen: [Segment, Segment] } | null {
    const seg = this.segmenten.get(segId);
    if (!seg) return null;
    const A = this.knopen.get(seg.a)!, B = this.knopen.get(seg.b)!;
    const q0 = lerp2(A.p, seg.c, t), q1 = lerp2(seg.c, B.p, t), m = lerp2(q0, q1, t);
    if (dist2(m, A.p) < MIN_SEGMENT || dist2(m, B.p) < MIN_SEGMENT) return null;
    const type = seg.type, naam = seg.naam;
    // Hoogte van het wegdek op het splitspunt (niet rechtlijnig tussen de uiteinden).
    let yM = this.knoopHoogte(m), bd = Infinity;
    for (const p of seg.pad) { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < bd) { bd = d; yM = p.y; } }
    this.verwijderSegment(segId);
    // verwijderSegment kan A/B opruimen als ze los kwamen te liggen: opnieuw aanmaken met dezelfde id.
    for (const k of [A, B]) if (!this.knopen.has(k.id)) { k.segs = []; this.knopen.set(k.id, k); }
    const M = this.nieuweKnoop(m);
    M.y = yM; M.niveau = A.niveau || B.niveau ? Math.round(yM - this.knoopHoogte(m)) : 0;
    const d1 = this.nieuwSegment(A, q0, M, type, naam);
    const d2 = this.nieuwSegment(M, q1, B, type, naam);
    if (seg.om) d1.om = d2.om = true;
    return { knoop: M, delen: [d1, d2] };
  }

  /** Vind of maak een knoop op p: bestaande knoop, of een bestaand segment splitsen. */
  private knoopOp(p: V2, type: WegTypeId, niveau = 0): Knoop {
    const bestaand = this.knoopBij(p, Math.max(5, halveBreedte(type)));
    if (bestaand) return bestaand;
    const op = this.segmentBij(p);
    if (op) {
      const r = this.splits(op.seg.id, op.t);
      if (r) return r.knoop;
      const A = this.knopen.get(op.seg.a)!, B = this.knopen.get(op.seg.b)!;
      return dist2(A.p, p) < dist2(B.p, p) ? A : B;
    }
    return this.nieuweKnoop(p, niveau);
  }

  /** Kleinste kromtestraal van de kwadratische Bézier. */
  static minStraal(a: V2, c: V2, b: V2): number {
    const dd = { x: 2 * (b.x - 2 * c.x + a.x), z: 2 * (b.z - 2 * c.z + a.z) };
    let min = Infinity;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const d = { x: 2 * ((1 - t) * (c.x - a.x) + t * (b.x - c.x)), z: 2 * ((1 - t) * (c.z - a.z) + t * (b.z - c.z)) };
      const k = Math.abs(d.x * dd.z - d.z * dd.x);
      if (k > 1e-9) min = Math.min(min, Math.hypot(d.x, d.z) ** 3 / k);
    }
    return min;
  }

  /** Mag deze weg hier? Geeft een foutmelding of null. */
  controleer(a: V2, c: V2, b: V2, type: WegTypeId): string | null {
    const L = dist2(a, c) + dist2(c, b);
    if (L < MIN_SEGMENT * 1.5) return 'Te kort';
    const g = this.terrein;
    for (const p of Wegennet.curve(a, c, b, 24)) if (!g.binnen(p.x, p.z, 20)) return 'Buiten de kaart';
    // Te krappe bocht: de binnenrand zou over zichzelf vouwen.
    if (Wegennet.minStraal(a, c, b) < halveBreedte(type) + 3) return 'Bocht te krap';
    const d1 = norm2(sub2(c, a)), d2 = norm2(sub2(b, c));
    if (d1.x * d2.x + d1.z * d2.z < -0.5) return 'Bocht te krap';
    return null;
  }

  /** Leg een weg van a naar b (controlepunt c). Splitst bestaande wegen op kruisingen. */
  leg(a: V2, c: V2, b: V2, type: WegTypeId, niveau = 0): Segment[] {
    if (this.controleer(a, c, b, type)) return [];
    const KA = this.knoopOp(a, type, niveau);
    const KB = this.knoopOp(b, type, niveau);
    if (KA.id === KB.id) return [];
    // Pas het controlepunt mee aan als de eindpunten verschoven zijn (snappen).
    const recht = Math.abs((c.x - (a.x + b.x) / 2)) < 1e-6 && Math.abs((c.z - (a.z + b.z) / 2)) < 1e-6;
    const ctrl = recht ? lerp2(KA.p, KB.p, 0.5) : { x: c.x + ((KA.p.x - a.x) + (KB.p.x - b.x)) / 2, z: c.z + ((KA.p.z - a.z) + (KB.p.z - b.z)) / 2 };

    // Straatnaam: een weg die rechtdoor doorloopt op een weg van hetzelfde type krijgt diens naam.
    let naam = '';
    for (const K of [KA, KB]) for (const sid of K.segs) {
      const o = this.segmenten.get(sid)!;
      if (naam || o.type !== type || K.segs.length !== 1) continue;
      const w = this.wegVan(o, K.id), d = norm2(sub2(K === KA ? ctrl : ctrl, K.p));
      if (w.x * d.x + w.z * d.z < -0.85) naam = o.naam;
    }
    if (!naam) naam = this.naamGever(type);

    // Kruisingen met bestaande wegen zoeken.
    const nieuw = Wegennet.curve(KA.p, ctrl, KB.p, 64);
    const kruis: { tNieuw: number; seg: number; tOud: number }[] = [];
    for (const seg of this.segmenten.values()) {
      if (seg.a === KA.id || seg.b === KA.id || seg.a === KB.id || seg.b === KB.id) continue;
      const A = this.knopen.get(seg.a)!, B = this.knopen.get(seg.b)!;
      const oud = Wegennet.curve(A.p, seg.c, B.p, 32);
      for (let i = 0; i < nieuw.length - 1; i++) for (let j = 0; j < oud.length - 1; j++) {
        const t = snijLijnstukken(nieuw[i], nieuw[i + 1], oud[j], oud[j + 1]);
        if (t === null) continue;
        const p = lerp2(nieuw[i], nieuw[i + 1], t);
        const q = puntTotLijnstuk(p, oud[j], oud[j + 1]);
        const tN = (i + t) / (nieuw.length - 1);
        // Op verschillende hoogte (viaduct of tunnel): kruisen zonder kruispunt.
        const yNieuw = (KA.niveau !== 0 || KB.niveau !== 0) ? lerp(KA.y, KB.y, tN) : this.knoopHoogte(p);
        let yOud = 0, bd = Infinity;
        for (const pp of seg.pad) { const dd = Math.hypot(pp.x - p.x, pp.z - p.z); if (dd < bd) { bd = dd; yOud = pp.y; } }
        if (Math.abs(yNieuw - yOud) > 4.5) continue;
        kruis.push({ tNieuw: tN, seg: seg.id, tOud: (j + q.t) / (oud.length - 1) });
      }
    }
    kruis.sort((x, y) => x.tNieuw - y.tNieuw);

    const knopen: Knoop[] = [KA];
    const params: number[] = [0];
    for (const k of kruis) {
      if (!this.segmenten.has(k.seg)) continue; // al gesplitst door een eerdere kruising
      const p = bezier2(KA.p, ctrl, KB.p, k.tNieuw);
      if (dist2(p, KA.p) < MIN_SEGMENT || dist2(p, KB.p) < MIN_SEGMENT) continue;
      if (dist2(p, knopen[knopen.length - 1].p) < MIN_SEGMENT) continue;
      const r = this.splits(k.seg, k.tOud);
      if (!r) continue;
      knopen.push(r.knoop); params.push(k.tNieuw);
    }
    knopen.push(KB); params.push(1);

    // De nieuwe Bézier opdelen in stukken tussen de knopen (De Casteljau).
    const res: Segment[] = [];
    let P0 = KA.p, C = ctrl, P1 = KB.p, tPrev = 0;
    for (let i = 1; i < knopen.length; i++) {
      const tAbs = params[i];
      const t = i === knopen.length - 1 ? 1 : (tAbs - tPrev) / (1 - tPrev);
      const q0 = lerp2(P0, C, t), q1 = lerp2(C, P1, t);
      const van = knopen[i - 1], naar = knopen[i];
      if (van.id !== naar.id && !this.bestaatVerbinding(van.id, naar.id)) res.push(this.nieuwSegment(van, t >= 1 ? C : q0, naar, type, naam));
      P0 = naar.p; C = q1; tPrev = tAbs;
    }
    return res;
  }

  /** Afrondstraal per wegtype (zoals de automatische bochten in Cities: Skylines 2). */
  static afrondStraal(type: WegTypeId) {
    return ({ voetpad: 6, fietspad: 10, woonstraat: 14, straat: 22, eenrichting: 22, straatBus: 26, laan: 36, tramstraat: 30, gow: 55, snelweg: 160 } as Record<WegTypeId, number>)[type];
  }

  /** Punt (Bézier-parameter) op een segment op een afstand vanaf een uiteinde. */
  private paramOp(seg: Segment, vanaf: 'a' | 'b', afstand: number): number {
    const A = this.knopen.get(seg.a)!, B = this.knopen.get(seg.b)!;
    const m = Wegennet.bemonster(A.p, seg.c, B.p, 0.5);
    const L = m[m.length - 1].s;
    const doel = vanaf === 'a' ? afstand : L - afstand;
    let best = m[0];
    for (const q of m) if (Math.abs(q.s - doel) < Math.abs(best.s - doel)) best = q;
    return best.t;
  }

  /**
   * Scherpe knik in een doorgaande weg (graad 2, zelfde type) vervangen door een vloeiende bocht:
   * beide stukken worden ingekort en met een Bézier door het oude knikpunt verbonden.
   */
  rondAf(knoopId: number): boolean {
    const K = this.knopen.get(knoopId);
    if (!K || K.segs.length !== 2) return false;
    const [s1, s2] = K.segs.map(id => this.segmenten.get(id)!);
    if (!s1 || !s2 || s1.type !== s2.type) return false;
    const a = this.wegVan(s1, knoopId), b = this.wegVan(s2, knoopId);
    const cos = -(a.x * b.x + a.z * b.z); // 1 = rechtdoor
    const afwijking = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (afwijking < 0.14 || afwijking > 2.1) return false;
    const R = Wegennet.afrondStraal(s1.type);
    const t = Math.min(R * Math.tan(afwijking / 2), s1.lengte * 0.45, s2.lengte * 0.45);
    if (t < 3) return false;
    const type = s1.type, naam = s1.naam;
    // Splitsen op afstand t van de knik.
    const p1 = this.paramOp(s1, s1.a === knoopId ? 'a' : 'b', t);
    const r1 = this.splits(s1.id, p1);
    if (!r1) return false;
    const s2nu = this.segmenten.get(s2.id) ?? null;
    if (!s2nu) return false;
    const p2 = this.paramOp(s2nu, s2nu.a === knoopId ? 'a' : 'b', t);
    const r2 = this.splits(s2nu.id, p2);
    if (!r2) return false;
    const P = r1.knoop, Q = r2.knoop;
    // De twee stompjes aan de knik weghalen en vervangen door één bocht.
    for (const sid of [...(this.knopen.get(knoopId)?.segs ?? [])]) this.verwijderSegment(sid);
    const ctrl = { ...K.p };
    if (!this.bestaatVerbinding(P.id, Q.id)) { const s = this.nieuwSegment(P, ctrl, Q, type, naam); void s; }
    return true;
  }

  bestaatVerbinding(a: number, b: number) {
    for (const s of this.knopen.get(a)?.segs ?? []) { const seg = this.segmenten.get(s)!; if ((seg.a === a && seg.b === b) || (seg.a === b && seg.b === a)) return true; }
    return false;
  }

  /** Wegtype wijzigen (opwaarderen). */
  wijzigType(id: number, type: WegTypeId) {
    const seg = this.segmenten.get(id);
    if (!seg || seg.type === type) return false;
    seg.type = type;
    this.berekenPad(seg); this.egaliseer(seg);
    this.events.push({ soort: 'seg+', id }); this.versie++;
    this.meldKnoop(seg.a); this.meldKnoop(seg.b);
    return true;
  }

  /** Rijrichting omdraaien (eenrichtingswegen; bij tweerichtingswegen spiegelt het profiel). */
  keerOm(id: number) {
    const seg = this.segmenten.get(id);
    if (!seg) return false;
    seg.om = !seg.om;
    this.events.push({ soort: 'seg+', id }); this.versie++;
    this.meldKnoop(seg.a); this.meldKnoop(seg.b);
    return true;
  }

  haalEvents() { const e = this.events; this.events = []; return e; }

  // ─── Opslaan ──────────────────────────────────────────────────────────────────
  naarJson() {
    return {
      knopen: [...this.knopen.values()].map(k => ({ id: k.id, x: k.p.x, z: k.p.z, y: k.y, niveau: k.niveau })),
      segmenten: [...this.segmenten.values()].map(s => ({ id: s.id, a: s.a, b: s.b, cx: s.c.x, cz: s.c.z, type: s.type, naam: s.naam, om: s.om ? 1 : 0 })),
      volgende: this.volgende,
    };
  }
  vanJson(j: ReturnType<Wegennet['naarJson']>) {
    this.knopen.clear(); this.segmenten.clear();
    for (const k of j.knopen) this.knopen.set(k.id, { id: k.id, p: { x: k.x, z: k.z }, y: k.y, niveau: k.niveau ?? 0, segs: [] });
    for (const s of j.segmenten) {
      const seg: Segment = { id: s.id, a: s.a, b: s.b, c: { x: s.cx, z: s.cz }, type: s.type, naam: s.naam ?? '', lengte: 0, pad: [], om: !!(s as { om?: number }).om };
      this.segmenten.set(seg.id, seg);
      this.knopen.get(s.a)!.segs.push(seg.id); this.knopen.get(s.b)!.segs.push(seg.id);
      this.berekenPad(seg); this.egaliseer(seg);
      this.events.push({ soort: 'seg+', id: seg.id }); this.versie++;
    }
    for (const k of this.knopen.values()) this.events.push({ soort: 'knoop~', id: k.id });
    this.volgende = j.volgende;
  }
}
