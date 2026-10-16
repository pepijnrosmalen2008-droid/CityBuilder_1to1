import { V2, dist2, saturate } from './math';
import { Terrein } from './terrain';
import { Wegennet, Segment } from './wegen/netwerk';
import { WEGTYPEN, WegTypeId, halveBreedte } from './wegen/typen';
import { Bomen } from './bomen';
import { Rng } from './rng';
import { Capaciteit, Functie, GebouwVorm, Zone, berekenCapaciteit, verdiepingHoogte, KENGETALLEN } from './zones';
import { Bouwstijl, GebouwType, kiesStijl, ontwerpKeuze } from './stijlen';
import type { GevelStijl } from './geom/gebouwmesh';
import { Districten, MAX_LAGEN, BELEID_KOSTEN } from './districten';
import { Strook, maakStrook, band, opStrook, verdeel, stroomSleutel, STROOK_DIEPTE } from './percelen';
import { afstandTotLijn, getekendOppervlak, knipHalfvlak, zwaartepunt } from './poly';
import { puntInPolygoon } from './math';
import { Namen, stadsnaam } from './namen';
import { Economie, Grondstof } from './economie';
import { Verkeer } from './verkeer/verkeer';
import { Voorzieningen } from './voorzieningen';
import { Hulpdiensten } from './hulpdiensten';
import { Grondwaarde } from './waarde';
import { Tarieven, Maandstaat, maandstaat, wegOppervlak, tariefEffect } from './begroting';

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
  /** Buitenste perceelgrenzen (begin en eind langs de straat), voor schuttingen. */
  zijden?: Anker[];
  /** Hoekpand: rooilijnen langs de zijstraat (punt op de gevel, normaal van de straat af). */
  zijStraat?: { o: V2; n: V2 }[];
  centrum: V2; voor: V2; breedte: number;
  y: number; yGrond: number;
  lagen: Laag[]; eenheden: number; seed: number;
  voortgang: number; klaar: boolean; bezetting: number;
  cap: Capaciteit;
  /** Bedrijfshal die lokale grondstoffen verwerkt. */
  specialisatie?: Grondstof;
  /** Niveau 1-5 (opgeknapt door hoge grondwaarde en goede voorzieningen). */
  niveau?: number;
  /** Bouwstijl, type en gevel (zie stijlen.ts). */
  stijl?: Bouwstijl; type?: GebouwType; gevel?: GevelStijl;
  /** Aantal panden langs de straat (grachtpanden: elk een eigen gevel) en hun grenzen op de stoeprand. */
  panden?: number; pandGrenzen?: Anker[];
  /** In de steigers: verbouwing naar een hoger niveau of een andere stijl (zoals in CS2). */
  verbouw?: { voortgang: number; niveau: number; stijl?: Bouwstijl };
  /** Dakbeleid van het district bij het bouwen van de mesh. */
  dakBeleid?: { groen: boolean; zon: boolean };
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

