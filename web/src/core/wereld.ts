import { V2, dist2, saturate } from './math';
import { Terrein } from './terrain';
import { Wegennet, Segment } from './wegen/netwerk';
import { WEGTYPEN, WegTypeId, halveBreedte } from './wegen/typen';
import { Bomen } from './bomen';
import { Rng } from './rng';
import { Capaciteit, Functie, GebouwVorm, Zone, berekenCapaciteit, verdiepingHoogte, KENGETALLEN } from './zones';
import { Strook, maakStrook, band, opStrook, verdeel, stroomSleutel, STROOK_DIEPTE } from './percelen';
import { afstandTotLijn, getekendOppervlak, zwaartepunt } from './poly';
import { puntInPolygoon } from './math';

/** Perceel op een gevelstrook: van booglengte s0 tot s1 langs de straat, zo diep als de strook. */
export interface Kavel {
  id: number;
  strook: string; seg: number; zijde: 1 | -1;
  s0: number; s1: number;
  /** Hoekpunten van de voorkant (om het perceel na een wegsplitsing terug te vinden). */
  voorA: V2; voorB: V2;
  poly: V2[];
  /** Midden van de voorkant, richting naar binnen, richting langs de straat. */
  voor: V2; binnen: V2; langs: V2;
  breedte: number; diepte: number; oppervlak: number;
  zone: Zone; gebouw: number;
}

export interface Laag { functie: Functie; hoogte: number }
export interface Anker { p: V2; n: V2; t: V2; d: number }

export interface Gebouw {
  id: number; kavel: number; kavels: number[]; zone: Zone; vorm: GebouwVorm;
  /** Footprint (vorm van het perceel), de gevellijn (rand van de stoep) en de maat van de bebouwing. */
  voet: V2[]; voorLijn: V2[]; terug: number; diepte: number;
  /** Zadeldak: voor- en achterhelft. */
  dak?: { voor: V2[]; achter: V2[] };
  /** Middens van de woningen (rijwoningen) op de voorgevel en de grenzen ertussen op de stoeprand. */
  ankers: Anker[]; grenzen: Anker[];
  /** Hele perceel (voor tuin en bestrating). */
  perceel: V2[];
  centrum: V2; voor: V2; breedte: number;
  y: number; yGrond: number;
  lagen: Laag[]; eenheden: number; seed: number;
  voortgang: number; klaar: boolean; bezetting: number;
  cap: Capaciteit;
}

export interface Statistiek {
  inwoners: number; woningen: number; beroeps: number; werkenden: number; werkloosheid: number;
  banen: number; banenD: number; banenH: number; banenK: number; banenI: number; banenO: number;
  gebouwenKlaar: number; inAanbouw: number;
}
export interface Vraag { wonen: number; detailhandel: number; kantoor: number; industrie: number }

export type WereldEvent =
  | { soort: 'seg+' | 'seg-' | 'knoop~'; id: number }
  | { soort: 'kavel+' | 'kavel-' | 'kavel~'; id: number }
  | { soort: 'gebouw+' | 'gebouw-' | 'gebouw~'; id: number };

export const SECONDEN_PER_DAG = 4;
export const totaleHoogte = (lagen: Laag[]) => lagen.reduce((s, l) => s + l.hoogte, 0);

type Box = { x0: number; z0: number; x1: number; z1: number };
const boxVan = (pts: { x: number; z: number }[], m = 0): Box => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
  return { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
};
const raken = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

export class Wereld {
  terrein: Terrein;
  net: Wegennet;
  bomen: Bomen;
  stroken = new Map<string, Strook>();
  kavels = new Map<number, Kavel>();
  gebouwen = new Map<number, Gebouw>();
  events: WereldEvent[] = [];
  snelheid = 1;
  dagen = 0;
  geld = 5_000_000;
  stat: Statistiek = { inwoners: 0, woningen: 0, beroeps: 0, werkenden: 0, werkloosheid: 0, banen: 0, banenD: 0, banenH: 0, banenK: 0, banenI: 0, banenO: 0, gebouwenKlaar: 0, inAanbouw: 0 };
  vraag: Vraag = { wonen: 0.6, detailhandel: 0.1, kantoor: 0.05, industrie: 0.15 };
  private volgende = 1;
  private rng: Rng;
  private bouwKlok = 0;
  private statKlok = 0;
  private segBox = new Map<number, Box>();

