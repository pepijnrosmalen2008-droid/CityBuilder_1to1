import { V2 } from '../math';
import { Rng } from '../rng';
import { WEGTYPEN, WegTypeId, halveBreedte } from '../wegen/typen';
import { Rijstroken, Baan, Verbinding, Spoor, RANG } from './rijstroken';
export type { Spoor };
import type { Wereld } from '../wereld';

// ════════════════════════════════════════════════════════════════════════════════════
// VERKEER
// Voertuigen rijden over de rijstrookgraaf. Elk voertuig heeft een rit (van een gebouw naar een
// ander gebouw, of van/naar een buitenaansluiting) en een route over gerichte wegstukken (A*,
// voorkeur voor hogere wegen zoals in Cities: Skylines). Volggedrag met het Intelligent Driver
// Model; voorsorteren door op tijd van strook te wisselen; op kruispunten reserveren ze hun
// verbinding als die vrij is van kruisend verkeer, het licht groen is en niemand met voorrang
// eraan komt (rechts gaat voor, hogere weg gaat voor, rechtdoor gaat voor linksaf).
// ════════════════════════════════════════════════════════════════════════════════════

export type VoertuigSoort = 'hatchback' | 'sedan' | 'stationwagen' | 'suv' | 'bestelbus' | 'vrachtwagen' | 'bus' | 'politie' | 'ambulance' | 'brandweer';

export const AFMETING: Record<VoertuigSoort, { l: number; b: number }> = {
  hatchback: { l: 4.15, b: 1.78 }, sedan: { l: 4.75, b: 1.83 }, stationwagen: { l: 4.8, b: 1.83 }, suv: { l: 4.6, b: 1.9 },
  bestelbus: { l: 5.3, b: 2.0 }, vrachtwagen: { l: 9.6, b: 2.5 }, bus: { l: 12, b: 2.55 },
  politie: { l: 4.8, b: 1.83 }, ambulance: { l: 5.3, b: 2.0 }, brandweer: { l: 9.6, b: 2.5 },
};

/** Lakkleuren (sRGB) met hun aandeel in het Nederlandse wagenpark. */
export const LAKKEN: { kleur: [number, number, number]; kans: number }[] = [
  { kleur: [0.93, 0.93, 0.92], kans: 0.2 }, { kleur: [0.05, 0.05, 0.06], kans: 0.17 }, { kleur: [0.42, 0.43, 0.45], kans: 0.18 },
  { kleur: [0.72, 0.73, 0.75], kans: 0.12 }, { kleur: [0.1, 0.18, 0.38], kans: 0.1 }, { kleur: [0.62, 0.06, 0.06], kans: 0.08 },
  { kleur: [0.16, 0.26, 0.2], kans: 0.03 }, { kleur: [0.45, 0.36, 0.26], kans: 0.03 }, { kleur: [0.18, 0.4, 0.62], kans: 0.04 },
  { kleur: [0.85, 0.5, 0.08], kans: 0.02 }, { kleur: [0.9, 0.78, 0.2], kans: 0.01 }, { kleur: [0.25, 0.25, 0.28], kans: 0.02 },
];

export interface Voertuig {
  id: number; soort: VoertuigSoort; lak: number; lengte: number;
  spoor: number; s: number; v: number; a: number;
  /** Route: gerichte wegstukken; ri = index van het huidige wegstuk. */
  route: { seg: number; r: 'A' | 'B' }[]; ri: number;
  /** Stopplek op de laatste strook. */
  doelS: number;
  v0f: number; amax: number; bc: number; T: number;
  /** Gereserveerde verbinding (0 = geen). */
  res: number;
  wacht: number; vast: number;
  /** Zijwaartse verschuiving tijdens een strookwissel (m, loopt naar 0). */
  zij: number;
  rem: boolean;
  /** Seconden sinds het vertrek (voor in- en uitvoegen). */
  leeftijd: number;
  /** Hulpdienst met zwaailicht en sirene (rijdt door rood, mag harder). */
  sirene?: boolean;
  /** Wordt aangeroepen bij aankomst op de bestemming. */
  opAankomst?: (v: Voertuig) => void;
}

/** Herkomst of bestemming: kant van een wegstuk en een punt (gebouw, voorziening). */
export interface Plek { seg: number; zijde: 1 | -1; p: V2; gewicht: number }

const S0 = 2.2; // minimale afstand tot de voorligger (m)