export interface Nieuws { id: number; dag: number; tekst: string; soort: 'weg' | 'bouw' | 'mijlpaal' | 'waarschuwing' }
const MIJLPALEN = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
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
  naam: string;
  namen: Namen;
  tarieven: Tarieven = { wonen: 1, bedrijven: 1 };
  /** Laatste afgerekende maand en de lopende prognose. */
  vorigeMaand: Maandstaat | null = null;
  prognose: Maandstaat = maandstaat({ wonen: 1, bedrijven: 1 }, 0, 0, 0, 0, 0);
  /** Exportopbrengst-heffing die de economie deze maand opbracht (gezet door economie.ts). */
  exportHeffing = 0;
  private maandKlok = 0;
  /** Extra vraag naar industrie door lokale grondstoffen (gezet door economie.ts). */
  industrieBonus = 0;
  nieuws: Nieuws[] = [];
  private nieuwsId = 1;
  private gemeld = new Set<string>();
  private opgeleverd = new Map<string, { woningen: number; banen: number; n: number; vorm: string }>();
  private nieuwsKlok = 0;
  private mijlpaal = 0;
  private waarschuwKlok = 0;

  constructor(readonly seed = 1) {
    this.terrein = new Terrein(2048, 4, seed);
    this.net = new Wegennet(this.terrein);
    this.bomen = new Bomen(this.terrein, seed * 7 + 4242);
    this.rng = new Rng(seed * 977 + 13);
    this.naam = stadsnaam(seed);
    this.namen = new Namen(seed);
    this.net.naamGever = t => this.namen.straat(t);
    this.economie = new Economie(this);
    this.verkeer = new Verkeer(this);
    this.voorzieningen = new Voorzieningen(this);
    this.hulpdiensten = new Hulpdiensten(this);
    this.grondwaarde = new Grondwaarde(this);
  }
  districten = new Districten();
  economie: Economie;
  verkeer: Verkeer;
  voorzieningen: Voorzieningen;
  hulpdiensten: Hulpdiensten;
  grondwaarde: Grondwaarde;

  meld(tekst: string, soort: Nieuws['soort']) {
    this.nieuws.push({ id: this.nieuwsId++, dag: this.dagen, tekst, soort });
    if (this.nieuws.length > 40) this.nieuws.shift();
  }

  straatVan(g: Gebouw): string {
    const k = this.kavels.get(g.kavel);
    return (k && this.net.segmenten.get(k.seg)?.naam) || '';
  }

  haalEvents() { const e = this.events; this.events = []; return e; }

  // ─── Wegen ──────────────────────────────────────────────────────────────────

  /** Kosten van een weg: verhoogd (viaduct) en verdiept (tunnel) zijn duurder. */
  static wegKosten(type: WegTypeId, lengte: number, niveau = 0) {
    const f = niveau > 0 ? 1 + niveau / 4 * 0.6 : niveau < 0 ? 2 + -niveau / 4 * 0.8 : 1;
    return WEGTYPEN[type].kosten * lengte * f;
  }

  legWeg(a: V2, c: V2, b: V2, type: WegTypeId, niveau = 0, afronden = false): { ok: boolean; fout?: string } {
    const fout = this.net.controleer(a, c, b, type);
    if (fout) return { ok: false, fout };
    const kosten = Wereld.wegKosten(type, dist2(a, c) + dist2(c, b), niveau);
    if (kosten > this.geld) return { ok: false, fout: 'Niet genoeg geld' };
    const nieuw = this.net.leg(a, c, b, type, niveau);
    if (!nieuw.length) return { ok: false, fout: 'Kan hier geen weg leggen' };
    this.geld -= kosten;
    if (afronden) {
      // Knik bij het beginpunt (aansluiting op een recht stuk van hetzelfde type) vloeiend maken.
      const k = this.net.knoopBij(a, 0.5);
      if (k) this.net.rondAf(k.id);
    }
    for (const seg of nieuw) this.wisBomenLangs(seg);
    this.verwerkNet();
    const naam = nieuw[0].naam;
    if (naam && !this.gemeld.has(naam)) {
      this.gemeld.add(naam);
      this.meld(type === 'snelweg' ? `De ${naam} is aangesloten op ${this.naam}` : `De ${naam} is aangelegd`, 'weg');
    }
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

  /** Rijrichting van een weg omdraaien (eenrichtingswegen, zoals rechts klikken bij opwaarderen in CS). */
  keerWegOm(id: number) {
    if (!this.net.keerOm(id)) return false;
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

  private herbouwStroken(segIds: Set<number>, gebieden: Box[], extraZwervers: Kavel[] = []) {
    // Oude stroken van deze segmenten (en van verdwenen segmenten) weg; de kavels erop zoeken een nieuw thuis.
    const zwervers: Kavel[] = [...extraZwervers];
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
        // Op de sprong in diepte (achter een hoekpand) een kavelgrens leggen.
        const knip = [a, ...st.sprongen.filter(x => x > a + 4 && x < b - 4).sort((x, y) => x - y), b];
        for (let i = 0; i < knip.length - 1; i++) for (const [p0, p1] of verdeel(knip[i], knip[i + 1])) this.nieuweKavel(st, p0, p1);
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

  // ─── Zoneren zoals in Cities: Skylines: vullen, selecteren, penseel ─────────

  private buurCache: { sleutel: string; buren: Map<number, number[]> } | null = null;

  /** Kavels die elkaar raken (zelfde bouwblok): langs de straat en rug aan rug. */
  private kavelBuren(): Map<number, number[]> {
    const sleutel = `${this.kavels.size}:${this.volgende}`;
    if (this.buurCache?.sleutel === sleutel) return this.buurCache.buren;
    const cel = (x: number, z: number) => (Math.floor(x / 20) + 1000) * 10000 + Math.floor(z / 20) + 1000;
    const raster = new Map<number, number[]>();
    for (const k of this.kavels.values()) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of k.poly) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      for (let i = Math.floor(x0 / 20); i <= Math.floor(x1 / 20); i++) for (let j = Math.floor(z0 / 20); j <= Math.floor(z1 / 20); j++) {
        const c = (i + 1000) * 10000 + j + 1000; let l = raster.get(c); if (!l) raster.set(c, l = []); l.push(k.id);
      }
    }
    const buren = new Map<number, number[]>();
    for (const k of this.kavels.values()) {
      const kand = new Set<number>();
      for (const p of k.poly) for (const id of raster.get(cel(p.x, p.z)) ?? []) if (id !== k.id) kand.add(id);
      const r: number[] = [];
      for (const id of kand) {
        const o = this.kavels.get(id)!;
        const rand = [...o.poly, o.poly[0]];
        if (k.poly.some(p => afstandTotLijn(p, rand).d < 0.9) || o.poly.some(p => afstandTotLijn(p, [...k.poly, k.poly[0]]).d < 0.9)) r.push(id);
      }
      buren.set(k.id, r);
    }
    this.buurCache = { sleutel, buren };
    return buren;
  }

  /** Kavel onder een punt (of de dichtstbijzijnde binnen 3 m). */
  kavelOp(p: V2): Kavel | null {
    let best: Kavel | null = null, bd = 3;
    for (const k of this.kavels.values()) {
      if (puntInPolygoon(p, k.poly)) return k;
      const d = afstandTotRand(p, k.poly);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  /** Vullen: alle kavels van het bouwblok die dezelfde zone hebben als de aangeklikte (emmertje). */
  blokVan(start: Kavel, max = 600): number[] {
    const buren = this.kavelBuren();
    const zone = start.zone;
    const gezien = new Set([start.id]), rij = [start.id];
    while (rij.length && gezien.size < max) {
      const id = rij.shift()!;
      for (const b of buren.get(id) ?? []) {
        if (gezien.has(b)) continue;
        const k = this.kavels.get(b);
        if (!k || k.zone !== zone) continue;
        gezien.add(b); rij.push(b);
      }
    }
    return [...gezien];
  }

  /** Kavels waarvan het midden van de voorkant in een (gedraaide) rechthoek ligt. */
  kavelsIn(hoeken: V2[]): number[] {
    const r: number[] = [];
    for (const k of this.kavels.values()) if (puntInPolygoon(zwaartepunt(k.poly), hoeken) || puntInPolygoon(k.voor, hoeken)) r.push(k.id);
    return r;
  }

  /** Zone toekennen aan een lijst kavels (zelfde regels als het penseel). */
  zoneerKavels(ids: number[], zone: Zone): number {
    let n = 0;
    for (const id of ids) {
      const k = this.kavels.get(id);
      if (!k || k.zone === zone) continue;
      if (zone !== 'geen' && this.voorzieningen.binnen(k.voor)) continue;
      if (k.gebouw) { if (zone !== 'geen') continue; this.verwijderGebouw(k.gebouw); }
      k.zone = zone; n++;
      this.events.push({ soort: 'kavel~', id: k.id });
    }
    return n;
  }

  /** Zoneer alle percelen die het penseel raakt. */
  zoneer(m: V2, straal: number, zone: Zone): number {
    let n = 0;
    for (const k of this.kavels.values()) {
      const c = zwaartepunt(k.poly);
      const raak = dist2(c, m) <= straal || dist2(k.voor, m) <= straal || puntInPolygoon(m, k.poly);
      if (!raak || k.zone === zone) continue;
      if (zone !== 'geen' && this.voorzieningen.binnen(k.voor)) continue;
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

  /**
   * Hoogste aantal lagen dat hier past: de regels van het district, en een geleidelijke skyline:
   * per buurpand mag je 2 lagen hoger plus 1 laag per 12 m afstand. Zo staat er geen toren naast
   * een rijtjeshuis, maar loopt de stad op naar het centrum.
   */
  maxLagen(c: V2, zelf = 0): number {
    const d = this.districten.van(c);
    let max = d ? MAX_LAGEN[d.beleid.hoogte] : 99;
    for (const g of this.gebouwen.values()) {
      if (g.id === zelf) continue;
      const dx = g.centrum.x - c.x, dz = g.centrum.z - c.z;
      if (Math.abs(dx) > 130 || Math.abs(dz) > 130) continue;
      const afstand = Math.hypot(dx, dz);
      if (afstand > 130) continue;
      max = Math.min(max, g.lagen.length + 2 + Math.floor(afstand / 12));
    }
    return max;
  }

  /** Raakt dit grondvlak een bestaand gebouw (behalve de opgegeven)? Steekproef op een raster van 1,2 m. */
  private overlaptBuren(voet: V2[], behalve: number[]): boolean {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of voet) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    for (const g of this.gebouwen.values()) {
      if (behalve.includes(g.id)) continue;
      if (g.voet.every(p => p.x < x0) || g.voet.every(p => p.x > x1) || g.voet.every(p => p.z < z0) || g.voet.every(p => p.z > z1)) continue;
      // Echte overlap (een paar m²), niet het delen van een rand met de buurwoning.
      let n = 0;
      for (let x = x0 + 0.6; x < x1; x += 1.2) for (let z = z0 + 0.6; z < z1; z += 1.2) {
        const p = { x, z };
        if (puntInPolygoon(p, voet) && puntInPolygoon(p, g.voet) && ++n >= 3) return true;
      }
    }
    return false;
  }

  private ontwerp(reeks: Kavel[], seed: number, niveau = 1, vasteStijl?: Bouwstijl): Gebouw | null {
    const r = new Rng(seed);
    const k = reeks[0], zone = k.zone;
    const st = this.stroken.get(k.strook);
    if (!st) return null;
    const s0 = Math.min(...reeks.map(x => x.s0)), s1 = Math.max(...reeks.map(x => x.s1));
    const lengte = s1 - s0;
    const district = this.districten.van(k.voor);
    const stijl: Bouwstijl = vasteStijl ?? (district && district.stijl !== 'gemengd' ? district.stijl : kiesStijl(niveau, r));
    const keuze = ontwerpKeuze(zone, stijl, niveau, reeks.length > 1, r, lengte);
    if (!keuze) return null;
    const VORM: Record<string, GebouwVorm> = { wonenLaag: 'rijwoningen', wonenHoog: 'appartementen', gemengd: 'winkelsMetWonen', kantoor: 'kantoortoren', industrie: 'bedrijfshal' };
    const vorm = VORM[zone];
    let lagen = keuze.lagen;
    if (vorm !== 'bedrijfshal') lagen = Math.max(vorm === 'rijwoningen' ? Math.min(2, keuze.lagen) : 3, Math.min(lagen, this.maxLagen(zwaartepunt(k.poly), k.gebouw)));
    // Een woontoren die hier niet hoog mag worden, wordt een gewoon appartementencomplex.
    if (keuze.type === 'woontoren' && lagen < 10) keuze.type = 'appModern';
    let diepte = r.range(keuze.diepte[0], keuze.diepte[1]);
    const terug = r.range(keuze.terug[0], keuze.terug[1]);
    const panden = keuze.eenheid ? Math.max(1, Math.round(lengte / keuze.eenheid)) : 1;
    const eenheden = vorm === 'rijwoningen' ? panden : 1;
    const mid = opStrook(st, (s0 + s1) / 2);
    diepte = Math.min(diepte, mid.d - terug - 1.5);
    if (diepte < 6) return null;
    // Hoekpand: ook afstand houden tot de zijstraat.
    const terugZij = vorm === 'winkelsMetWonen' ? 0.2 : Math.max(1.5, terug * 0.6);
    const zijStraat = st.knippen.filter(kn => kn.straat).map(kn => ({ o: { x: kn.o.x + kn.n.x * terugZij, z: kn.o.z + kn.n.z * terugZij }, n: kn.n }));
    const opZij = (poly: V2[]) => { for (const z of zijStraat) poly = poly.length >= 3 ? knipHalfvlak(poly, z.o, z.n) : poly; return poly; };
    let voet = opZij(band(st, s0, s1, terug, (d: number) => Math.min(terug + diepte, d - 1)));
    // Nooit door een ander gebouw heen (op hoeken en in krappe bochten): dan ondieper bouwen.
    for (let poging = 0; poging < 4 && voet.length >= 3 && this.overlaptBuren(voet, reeks.map(x => x.gebouw)); poging++) {
      diepte *= 0.75;
      if (diepte < 6) return null;
      voet = opZij(band(st, s0, s1, terug, (d: number) => Math.min(terug + diepte, d - 1)));
    }
    if (voet.length < 3 || Math.abs(getekendOppervlak(voet)) < 30 || this.overlaptBuren(voet, reeks.map(x => x.gebouw))) return null;
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
    const dak = vorm === 'rijwoningen' && keuze.type !== 'grachtpand' && keuze.type !== 'villa' ? {
      voor: opZij(band(st, s0, s1, terug, (d: number) => Math.min(terug + diepte / 2, d - 1))),
      achter: opZij(band(st, s0, s1, terug + diepte / 2, (d: number) => Math.min(terug + diepte, d - 1))),
    } : undefined;
    const ankers: Anker[] = [], grenzen: Anker[] = [];
    for (let i = 0; i < eenheden; i++) {
      const q = opStrook(st, s0 + (i + 0.5) * lengte / eenheden);
      ankers.push({ p: { x: q.p.x + q.n.x * terug, z: q.p.z + q.n.z * terug }, n: q.n, t: q.t, d: q.d });
    }
    for (let i = 1; i < eenheden; i++) { const q = opStrook(st, s0 + i * lengte / eenheden); grenzen.push({ p: q.p, n: q.n, t: q.t, d: q.d }); }
    const pandGrenzen: Anker[] = [];
    if (keuze.eenheid) for (let i = 0; i <= panden; i++) { const q = opStrook(st, s0 + i * lengte / panden); pandGrenzen.push({ p: q.p, n: q.n, t: q.t, d: q.d }); }
    const perceel = band(st, s0, s1, 0, STROOK_DIEPTE);
    const zijden: Anker[] = [s0, s1].map(sv => { const q = opStrook(st, sv); return { p: q.p, n: q.n, t: q.t, d: q.d }; });
    let y = -Infinity, yGrond = Infinity;
    for (const p of [...voet, zwaartepunt(voet)]) { const h = this.terrein.hoogte(p.x, p.z); y = Math.max(y, h); yGrond = Math.min(yGrond, h); }
    const opp = Math.abs(getekendOppervlak(voet));
    return {
      id: this.volgende++, kavel: k.id, kavels: reeks.map(x => x.id), zone, vorm,
      voet, voorLijn, terug, diepte, dak, ankers, grenzen, perceel, zijden,
      zijStraat: zijStraat.filter(z => voet.some(p => Math.abs((p.x - z.o.x) * z.n.x + (p.z - z.o.z) * z.n.z) < 0.3)),
      centrum: zwaartepunt(voet), voor: { x: -mid.n.x, z: -mid.n.z }, breedte: lengte,
      y: y + 0.15, yGrond, lagen: ls, eenheden, seed: Math.floor(r.next() * 2 ** 31),
      voortgang: 0, klaar: false, bezetting: 0,
      cap: berekenCapaciteit(vorm, opp, ls.map(l => l.functie), eenheden, keuze.type === 'grachtpand' ? Math.max(1, lagen - 2) : 1),
      niveau, stijl: keuze.stijl, type: keuze.type, gevel: keuze.gevel, panden, pandGrenzen,
      dakBeleid: district ? { groen: district.beleid.groen, zon: district.beleid.zon } : undefined,
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
    if (this.voorzieningen.binnen(k.voor)) return;
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
    if (g.vorm === 'bedrijfshal') g.specialisatie = this.economie.kiesSpecialisatie() ?? undefined;
    this.gebouwen.set(g.id, g);
    for (const x of reeks) { x.gebouw = g.id; this.events.push({ soort: 'kavel~', id: x.id }); }
    this.bomen.wisInPolygoon(g.perceel, 1);
    this.events.push({ soort: 'gebouw+', id: g.id });
    // Buren opnieuw opbouwen: hun schuttingen en schuurtjes wijken voor het nieuwe pand.
    for (const o of this.gebouwen.values()) {
      if (o === g || Math.abs(o.centrum.x - g.centrum.x) > 90 || Math.abs(o.centrum.z - g.centrum.z) > 90) continue;
      if (g.voet.some(p => puntInPolygoon(p, o.perceel)) || o.perceel.some(p => puntInPolygoon(p, g.voet))) this.events.push({ soort: 'gebouw~', id: o.id });
    }
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

  // ─── Verbouwen (opwaarderen zoals in Cities: Skylines 2) ───────────────────────

  /** Het gebouw gaat in de steigers; de bewoners blijven. Daarna komt het terug in de stijl van het nieuwe niveau. */
  startVerbouw(g: Gebouw, niveau: number, stijl?: Bouwstijl) {
    if (g.verbouw || !g.klaar) return;
    g.verbouw = { voortgang: 0, niveau, stijl };
    this.events.push({ soort: 'gebouw~', id: g.id });
  }

  private rondVerbouwAf(g: Gebouw) {
    const v = g.verbouw!;
    delete g.verbouw;
    const reeks = g.kavels.map(id => this.kavels.get(id)).filter((k): k is Kavel => !!k);
    const stijl = v.stijl ?? (g.stijl && this.rng.next() < 0.6 ? g.stijl : undefined);
    const nieuw = reeks.length ? this.ontwerp(reeks, g.seed + v.niveau * 977, v.niveau, stijl) : null;
    if (nieuw) {
      this.volgende--;
      const { id, bezetting, specialisatie } = g;
      Object.assign(g, nieuw, { id, bezetting, specialisatie, klaar: true, voortgang: 1 });
    } else g.niveau = v.niveau;
    this.events.push({ soort: 'gebouw~', id: g.id });
  }

  private districtKlok = 0;
  private volgDistricten() {
    for (const g of this.gebouwen.values()) {
      if (!g.klaar) continue;
      const d = this.districten.van(g.centrum);
      const groen = !!d?.beleid.groen, zon = !!d?.beleid.zon;
      if (!!g.dakBeleid?.groen !== groen || !!g.dakBeleid?.zon !== zon) { g.dakBeleid = { groen, zon }; this.events.push({ soort: 'gebouw~', id: g.id }); }
      if (d && d.stijl !== 'gemengd' && g.stijl !== d.stijl && !g.verbouw && !d.beleid.beschermd && this.rng.next() < 0.05) this.startVerbouw(g, g.niveau ?? 1, d.stijl);
    }
  }

  /** Maandelijkse subsidie voor het districtsbeleid (groene daken, zonnepanelen). */
  get beleidKosten(): number {
    let k = 0;
    for (const g of this.gebouwen.values()) { if (g.dakBeleid?.groen) k += BELEID_KOSTEN.groen; if (g.dakBeleid?.zon) k += BELEID_KOSTEN.zon; }
    return k;
  }

  // ─── Simulatie ──────────────────────────────────────────────────────────────

  vraagVoor(z: Zone) {
    return this.vraagZonderNuts(z) * (1 - this.voorzieningen.tekortAandeel * 0.9);
  }

  private vraagZonderNuts(z: Zone) {
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
    this.verkeer.stap(dtEcht);
    const dt = Math.min(0.25, dtEcht) * this.snelheid;
    if (dt <= 0) return;
    this.dagen += dt / SECONDEN_PER_DAG;

    for (const g of this.gebouwen.values()) {
      if (g.klaar && g.verbouw) {
        g.verbouw.voortgang += dt / (12 + 1.5 * g.lagen.length);
        if (g.verbouw.voortgang >= 1) this.rondVerbouwAf(g);
      }
      if (!g.klaar) {
        const duur = 8 + 1.6 * g.lagen.length;
        const oud = Math.floor(g.voortgang * g.lagen.length * 2);
        g.voortgang = Math.min(1, g.voortgang + dt / duur);
        if (g.voortgang >= 1) {
          g.klaar = true; this.events.push({ soort: 'gebouw~', id: g.id });
          const straat = this.straatVan(g);
          const o = this.opgeleverd.get(straat) ?? { woningen: 0, banen: 0, n: 0, vorm: g.vorm };
          o.woningen += g.cap.woningen; o.banen += g.cap.banen.detailhandel + g.cap.banen.horeca + g.cap.banen.kantoor + g.cap.banen.industrie + g.cap.banen.overig; o.n++;
          this.opgeleverd.set(straat, o);
        }
        else if (Math.floor(g.voortgang * g.lagen.length * 2) !== oud) this.events.push({ soort: 'gebouw~', id: g.id });
      } else if (this.voorzieningen.tekort.has(g.id)) {
        // Geen stroom, water of afvalophaal: bewoners en bedrijven vertrekken langzaam.
        g.bezetting = Math.max(0.1, g.bezetting - dt * 0.006);
      } else if (g.bezetting < 1) {
        // Districtsbelasting: lager tarief trekt sneller bewoners/bedrijven aan, hoger remt.
        const stap = this.districten.belastingStap(g.centrum, g.cap.woningen > 0);
        g.bezetting = Math.min(1, g.bezetting + dt * 0.035 * (0.35 + this.vraagVoor(g.zone)) * Math.max(0.3, 1 - 0.2 * stap));
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

    // Districten: dakbeleid bijwerken en panden geleidelijk in de stijl van het district verbouwen.
    this.districtKlok += dt;
    if (this.districtKlok > 5) { this.districtKlok = 0; this.volgDistricten(); }

    this.statKlok += dtEcht;
    if (this.statKlok >= 0.5) { this.statKlok = 0; this.berekenStatistiek(); }

    this.economie.stap(dt);
    this.voorzieningen.stap(dt);
    this.hulpdiensten.stap(dt);
    this.grondwaarde.stap(dt);

    // Maandafrekening (30 dagen).
    this.maandKlok += dt / SECONDEN_PER_DAG;
    if (this.maandKlok >= 30) {
      this.maandKlok -= 30;
      this.vorigeMaand = this.prognose;
      this.geld += this.prognose.saldo;
      if (this.prognose.saldo < 0 && this.geld < 0) this.meld(`Begrotingstekort: € ${Math.round(-this.prognose.saldo).toLocaleString('nl-NL')} per maand. Verhoog de lasten of bouw zuiniger.`, 'waarschuwing');
    }

    // Nieuws: opleveringen per straat bundelen, mijlpalen, waarschuwingen.
    this.nieuwsKlok += dt;
    if (this.nieuwsKlok > 30) {
      this.nieuwsKlok = 0;
      const lijst = [...this.opgeleverd.entries()].sort((a, b) => (b[1].woningen + b[1].banen) - (a[1].woningen + a[1].banen)).slice(0, 2);
      for (const [straat, o] of lijst) {
        const aan = straat ? ` aan de ${straat}` : '';
        if (o.woningen && o.banen) this.meld(`${o.woningen} woningen en ${o.banen} banen opgeleverd${aan}`, 'bouw');
        else if (o.woningen) this.meld(`${o.woningen} ${o.woningen === 1 ? 'woning' : 'nieuwe woningen'} opgeleverd${aan}`, 'bouw');
        else if (o.banen) this.meld(`${o.vorm === 'bedrijfshal' ? 'Nieuw bedrijf' : o.vorm === 'kantoortoren' ? 'Nieuw kantoor' : 'Nieuwe winkels'}${aan}: ${o.banen} banen`, 'bouw');
      }
      this.opgeleverd.clear();
    }
    while (this.mijlpaal < MIJLPALEN.length && this.stat.inwoners >= MIJLPALEN[this.mijlpaal]) {
      this.meld(`${this.naam} telt nu ${MIJLPALEN[this.mijlpaal].toLocaleString('nl-NL')} inwoners!`, 'mijlpaal');
      this.mijlpaal++;
    }
    this.waarschuwKlok += dt;
    if (this.waarschuwKlok > 120 && this.stat.inwoners > 50) {
      const b = this.voorzieningen.balans;
      const tekort = (['stroom', 'water', 'riool', 'afval'] as const).find(n => b[n].tekort > b[n].verbruik * 0.02);
      const tip = { stroom: 'bouw een windturbine, zonnepark of centrale', water: 'bouw een drinkwaterpompstation', riool: 'bouw een rioolwaterzuivering', afval: 'bouw een stortplaats of afvalcentrale' } as const;
      const naam = { stroom: 'Stroomtekort', water: 'Watertekort', riool: 'Het riool loopt over', afval: 'Het afval wordt niet opgehaald' } as const;
      if (tekort) { this.meld(`${naam[tekort]}: ${tip[tekort]} (Voorzieningen, N)`, 'waarschuwing'); this.waarschuwKlok = 0; }
    }
    if (this.waarschuwKlok > 240 && this.stat.inwoners > 200) {
      if (this.stat.werkloosheid > 0.15) { this.meld(`Werkloosheid ${Math.round(this.stat.werkloosheid * 100)}%: er is vraag naar kantoren en bedrijven`, 'waarschuwing'); this.waarschuwKlok = 0; }
      else if (this.vraag.wonen > 0.8 && ![...this.kavels.values()].some(k => (k.zone === 'wonenLaag' || k.zone === 'wonenHoog') && !k.gebouw)) { this.meld('Er is vraag naar woningen: wijs meer woonzones aan', 'waarschuwing'); this.waarschuwKlok = 0; }
    }
  }

  /** Tevredenheid 0-100: werk, woonruimte en voorzieningen. */
  get tevredenheid(): number {
    const s = this.stat, v = this.vraag;
    if (s.inwoners < 1) return 75;
    // Hoe groter de stad, hoe meer inwoners verwachten van brandweer, politie en zorg.
    const h = this.hulpdiensten.stat, eis = Math.min(1, s.inwoners / 3000);
    let t = 84 - this.voorzieningen.tekortAandeel * 70 - h.misdaad * 22 * eis - (1 - h.gezondheid) * 14 * eis - (1 - h.brandveiligheid) * 8 * eis - s.werkloosheid * 160 - Math.max(0, v.detailhandel - 0.6) * 25 - Math.max(0, v.wonen - 0.85) * 10;
    return Math.round(Math.max(5, Math.min(100, t)));
  }

  berekenStatistiek() {
    let inw = 0, won = 0, d = 0, h = 0, kk = 0, ii = 0, o = 0, klaar = 0, bouw = 0;
    // Belastingwaarde: hoger niveau = hogere WOZ/OZB.
    let wonWOZ = 0, banenWOZ = 0;
    for (const g of this.gebouwen.values()) {
      if (!g.klaar) { bouw++; continue; }
      klaar++;
      const b = g.bezetting, c = g.cap;
      inw += c.bewoners * b; won += c.woningen;
      const f = 0.75 + 0.125 * (g.niveau ?? 1);
      wonWOZ += c.woningen * f * (1 + 0.1 * this.districten.belastingStap(g.centrum, true));
      banenWOZ += (c.banen.detailhandel + c.banen.horeca + c.banen.kantoor + c.banen.industrie + c.banen.overig) * b * f * (1 + 0.1 * this.districten.belastingStap(g.centrum, false));
      d += c.banen.detailhandel * b; h += c.banen.horeca * b; kk += c.banen.kantoor * b; ii += c.banen.industrie * b; o += c.banen.overig * b;
    }
    let winning = 0;
    for (const b of this.economie.bedrijven.values()) if (b.klaar) winning += b.banen;
    ii += winning;
    const banen = d + h + kk + ii + o;
    const beroeps = inw * KENGETALLEN.beroepsbevolking;
    const werkenden = Math.min(beroeps, banen);
    const wl = beroeps > 1 ? (beroeps - werkenden) / beroeps : 0;
    this.stat = { inwoners: Math.round(inw), woningen: won, beroeps: Math.round(beroeps), werkenden: Math.round(werkenden), werkloosheid: wl,
      banen: Math.round(banen), banenD: Math.round(d), banenH: Math.round(h), banenK: Math.round(kk), banenI: Math.round(ii), banenO: Math.round(o), gebouwenKlaar: klaar, inAanbouw: bouw };
    const doelD = inw / 12, doelK = beroeps * 0.3, doelI = beroeps * 0.15;
    const tw = tariefEffect(this.tarieven.wonen), tb = tariefEffect(this.tarieven.bedrijven);
    this.vraag = {
      wonen: saturate(0.55 + (banen - beroeps) / Math.max(150, beroeps + banen) * 1.2 - wl * 1.5 + tw),
      detailhandel: saturate(0.1 + (doelD - (d + h)) / Math.max(10, doelD) + tb),
      kantoor: saturate(0.05 + (doelK - kk) / Math.max(25, doelK) + wl + tb),
      industrie: saturate(0.15 + (doelI - ii) / Math.max(25, doelI) + wl + tb + this.industrieBonus),
    };
    let m2 = 0;
    for (const sg of this.net.segmenten.values()) m2 += wegOppervlak(sg.type, sg.lengte);
    void banenWOZ;
    this.prognose = maandstaat(this.tarieven, wonWOZ, Math.round(banenWOZ + winning), Math.round(inw), m2, this.exportHeffing, this.voorzieningen.onderhoud + this.beleidKosten, this.voorzieningen.inkoopKosten);
  }

  // ─── Opslaan (engine-onafhankelijk JSON-formaat) ────────────────────────────

  /** Volledige stand van de stad als JSON (engine-onafhankelijk; ook voor een andere engine). */
  naarJson() {
    return {
      versie: 4, seed: this.seed, naam: this.naam, dagen: this.dagen, geld: this.geld, volgende: this.volgende,
      tarieven: this.tarieven, mijlpaal: this.mijlpaal, maandKlok: this.maandKlok, vorigeMaand: this.vorigeMaand,
      gemeld: [...this.gemeld], nieuws: this.nieuws.slice(0, 20), nieuwsId: this.nieuwsId,
      terrein: this.terrein.wijzigingen(), bomen: this.bomen.gekapt(), namen: this.namen.naarJson(),
      net: this.net.naarJson(),
      kavels: [...this.kavels.values()],
      gebouwen: [...this.gebouwen.values()],
      economie: this.economie.naarJson(),
      voorzieningen: this.voorzieningen.naarJson(),
      hulpdiensten: this.hulpdiensten.naarJson(),
      districten: this.districten.naarJson(),
    };
  }

  /** Een opgeslagen stad laden in deze (nieuwe, lege) wereld met dezelfde seed. */
  laadJson(j: ReturnType<Wereld['naarJson']>) {
    this.naam = j.naam; this.dagen = j.dagen; this.geld = j.geld; this.volgende = j.volgende;
    this.tarieven = j.tarieven; this.mijlpaal = j.mijlpaal; this.maandKlok = j.maandKlok; this.vorigeMaand = j.vorigeMaand;
    this.gemeld = new Set(j.gemeld); this.nieuws = j.nieuws ?? []; this.nieuwsId = j.nieuwsId ?? 1;
    this.terrein.laadWijzigingen(j.terrein);
    this.bomen.laadGekapt(j.bomen);
    this.namen.laadJson(j.namen);
    this.net.vanJson(j.net);
    // Eerst de kavels en gebouwen terug; daarna de gevelstroken opnieuw berekenen en de kavels
    // daarop terugzetten (zoals na het verleggen van een weg).
    this.kavels = new Map(j.kavels.map(k => [k.id, k]));
    this.gebouwen = new Map(j.gebouwen.map(g => [g.id, g]));
    const ev = this.net.haalEvents();
    for (const e of ev) this.events.push(e);
    // Gevelstroken opnieuw berekenen; de opgeslagen kavels passen er precies op.
    for (const sg of this.net.segmenten.values()) {
      this.segBox.set(sg.id, boxVan(sg.pad, halveBreedte(sg.type)));
      for (const z of [1, -1] as const) { const st = maakStrook(this.net, this.terrein, sg, z); if (st) this.stroken.set(stroomSleutel(sg.id, z), st); }
    }
    for (const g of [...this.gebouwen.values()]) {
      if (!this.kavels.has(g.kavel)) { this.gebouwen.delete(g.id); continue; }
      this.events.push({ soort: 'gebouw+', id: g.id });
    }
    for (const k of this.kavels.values()) this.events.push({ soort: 'kavel~', id: k.id });
    this.economie.laadJson(j.economie);
    this.voorzieningen.laadJson(j.voorzieningen);
    this.hulpdiensten.laadJson(j.hulpdiensten);
    this.districten.laadJson(j.districten);
    this.berekenStatistiek();
  }
}

export function kavelMidden(k: Kavel): V2 { return zwaartepunt(k.poly); }

function afstandTotRand(p: V2, poly: V2[]): number {
  return afstandTotLijn(p, [...poly, poly[0]]).d;
}