  constructor(readonly seed = 1) {
    this.terrein = new Terrein(2048, 4, seed);
    this.net = new Wegennet(this.terrein);
    this.bomen = new Bomen(this.terrein, seed * 7 + 4242);
    this.rng = new Rng(seed * 977 + 13);
  }

  haalEvents() { const e = this.events; this.events = []; return e; }

  // ─── Wegen ──────────────────────────────────────────────────────────────────

  legWeg(a: V2, c: V2, b: V2, type: WegTypeId): { ok: boolean; fout?: string } {
    const fout = this.net.controleer(a, c, b, type);
    if (fout) return { ok: false, fout };
    const kosten = WEGTYPEN[type].kosten * (dist2(a, c) + dist2(c, b));
    if (kosten > this.geld) return { ok: false, fout: 'Niet genoeg geld' };
    const nieuw = this.net.leg(a, c, b, type);
    if (!nieuw.length) return { ok: false, fout: 'Kan hier geen weg leggen' };
    this.geld -= kosten;
    for (const seg of nieuw) this.wisBomenLangs(seg);
    this.verwerkNet();
    return { ok: true };
  }

  sloopWeg(id: number) {
    const seg = this.net.segmenten.get(id);
    if (!seg) return;
    this.net.verwijderSegment(id);
    this.geld += WEGTYPEN[seg.type].kosten * seg.lengte * 0.25;
    this.verwerkNet();
  }

  wijzigWeg(id: number, type: WegTypeId) {
    const seg = this.net.segmenten.get(id);
    if (!seg || seg.type === type) return false;
    const extra = (WEGTYPEN[type].kosten - WEGTYPEN[seg.type].kosten * 0.5) * seg.lengte;
    if (extra > this.geld) return false;
    this.net.wijzigType(id, type);
    this.geld -= Math.max(0, extra);
    this.wisBomenLangs(seg);
    this.verwerkNet();
    return true;
  }

  /** Netwerk-events doorgeven en de gevelstroken in de buurt opnieuw berekenen. */
  private verwerkNet() {
    const ev = this.net.haalEvents();
    const gewijzigd = new Set<number>();
    const gebieden: Box[] = [];
    for (const e of ev) {
      this.events.push(e);
      if (e.soort === 'seg+') gewijzigd.add(e.id);
      if (e.soort === 'seg-') { const b = this.segBox.get(e.id); if (b) gebieden.push(b); this.segBox.delete(e.id); }
    }
    for (const id of gewijzigd) {
      const s = this.net.segmenten.get(id);
      if (!s) continue;
      const b = boxVan(s.pad, halveBreedte(s.type));
      this.segBox.set(id, b); gebieden.push(b);
    }
    if (!gebieden.length) return;
    // Alles binnen twee strookdieptes van een wijziging kan een andere vorm krijgen.
    const marge = STROOK_DIEPTE * 2 + 20;
    const groot = gebieden.map(b => ({ x0: b.x0 - marge, z0: b.z0 - marge, x1: b.x1 + marge, z1: b.z1 + marge }));
    const te = new Set<number>();
    for (const [id, b] of this.segBox) if (groot.some(g => raken(g, b))) te.add(id);
    this.herbouwStroken(te, gebieden);
  }

  private wisBomenLangs(seg: Segment) {
    const hb = halveBreedte(seg.type) + 2.5;
    const b = boxVan(seg.pad, hb);
    this.bomen.wis(b.x0, b.z0, b.x1, b.z1, (x, z) => afstandTotLijn({ x, z }, seg.pad).d < hb);
  }