export class Verkeer {
  stroken: Rijstroken;
  voertuigen = new Map<number, Voertuig>();
  /** Maximum aantal voertuigen (de render-laag zet dit per kwaliteitsniveau). */
  max = 400;
  /** Doorstroming (0-1), zoals de verkeersmeter in Cities: Skylines. */
  doorstroming = 1;
  ritten = 0;
  private volgende = 1;
  private versie = -1;
  private bouwKlok = 0;
  private plekKlok = 99;
  private spawnKlok = 0;
  private rng = new Rng(4242);
  private aangemeld = new Map<number, { id: number; eta: number }[]>();
  private plekken: Record<'woning' | 'werk' | 'winkel' | 'industrie', Plek[]> = { woning: [], werk: [], winkel: [], industrie: [] };
  private buiten: number[] = [];

  constructor(private w: Wereld) { this.stroken = new Rijstroken(w.net); }

  // ─── Graaf bijhouden ─────────────────────────────────────────────────────────

  private herbouw() {
    const oud = new Map<number, { seg: number; r: 'A' | 'B'; index: number; frac: number }>();
    for (const v of this.voertuigen.values()) {
      const sp = this.stroken.sporen.get(v.spoor);
      const b = sp?.soort === 'baan' ? sp : sp?.soort === 'verbinding' ? this.stroken.baan(sp.naar) : null;
      if (b) oud.set(v.id, { seg: b.seg, r: b.richting, index: b.index, frac: sp?.soort === 'baan' ? v.s / Math.max(1, sp.lengte) : 0 });
    }
    this.stroken.bouw();
    // Voertuigen terugzetten op dezelfde strook (als die nog bestaat), anders verwijderen.
    for (const v of [...this.voertuigen.values()]) {
      const o = oud.get(v.id);
      const lijst = o ? this.stroken.stroken(o.seg, o.r) : [];
      const b = lijst.find(x => x.index === o!.index) ?? lijst[0];
      if (!o || !b || !v.route.every(x => this.w.net.segmenten.has(x.seg))) { this.voertuigen.delete(v.id); continue; }
      v.spoor = b.id; v.s = o.frac * b.lengte; v.res = 0;
      const ri = v.route.findIndex(x => x.seg === o.seg && x.r === o.r);
      if (ri < 0) { this.voertuigen.delete(v.id); continue; }
      v.ri = ri;
    }
    this.buiten = [];
    const g = this.w.terrein.grootte / 2;
    for (const k of this.w.net.knopen.values()) {
      if (k.segs.length !== 1) continue;
      const seg = this.w.net.segmenten.get(k.segs[0]);
      if (!seg || RANG[seg.type] < 2) continue;
      if (Math.max(Math.abs(k.p.x), Math.abs(k.p.z)) > g - 160) this.buiten.push(k.id);
    }
  }

  /** Herkomsten en bestemmingen uit de gebouwen en bedrijven. */
  private verzamelPlekken() {
    const p: typeof this.plekken = { woning: [], werk: [], winkel: [], industrie: [] };
    for (const g of this.w.gebouwen.values()) {
      if (!g.klaar) continue;
      const k = this.w.kavels.get(g.kavel);
      if (!k || !this.w.net.segmenten.has(k.seg)) continue;
      const plek = (gewicht: number): Plek => ({ seg: k.seg, zijde: k.zijde, p: k.voor, gewicht: gewicht * Math.max(0.2, g.bezetting) });
      if (g.cap.woningen) p.woning.push(plek(g.cap.woningen));
      const b = g.cap.banen;
      if (b.kantoor + b.overig) p.werk.push(plek(b.kantoor + b.overig));
      if (b.detailhandel + b.horeca) { p.winkel.push(plek(b.detailhandel + b.horeca)); p.werk.push(plek(b.detailhandel + b.horeca)); }
      if (b.industrie) { p.industrie.push(plek(b.industrie)); p.werk.push(plek(b.industrie)); }
    }
    for (const b of this.w.economie.bedrijven.values()) {
      if (!b.klaar) continue;
      const s = this.w.net.segmentBij(b.p, 40);
      if (!s) continue;
      let best = s.seg.pad[0], bd = Infinity;
      for (const q of s.seg.pad) { const d = Math.hypot(q.x - b.p.x, q.z - b.p.z); if (d < bd) { bd = d; best = q; } }
      const zijde: 1 | -1 = ((b.p.x - best.x) * -best.dz + (b.p.z - best.z) * best.dx) > 0 ? 1 : -1;
      p.industrie.push({ seg: s.seg.id, zijde, p: b.p, gewicht: b.banen });
    }
    this.plekken = p;
  }

  private kies(lijst: Plek[]): Plek | null {
    if (!lijst.length) return null;
    let tot = 0; for (const x of lijst) tot += x.gewicht;
    let r = this.rng.next() * tot;
    for (const x of lijst) { r -= x.gewicht; if (r <= 0) return x; }
    return lijst[lijst.length - 1];
  }

