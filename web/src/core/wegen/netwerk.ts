import { V2, bezier2, dist2, lerp2, norm2, sub2, snijLijnstukken, puntTotLijnstuk , lerp } from '../math';
import { Terrein, ZEENIVEAU } from '../terrain';
import { WegTypeId, halveBreedte } from './typen';

export interface Knoop { id: number; p: V2; y: number; segs: number[] }

/** Eén bemonsterd punt op de as van een segment. */
export interface PadPunt { x: number; y: number; z: number; dx: number; dz: number; s: number; brug: boolean }

export interface Segment {
  id: number;
  a: number; b: number;
  /** Controlepunt van de kwadratische Bézier (rechte weg: midden). */
  c: V2;
  type: WegTypeId;
  lengte: number;
  pad: PadPunt[];
}

export const PAD_STAP = 4;
export const MIN_SEGMENT = 6;

export type NetEvent = { soort: 'seg+' | 'seg-'; id: number } | { soort: 'knoop~'; id: number };

export class Wegennet {
  knopen = new Map<number, Knoop>();
  segmenten = new Map<number, Segment>();
  private volgende = 1;
  events: NetEvent[] = [];

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
    seg.pad = m.map((q, i) => {
      const u = n ? i / n : 0;
      const y = gl[i] + (A.y - y0) * (1 - u) + (B.y - y1) * u;
      const grond = t.hoogte(q.p.x, q.p.z);
      return { x: q.p.x, y, z: q.p.z, dx: q.d.x, dz: q.d.z, s: q.s, brug: grond < y - 2.2 };
    });
    // Brugstukjes van één monster wegpoetsen, brug pas vanaf 3 monsters (12 m).
    for (let i = 0; i < seg.pad.length; i++) {
      if (!seg.pad[i].brug) continue;
      let j = i; while (j < seg.pad.length && seg.pad[j].brug) j++;
      if (j - i < 3) for (let k = i; k < j; k++) seg.pad[k].brug = false;
      i = j;
    }
    seg.lengte = m[n].s;
  }

  /** Grondverzet onder de weg (niet onder bruggen). */
  private egaliseer(seg: Segment) {
    const hb = halveBreedte(seg.type);
    const pad = seg.pad;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pad) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const r = hb + 14;
    this.terrein.egaliseer((x, z) => {
      let best = Infinity, h = 0, brug = false;
      for (let i = 0; i < pad.length - 1; i++) {
        const a = pad[i], b = pad[i + 1];
        const q = puntTotLijnstuk({ x, z }, a, b);
        if (q.d < best) { best = q.d; h = lerp(a.y, b.y, q.t); brug = a.brug || b.brug; }
      }
      if (brug) return null;
      return { h: h - 0.08, d: best };
    }, x0 - r, z0 - r, x1 + r, z1 + r, hb + 0.8, 12);
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

  /** Hoeveel meter het segment aan dit uiteinde wordt ingekort voor het kruispunt. */
  inkorting(seg: Segment, eind: 'a' | 'b'): number {
    const id = eind === 'a' ? seg.a : seg.b;
    const k = this.knopen.get(id);
    if (!k || k.segs.length < 3 || !seg.pad.length) return 0;
    // Zover inkorten dat de rijbaan van elke kruisende weg (plus stoep) er net naast past:
    // hb_ander / sin(hoek) + hb_eigen / tan(hoek). Haaks: precies de halve breedte van de ander.
    const eigen = this.wegVan(seg, id), hbE = halveBreedte(seg.type) + 1.2;
    let t = 3;
    for (const sid of k.segs) {
      if (sid === seg.id) continue;
      const o = this.segmenten.get(sid);
      if (!o || !o.pad.length) continue;
      const r = this.wegVan(o, id);
      const cos = eigen.x * r.x + eigen.z * r.z;
      const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
      if (sin < 0.17) continue; // (bijna) in elkaars verlengde: geen inkorting nodig
      // Waar de rand van deze weg de rand van de andere weg snijdt.
      t = Math.max(t, (halveBreedte(o.type) + 1.2 + hbE * cos) / sin);
    }
    return Math.min(t, seg.lengte * 0.45);
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

  private nieuweKnoop(p: V2): Knoop {
    const k: Knoop = { id: this.volgende++, p: { ...p }, y: this.knoopHoogte(p), segs: [] };
    this.knopen.set(k.id, k);
    return k;
  }

  private nieuwSegment(a: Knoop, c: V2, b: Knoop, type: WegTypeId): Segment {
    const seg: Segment = { id: this.volgende++, a: a.id, b: b.id, c: { ...c }, type, lengte: 0, pad: [] };
    this.segmenten.set(seg.id, seg);
    a.segs.push(seg.id); b.segs.push(seg.id);
    this.berekenPad(seg);
    this.egaliseer(seg);
    this.events.push({ soort: 'seg+', id: seg.id });
    this.meldKnoop(a.id); this.meldKnoop(b.id);
    return seg;
  }

  private meldKnoop(id: number) {
    this.events.push({ soort: 'knoop~', id });
    // Aansluitende segmenten moeten mee (inkorting verandert met de graad).
    for (const s of this.knopen.get(id)?.segs ?? []) this.events.push({ soort: 'seg+', id: s });
  }

  verwijderSegment(id: number) {
    const seg = this.segmenten.get(id);
    if (!seg) return;
    this.segmenten.delete(id);
    this.events.push({ soort: 'seg-', id });
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
    const type = seg.type;
    // Hoogte van het wegdek op het splitspunt (niet rechtlijnig tussen de uiteinden).
    let yM = this.knoopHoogte(m), bd = Infinity;
    for (const p of seg.pad) { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < bd) { bd = d; yM = p.y; } }
    this.verwijderSegment(segId);
    // verwijderSegment kan A/B opruimen als ze los kwamen te liggen: opnieuw aanmaken met dezelfde id.
    for (const k of [A, B]) if (!this.knopen.has(k.id)) { k.segs = []; this.knopen.set(k.id, k); }
    const M = this.nieuweKnoop(m);
    M.y = yM;
    const d1 = this.nieuwSegment(A, q0, M, type);
    const d2 = this.nieuwSegment(M, q1, B, type);
    return { knoop: M, delen: [d1, d2] };
  }

  /** Vind of maak een knoop op p: bestaande knoop, of een bestaand segment splitsen. */
  private knoopOp(p: V2, type: WegTypeId): Knoop {
    const bestaand = this.knoopBij(p, Math.max(5, halveBreedte(type)));
    if (bestaand) return bestaand;
    const op = this.segmentBij(p);
    if (op) {
      const r = this.splits(op.seg.id, op.t);
      if (r) return r.knoop;
      const A = this.knopen.get(op.seg.a)!, B = this.knopen.get(op.seg.b)!;
      return dist2(A.p, p) < dist2(B.p, p) ? A : B;
    }
    return this.nieuweKnoop(p);
  }

  /** Mag deze weg hier? Geeft een foutmelding of null. */
  controleer(a: V2, c: V2, b: V2, type: WegTypeId): string | null {
    const L = dist2(a, c) + dist2(c, b);
    if (L < MIN_SEGMENT * 1.5) return 'Te kort';
    const g = this.terrein;
    for (const p of Wegennet.curve(a, c, b, 24)) if (!g.binnen(p.x, p.z, 20)) return 'Buiten de kaart';
    // Te scherpe bocht.
    const d1 = norm2(sub2(c, a)), d2 = norm2(sub2(b, c));
    if (d1.x * d2.x + d1.z * d2.z < -0.2) return 'Bocht te scherp';
    void type;
    return null;
  }

  /** Leg een weg van a naar b (controlepunt c). Splitst bestaande wegen op kruisingen. */
  leg(a: V2, c: V2, b: V2, type: WegTypeId): Segment[] {
    if (this.controleer(a, c, b, type)) return [];
    const KA = this.knoopOp(a, type);
    const KB = this.knoopOp(b, type);
    if (KA.id === KB.id) return [];
    // Pas het controlepunt mee aan als de eindpunten verschoven zijn (snappen).
    const recht = Math.abs((c.x - (a.x + b.x) / 2)) < 1e-6 && Math.abs((c.z - (a.z + b.z) / 2)) < 1e-6;
    const ctrl = recht ? lerp2(KA.p, KB.p, 0.5) : { x: c.x + ((KA.p.x - a.x) + (KB.p.x - b.x)) / 2, z: c.z + ((KA.p.z - a.z) + (KB.p.z - b.z)) / 2 };

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
        kruis.push({ tNieuw: (i + t) / (nieuw.length - 1), seg: seg.id, tOud: (j + q.t) / (oud.length - 1) });
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
      if (van.id !== naar.id && !this.bestaatVerbinding(van.id, naar.id)) res.push(this.nieuwSegment(van, t >= 1 ? C : q0, naar, type));
      P0 = naar.p; C = q1; tPrev = tAbs;
    }
    return res;
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
    this.events.push({ soort: 'seg+', id });
    this.meldKnoop(seg.a); this.meldKnoop(seg.b);
    return true;
  }

  haalEvents() { const e = this.events; this.events = []; return e; }

  // ─── Opslaan ──────────────────────────────────────────────────────────────────
  naarJson() {
    return {
      knopen: [...this.knopen.values()].map(k => ({ id: k.id, x: k.p.x, z: k.p.z, y: k.y })),
      segmenten: [...this.segmenten.values()].map(s => ({ id: s.id, a: s.a, b: s.b, cx: s.c.x, cz: s.c.z, type: s.type })),
      volgende: this.volgende,
    };
  }
  vanJson(j: ReturnType<Wegennet['naarJson']>) {
    this.knopen.clear(); this.segmenten.clear();
    for (const k of j.knopen) this.knopen.set(k.id, { id: k.id, p: { x: k.x, z: k.z }, y: k.y, segs: [] });
    for (const s of j.segmenten) {
      const seg: Segment = { id: s.id, a: s.a, b: s.b, c: { x: s.cx, z: s.cz }, type: s.type, lengte: 0, pad: [] };
      this.segmenten.set(seg.id, seg);
      this.knopen.get(s.a)!.segs.push(seg.id); this.knopen.get(s.b)!.segs.push(seg.id);
      this.berekenPad(seg); this.egaliseer(seg);
      this.events.push({ soort: 'seg+', id: seg.id });
    }
    for (const k of this.knopen.values()) this.events.push({ soort: 'knoop~', id: k.id });
    this.volgende = j.volgende;
  }
}