  /** Raakt een weg dit polygoon? */
  private wegRaakt(poly: V2[], marge = -0.2): boolean {
    const pb = boxVan(poly);
    for (const seg of this.net.segmenten.values()) {
      const hb = halveBreedte(seg.type) + marge;
      const sb = this.segBox.get(seg.id);
      if (sb && !raken(sb, pb)) continue;
      for (let i = 0; i < seg.pad.length - 1; i++) {
        const a = seg.pad[i], b = seg.pad[i + 1];
        for (let t = 0; t <= 1; t += 0.25) {
          const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
          if (p.x < pb.x0 - hb || p.x > pb.x1 + hb || p.z < pb.z0 - hb || p.z > pb.z1 + hb) continue;
          if (puntInPolygoon(p, poly) || afstandTotRand(p, poly) < hb) return true;
        }
      }
    }
    return false;
  }

  // ─── Gevelstroken en percelen ───────────────────────────────────────────────

  private herbouwStroken(segIds: Set<number>, gebieden: Box[]) {
    // Oude stroken van deze segmenten (en van verdwenen segmenten) weg; de kavels erop zoeken een nieuw thuis.
    const zwervers: Kavel[] = [];
    for (const [sleutel, st] of this.stroken) {
      if (segIds.has(st.seg) || !this.net.segmenten.has(st.seg)) {
        this.stroken.delete(sleutel);
        for (const k of this.kavels.values()) if (k.strook === sleutel) zwervers.push(k);
      }
    }
    const nieuweStroken: Strook[] = [];
    for (const id of segIds) {
      const seg = this.net.segmenten.get(id);
      if (!seg) continue;
      for (const z of [1, -1] as const) {
        const st = maakStrook(this.net, this.terrein, seg, z);
        if (st) { this.stroken.set(stroomSleutel(id, z), st); nieuweStroken.push(st); }
      }
    }
    // Bestaande kavels terugzetten op de nieuwe strook waar hun voorkant op ligt.
    const bezet = new Map<string, [number, number][]>();
    for (const k of zwervers) {
      let thuis: Strook | null = null, s0 = 0, s1 = 0;
      for (const st of nieuweStroken) {
        if (st.zijde !== k.zijde && this.net.segmenten.get(st.seg)?.id === k.seg) continue;
        const a = afstandTotLijn(k.voorA, st.voor, st.s), b = afstandTotLijn(k.voorB, st.voor, st.s);
        if (a.d < 0.8 && b.d < 0.8) {
          // Zelfde kant van de weg?
          const q = opStrook(st, (a.s + b.s) / 2);
          if (q.n.x * k.binnen.x + q.n.z * k.binnen.z < 0.7) continue;
          thuis = st; s0 = Math.min(a.s, b.s); s1 = Math.max(a.s, b.s); break;
        }
      }
      if (!thuis || s1 - s0 < 3) { this.verwijderKavel(k.id); continue; }
      s0 = Math.max(s0, thuis.s0); s1 = Math.min(s1, thuis.s1);
      const poly = band(thuis, s0, s1, 0, STROOK_DIEPTE);
      const opp = Math.abs(getekendOppervlak(poly));
      // Te veel veranderd (bijv. een weg erdoorheen): opnieuw verdelen.
      if (poly.length < 3 || opp < k.oppervlak * 0.85 || this.wegRaakt(poly)) { this.verwijderKavel(k.id); continue; }
      this.zetKavel(k, thuis, s0, s1, poly);
      const sl = stroomSleutel(thuis.seg, thuis.zijde);
      (bezet.get(sl) ?? bezet.set(sl, []).get(sl)!).push([s0, s1]);
      this.events.push({ soort: 'kavel~', id: k.id });
    }
    // Kavels van andere stroken in het gebied die nu op een weg liggen (nieuwe weg erdoorheen).
    for (const k of [...this.kavels.values()]) {
      if (bezet.has(k.strook) && this.stroken.has(k.strook)) continue;
      if (!gebieden.some(g => raken(g, boxVan(k.poly)))) continue;
      if (this.wegRaakt(k.poly)) this.verwijderKavel(k.id);
    }
    // Lege stukken van de nieuwe stroken opvullen met nieuwe percelen.
    for (const st of nieuweStroken) {
      const sl = stroomSleutel(st.seg, st.zijde);
      const vol = (bezet.get(sl) ?? []).sort((a, b) => a[0] - b[0]);
      const gaten: [number, number][] = [];
      let c = st.s0;
      for (const [a, b] of vol) { if (a - c > 0.5) gaten.push([c, a]); c = Math.max(c, b); }
      if (st.s1 - c > 0.5) gaten.push([c, st.s1]);
      for (const [a, b] of gaten) {
        if (b - a < 4) {
          // Klein restje: bij een onbebouwde buur voegen.
          const buur = [...this.kavels.values()].find(k => k.strook === sl && !k.gebouw && (Math.abs(k.s1 - a) < 0.6 || Math.abs(k.s0 - b) < 0.6));
          if (buur) {
            const n0 = Math.min(buur.s0, a), n1 = Math.max(buur.s1, b);
            const poly = band(st, n0, n1, 0, STROOK_DIEPTE);
            if (poly.length >= 3) { this.zetKavel(buur, st, n0, n1, poly); this.events.push({ soort: 'kavel~', id: buur.id }); }
          }
          continue;
        }
        for (const [p0, p1] of verdeel(a, b)) this.nieuweKavel(st, p0, p1);
      }
    }
  }