  // ─── Ritten ──────────────────────────────────────────────────────────────────

  private lak(soort: VoertuigSoort): number {
    if (soort === 'bestelbus' && this.rng.next() < 0.6) return 0;
    let r = this.rng.next();
    for (let i = 0; i < LAKKEN.length; i++) { r -= LAKKEN[i].kans; if (r <= 0) return i; }
    return 0;
  }

  /** Strook en positie om bij een plek de weg op te gaan (rechts, dus in de richting van die kant). */
  private toegang(pl: Plek): { baan: Baan; s: number } | null {
    const r = pl.zijde === 1 ? 'A' : 'B';
    const lijst = this.stroken.stroken(pl.seg, r);
    if (!lijst.length) return null;
    const b = lijst[0];
    return { baan: b, s: Math.max(1, Math.min(b.lengte - 2, Rijstroken.projecteer(b, pl.p))) };
  }

  /** Doel: segment, richting en stopplek; beide richtingen mogelijk. */
  private doelOpties(pl: Plek): { seg: number; r: 'A' | 'B'; s: number; extra: number }[] {
    const r: { seg: number; r: 'A' | 'B'; s: number; extra: number }[] = [];
    for (const rr of ['A', 'B'] as const) {
      const lijst = this.stroken.stroken(pl.seg, rr);
      if (!lijst.length) continue;
      const b = lijst[0];
      r.push({ seg: pl.seg, r: rr, s: Math.max(2, Math.min(b.lengte - 1, Rijstroken.projecteer(b, pl.p))), extra: (rr === 'A') === (pl.zijde === 1) ? 0 : 25 });
    }
    return r;
  }

  private kosten(type: WegTypeId, lengte: number) {
    const f: Record<string, number> = { woonstraat: 1.7, straat: 1.15, straatBus: 1.15, tramstraat: 1.2, laan: 1, gow: 0.85, snelweg: 0.75 };
    return lengte / (WEGTYPEN[type].snelheid / 3.6) * (f[type] ?? 1.3);
  }

  /** A* over gerichte wegstukken van (seg, r) naar een van de doelen. */
  private route(start: { seg: number; r: 'A' | 'B'; s: number }, doelen: { seg: number; r: 'A' | 'B'; s: number; extra: number }[]): { seg: number; r: 'A' | 'B' }[] | null {
    const net = this.w.net;
    const sleutel = (seg: number, r: string) => `${seg}${r}`;
    // Direct op hetzelfde wegstuk vooruit.
    for (const d of doelen) if (d.seg === start.seg && d.r === start.r && d.s > start.s + 8) return [{ seg: start.seg, r: start.r }];
    const doelMap = new Map(doelen.map(d => [sleutel(d.seg, d.r), d]));
    const eindKnoop = (seg: number, r: 'A' | 'B') => { const s = net.segmenten.get(seg)!; return r === 'A' ? s.b : s.a; };
    const doelPunt = net.segmenten.get(doelen[0].seg)!.pad[0];
    const h = (k: number) => { const p = net.knopen.get(k)!.p; return Math.hypot(p.x - doelPunt.x, p.z - doelPunt.z) / 30; };
    const g = new Map<string, number>(), terug = new Map<string, string>();
    const open: { k: string; f: number; seg: number; r: 'A' | 'B' }[] = [];
    const s0 = sleutel(start.seg, start.r);
    g.set(s0, 0);
    open.push({ k: s0, f: 0, seg: start.seg, r: start.r });
    let beste: { k: string; c: number } | null = null;
    let teller = 0;
    while (open.length && teller++ < 6000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const gc = g.get(cur.k)!;
      if (beste && gc >= beste.c) break;
      const kn = eindKnoop(cur.seg, cur.r);
      const knoop = net.knopen.get(kn);
      if (!knoop) continue;
      const licht = this.stroken.lichten.has(kn) ? 6 : knoop.segs.length > 2 ? 2.5 : 0;
      for (const sid of knoop.segs) {
        if (sid === cur.seg && knoop.segs.length > 1) continue;
        const s = net.segmenten.get(sid)!;
        const r: 'A' | 'B' = s.a === kn ? 'A' : 'B';
        if (!this.stroken.stroken(sid, r).length) continue;
        const k = sleutel(sid, r);
        const d = doelMap.get(k);
        const kost = gc + licht;
        if (d) {
          const c = kost + this.kosten(s.type, d.s) + d.extra;
          if (!beste || c < beste.c) { beste = { k, c }; if (!g.has(k) || kost < g.get(k)!) { g.set(k, kost); terug.set(k, cur.k); } }
        }
        const ng = kost + this.kosten(s.type, s.lengte);
        if (g.has(k) && g.get(k)! <= ng) continue;
        g.set(k, ng); terug.set(k, cur.k);
        open.push({ k, f: ng + h(r === 'A' ? s.b : s.a), seg: sid, r });
      }
    }
    if (!beste) return null;
    const pad: { seg: number; r: 'A' | 'B' }[] = [];
    let k: string | undefined = beste.k;
    let veilig = 0;
    while (k && veilig++ < 5000) {
      const r = k.slice(-1) as 'A' | 'B';
      pad.unshift({ seg: Number(k.slice(0, -1)), r });
      if (k === s0) break;
      k = terug.get(k);
    }
    return pad[0] && pad[0].seg === start.seg && pad[0].r === start.r ? pad : null;
  }

