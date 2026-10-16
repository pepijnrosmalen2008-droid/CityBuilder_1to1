// ════════════════════════════════════════════════════════════════════════════════════
// LEVEN OP STRAAT
// Voetgangers op de stoepen en fietsers op de fietspaden, alleen in de buurt van de camera en
// met een vast maximum (zoals CS de 'cims' dichtbij toont). Puur beeld: ze doen niet mee in de
// simulatie, dus kosten ze bijna niets. Om de hoek lopen ze in een rechte lijn naar het begin
// van de volgende straat, zodat ze nergens verspringen.
// ════════════════════════════════════════════════════════════════════════════════════

import { V2, V3 } from './math';
import { Wegennet, Segment } from './wegen/netwerk';
import { profiel, strookGrenzen } from './wegen/typen';
import { asPunt } from './geom/wegmesh';

export type LoperSoort = 'voet' | 'fiets';
export interface Loper {
  id: number;
  soort: LoperSoort;
  seg: number;
  /** Offset vanaf de as (links negatief) en booglengte. */
  o: number; s: number;
  /** +1 = met de tekenrichting mee, -1 = ertegenin. */
  r: 1 | -1;
  v: number;
  fase: number;
  kleur: number;
  /** Oversteek naar de volgende straat (rechte lijn), of null. */
  over: { van: V3; naar: V3; t: number; L: number } | null;
}

const STOEP_H = 0.15;

export class StraatLeven {
  lopers: Loper[] = [];
  private volgende = 1;
  private kandidaten: { seg: Segment; voet: number[]; fiets: { o: number; r: 1 | -1 | 0 }[] }[] = [];
  private kandVoet: StraatLeven['kandidaten'] = [];
  private kandFiets: StraatLeven['kandidaten'] = [];
  private kandFocus: V2 = { x: 1e9, z: 1e9 };
  private kandVersie = -1;
  private zaad = 12345;

  constructor(private net: Wegennet) {}

  private rnd() { this.zaad = (this.zaad * 1664525 + 1013904223) >>> 0; return this.zaad / 4294967296; }

  private stroken(seg: Segment) {
    this.bereik(seg);
    let st = this.stroCache.get(seg.id);
    if (!st) this.stroCache.set(seg.id, st = this.strokenVan(seg));
    return st;
  }

  /** Stoep- en fietsstroken van een segment. */
  private strokenVan(seg: Segment) {
    const g = strookGrenzen(profiel(seg.type, seg.om));
    const voet = g.filter(x => x.s.soort === 'stoep' && x.s.breedte >= 1.5).map(x => (x.a + x.b) / 2);
    const fiets = g.filter(x => x.s.soort === 'fiets').map(x => ({ o: (x.a + x.b) / 2, r: (x.s.richting === 'A' ? 1 : x.s.richting === 'B' ? -1 : 0) as 1 | -1 | 0 }));
    return { voet, fiets };
  }

  private bereikCache = new Map<number, { s0: number; s1: number }>();
  private bereikVersie = -1;
  private stroCache = new Map<number, ReturnType<StraatLeven['strokenVan']>>();

  private bereik(seg: Segment) {
    if (this.bereikVersie !== this.net.versie) { this.bereikVersie = this.net.versie; this.bereikCache.clear(); this.stroCache.clear(); }
    let b = this.bereikCache.get(seg.id);
    if (!b) this.bereikCache.set(seg.id, b = this.bereikVan(seg));
    return b;
  }

  private bereikVan(seg: Segment) {
    const ka = this.net.eindKnip(seg, 'a'), kb = this.net.eindKnip(seg, 'b');
    return { s0: Math.max(ka.links, ka.rechts) + 0.5, s1: seg.lengte - Math.max(kb.links, kb.rechts) - 0.5 };
  }