  private zetKavel(k: Kavel, st: Strook, s0: number, s1: number, poly: V2[]) {
    const m = opStrook(st, (s0 + s1) / 2);
    k.strook = stroomSleutel(st.seg, st.zijde); k.seg = st.seg; k.zijde = st.zijde;
    k.s0 = s0; k.s1 = s1; k.poly = poly;
    k.voorA = opStrook(st, s0).p; k.voorB = opStrook(st, s1).p;
    k.voor = m.p; k.binnen = m.n; k.langs = m.t;
    k.breedte = s1 - s0; k.diepte = m.d; k.oppervlak = Math.abs(getekendOppervlak(poly));
  }

  private nieuweKavel(st: Strook, s0: number, s1: number) {
    const poly = band(st, s0, s1, 0, STROOK_DIEPTE);
    if (poly.length < 3) return;
    const opp = Math.abs(getekendOppervlak(poly));
    if (opp < 50) return;
    // Niet te steil.
    let lo = Infinity, hi = -Infinity;
    for (const p of poly) { const h = this.terrein.hoogte(p.x, p.z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi - lo > 7) return;
    if (this.wegRaakt(poly)) return;
    const k = { id: this.volgende++, zone: 'geen', gebouw: 0 } as Kavel;
    this.zetKavel(k, st, s0, s1, poly);
    this.kavels.set(k.id, k);
    this.events.push({ soort: 'kavel+', id: k.id });
  }

  verwijderKavel(id: number) {
    const k = this.kavels.get(id);
    if (!k) return;
    if (k.gebouw) this.verwijderGebouw(k.gebouw);
    this.kavels.delete(id);
    this.events.push({ soort: 'kavel-', id });
  }

  /** Zoneer alle percelen die het penseel raakt. */
  zoneer(m: V2, straal: number, zone: Zone): number {
    let n = 0;
    for (const k of this.kavels.values()) {
      const c = zwaartepunt(k.poly);
      const raak = dist2(c, m) <= straal || dist2(k.voor, m) <= straal || puntInPolygoon(m, k.poly);
      if (!raak || k.zone === zone) continue;
      if (k.gebouw) {
        if (zone !== 'geen') continue;
        this.verwijderGebouw(k.gebouw);
      }
      k.zone = zone; n++;
      this.events.push({ soort: 'kavel~', id: k.id });
    }
    return n;
  }

  // ─── Gebouwen ───────────────────────────────────────────────────────────────

  private ontwerp(reeks: Kavel[], seed: number): Gebouw | null {
    const r = new Rng(seed);
    const k = reeks[0], zone = k.zone;
    const st = this.stroken.get(k.strook);
    if (!st) return null;
    const s0 = Math.min(...reeks.map(x => x.s0)), s1 = Math.max(...reeks.map(x => x.s1));
    const lengte = s1 - s0;
    let vorm: GebouwVorm, lagen: number, diepte: number, terug: number, eenheden = 1;
    switch (zone) {
      case 'wonenLaag': vorm = 'rijwoningen'; lagen = r.next() < 0.65 ? 2 : 3; eenheden = Math.max(1, Math.round(lengte / 5.4));
        diepte = r.range(9, 10.5); terug = r.range(3, 5); break;
      case 'wonenHoog': vorm = 'appartementen'; lagen = reeks.length > 1 ? r.int(5, 11) : r.int(4, 7); diepte = r.range(12, 15); terug = r.range(2.5, 5); break;
      case 'gemengd': vorm = 'winkelsMetWonen'; lagen = r.int(3, 5); diepte = r.range(12, 16); terug = 0.2; break;
      case 'kantoor': vorm = 'kantoortoren'; lagen = reeks.length > 1 ? r.int(6, 18) : r.int(4, 8); diepte = r.range(16, 22); terug = r.range(3, 5); break;
      case 'industrie': vorm = 'bedrijfshal'; lagen = 1; diepte = r.range(20, 30); terug = r.range(5, 8); break;
      default: return null;
    }
    const mid = opStrook(st, (s0 + s1) / 2);
    diepte = Math.min(diepte, mid.d - terug - 1.5);
    if (diepte < 6) return null;
    const voet = band(st, s0, s1, terug, (d: number) => Math.min(terug + diepte, d - 1));
    if (voet.length < 3 || Math.abs(getekendOppervlak(voet)) < 30) return null;
    const ls: Laag[] = [];
    for (let i = 0; i < lagen; i++) {
      const bg = i === 0;
      const f: Functie = vorm === 'winkelsMetWonen' ? (bg ? (r.next() < 0.25 ? 'horeca' : 'detailhandel') : 'wonen')
        : vorm === 'kantoortoren' ? 'kantoor' : vorm === 'bedrijfshal' ? 'industrie' : 'wonen';
      ls.push({ functie: f, hoogte: verdiepingHoogte(f, bg) });
    }
    // Gevellijn (stoeprand) iets voorbij het perceel, voor het herkennen van voor- en achtergevels.
    const voorLijn: V2[] = [];
    for (let s = s0 - 6; s <= s1 + 6.01; s += Math.min(2, (lengte + 12) / 4)) voorLijn.push(opStrook(st, s).p);
    const dak = vorm === 'rijwoningen' ? {
      voor: band(st, s0, s1, terug, (d: number) => Math.min(terug + diepte / 2, d - 1)),
      achter: band(st, s0, s1, terug + diepte / 2, (d: number) => Math.min(terug + diepte, d - 1)),
    } : undefined;
    const ankers: Anker[] = [], grenzen: Anker[] = [];
    for (let i = 0; i < eenheden; i++) {
      const q = opStrook(st, s0 + (i + 0.5) * lengte / eenheden);
      ankers.push({ p: { x: q.p.x + q.n.x * terug, z: q.p.z + q.n.z * terug }, n: q.n, t: q.t, d: q.d });
    }
    for (let i = 1; i < eenheden; i++) { const q = opStrook(st, s0 + i * lengte / eenheden); grenzen.push({ p: q.p, n: q.n, t: q.t, d: q.d }); }
    const perceel = band(st, s0, s1, 0, STROOK_DIEPTE);
    let y = -Infinity, yGrond = Infinity;
    for (const p of [...voet, zwaartepunt(voet)]) { const h = this.terrein.hoogte(p.x, p.z); y = Math.max(y, h); yGrond = Math.min(yGrond, h); }
    const opp = Math.abs(getekendOppervlak(voet));
    return {
      id: this.volgende++, kavel: k.id, kavels: reeks.map(x => x.id), zone, vorm,
      voet, voorLijn, terug, diepte, dak, ankers, grenzen, perceel,
      centrum: zwaartepunt(voet), voor: { x: -mid.n.x, z: -mid.n.z }, breedte: lengte,
      y: y + 0.15, yGrond, lagen: ls, eenheden, seed: Math.floor(r.next() * 2 ** 31),
      voortgang: 0, klaar: false, bezetting: 0,
      cap: berekenCapaciteit(vorm, opp, ls.map(l => l.functie), eenheden),
    };
  }

  /** Lege buurkavel met dezelfde zone, direct ernaast op dezelfde strook. */
  private buur(k: Kavel, rechts: boolean): Kavel | null {
    for (const n of this.kavels.values()) {
      if (n === k || n.strook !== k.strook || n.zone !== k.zone || n.gebouw) continue;
      if (rechts ? Math.abs(n.s0 - k.s1) < 0.6 : Math.abs(n.s1 - k.s0) < 0.6) return n;
    }
    return null;
  }

  private startBouw(k: Kavel) {
    const kans: Partial<Record<Zone, number>> = { kantoor: 0.75, wonenHoog: 0.55, industrie: 0.65, wonenLaag: 0.35, gemengd: 0.25 };
    const max: Partial<Record<Zone, number>> = { kantoor: 3, wonenHoog: 3, industrie: 3, wonenLaag: 2, gemengd: 2 };
    const reeks = [k];
    if (this.rng.next() < (kans[k.zone] ?? 0)) {
      const doel = 2 + (this.rng.next() < 0.4 ? 1 : 0);
      while (reeks.length < Math.min(doel, max[k.zone] ?? 1)) {
        const r = this.buur(reeks[reeks.length - 1], true), l = r ? null : this.buur(reeks[0], false);
        if (r) reeks.push(r); else if (l) reeks.unshift(l); else break;
      }
    }
    const g = this.ontwerp(reeks, Math.floor(this.rng.next() * 2 ** 31));
    if (!g) return;
    this.gebouwen.set(g.id, g);
    for (const x of reeks) { x.gebouw = g.id; this.events.push({ soort: 'kavel~', id: x.id }); }
    this.bomen.wisInPolygoon(g.perceel, 1);
    this.events.push({ soort: 'gebouw+', id: g.id });
  }

  verwijderGebouw(id: number) {
    const g = this.gebouwen.get(id);
    if (!g) return;
    this.gebouwen.delete(id);
    for (const kid of g.kavels) {
      const k = this.kavels.get(kid);
      if (k && k.gebouw === id) { k.gebouw = 0; this.events.push({ soort: 'kavel~', id: k.id }); }
    }
    this.events.push({ soort: 'gebouw-', id });
  }

  gebouwOp(p: V2): Gebouw | null {
    for (const g of this.gebouwen.values()) if (puntInPolygoon(p, g.voet)) return g;
    return null;
  }

  // ─── Simulatie ──────────────────────────────────────────────────────────────

  vraagVoor(z: Zone) {
    const v = this.vraag;
    switch (z) {
      case 'wonenLaag': case 'wonenHoog': return v.wonen;
      case 'gemengd': return Math.max(v.wonen, v.detailhandel) * 0.9;
      case 'kantoor': return v.kantoor;
      case 'industrie': return v.industrie;
      default: return 0;
    }
  }

  stap(dtEcht: number) {
    const dt = Math.min(0.25, dtEcht) * this.snelheid;
    if (dt <= 0) return;
    this.dagen += dt / SECONDEN_PER_DAG;

    for (const g of this.gebouwen.values()) {
      if (!g.klaar) {
        const duur = 8 + 1.6 * g.lagen.length;
        const oud = Math.floor(g.voortgang * g.lagen.length * 2);
        g.voortgang = Math.min(1, g.voortgang + dt / duur);
        if (g.voortgang >= 1) { g.klaar = true; this.events.push({ soort: 'gebouw~', id: g.id }); }
        else if (Math.floor(g.voortgang * g.lagen.length * 2) !== oud) this.events.push({ soort: 'gebouw~', id: g.id });
      } else if (g.bezetting < 1) {
        g.bezetting = Math.min(1, g.bezetting + dt * 0.035 * (0.35 + this.vraagVoor(g.zone)));
      }
    }

    this.bouwKlok += dt;
    if (this.bouwKlok >= 0.3) {
      this.bouwKlok = 0;
      // Per zonesoort: met een kans gelijk aan de vraag start een projectontwikkelaar een project.
      const perZone = new Map<Zone, Kavel[]>();
      for (const k of this.kavels.values()) {
        if (k.zone === 'geen' || k.gebouw) continue;
        let l = perZone.get(k.zone); if (!l) perZone.set(k.zone, l = []); l.push(k);
      }
      for (const [zone, lijst] of perZone) {
        const v = this.vraagVoor(zone);
        const pogingen = 1 + Math.floor(v * 2);
        for (let p = 0; p < pogingen && lijst.length; p++) {
          if (this.rng.next() > v) continue;
          const i = Math.floor(this.rng.next() * lijst.length);
          const k = lijst[i]; lijst.splice(i, 1);
          if (!k.gebouw) this.startBouw(k);
        }
      }
    }

    this.statKlok += dtEcht;
    if (this.statKlok >= 0.5) { this.statKlok = 0; this.berekenStatistiek(); }
  }

  berekenStatistiek() {
    let inw = 0, won = 0, d = 0, h = 0, kk = 0, ii = 0, o = 0, klaar = 0, bouw = 0;
    for (const g of this.gebouwen.values()) {
      if (!g.klaar) { bouw++; continue; }
      klaar++;
      const b = g.bezetting, c = g.cap;
      inw += c.bewoners * b; won += c.woningen;
      d += c.banen.detailhandel * b; h += c.banen.horeca * b; kk += c.banen.kantoor * b; ii += c.banen.industrie * b; o += c.banen.overig * b;
    }
    const banen = d + h + kk + ii + o;
    const beroeps = inw * KENGETALLEN.beroepsbevolking;
    const werkenden = Math.min(beroeps, banen);
    const wl = beroeps > 1 ? (beroeps - werkenden) / beroeps : 0;
    this.stat = { inwoners: Math.round(inw), woningen: won, beroeps: Math.round(beroeps), werkenden: Math.round(werkenden), werkloosheid: wl,
      banen: Math.round(banen), banenD: Math.round(d), banenH: Math.round(h), banenK: Math.round(kk), banenI: Math.round(ii), banenO: Math.round(o), gebouwenKlaar: klaar, inAanbouw: bouw };
    const doelD = inw / 12, doelK = beroeps * 0.3, doelI = beroeps * 0.15;
    this.vraag = {
      wonen: saturate(0.55 + (banen - beroeps) / Math.max(150, beroeps + banen) * 1.2 - wl * 1.5),
      detailhandel: saturate(0.1 + (doelD - (d + h)) / Math.max(10, doelD)),
      kantoor: saturate(0.05 + (doelK - kk) / Math.max(25, doelK) + wl),
      industrie: saturate(0.15 + (doelI - ii) / Math.max(25, doelI) + wl),
    };
  }

  // ─── Opslaan (engine-onafhankelijk JSON-formaat) ────────────────────────────

  naarJson() {
    return {
      versie: 2, seed: this.seed, dagen: this.dagen, geld: this.geld, volgende: this.volgende,
      net: this.net.naarJson(),
      kavels: [...this.kavels.values()],
      gebouwen: [...this.gebouwen.values()],
    };
  }
}

export function kavelMidden(k: Kavel): V2 { return zwaartepunt(k.poly); }

function afstandTotRand(p: V2, poly: V2[]): number {
  return afstandTotLijn(p, [...poly, poly[0]]).d;
}