  /** Nieuwe rit: herkomst, bestemming, voertuig. */
  private nieuweRit(): boolean {
    const P = this.plekken;
    const r = this.rng.next();
    let van: Plek | null = null, naar: Plek | null = null, buitenVan = 0, buitenNaar = 0;
    let soort = this.rng.kies(['hatchback', 'hatchback', 'sedan', 'sedan', 'stationwagen', 'stationwagen', 'suv', 'suv', 'hatchback'] as const) as VoertuigSoort;
    const buiten = () => this.buiten.length ? this.buiten[Math.floor(this.rng.next() * this.buiten.length)] : 0;
    if (r < 0.42) { van = this.kies(P.woning); naar = this.kies(P.werk); }
    else if (r < 0.6) { van = this.kies(P.woning); naar = this.kies(P.winkel); }
    else if (r < 0.75) { van = this.kies(P.werk); naar = this.kies(P.woning); }
    else if (r < 0.84) { soort = 'bestelbus'; van = this.kies(P.industrie) ?? this.kies(P.winkel); naar = this.kies(P.winkel) ?? this.kies(P.woning); }
    else if (r < 0.93) {
      soort = 'vrachtwagen';
      const ind = this.kies(P.industrie);
      if (ind && this.buiten.length) { if (this.rng.next() < 0.5) { van = ind; buitenNaar = buiten(); } else { buitenVan = buiten(); naar = ind; } }
      else { van = ind; naar = this.kies(P.winkel); }
    } else {
      if (this.buiten.length) { buitenVan = buiten(); if (this.rng.next() < 0.4 && this.buiten.length > 1) buitenNaar = buiten(); else naar = this.kies(this.rng.next() < 0.5 ? P.werk : P.winkel); }
      else { van = this.kies(P.woning); naar = this.kies(P.winkel); }
    }
    if (buitenVan && buitenVan === buitenNaar) return false;
    // Start.
    let start: { baan: Baan; s: number } | null = null;
    if (van) start = this.toegang(van);
    else if (buitenVan) {
      const k = this.w.net.knopen.get(buitenVan)!;
      const seg = this.w.net.segmenten.get(k.segs[0])!;
      const lijst = this.stroken.stroken(seg.id, seg.a === buitenVan ? 'A' : 'B');
      if (lijst.length) { const b = lijst[Math.floor(this.rng.next() * lijst.length)]; start = { baan: b, s: 1 }; }
    }
    if (!start) return false;
    // Doelen.
    let doelen: { seg: number; r: 'A' | 'B'; s: number; extra: number }[] = [];
    if (naar) doelen = this.doelOpties(naar);
    else if (buitenNaar) {
      const k = this.w.net.knopen.get(buitenNaar)!;
      const seg = this.w.net.segmenten.get(k.segs[0])!;
      const r2: 'A' | 'B' = seg.b === buitenNaar ? 'A' : 'B';
      const lijst = this.stroken.stroken(seg.id, r2);
      if (lijst.length) doelen = [{ seg: seg.id, r: r2, s: lijst[0].lengte - 1, extra: 0 }];
    }
    if (!doelen.length) return false;
    if (van && naar && van.seg === naar.seg && Math.hypot(van.p.x - naar.p.x, van.p.z - naar.p.z) < 60) return false;
    const route = this.route({ seg: start.baan.seg, r: start.baan.richting, s: start.s }, doelen);
    if (!route) return false;
    const laatste = route[route.length - 1];
    const doel = doelen.find(d => d.seg === laatste.seg && d.r === laatste.r)!;
    return !!this.maak(soort, start, route, doel.s, !!buitenVan, !!van);
  }