  /** Wereldpositie, kijkrichting (rad) en hoogte van een loper. */
  plek(l: Loper): { x: number; y: number; z: number; rot: number } {
    if (l.over) {
      const t = l.over.t, a = l.over.van, b = l.over.naar;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, rot: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    const seg = this.net.segmenten.get(l.seg)!;
    const a = asPunt(seg.pad, l.s);
    const dy = l.soort === 'voet' ? STOEP_H : 0.01;
    return { x: a.x - a.dz * l.o, y: a.y + dy, z: a.z + a.dx * l.o, rot: Math.atan2(a.dx * l.r, a.dz * l.r) };
  }

  private puntOp(seg: Segment, s: number, o: number, soort: LoperSoort): V3 {
    const a = asPunt(seg.pad, s);
    return { x: a.x - a.dz * o, y: a.y + (soort === 'voet' ? STOEP_H : 0.01), z: a.z + a.dx * o };
  }

  private werkKandidatenBij(focus: V2, straal: number) {
    if (this.kandVersie === this.net.versie && Math.hypot(focus.x - this.kandFocus.x, focus.z - this.kandFocus.z) < 40) return;
    this.kandVersie = this.net.versie; this.kandFocus = { ...focus };
    this.kandidaten = [];
    for (const seg of this.net.segmenten.values()) {
      if (!seg.pad.length) continue;
      const m = seg.pad[seg.pad.length >> 1];
      if (Math.hypot(m.x - focus.x, m.z - focus.z) > straal + seg.lengte / 2) continue;
      if (seg.pad.some(p => p.tunnel)) continue;
      const st = this.stroken(seg);
      if (st.voet.length || st.fiets.length) this.kandidaten.push({ seg, ...st });
    }
    this.kandVoet = this.kandidaten.filter(k => k.voet.length);
    this.kandFiets = this.kandidaten.filter(k => k.fiets.length);
  }

  private maak(soort: LoperSoort, focus: V2, straal: number): Loper | null {
    const lijst = soort === 'voet' ? this.kandVoet : this.kandFiets;
    if (!lijst.length) return null;
    for (let poging = 0; poging < 6; poging++) {
      const k = lijst[Math.floor(this.rnd() * lijst.length)];
      const { s0, s1 } = this.bereik(k.seg);
      if (s1 - s0 < 4) continue;
      const s = s0 + this.rnd() * (s1 - s0);
      const a = asPunt(k.seg.pad, s);
      if (Math.hypot(a.x - focus.x, a.z - focus.z) > straal) continue;
      let o: number, r: 1 | -1;
      if (soort === 'voet') { o = k.voet[Math.floor(this.rnd() * k.voet.length)] + (this.rnd() - 0.5) * 0.8; r = this.rnd() < 0.5 ? 1 : -1; }
      else { const f = k.fiets[Math.floor(this.rnd() * k.fiets.length)]; o = f.o + (this.rnd() - 0.5) * 0.3; r = f.r || (this.rnd() < 0.5 ? 1 : -1); }
      return { id: this.volgende++, soort, seg: k.seg.id, o, s, r, v: soort === 'voet' ? 1.1 + this.rnd() * 0.5 : 4 + this.rnd() * 1.8, fase: this.rnd() * 6.28, kleur: Math.floor(this.rnd() * 1e6), over: null };
    }
    return null;
  }

  /** Aan het einde van de straat: verder in een andere straat (met een oversteek), anders omkeren. */
  private volgendeStraat(l: Loper, seg: Segment) {
    const knoop = l.r > 0 ? seg.b : seg.a;
    const k = this.net.knopen.get(knoop);
    const opties: { seg: Segment; o: number; r: 1 | -1; s: number }[] = [];
    for (const id of k?.segs ?? []) {
      if (id === seg.id && (k?.segs.length ?? 0) > 1) continue;
      const n = this.net.segmenten.get(id);
      if (!n || !n.pad.length || n.pad.some(p => p.tunnel)) continue;
      const st = this.stroken(n), b = this.bereik(n);
      if (b.s1 - b.s0 < 2) continue;
      const r: 1 | -1 = n.a === knoop ? 1 : -1;
      const s = r > 0 ? b.s0 : b.s1;
      if (l.soort === 'voet') for (const o of st.voet) opties.push({ seg: n, o: o + (l.o % 0.4), r, s });
      else for (const f of st.fiets) if (f.r === 0 || f.r === r) opties.push({ seg: n, o: f.o, r, s });
    }
    if (!opties.length) { l.r = -l.r as 1 | -1; return; }
    // Liefst niet terug dezelfde straat in, en de dichtstbijzijnde stoep (niet dwars over het kruispunt).
    const van = this.puntOp(seg, l.s, l.o, l.soort);
    const scored = opties.map(x => ({ x, d: Math.hypot(this.puntOp(x.seg, x.s, x.o, l.soort).x - van.x, this.puntOp(x.seg, x.s, x.o, l.soort).z - van.z) + (x.seg.id === seg.id ? 30 : 0) + this.rnd() * 14 }));
    scored.sort((p, q) => p.d - q.d);
    const keuze = scored[0].x;
    const naar = this.puntOp(keuze.seg, keuze.s, keuze.o, l.soort);
    l.seg = keuze.seg.id; l.o = keuze.o; l.r = keuze.r; l.s = keuze.s;
    const L = Math.hypot(naar.x - van.x, naar.z - van.z);
    l.over = L > 0.3 ? { van, naar, t: 0, L } : null;
  }

  /**
   * Bijwerken rond `focus`: lopers binnen `straal`, hooguit `max`, met dichtheid 0-1 (minder 's nachts).
   */
  stap(dt: number, focus: V2, straal: number, max: number, dichtheid: number) {
    this.werkKandidatenBij(focus, straal);
    // Weg: te ver weg, of hun straat bestaat niet meer.
    this.lopers = this.lopers.filter(l => {
      const seg = this.net.segmenten.get(l.seg);
      if (!seg) return false;
      const p = this.plek(l);
      return Math.hypot(p.x - focus.x, p.z - focus.z) < straal * 1.15;
    });
    const doel = Math.round(max * dichtheid);
    // Aanvullen, een paar per stap (geen piek).
    for (let i = 0; i < 12 && this.lopers.length < doel; i++) {
      const l = this.maak(this.rnd() < 0.78 ? 'voet' : 'fiets', focus, straal);
      if (l) this.lopers.push(l); else break;
    }
    if (this.lopers.length > doel + 10) this.lopers.length = doel;
    for (const l of this.lopers) {
      l.fase += dt * l.v * (l.soort === 'voet' ? 5.2 : 2.2);
      if (l.over) {
        l.over.t += dt * l.v / l.over.L;
        if (l.over.t >= 1) l.over = null;
        continue;
      }
      const seg = this.net.segmenten.get(l.seg)!;
      const { s0, s1 } = this.bereik(seg);
      l.s += l.r * l.v * dt;
      if ((l.r > 0 && l.s >= s1) || (l.r < 0 && l.s <= s0)) {
        l.s = Math.max(s0, Math.min(s1, l.s));
        this.volgendeStraat(l, seg);
      }
    }
  }
}