  /** Voertuig op de weg zetten (als er ruimte is om in te voegen). */
  private maak(soort: VoertuigSoort, start: { baan: Baan; s: number }, route: { seg: number; r: 'A' | 'B' }[], doelS: number, vanBuiten: boolean, vanGebouw: boolean): Voertuig | null {
    const b = start.baan;
    for (const o of this.voertuigen.values()) if (o.spoor === b.id && Math.abs(o.s - start.s) < 9) return null;
    const f = AFMETING[soort];
    const vracht = soort === 'vrachtwagen' || soort === 'bus';
    const v: Voertuig = {
      id: this.volgende++, soort, lak: this.lak(soort), lengte: f.l,
      spoor: b.id, s: start.s, v: vanBuiten ? b.vmax * 0.8 : 0, a: 0,
      route, ri: 0, doelS,
      v0f: vracht ? 0.85 : soort === 'bestelbus' ? 0.95 : 0.9 + this.rng.next() * 0.2,
      amax: vracht ? 0.8 : soort === 'bestelbus' ? 1.3 : 1.4 + this.rng.next() * 0.8,
      bc: vracht ? 2.0 : 2.6, T: vracht ? 1.7 : 1.0 + this.rng.next() * 0.6,
      res: 0, wacht: 0, vast: 0, zij: vanGebouw ? 2.2 : 0, rem: false, leeftijd: 0,
    };
    this.voertuigen.set(v.id, v);
    this.ritten++;
    return v;
  }

  /**
   * Een voertuig gericht sturen (hulpdiensten): van een plek naar een plek. Geeft het voertuig, of
   * null als er nu geen route of geen ruimte is (dan later opnieuw proberen).
   */
  stuur(soort: VoertuigSoort, van: Plek, naar: Plek, sirene: boolean, opAankomst: (v: Voertuig) => void): Voertuig | null {
    if (this.versie !== this.w.net.versie) return null;
    const start = this.toegang(van);
    if (!start) return null;
    const doelen = this.doelOpties(naar).map(d => ({ ...d, extra: sirene ? 0 : d.extra }));
    if (!doelen.length) return null;
    const route = this.route({ seg: start.baan.seg, r: start.baan.richting, s: start.s }, doelen);
    if (!route) return null;
    const laatste = route[route.length - 1];
    const doel = doelen.find(d => d.seg === laatste.seg && d.r === laatste.r)!;
    const v = this.maak(soort, start, route, doel.s, false, true);
    if (!v) return null;
    v.sirene = sirene; v.opAankomst = opAankomst;
    if (sirene) { v.v0f = 1.3; v.amax = Math.max(v.amax, 2.2); v.T = 0.8; }
    this.ritten--;
    return v;
  }

  // ─── Rijden ──────────────────────────────────────────────────────────────────

  private spoor(id: number): Baan | Verbinding | undefined { return this.stroken.sporen.get(id); }

  /** Verbinding die het voertuig na zijn huidige strook neemt (of null: laatste strook / verkeerde strook). */
  private volgendeVerbinding(v: Voertuig, b: Baan): Verbinding | null {
    const next = v.route[v.ri + 1];
    if (!next) return null;
    // Al gereserveerd: daarbij blijven.
    if (v.res) { const r = this.stroken.verbinding(v.res); if (r && r.van === b.id) return r; }
    let best: Verbinding | null = null, bs = -Infinity;
    const naNa = v.route[v.ri + 2];
    for (const id of b.uit) {
      const c = this.stroken.verbinding(id);
      if (!c || c.doelSeg !== next.seg) continue;
      const doel = this.stroken.baan(c.naar)!;
      if (doel.richting !== next.r) continue;
      // Voorkeur: een doelstrook die bij de afslag daarna past, en een vrije.
      let score = -this.bezetting(doel) * 0.2;
      if (naNa) score += doel.uit.some(u => this.stroken.verbinding(u)?.doelSeg === naNa.seg) ? 2 : 0;
      else score += doel.index === 0 ? 1 : 0;
      if (score > bs) { bs = score; best = c; }
    }
    return best;
  }

  private bezetting(sp: Spoor) { return sp.op.length / Math.max(1, sp.lengte / 8); }

  /** Voorligger op afstand: [gat, snelheid van de voorligger]. */
  private voorligger(v: Voertuig, sp: Baan | Verbinding, i: number, volgende: Verbinding | null): [number, number] {
    // Op hetzelfde spoor.
    for (let j = i + 1; j < sp.op.length; j++) {
      const o = this.voertuigen.get(sp.op[j]);
      if (o) return [o.s - o.lengte - v.s, o.v];
    }
    // Verder vooruit: volgende sporen.
    let afst = sp.lengte - v.s;
    let cur: Baan | Verbinding | null = sp.soort === 'baan' ? volgende : this.stroken.baan(sp.naar);
    for (let n = 0; n < 3 && cur && afst < 120; n++) {
      for (const id of cur.op) { const o = this.voertuigen.get(id); if (o) return [afst + o.s - o.lengte, o.v]; }
      afst += cur.lengte;
      if (cur.soort === 'verbinding') cur = this.stroken.baan(cur.naar);
      else break;
    }
    return [Infinity, 0];
  }

  private idm(v: Voertuig, v0: number, gat: number, vl: number): number {
    const s = v.v;
    const sster = S0 + Math.max(0, s * v.T + s * (s - vl) / (2 * Math.sqrt(v.amax * v.bc)));
    const g = Math.max(0.1, gat);
    return v.amax * (1 - Math.pow(s / Math.max(0.5, v0), 4) - (sster / g) ** 2);
  }

  /** Mag v de verbinding c op? (licht, kruisend verkeer, voorrang, ruimte erachter) */
  private mag(v: Voertuig, c: Verbinding, rest: number): boolean {
    if (v.res === c.id) return true;
    const licht = this.stroken.lichtVoor(c.knoop, c.bron);
    // Met zwaailicht en sirene mag je door rood (wel opletten voor kruisend verkeer).
    if (licht === 'rood' && !v.sirene) return false;
    if (licht === 'oranje' && !v.sirene && rest > (v.v * v.v) / (2 * 3.5) + 1.5) return false;
    // Ruimte op de doelstrook (niet het kruispunt blokkeren).
    const doel = this.stroken.baan(c.naar);
    // Niet het kruispunt op als er achter het kruispunt geen plek is voor iedereen die al die kant op gaat.
    if (doel) {
      const eerste = doel.op.map(id => this.voertuigen.get(id)).find(Boolean);
      const ruimte = eerste ? eerste.s - eerste.lengte - 1 : Math.min(60, doel.lengte);
      let nodig = v.lengte + S0;
      for (const sp of this.stroken.sporen.values()) if (sp.soort === 'verbinding' && sp.naar === doel.id && sp.bezet > 0) nodig += sp.bezet * 7;
      if (nodig > ruimte && (!eerste || eerste.v < 4)) return false;
    }
    if (c.bezet > 0 && c.op.length) { const o = this.voertuigen.get(c.op[0]); if (o && o.s < o.lengte + 1) return false; }
    let vrij = true;
    for (const x of c.conflict) {
      const cx = this.stroken.verbinding(x);
      if (cx && cx.bezet > 0) return false;
    }
    if (v.wacht > 7) return vrij;
    // Voorrang van naderend verkeer op conflicterende verbindingen.
    const mijnEta = rest / Math.max(1.5, v.v);
    const bronMij = this.w.net.segmenten.get(c.bron), mijnIn = this.stroken.baan(c.van)!;
    for (const x of c.conflict) {
      const lijst = this.aangemeld.get(x);
      if (!lijst?.length) continue;
      const cx = this.stroken.verbinding(x)!;
      const anderLicht = this.stroken.lichtVoor(cx.knoop, cx.bron);
      if (anderLicht === 'rood') continue;
      for (const a of lijst) {
        if (a.id === v.id || a.eta > mijnEta + 3.5) continue;
        if (this.voorrang(cx, c, licht !== null, bronMij?.type, mijnIn)) { vrij = false; break; }
      }
      if (!vrij) break;
    }
    return vrij;
  }

  /** Heeft verbinding a voorrang op b? */
  private voorrang(a: Verbinding, b: Verbinding, lichten: boolean, typeB: WegTypeId | undefined, bIn: Baan): boolean {
    const rangA = RANG[this.w.net.segmenten.get(a.bron)?.type ?? 'straat'], rangB = typeB ? RANG[typeB] : 2;
    const rechtdoorA = a.afslag !== 'links' && a.afslag !== 'keer', rechtdoorB = b.afslag !== 'links' && b.afslag !== 'keer';
    if (!lichten && rangA !== rangB) return rangA > rangB;
    if (rechtdoorA !== rechtdoorB) return rechtdoorA;
    if (lichten) return false;
    // Rechts gaat voor: komt a van rechts (gezien vanuit b)?
    const aIn = this.stroken.baan(a.van)!;
    const n = bIn.pts.length, m = aIn.pts.length;
    const db = { x: bIn.pts[n - 1].x - bIn.pts[n - 2].x, z: bIn.pts[n - 1].z - bIn.pts[n - 2].z };
    const da = { x: aIn.pts[m - 1].x - aIn.pts[m - 2].x, z: aIn.pts[m - 1].z - aIn.pts[m - 2].z };
    // Richting naar a's herkomst = -da; rechts van db: kruisproduct > 0.
    return db.x * -da.z - db.z * -da.x > 0;
  }

  /** Probeer van strook te wisselen naar een buurstrook (zelfde richting). */
  private wissel(v: Voertuig, b: Baan, naarIndex: number): boolean {
    const lijst = this.stroken.stroken(b.seg, b.richting);
    const doel = lijst.find(x => x.index === naarIndex);
    if (!doel) return false;
    const s = Math.min(doel.lengte - 1, v.s * doel.lengte / Math.max(1, b.lengte));
    for (const id of doel.op) {
      const o = this.voertuigen.get(id);
      if (!o) continue;
      const voor = o.s - o.lengte - s, achter = s - v.lengte - o.s;
      if (o.s >= s && voor < 3 + v.v * 0.4) return false;
      if (o.s < s && achter < 4 + Math.max(0, o.v - v.v) * 1.5 + o.v * 0.3) return false;
    }
    // Visueel nog op de oude strook: die ligt rechts (positief) als we naar links wisselen.
    v.zij += (naarIndex - b.index) * 3.2;
    this.laatLos(v);
    v.spoor = doel.id; v.s = s;
    return true;
  }

  /** Reservering van een verbinding opgeven. */
  private laatLos(v: Voertuig) {
    if (!v.res) return;
    const c = this.stroken.verbinding(v.res);
    if (c && this.spoor(v.spoor) !== c) c.bezet = Math.max(0, c.bezet - 1);
    v.res = 0;
  }

  private verwijder(v: Voertuig) {
    this.laatLos(v);
    const sp = this.spoor(v.spoor);
    if (sp?.soort === 'verbinding') sp.bezet = Math.max(0, sp.bezet - 1);
    this.voertuigen.delete(v.id);
  }

  stap(dtEcht: number) {
    const dt = Math.min(0.25, dtEcht) * this.w.snelheid;
    // Rijstrookgraaf bijwerken na wegwerk (even wachten tot het tekenen klaar is).
    if (this.w.net.versie !== this.versie) {
      this.bouwKlok += dtEcht;
      if (this.bouwKlok > 0.25 || this.versie < 0) { this.versie = this.w.net.versie; this.bouwKlok = 0; this.herbouw(); this.plekKlok = 99; }
    }
    if (dt <= 0) return;
    this.plekKlok += dtEcht;
    if (this.plekKlok > 5) { this.plekKlok = 0; this.verzamelPlekken(); }
    // Vraag per knoop en aanvoerend segment (uit de aanmeldingen bij de kruispunten).
    const vraag = new Map<string, number>();
    for (const [cid, lijst] of this.aangemeld) {
      const c = this.stroken.verbinding(cid);
      if (c) vraag.set(`${c.knoop}:${c.bron}`, (vraag.get(`${c.knoop}:${c.bron}`) ?? 0) + lijst.length);
    }
    this.stroken.stapLichten(dt, (k, s) => vraag.get(`${k}:${s}`) ?? 0);

    // Nieuwe ritten tot het gewenste aantal (naar inwoners en banen).
    const st = this.w.stat;
    const gewenst = Math.min(this.max, Math.round(st.inwoners * 0.014 + st.banen * 0.003 + (this.buiten.length ? 8 : 0)));
    this.spawnKlok += dt;
    let pogingen = 0;
    while (this.voertuigen.size < gewenst && this.spawnKlok > 0.05 && pogingen++ < 6) { this.spawnKlok -= 0.05; this.nieuweRit(); }
    if (this.spawnKlok > 1) this.spawnKlok = 1;

    // In stappen van hooguit 0,1 s.
    const n = Math.max(1, Math.ceil(dt / 0.1));
    for (let i = 0; i < n; i++) this.deelstap(dt / n);
  }

  private deelstap(dt: number) {
    // Lijsten per spoor, gesorteerd op afstand.
    for (const sp of this.stroken.sporen.values()) sp.op.length = 0;
    for (const v of this.voertuigen.values()) {
      const sp = this.spoor(v.spoor);
      if (!sp) { this.voertuigen.delete(v.id); continue; }
      sp.op.push(v.id);
    }
    for (const sp of this.stroken.sporen.values()) if (sp.op.length > 1) sp.op.sort((a, b) => this.voertuigen.get(a)!.s - this.voertuigen.get(b)!.s);
    // Aanmeldingen bij kruispunten (voor voorrang), van de vorige stap.
    const aangemeld = new Map<number, { id: number; eta: number }[]>();
    let somV = 0, somV0 = 0;
    for (const v of this.voertuigen.values()) {
      const sp = this.spoor(v.spoor)!;
      const i = sp.op.indexOf(v.id);
      v.leeftijd += dt;
      let v0 = sp.vmax * v.v0f;
      let volgende: Verbinding | null = null;
      let stop = Infinity; // afstand tot een verplichte stop
      if (sp.soort === 'baan') {
        const rest = sp.lengte - v.s;
        const laatste = v.ri >= v.route.length - 1;
        if (laatste) {
          stop = v.doelS - v.s + 0.5;
          // Rechts aanhouden voor het parkeren.
          if (sp.index > 0 && v.doelS - v.s < 160 && v.zij === 0) this.wissel(v, sp, sp.index - 1);
        } else {
          volgende = this.volgendeVerbinding(v, sp);
          if (!volgende) {
            // Verkeerde strook: voorsorteren naar een strook die er wel heen gaat.
            const lijst = this.stroken.stroken(sp.seg, sp.richting);
            const next = v.route[v.ri + 1];
            const goed = lijst.filter(b => b.uit.some(u => { const c = this.stroken.verbinding(u); return c && c.doelSeg === next.seg && this.stroken.baan(c.naar)?.richting === next.r; }));
            if (goed.length && Math.abs(v.zij) < 0.5) {
              const doelIndex = goed.reduce((m, b) => Math.abs(b.index - sp.index) < Math.abs(m - sp.index) ? b.index : m, goed[0].index);
              this.wissel(v, sp, sp.index + Math.sign(doelIndex - sp.index));
            }
            stop = rest - 2;
            if (v.v < 0.3 && rest < 12) v.vast += dt;
            if (v.vast > 12) {
              // Geen kans om voor te sorteren: een andere route vanaf hier.
              const c = sp.uit.map(u => this.stroken.verbinding(u)).find(Boolean);
              if (c) v.route = [...v.route.slice(0, v.ri + 1), { seg: c.doelSeg, r: this.stroken.baan(c.naar)!.richting }];
              v.doelS = 20; v.vast = 0;
            }
          } else {
            // Bochtsnelheid: op tijd afremmen voor de verbinding.
            v0 = Math.min(v0, Math.sqrt(volgende.vmax * volgende.vmax + 2 * 1.8 * Math.max(0, rest)));
            if (rest < 45) { let l = aangemeld.get(volgende.id); if (!l) aangemeld.set(volgende.id, l = []); l.push({ id: v.id, eta: rest / Math.max(1.5, v.v) }); }
            const remweg = (v.v * v.v) / (2 * v.bc) + 4;
            if (v.res !== volgende.id && rest < Math.max(remweg + 2, 6)) {
              if (this.mag(v, volgende, rest)) { volgende.bezet++; v.res = volgende.id; v.wacht = 0; }
              else { stop = rest - 0.8; if (v.v < 0.5) v.wacht += dt; }
            }
          }
        }
      }
      const [gat, vl] = this.voorligger(v, sp, i, volgende);
      let a = this.idm(v, v0, gat, vl);
      if (stop < Infinity) a = Math.min(a, this.idm(v, v0, stop + S0, 0));
      if (v.leeftijd < 2.5 && v.v < 3) a = Math.min(a, 1.2); // rustig wegrijden
      a = Math.max(-9, Math.min(v.amax, a));
      v.rem = a < -0.8 || (v.v < 0.2 && stop < 6);
      v.a = a;
      v.v = Math.max(0, v.v + a * dt);
      v.s += v.v * dt;
      v.zij *= Math.exp(-dt * 1.2); if (Math.abs(v.zij) < 0.03) v.zij = 0;
      somV += v.v; somV0 += Math.max(1, v0);
      // Naar het volgende spoor.
      let veilig = 0;
      while (veilig++ < 4) {
        const cur = this.spoor(v.spoor)!;
        if (cur.soort === 'baan' && v.ri >= v.route.length - 1 && v.s >= v.doelS - 0.3) { v.opAankomst?.(v); this.verwijder(v); break; }
        if (v.s < cur.lengte) break;
        if (cur.soort === 'baan') {
          if (v.res && this.stroken.verbinding(v.res)?.van === cur.id) { v.s -= cur.lengte; v.spoor = v.res; }
          else { v.s = cur.lengte; v.v = 0; break; }
        } else {
          v.s -= cur.lengte; v.spoor = cur.naar; v.ri++;
          cur.bezet = Math.max(0, cur.bezet - 1); v.res = 0;
        }
      }
      if (v.v < 0.2) v.vast += dt; else v.vast = Math.max(0, v.vast - dt * 2);
      if (v.vast > 75 && this.voertuigen.has(v.id)) this.verwijder(v); // hopeloos vast: verdwijnt (zoals in CS)
    }
    this.aangemeld = aangemeld;
    this.doorstroming += ((somV0 > 0 ? Math.min(1, somV / somV0 * 1.25) : 1) - this.doorstroming) * Math.min(1, dt * 0.2);
  }

  /** Halve breedte van de weg onder een voertuig (voor de render-laag niet nodig, wel voor testen). */
  static wegBreedte(type: WegTypeId) { return halveBreedte(type); }
}
