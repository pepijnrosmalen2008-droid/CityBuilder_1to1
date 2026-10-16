import { V2, V3, dist2, lerp2, bezier2, norm2, sub2 } from './math';
import { Wereld } from './wereld';

import { WegTypeId, halveBreedte, WEGTYPEN } from './wegen/typen';
import { Wegennet } from './wegen/netwerk';
import { Zone, zoneKleur, ZONES } from './zones';
import type { Bord, Verbod } from './verkeer/regels';
import { wegeindeBij, kruispuntBij, maakHoofdweg, hoofdwegKeten } from './verkeer/tmpe';
import { Verplaatser } from './verplaats';
import { Grondstof, GRONDSTOFFEN, HoofdPlek } from './economie';
import { DienstSoort, DIENSTEN, NUT_EENHEID } from './voorzieningen';
import { getekendOppervlak, afstandTotLijn } from './poly';
import { PERCEEL_BREEDTE, vrijeDiepte } from './percelen';

// Gereedschap met abstracte invoer: de render-/ui-laag geeft het grondpunt onder de muis en de
// knoppen door; dit bestand bepaalt wat er gebeurt en welk voorbeeld getekend moet worden.

export type Modus = 'weg' | 'zone' | 'district' | 'gebied' | 'dienst' | 'opwaarderen' | 'sloop' | 'kijk' | 'verkeer' | 'verplaats';
/** Onderdelen van het verkeersgereedschap (zoals TM:PE). */
export type VerkeerTool = 'voorrang' | 'hoofdweg' | 'lichten' | 'pijlen' | 'regels' | 'snelheid' | 'verbod';

/** Tekenstijl van het wegengereedschap (zoals in Cities: Skylines). */
export type Stijl = 'recht' | 'bocht' | 'vrij' | 'raster';

/** Hulplijn: oneindige lijn door p met richting d. */
export interface Hulplijn { p: V2; d: V2; soort: 'verlengde' | 'haaks' | 'blok' | 'hoek' }

/** Kavelvoorbeeld langs één kant van de spookweg. */
export interface KavelBand { voor: V3[]; achter: V3[]; streepjes: [V3, V3][] }

export type Voorbeeld =
  | { soort: 'geen' }
  | { soort: 'weg'; as: V3[]; breedte: number; geldig: boolean; tekst: string; punten: V3[]; lijnen: [V3, V3][]; snap: V3 | null; kavels: KavelBand[]; meer?: V3[][] }
  | { soort: 'penseel'; m: V3; r: number; kleur: string }
  | { soort: 'zoneSel'; kavels: number[]; kleur: string; tekst: string; kader: V3[] | null; m: V3 | null; r: number }
  | { soort: 'markeer'; segmenten?: number[]; segment?: number; gebouw?: number; gebied?: number; dienst?: number; kleur: string; tekst: string }
  | { soort: 'dienst'; voet: V3[]; geldig: boolean; tekst: string }
  | { soort: 'verplaats'; sel: [V3, V3][]; geest: [V3, V3][]; segmenten: number[]; greep: V3 | null; veld: V3[] | null; tekst: string }
  | { soort: 'gebied'; punten: V3[]; kleur: string; tekst: string; dicht: boolean; hoofd: { p: V3; rot: number; geldig: boolean } | null };

export class Gereedschap {
  modus: Modus = 'weg';
  wegtype: WegTypeId = 'straat';
  stijl: Stijl = 'recht';
  /** Hoogte van nieuwe knopen ten opzichte van het maaiveld (m, stappen van 4). */
  niveau = 0;
  afronden = true;
  hulplijnen = true;
  /** Laatste snapresultaat (voor het voorbeeld). */
  private laatsteSnap: { p: V2; lijnen: Hulplijn[]; soort: string } | null = null;
  private kavelCache: { sleutel: string; banden: KavelBand[] } | null = null;
  get bocht() { return this.stijl === 'bocht'; }
  zone: Zone = 'wonenLaag';
  penseel = 22;
  /** Zoneergereedschap zoals in Cities: Skylines: vullen (bouwblok), selectie (rechthoek), penseel. */
  zoneTool: 'vullen' | 'selectie' | 'penseel' = 'vullen';
  private selStart: V2 | null = null;
  /** District waarmee geschilderd wordt (0 = gum). */
  district = 0;
  gum = false;
  melding = '';
  private start: V2 | null = null;
  private ctrl: V2 | null = null;
  /** Richting waarin een bocht vanaf het startpunt vloeiend doorloopt (wegeinde of vorige bocht). */
  private raak: V2 | null = null;
  /** Referentierichting voor hoeksnappen (de weg waar je op aansluit). */
  private ref: V2 | null = null;
  private muis: V3 | null = null;
  private schilderen = false;
  /** Slepen met slopen of opwaarderen (zoals in CS): alles onder de muis wordt meegenomen. */
  private slepen = false;
  private gesleept = new Set<string>();
  private sleepPunt: V2 | null = null;
  private verbodAan = true;
  /** Raster: tweede punt (richting en lengte). */
  private rasterB: V2 | null = null;
  /** Parallel bouwen: afstand van de tweede weg (0 = uit), rechts van de tekenrichting. */
  parallel = 0;
  private schilderKlok = 0;
  private meldingKlok = 0;
  grondstof: Grondstof = 'landbouw';
  dienst: DienstSoort = 'windmolen';
  /** Geselecteerd gebouw of voorziening (Kijken). */
  selectie: { soort: 'gebouw' | 'dienst'; id: number } | null = null;
  private gebiedPunten: V2[] = [];
  /** Verkeersgereedschap (TM:PE). */
  verkeerTool: VerkeerTool = 'voorrang';
  /** Gekozen maximumsnelheid (km/u; undefined = standaard van het wegtype). */
  snelheidKeuze: number | undefined = 30;
  verbodKeuze: Verbod = 'vracht';
  /** Bord voor de zijwegen van een voorrangsweg. */
  zijBord: Bord = 'geef';
  private hoofd: HoofdPlek | null = null;

  /** Verplaatsen (Move It). */
  verplaatser: Verplaatser;
  /** Shift ingedrukt bij de laatste klik (gezet door de invoerlaag). */
  shift = false;
  /** Knop 'Meerdere' (voor aanraakschermen): elke klik voegt toe of haalt weg. */
  shiftVast = false;
  /** Rechthoek op de grond tijdens het selecteren (gezet door de invoerlaag, uit schermhoeken). */
  veld: V2[] | null = null;
  /** Plakken: het klembord hangt aan de muis tot je klikt. */
  plakModus = false;
  plakHoek = 0;
  /** Kijkrichting van de camera op de grond (voor de pijltjestoetsen). */
  kijk: V2 = { x: 0, z: -1 };
  private mSleep: { van: V2; soort: 'schuif' | 'buig' | 'veld'; seg?: number } | null = null;
  private selCache: { sleutel: string; lijnen: [V3, V3][] } | null = null;

  constructor(private wereld: Wereld) { this.verplaatser = new Verplaatser(wereld); }

  /** Is er een rechthoekselectie bezig? (dan geeft de invoerlaag de schermhoeken door) */
  get selecteertVeld() { return this.modus === 'verplaats' && this.mSleep?.soort === 'veld'; }

  /** Wordt er een weg getekend (startpunt gezet)? */
  get tekent() { return (this.modus === 'weg' && !!this.start) || (this.modus === 'gebied' && this.gebiedPunten.length > 0); }

  /** Gebied afronden (knop of klik op het eerste punt). */
  rondGebiedAf() {
    if (this.gebiedPunten.length < 3) { this.melding = 'Zet minstens drie punten'; return; }
    const fout = this.wereld.economie.maakGebied(this.grondstof, this.gebiedPunten, this.hoofd);
    if (fout) this.melding = fout; else { this.gebiedPunten = []; this.hoofd = null; }
  }

  zetModus(m: Modus) { this.modus = m; this.annuleer(); this.plakModus = false; this.mSleep = null; this.veld = null; this.melding = ''; if (m !== 'kijk') this.selectie = null; }
  annuleer() { this.rasterB = null; this.slepen = false; this.start = null; this.ctrl = null; this.raak = null; this.ref = null; this.schilderen = false; this.gebiedPunten = []; this.hoofd = null; }

  /** Begin op p: onthoud de richting van een aansluitende weg (doorlopen en hoeksnappen). */
  private begin(p: V2) {
    this.start = p; this.raak = null; this.ref = null;
    const net = this.wereld.net;
    const k = net.knoopBij(p, 0.5);
    if (!k || !k.segs.length) return;
    const seg = net.segmenten.get(k.segs[0])!;
    const w = net.wegVan(seg, k.id);
    this.ref = w;
    if (k.segs.length === 1) this.raak = { x: -w.x, z: -w.z };
  }

  /** Controlepunt voor een vloeiende bocht vanaf de start met raaklijn `raak` naar b. */
  private vloeiend(b: V2): V2 | null {
    if (!this.start || !this.raak) return null;
    const d = sub2(b, this.start), L2 = d.x * d.x + d.z * d.z;
    const td = this.raak.x * d.x + this.raak.z * d.z;
    if (L2 < 1 || td < Math.sqrt(L2) * 0.15) return null;
    const k = Math.min(L2 / (2 * td), Math.sqrt(L2) * 1.2);
    return { x: this.start.x + this.raak.x * k, z: this.start.z + this.raak.z * k };
  }

  static readonly NIVEAU_STAP = 4;
  static readonly NIVEAU_MIN = -16;
  static readonly NIVEAU_MAX = 24;
  hoger(stap: number) { this.niveau = Math.max(Gereedschap.NIVEAU_MIN, Math.min(Gereedschap.NIVEAU_MAX, this.niveau + stap * Gereedschap.NIVEAU_STAP)); }

  /** Hulplijnen van wegen in de buurt: verlengden, haakse lijnen en evenwijdige lijnen op blokafstand. */
  private hulplijnenBij(p: V2): Hulplijn[] {
    const net = this.wereld.net;
    const r: Hulplijn[] = [];
    const hbN = halveBreedte(this.wegtype);
    for (const seg of net.segmenten.values()) {
      const A = net.knopen.get(seg.a)!, B = net.knopen.get(seg.b)!;
      if (Math.min(dist2(A.p, p), dist2(B.p, p), afstandTotLijn(p, seg.pad).d) > 260) continue;
      for (const K of [A, B]) {
        const uit = net.wegVan(seg, K.id); // de weg in
        const d = { x: -uit.x, z: -uit.z };
        r.push({ p: K.p, d, soort: 'verlengde' });
        r.push({ p: K.p, d: { x: -d.z, z: d.x }, soort: 'haaks' });
      }
      // Evenwijdig op blokafstand: twee gevelstroken rug aan rug (compact 2×25 m, ruim 2×50 m).
      const mid = lerp2(A.p, B.p, 0.5);
      if (dist2(seg.c, mid) < 1 && seg.lengte > 20) {
        const d = norm2(sub2(B.p, A.p)), n = { x: -d.z, z: d.x };
        const hb = halveBreedte(seg.type);
        for (const diep of [25, 50]) for (const k of [1, -1]) {
          const o = hb + hbN + 2 * diep;
          r.push({ p: { x: A.p.x + n.x * o * k, z: A.p.z + n.z * o * k }, d, soort: 'blok' });
        }
      }
    }
    // Ontdubbelen (aaneengesloten rechte wegen geven dezelfde lijn).
    const uniek: Hulplijn[] = [];
    for (const l of r) {
      if (uniek.some(u => Math.abs(u.d.x * l.d.z - u.d.z * l.d.x) < 0.01 && Math.abs((l.p.x - u.p.x) * u.d.z - (l.p.z - u.p.z) * u.d.x) < 0.5)) continue;
      uniek.push(l);
    }
    return uniek;
  }

  /**
   * Snappen in de volgorde van Cities: Skylines: knoop, weg, kruising van hulplijnen, hulplijn,
   * en anders hoek (15°) en lengte (hele meters) vanaf het startpunt.
   */
  private snap(p: V2): V2 {
    const net = this.wereld.net;
    this.laatsteSnap = null;
    const k = net.knoopBij(p, Math.max(8, halveBreedte(this.wegtype) + 2));
    if (k) { this.laatsteSnap = { p: k.p, lijnen: [], soort: 'knoop' }; return { ...k.p }; }
    const s = net.segmentBij(p, 2);
    if (s) {
      const A = net.knopen.get(s.seg.a)!, B = net.knopen.get(s.seg.b)!;
      const q = bezier2(A.p, s.seg.c, B.p, s.t);
      this.laatsteSnap = { p: q, lijnen: [], soort: 'weg' };
      return q;
    }
    if (this.hulplijnen) {
      const lijnen = this.hulplijnenBij(p);
      // Vanaf het startpunt: de hoekstralen tellen ook als hulplijn (voor kruisingen).
      if (this.start && this.stijl !== 'vrij') {
        const ref = this.ref ?? { x: 1, z: 0 };
        const h0 = Math.atan2(ref.z, ref.x);
        for (let i = 0; i < 12; i++) lijnen.push({ p: this.start, d: { x: Math.cos(h0 + i * Math.PI / 12), z: Math.sin(h0 + i * Math.PI / 12) }, soort: 'hoek' });
      }
      const afst = (l: Hulplijn) => Math.abs((p.x - l.p.x) * l.d.z - (p.z - l.p.z) * l.d.x);
      const dichtbij = lijnen.map(l => ({ l, a: afst(l) })).filter(x => x.a < 7).sort((a, b) => a.a - b.a);
      // Kruising van twee hulplijnen.
      let best: { q: V2; d: number; l: Hulplijn[] } | null = null;
      for (let i = 0; i < dichtbij.length; i++) for (let j = i + 1; j < dichtbij.length; j++) {
        const L1 = dichtbij[i].l, L2 = dichtbij[j].l;
        if (L1.soort === 'hoek' && L2.soort === 'hoek') continue;
        const den = L1.d.x * L2.d.z - L1.d.z * L2.d.x;
        if (Math.abs(den) < 0.2) continue;
        const t = ((L2.p.x - L1.p.x) * L2.d.z - (L2.p.z - L1.p.z) * L2.d.x) / den;
        const q = { x: L1.p.x + L1.d.x * t, z: L1.p.z + L1.d.z * t };
        const d = dist2(q, p);
        if (d < 8 && (!best || d < best.d)) best = { q, d, l: [L1, L2] };
      }
      if (best) { this.laatsteSnap = { p: best.q, lijnen: best.l, soort: 'kruis' }; return best.q; }
      const een = dichtbij.find(x => x.l.soort !== 'hoek' && x.a < 4) ?? (dichtbij[0] && dichtbij[0].a < 2.5 ? dichtbij[0] : undefined);
      if (een) {
        const l = een.l, t = (p.x - l.p.x) * l.d.x + (p.z - l.p.z) * l.d.z;
        let q = { x: l.p.x + l.d.x * t, z: l.p.z + l.d.z * t };
        // Langs een hoekstraal: lengte afronden.
        if (l.soort === 'hoek') { const len = Math.round(t / 2) * 2; q = { x: l.p.x + l.d.x * len, z: l.p.z + l.d.z * len }; }
        this.laatsteSnap = { p: q, lijnen: [l], soort: 'lijn' };
        return q;
      }
    }
    return { x: Math.round(p.x), z: Math.round(p.z) };
  }

  /** Eindpunt: snappen, en anders lengte op hele meters en hoek op 15° (rechte stukken). */
  private eindpunt(p: V2): V2 {
    const s = this.snap(p);
    if (!this.start || this.laatsteSnap) return s;
    const d = sub2(s, this.start), l = Math.round(Math.hypot(d.x, d.z) / 2) * 2;
    let n = norm2(d);
    if (this.stijl === 'recht' || !this.raak) {
      const ref = this.ref ?? { x: 1, z: 0 };
      const h = Math.atan2(n.z, n.x), h0 = Math.atan2(ref.z, ref.x);
      const stap = Math.PI / 12, rel = h - h0;
      const doel = Math.round(rel / stap) * stap;
      if (Math.abs(rel - doel) < 0.045) n = { x: Math.cos(h0 + doel), z: Math.sin(h0 + doel) };
    }
    return { x: this.start.x + n.x * l, z: this.start.z + n.z * l };
  }

  /** Controlepunt voor het segment van start naar b volgens de tekenstijl (null = nog een klik nodig). */
  private controle(b: V2): { c: V2 | null; wacht: boolean } {
    if (!this.start) return { c: null, wacht: false };
    if (this.stijl === 'recht') return { c: lerp2(this.start, b, 0.5), wacht: false };
    if (this.stijl === 'vrij') {
      if (!this.raak) return { c: lerp2(this.start, b, 0.5), wacht: false };
      const v = this.vloeiend(b);
      return { c: v ?? lerp2(this.start, b, 0.5), wacht: false };
    }
    // Bocht: vloeiend doorlopen als dat kan, anders eerst het bochtpunt klikken.
    if (this.ctrl) return { c: this.ctrl, wacht: false };
    const v = this.vloeiend(b);
    return v ? { c: v, wacht: false } : { c: null, wacht: true };
  }

  /** Hoogte van een punt op de spookweg. */
  private hoogteVan(p: V2): number {
    const k = this.wereld.net.knoopBij(p, 0.5);
    return k ? k.y : this.wereld.terrein.hoogte(p.x, p.z) + this.niveau;
  }

  /** Kavelvoorbeeld (de balkjes): bouwgrond aan beide kanten van de spookweg, met perceelgrenzen. */
  private kavelBanden(a: V2, c: V2, b: V2): KavelBand[] {
    if (!WEGTYPEN[this.wegtype].erf || this.niveau !== 0) return [];
    const sleutel = [a.x, a.z, c.x, c.z, b.x, b.z, this.wegtype].map(x => typeof x === 'number' ? x.toFixed(1) : x).join(',');
    if (this.kavelCache?.sleutel === sleutel) return this.kavelCache.banden;
    const t = this.wereld.terrein, net = this.wereld.net;
    const hb = halveBreedte(this.wegtype) + 0.05;
    const m = Wegennet.bemonster(a, c, b, 4);
    const L = m[m.length - 1].s;
    const banden: KavelBand[] = [];
    // Niet tot in de kruispunten aan de uiteinden.
    const s0 = 6, s1 = L - 6;
    if (s1 - s0 < 8) { this.kavelCache = { sleutel, banden }; return banden; }
    for (const zijde of [1, -1]) {
      const voor: V3[] = [], achter: V3[] = [], diepte: number[] = [], ss: number[] = [];
      for (const q of m) {
        if (q.s < s0 - 0.01 || q.s > s1 + 0.01) continue;
        const n = { x: -q.d.z * zijde, z: q.d.x * zijde };
        const v = { x: q.p.x + n.x * hb, z: q.p.z + n.z * hb };
        const d = Math.min(32, vrijeDiepte(net, t, v, n));
        const e = { x: v.x + n.x * d, z: v.z + n.z * d };
        voor.push({ x: v.x, y: t.hoogte(v.x, v.z), z: v.z });
        achter.push({ x: e.x, y: t.hoogte(e.x, e.z), z: e.z });
        diepte.push(d); ss.push(q.s);
      }
      if (voor.length < 2 || Math.max(...diepte) < 6) continue;
      // Perceelgrenzen zoals verdeel() ze legt.
      const n = Math.max(1, Math.round((s1 - s0) / PERCEEL_BREEDTE));
      const streepjes: [V3, V3][] = [];
      for (let i = 0; i <= n; i++) {
        const sv = s0 + (s1 - s0) * i / n;
        let j = 0; while (j < ss.length - 2 && ss[j + 1] < sv) j++;
        const f = Math.max(0, Math.min(1, (sv - ss[j]) / Math.max(1e-6, ss[j + 1] - ss[j])));
        const lp = (A: V3, B: V3): V3 => ({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, z: A.z + (B.z - A.z) * f });
        streepjes.push([lp(voor[j], voor[j + 1]), lp(achter[j], achter[j + 1])]);
      }
      banden.push({ voor, achter, streepjes });
    }
    this.kavelCache = { sleutel, banden };
    return banden;
  }

  beweeg(grond: V3 | null) { this.muis = grond; }

  /** Linkermuisknop ingedrukt. */
  klik(grond: V3 | null) {
    if (!grond) return;
    const p = { x: grond.x, z: grond.z };
    const w = this.wereld;
    switch (this.modus) {
      case 'weg': {
        if (this.stijl === 'raster') { this.rasterKlik(this.snap(p)); return; }
        if (!this.start) { this.begin(this.snap(p)); return; }
        const b0 = this.eindpunt(p);
        const { c: c0, wacht } = this.controle(b0);
        if (wacht) { this.ctrl = { ...this.snap(p) }; return; }
        const b = b0, c = c0 ?? lerp2(this.start, b, 0.5);
        {
          const ya = this.hoogteVan(this.start), yb = this.hoogteVan(b), L = dist2(this.start, c) + dist2(c, b);
          const kA = w.net.knoopBij(this.start, 0.5), kB = w.net.knoopBij(b, 0.5);
          if ((this.niveau !== 0 || !!kA?.niveau || !!kB?.niveau) && Math.abs(yb - ya) / Math.max(1, L) > 0.12) { this.melding = 'Te steil: maak de weg langer'; return; }
        }
        const par = this.parallel ? this.verschuif(this.start, c, b, this.parallel) : null;
        const r = w.legWeg(this.start, c, b, this.wegtype, this.niveau, this.afronden && this.stijl === 'recht');
        if (r.ok && par) w.legWeg(par[0], par[1], par[2], this.wegtype, this.niveau, false);
        if (r.ok) {
          // Verder vanaf het eindpunt; bocht en vrij lopen vloeiend door.
          const raak = norm2(sub2(b, c));
          this.begin(b);
          if (this.stijl !== 'recht') this.raak = raak;
          this.ref = raak;
          this.ctrl = null; this.melding = '';
        } else this.melding = r.fout ?? '';
        return;
      }
      case 'zone':
        if (this.zoneTool === 'penseel') { this.schilderen = true; this.schilder(p); return; }
        if (this.zoneTool === 'vullen') { const k = w.kavelOp(p); if (k) w.zoneerKavels(w.blokVan(k), this.zone); return; }
        this.selStart = p; return;
      case 'district':
        if (!this.gum && !w.districten.lijst.has(this.district)) { this.melding = 'Maak eerst een district (Nieuw district)'; return; }
        this.schilderen = true; this.schilder(p); return;
      case 'gebied': {
        const pp = this.gebiedPunten;
        if (!pp.length) {
          // Eerst het hoofdgebouw aan de weg; het gebied begint bij de stoep ernaast.
          const h = w.economie.hoofdPlek(p);
          if (!h) { this.melding = 'Begin naast een weg: daar komt het hoofdgebouw'; return; }
          this.hoofd = h;
          pp.push(h.weg);
          return;
        }
        if (pp.length >= 3 && dist2(p, pp[0]) < 14) { this.rondGebiedAf(); return; }
        pp.push(p);
        return;
      }
      case 'opwaarderen': {
        this.slepen = true; this.gesleept.clear(); this.sleepPunt = null;
        this.sleepStap(p);
        return;
      }
      case 'verkeer': this.verkeerKlik(p); return;
      case 'verplaats': this.verplaatsKlik(p); return;
      case 'dienst': {
        const fout = w.voorzieningen.bouw(this.dienst, p);
        if (fout) this.melding = fout;
        return;
      }
      case 'kijk': {
        const vz = w.voorzieningen.dienstOp(p);
        const g = vz ? null : w.gebouwOp(p);
        this.selectie = vz ? { soort: 'dienst', id: vz.id } : g ? { soort: 'gebouw', id: g.id } : null;
        return;
      }
      case 'sloop': {
        this.slepen = true; this.gesleept.clear(); this.sleepPunt = null;
        this.sleepStap(p);
        return;
      }
    }
  }

  private verplaatsKlik(p: V2) {
    const m = this.verplaatser;
    if (this.plakModus) { const f = m.plak(p, this.plakHoek); this.plakModus = false; if (f) this.melding = f; return; }
    const gr = m.greep();
    if (gr && dist2(p, gr.p) < 4.5) { this.mSleep = { van: p, soort: 'buig', seg: gr.seg }; return; }
    const d = m.raak(p);
    if (d) {
      if (this.shift) { m.wissel(d); return; }
      if (!m.heeft(d)) m.kies(d);
      this.mSleep = { van: p, soort: 'schuif' };
      return;
    }
    this.mSleep = { van: p, soort: 'veld' };
  }

  private verplaatsLos() {
    const s = this.mSleep, m = this.verplaatser, q = this.muis ? { x: this.muis.x, z: this.muis.z } : null;
    this.mSleep = null;
    if (!s || !q) { this.veld = null; return; }
    const d = { x: q.x - s.van.x, z: q.z - s.van.z }, ver = Math.hypot(d.x, d.z) > 0.3;
    if (s.soort === 'schuif' && ver) { if (!m.verschuif(d)) this.melding = 'Zo wordt een weg te kort'; }
    else if (s.soort === 'buig' && ver && s.seg !== undefined) m.buig(s.seg, q);
    else if (s.soort === 'veld') {
      if (this.veld && ver) m.inVeld(this.veld, this.shift);
      else if (!this.shift) m.leegmaken();
    }
    this.veld = null;
  }

  /** Sneltoetsen van het verplaatsgereedschap. Geeft true als de toets gebruikt is. */
  verplaatsToets(k: string, shift: boolean, ctrl: boolean): boolean {
    if (this.modus !== 'verplaats') return false;
    const m = this.verplaatser;
    const meld = (n: string | null, t: string) => { this.melding = n ? `${t}: ${n.toLowerCase()}` : `Niets om ${t.toLowerCase()}`; };
    if (ctrl) {
      if (k === 'z' && !shift) { meld(m.terug(), 'Ongedaan'); return true; }
      if (k === 'y' || (k === 'z' && shift)) { meld(m.opnieuw(), 'Opnieuw'); return true; }
      if (k === 'c') { if (m.kopieer()) this.melding = 'Gekopieerd · Ctrl+V om te plakken'; return true; }
      if (k === 'v') { if (m.heeftKlembord) { this.plakModus = true; this.plakHoek = 0; } else this.melding = 'Kopieer eerst iets (Ctrl+C)'; return true; }
      if (k === 'a') return false;
      return false;
    }
    if (k === 'delete' || k === 'backspace') { m.verwijder(); return true; }
    const stap = shift ? 8 : 1, hoek = (shift ? 1 : 15) * Math.PI / 180;
    if (this.plakModus && (k === 'q' || k === 'e')) { this.plakHoek += k === 'q' ? -hoek : hoek; return true; }
    if (m.leeg) return false;
    if (k === 'q' || k === 'e') { m.draai(k === 'q' ? -hoek : hoek); return true; }
    if (k === 'pageup' || k === 'pagedown') { m.hoogte(k === 'pageup' ? (shift ? 4 : 1) : (shift ? -4 : -1)); return true; }
    const f = this.kijk, r = { x: -f.z, z: f.x };
    const pijl: Record<string, V2> = { arrowup: f, arrowdown: { x: -f.x, z: -f.z }, arrowright: r, arrowleft: { x: -r.x, z: -r.z } };
    if (pijl[k]) { m.verschuif({ x: pijl[k].x * stap, z: pijl[k].z * stap }); return true; }
    return false;
  }

  /** Lijnen rond de selectie (gecachet tot de selectie of de wereld verandert). */
  private selectieLijnen(): [V3, V3][] {
    const w = this.wereld, m = this.verplaatser, t = w.terrein;
    const sleutel = `${m.versie}|${w.net.versie}|${w.gebouwen.size}`;
    if (this.selCache?.sleutel === sleutel) return this.selCache.lijnen;
    const l: [V3, V3][] = [];
    const y = (p: V2) => Math.max(t.hoogte(p.x, p.z), 0) + 0.7;
    const ring = (pts: V2[], hoog = 0) => { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; l.push([{ x: a.x, y: y(a) + hoog, z: a.z }, { x: b.x, y: y(b) + hoog, z: b.z }]); } };
    const cirkel = (c: V2, r: number, yy?: number) => { const pts = Array.from({ length: 16 }, (_, k) => ({ x: c.x + Math.cos(k / 16 * Math.PI * 2) * r, z: c.z + Math.sin(k / 16 * Math.PI * 2) * r })); for (let i = 0; i < 16; i++) { const a = pts[i], b = pts[(i + 1) % 16]; l.push([{ x: a.x, y: yy ?? y(a), z: a.z }, { x: b.x, y: yy ?? y(b), z: b.z }]); } };
    for (const id of m.sel.knoop) { const k = w.net.knopen.get(id); if (k) cirkel(k.p, 4, Math.max(k.y, 0) + 0.9); }
    for (const id of m.sel.gebouw) { const g = w.gebouwen.get(id); if (g) { ring(g.voet); const h = g.lagen.reduce((s, x) => s + x.hoogte, 0); ring(g.voet, h + (g.y - y(g.centrum))); } }
    for (const id of m.sel.dienst) { const d = w.voorzieningen.diensten.get(id); if (d) ring(d.voet); }
    for (const i of [...m.sel.boom].slice(0, 400)) cirkel({ x: w.bomen.x[i], z: w.bomen.z[i] }, 2.2);
    this.selCache = { sleutel, lijnen: l };
    return l;
  }

  private verplaatsVoorbeeld(p: V2): Voorbeeld {
    const w = this.wereld, m = this.verplaatser, t = w.terrein;
    const y = (q: V2) => Math.max(t.hoogte(q.x, q.z), 0);
    const veld = this.veld ? this.veld.map(q => ({ x: q.x, y: y(q) + 0.8, z: q.z })) : null;
    if (this.plakModus) {
      return { soort: 'verplaats', sel: [], geest: this.plakGeest(p), segmenten: [], greep: null, veld: null, tekst: 'Klik om te plakken · Q/E draaien · rechts = annuleren' };
    }
    const s = this.mSleep, sel = this.selectieLijnen();
    const gr = m.greep();
    let geest: [V3, V3][] = [], tekst = '';
    const n = m.sel, delen: string[] = [];
    if (n.seg.size) delen.push(`${n.seg.size} weg${n.seg.size > 1 ? 'en' : ''}`);
    if (n.knoop.size) delen.push(`${n.knoop.size} knoop${n.knoop.size > 1 ? 'pen' : ''}`);
    if (n.gebouw.size) delen.push(`${n.gebouw.size} gebouw${n.gebouw.size > 1 ? 'en' : ''}`);
    if (n.dienst.size) delen.push(`${n.dienst.size} voorziening${n.dienst.size > 1 ? 'en' : ''}`);
    if (n.boom.size) delen.push(`${n.boom.size} bom${n.boom.size > 1 ? 'en' : ''}`);
    if (s?.soort === 'schuif') {
      const d = { x: p.x - s.van.x, z: p.z - s.van.z };
      geest = m.geest(Verplaatser.schuif(d), y);
      tekst = `${Math.hypot(d.x, d.z).toFixed(1)} m`;
    } else if (s?.soort === 'buig' && s.seg !== undefined) {
      const sg = w.net.segmenten.get(s.seg);
      if (sg) {
        const A = w.net.knopen.get(sg.a)!.p, B = w.net.knopen.get(sg.b)!.p;
        const c = { x: 2 * p.x - (A.x + B.x) / 2, z: 2 * p.z - (A.z + B.z) / 2 };
        const pts = Wegennet.curve(A, c, B, 24);
        for (let i = 1; i < pts.length; i++) geest.push([{ x: pts[i - 1].x, y: y(pts[i - 1]) + 0.8, z: pts[i - 1].z }, { x: pts[i].x, y: y(pts[i]) + 0.8, z: pts[i].z }]);
        tekst = 'Weg buigen';
      }
    } else if (s?.soort === 'veld') tekst = 'Selecteren' + (this.shift ? ' (erbij)' : '');
    else if (delen.length) tekst = delen.join(', ') + ' · slepen · Q/E draaien · PgUp/PgDn';
    else {
      const d = m.raak(p);
      tekst = d ? 'Klik om te kiezen · Shift = erbij · slepen op de grond = rechthoek' : 'Klik op een weg, knoop, gebouw, voorziening of boom';
    }
    return { soort: 'verplaats', sel, geest, segmenten: [...n.seg], greep: gr ? { x: gr.p.x, y: y(gr.p) + 0.8, z: gr.p.z } : null, veld, tekst };
  }

  /** Spooklijnen van het klembord op de muis. */
  private plakGeest(p: V2): [V3, V3][] {
    const t = this.wereld.terrein, m = this.verplaatser;
    const y = (q: V2) => Math.max(t.hoogte(q.x, q.z), 0);
    return m.geestKlembord(p, this.plakHoek, y);
  }

  /** Volgende bord in de reeks: geen → voorrangsweg → voorrang verlenen → stop → geen. */
  static volgendBord(b: Bord | undefined): Bord | undefined { return b === undefined ? 'voorrang' : b === 'voorrang' ? 'geef' : b === 'geef' ? 'stop' : undefined; }

  /** Klik in het verkeersgereedschap (de iconen boven de kruispunten zijn ook klikbaar). */
  private verkeerKlik(p: V2) {
    const net = this.wereld.net, R = net.regels;
    switch (this.verkeerTool) {
      case 'voorrang': {
        const e = wegeindeBij(net, p);
        if (e) R.zetEind(e.seg, e.knoop, { bord: Gereedschap.volgendBord(R.bord(e.seg, e.knoop)) });
        return;
      }
      case 'hoofdweg': {
        const s = net.segmentBij(p, 2);
        if (s) { const n = maakHoofdweg(net, s.seg.id, this.zijBord); this.melding = n ? `Voorrangsweg: ${n} borden gezet` : 'Geen kruispunten op deze weg'; }
        return;
      }
      case 'lichten': {
        const k = kruispuntBij(net, p);
        if (k !== null) R.zetKnoop(k, { licht: net.heeftLichten(k) ? 'uit' : 'aan' });
        return;
      }
      case 'snelheid': case 'verbod':
        this.slepen = true; this.gesleept.clear(); this.sleepPunt = null;
        this.sleepStap(p);
        return;
      default: return;
    }
  }

  /** Eén stap van slepend slopen/opwaarderen: neem wat onder de muis ligt, één keer per sleep. */
  private sleepStap(p: V2) {
    const w = this.wereld;
    if (this.modus === 'verkeer') {
      const s = w.net.segmentBij(p, 1);
      if (!s || this.gesleept.has('s' + s.seg.id)) return;
      this.gesleept.add('s' + s.seg.id);
      const R = w.net.regels;
      if (this.verkeerTool === 'snelheid') R.zetLimiet(s.seg.id, this.snelheidKeuze);
      else if (this.verkeerTool === 'verbod') {
        // De eerste weg van de sleep bepaalt of het verbod aan of uit gaat.
        if (this.gesleept.size === 1) this.verbodAan = !R.verboden(s.seg.id).includes(this.verbodKeuze);
        const l = R.verboden(s.seg.id).filter(x => x !== this.verbodKeuze);
        R.zetVerbod(s.seg.id, this.verbodAan ? [...l, this.verbodKeuze] : l);
      }
      return;
    }
    if (this.modus === 'opwaarderen') {
      const s = w.net.segmentBij(p, 1);
      if (!s || this.gesleept.has('s' + s.seg.id)) return;
      this.gesleept.add('s' + s.seg.id);
      if (s.seg.type !== this.wegtype && !w.wijzigWeg(s.seg.id, this.wegtype)) this.melding = 'Opwaarderen lukt niet (geld?)';
      return;
    }
    // Slopen: pas verder als de muis echt beweegt (anders sloopt één klik ook wat eronder ligt).
    if (this.sleepPunt && dist2(this.sleepPunt, p) < 4) return;
    this.sleepPunt = p;
    switch (this.modus) {
      case 'sloop': {
        const vz = w.voorzieningen.dienstOp(p);
        if (vz) { w.voorzieningen.sloop(vz.id); return; }
        const g = w.gebouwOp(p);
        if (g) { w.verwijderGebouw(g.id); return; }
        const s = w.net.segmentBij(p, 1);
        if (s) { w.sloopWeg(s.seg.id); return; }
        const gb = w.economie.gebiedOp(p);
        if (gb) w.economie.verwijderGebied(gb.id);
        return;
      }
    }
  }

  los() {
    this.schilderen = false;
    this.slepen = false;
    if (this.modus === 'verplaats') { this.verplaatsLos(); return; }
    // Selectie loslaten: alle kavels in de rechthoek zoneren.
    if (this.modus === 'zone' && this.selStart && this.muis) {
      const h = this.selectieHoeken(this.selStart, { x: this.muis.x, z: this.muis.z });
      if (h) this.wereld.zoneerKavels(this.wereld.kavelsIn(h), this.zone);
    }
    this.selStart = null;
  }

  /** Rechts klikken (zonder slepen): in Zones weghalen met hetzelfde gereedschap, zoals in CS; bij Opwaarderen de rijrichting omdraaien. Geeft true als dat gebeurde. */
  rechts(grond: V3 | null): boolean {
    if (this.modus === 'opwaarderen' && grond) {
      const s = this.wereld.net.segmentBij({ x: grond.x, z: grond.z }, 1);
      if (s) { this.wereld.keerWegOm(s.seg.id); return true; }
      return false;
    }
    if (this.modus === 'verplaats') {
      if (this.plakModus) this.plakModus = false;
      else this.verplaatser.leegmaken();
      return true;
    }
    if (this.modus === 'verkeer' && grond) {
      const p = { x: grond.x, z: grond.z }, net = this.wereld.net, R = net.regels;
      if (this.verkeerTool === 'voorrang') { const e = wegeindeBij(net, p); if (e) R.zetEind(e.seg, e.knoop, { bord: undefined }); return true; }
      if (this.verkeerTool === 'lichten') { const k = kruispuntBij(net, p); if (k !== null) R.zetKnoop(k, { licht: 'auto', groen: undefined }); return true; }
      if (this.verkeerTool === 'snelheid') { const s = net.segmentBij(p, 1); if (s) R.zetLimiet(s.seg.id, undefined); return true; }
      if (this.verkeerTool === 'verbod') { const s = net.segmentBij(p, 1); if (s) R.zetVerbod(s.seg.id, []); return true; }
      return true;
    }
    if (this.modus !== 'zone' || !grond) return false;
    const p = { x: grond.x, z: grond.z }, w = this.wereld;
    if (this.zoneTool === 'penseel') w.zoneer(p, this.penseel, 'geen');
    else { const k = w.kavelOp(p); if (k && k.zone !== 'geen') w.zoneerKavels(w.blokVan(k), 'geen'); }
    return true;
  }

  /** Bézier a-c-b evenwijdig verschoven over d meter naar rechts (parallel bouwen). */
  private verschuif(a: V2, c: V2, b: V2, d: number): [V2, V2, V2] {
    const ta = norm2(sub2(c, a)), tb = norm2(sub2(b, c));
    const na = { x: -ta.z, z: ta.x }, nb = { x: -tb.z, z: tb.x };
    const a2 = { x: a.x + na.x * d, z: a.z + na.z * d }, b2 = { x: b.x + nb.x * d, z: b.z + nb.z * d };
    const den = ta.x * tb.z - ta.z * tb.x;
    let c2 = lerp2(a2, b2, 0.5);
    if (Math.abs(den) > 1e-3) { const t = ((b2.x - a2.x) * tb.z - (b2.z - a2.z) * tb.x) / den; c2 = { x: a2.x + ta.x * t, z: a2.z + ta.z * t }; }
    return [a2, c2, b2];
  }

  /** Raster zoals in CS2: klik 1 = hoek, klik 2 = richting en lengte, klik 3 = diepte. */
  private rasterLijnen(a: V2, b: V2, c: V2): [V2, V2][] {
    const W = halveBreedte(this.wegtype) * 2;
    const L = dist2(a, b);
    if (L < 20) return [];
    const u = norm2(sub2(b, a));
    let n = { x: -u.z, z: u.x };
    let D = (c.x - a.x) * n.x + (c.z - a.z) * n.z;
    if (D < 0) { n = { x: -n.x, z: -n.z }; D = -D; }
    // Bouwblokken: 2 × 30 m diep tussen evenwijdige straten, 2 × 45 m langs de straat.
    const dr = 60 + W, dk = 90 + W;
    const nr = Math.max(1, Math.round(D / dr)), nk = Math.max(1, Math.round(L / dk));
    const Lr = nk * dk, Ld = nr * dr;
    const r: [V2, V2][] = [];
    const op = (x: number, y: number) => ({ x: a.x + u.x * x + n.x * y, z: a.z + u.z * x + n.z * y });
    for (let i = 0; i <= nr; i++) r.push([op(0, i * dr), op(Lr, i * dr)]);
    for (let j = 0; j <= nk; j++) r.push([op(j * dk, 0), op(j * dk, Ld)]);
    return r;
  }

  private rasterKlik(p: V2) {
    if (!this.start) { this.begin(p); return; }
    if (!this.rasterB) { if (dist2(this.start, p) >= 20) this.rasterB = p; return; }
    const lijnen = this.rasterLijnen(this.start, this.rasterB, p);
    const kosten = lijnen.reduce((s, [a, b]) => s + Wereld.wegKosten(this.wegtype, dist2(a, b), this.niveau), 0);
    if (kosten > this.wereld.geld) { this.melding = 'Niet genoeg geld'; return; }
    let fout = '';
    for (const [a, b] of lijnen) { const r = this.wereld.legWeg(a, lerp2(a, b, 0.5), b, this.wegtype, this.niveau); if (!r.ok) fout = r.fout ?? ''; }
    if (fout) this.melding = fout;
    this.annuleer();
  }

  /** Rechthoek van a naar b, gedraaid langs de weg bij a (zoals het zoneraster in CS). */
  private selectieHoeken(a: V2, b: V2): V2[] | null {
    if (dist2(a, b) < 1) return null;
    const s = this.wereld.net.segmentBij(a, 60);
    let t = { x: 1, z: 0 };
    if (s) { const A = this.wereld.net.knopen.get(s.seg.a)!, B = this.wereld.net.knopen.get(s.seg.b)!; const q1 = bezier2(A.p, s.seg.c, B.p, Math.min(1, s.t + 0.01)), q0 = bezier2(A.p, s.seg.c, B.p, Math.max(0, s.t - 0.01)); t = norm2(sub2(q1, q0)); }
    const n = { x: -t.z, z: t.x };
    const d = sub2(b, a), u = d.x * t.x + d.z * t.z, v = d.x * n.x + d.z * n.z;
    return [a, { x: a.x + t.x * u, z: a.z + t.z * u }, b, { x: a.x + n.x * v, z: a.z + n.z * v }];
  }

  /** Rechtermuisknop / Escape: eerst de lopende actie stoppen. Geeft true als er iets te stoppen was. */
  terug(): boolean {
    if (this.modus === 'verplaats') {
      if (this.plakModus) { this.plakModus = false; return true; }
      if (!this.verplaatser.leeg) { this.verplaatser.leegmaken(); return true; }
      return false;
    }
    if (this.modus === 'gebied' && this.gebiedPunten.length) { this.gebiedPunten.pop(); return true; }
    if (this.start || this.ctrl) { this.annuleer(); return true; }
    return false;
  }

  private schilder(p: V2) {
    if (this.modus === 'district') this.wereld.districten.schilder(p, this.penseel * 1.5, this.gum ? 0 : this.district);
    else this.wereld.zoneer(p, this.penseel, this.zone);
  }

  stap(dt: number) {
    if (this.melding) { this.meldingKlok += dt; if (this.meldingKlok > 2.5) { this.melding = ''; this.meldingKlok = 0; } } else this.meldingKlok = 0;
    if (this.slepen && this.muis && (this.modus === 'sloop' || this.modus === 'opwaarderen' || this.modus === 'verkeer')) this.sleepStap({ x: this.muis.x, z: this.muis.z });
    if ((this.modus === 'zone' || this.modus === 'district') && this.schilderen && this.muis) {
      this.schilderKlok += dt;
      if (this.schilderKlok > 0.05) { this.schilderKlok = 0; this.schilder({ x: this.muis.x, z: this.muis.z }); }
    }
  }

  voorbeeld(): Voorbeeld {
    const m = this.muis, w = this.wereld;
    if (!m) return { soort: 'geen' };
    const p = { x: m.x, z: m.z };
    switch (this.modus) {
      case 'weg': {
        const t = w.terrein;
        const lijnenV3 = (snapP: V2 | null) => {
          const r: [V3, V3][] = [];
          if (!this.laatsteSnap || !snapP) return r;
          for (const l of this.laatsteSnap.lijnen) {
            const a = { x: snapP.x - l.d.x * 160, z: snapP.z - l.d.z * 160 }, e = { x: snapP.x + l.d.x * 160, z: snapP.z + l.d.z * 160 };
            // In stukjes over het terrein.
            for (let i = 0; i < 16; i++) {
              const p0 = lerp2(a, e, i / 16), p1 = lerp2(a, e, (i + 0.6) / 16);
              r.push([{ x: p0.x, y: Math.max(t.hoogte(p0.x, p0.z), 0) + 0.8, z: p0.z }, { x: p1.x, y: Math.max(t.hoogte(p1.x, p1.z), 0) + 0.8, z: p1.z }]);
            }
          }
          return r;
        };
        const naam = WEGTYPEN[this.wegtype].naam;
        const hoogteTekst = this.niveau === 0 ? '' : this.niveau > 0 ? ` · ${this.niveau} m hoog` : ` · tunnel ${-this.niveau} m`;
        if (!this.start) {
          const s = this.snap(p);
          const y = this.hoogteVan(s);
          return { soort: 'weg', as: [], breedte: halveBreedte(this.wegtype) * 2, geldig: true, tekst: naam + hoogteTekst, punten: [{ x: s.x, y, z: s.z }], lijnen: lijnenV3(s), snap: this.laatsteSnap ? { x: s.x, y, z: s.z } : null, kavels: [] };
        }
        if (this.stijl === 'raster') {
          const q = this.snap(p);
          const naarV3 = (x: V2) => ({ x: x.x, y: Math.max(t.hoogte(x.x, x.z), 0) + 0.3, z: x.z });
          const lijnen: [V2, V2][] = this.rasterB ? this.rasterLijnen(this.start, this.rasterB, q) : [[this.start, q]];
          const meer = lijnen.map(([a, b]) => Array.from({ length: 9 }, (_, i) => naarV3(lerp2(a, b, i / 8))));
          const lengte = lijnen.reduce((s, [a, b]) => s + dist2(a, b), 0);
          const kosten = lijnen.reduce((s, [a, b]) => s + Wereld.wegKosten(this.wegtype, dist2(a, b), this.niveau), 0);
          const blokken = this.rasterB ? `${lijnen.length} straten · ` : '';
          const tekst = !this.rasterB ? `Raster: klik de richting en lengte · ${Math.round(dist2(this.start, q))} m` : `${blokken}${Math.round(lengte)} m · € ${Math.round(kosten).toLocaleString('nl-NL')} · klik om te bouwen`;
          return { soort: 'weg', as: [], breedte: halveBreedte(this.wegtype) * 2, geldig: kosten <= w.geld, tekst, punten: [this.start, ...(this.rasterB ? [this.rasterB] : []), q].map(naarV3), lijnen: [], snap: null, kavels: [], meer };
        }
        const e = this.eindpunt(p);
        const snapNu = this.laatsteSnap;
        const { c: c0, wacht } = this.controle(e);
        const b = wacht ? this.snap(p) : e;
        const c = c0 ?? lerp2(this.start, b, 0.5);
        const fout = w.net.controleer(this.start, c, b, this.wegtype);
        const curve = Wegennet.curve(this.start, c, b, 32);
        const lengte = curve.reduce((s, q, i, arr) => i ? s + dist2(arr[i - 1], q) : 0, 0);
        const kosten = Wereld.wegKosten(this.wegtype, lengte, this.niveau);
        const geld = kosten <= w.geld;
        const ya = this.hoogteVan(this.start), yb = this.hoogteVan(b);
        const as = curve.map((q, i) => ({ x: q.x, y: Math.max(ya + (yb - ya) * i / 32, 0.5), z: q.z }));
        // Hoek ten opzichte van de weg waarop je aansluit, en de helling.
        const dir = norm2(sub2(curve[1], curve[0]));
        let hoekTekst = '';
        if (this.ref) {
          const graden = Math.round(Math.acos(Math.max(-1, Math.min(1, Math.abs(dir.x * this.ref.x + dir.z * this.ref.z)))) * 180 / Math.PI);
          hoekTekst = ` · ${graden}°`;
        }
        const helling = lengte > 1 ? Math.abs(yb - ya) / lengte * 100 : 0;
        const kA = w.net.knoopBij(this.start, 0.5), kB = w.net.knoopBij(b, 0.5);
        const hellingTelt = this.niveau !== 0 || !!kA?.niveau || !!kB?.niveau;
        const hellingTekst = helling >= 1 ? ` · helling ${Math.round(helling)}%` : '';
        const tekst = wacht ? 'Klik het bochtpunt' : fout ?? (!geld ? 'Niet genoeg geld' : `${Math.round(lengte)} m · € ${Math.round(kosten).toLocaleString('nl-NL')}${hoekTekst}${hoogteTekst}${hellingTekst}`);
        const kavels = !fout && !wacht ? this.kavelBanden(this.start, c, b) : [];
        this.laatsteSnap = snapNu;
        return {
          soort: 'weg', as, breedte: halveBreedte(this.wegtype) * 2, geldig: !fout && geld && !wacht && !(hellingTelt && helling > 12), tekst: hellingTelt && helling > 12 && !fout ? 'Te steil: maak de weg langer' : tekst,
          punten: [this.start, ...(this.ctrl ? [this.ctrl] : []), b].map(q => ({ x: q.x, y: this.hoogteVan(q), z: q.z })),
          lijnen: lijnenV3(b), snap: snapNu ? { x: b.x, y: yb, z: b.z } : null, kavels,
          meer: this.parallel && !wacht ? [(() => { const [a2, c2, b2] = this.verschuif(this.start!, c, b, this.parallel); return Wegennet.curve(a2, c2, b2, 32).map((q, i) => ({ x: q.x, y: Math.max(ya + (yb - ya) * i / 32, 0.5), z: q.z })); })()] : undefined,
        };
      }
      case 'verplaats': return this.verplaatsVoorbeeld(p);
      case 'verkeer': {
        const net = w.net;
        if (this.verkeerTool === 'hoofdweg') {
          const s = net.segmentBij(p, 2);
          return s ? { soort: 'markeer', segmenten: hoofdwegKeten(net, s.seg.id), kleur: '#ffd43b', tekst: 'Klik: voorrangsweg maken (zijwegen ' + (this.zijBord === 'stop' ? 'stop' : 'voorrang verlenen') + ')' } : { soort: 'geen' };
        }
        if (this.verkeerTool === 'snelheid' || this.verkeerTool === 'verbod') {
          const s = net.segmentBij(p, 1);
          if (!s) return { soort: 'geen' };
          const R = net.regels, nu = R.limiet(s.seg.id) ?? WEGTYPEN[s.seg.type].snelheid;
          const tekst = this.verkeerTool === 'snelheid' ? `${nu} km/u → ${this.snelheidKeuze ?? WEGTYPEN[s.seg.type].snelheid} km/u · slepen = meer wegen · rechts = standaard` : `Verbod ${({ auto: "auto's", vracht: 'vrachtverkeer', bus: 'bussen', parkeren: 'parkeren' } as const)[this.verbodKeuze]} aan/uit · rechts = alles toestaan`;
          return { soort: 'markeer', segment: s.seg.id, kleur: this.verkeerTool === 'snelheid' ? '#4dabf7' : '#ff6b6b', tekst };
        }
        return { soort: 'geen' };
      }
      case 'zone': {
        const kleur = zoneKleur(this.zone), naam = ZONES.find(z => z.id === this.zone)?.naam ?? '';
        if (this.zoneTool === 'penseel') return { soort: 'zoneSel', kavels: [], kleur, tekst: '', kader: null, m, r: this.penseel };
        if (this.zoneTool === 'selectie') {
          if (!this.selStart) return { soort: 'zoneSel', kavels: [], kleur, tekst: `${naam}: sleep een rechthoek`, kader: null, m: null, r: 0 };
          const h = this.selectieHoeken(this.selStart, p);
          const ids = h ? w.kavelsIn(h).filter(id => { const k = w.kavels.get(id)!; return k.zone !== this.zone && (!k.gebouw || this.zone === 'geen'); }) : [];
          return { soort: 'zoneSel', kavels: ids, kleur, tekst: `${ids.length} kavels → ${naam}`, kader: h ? h.map(q => ({ x: q.x, y: w.terrein.hoogte(q.x, q.z), z: q.z })) : null, m: null, r: 0 };
        }
        const k = w.kavelOp(p);
        if (!k) return { soort: 'zoneSel', kavels: [], kleur, tekst: '', kader: null, m: null, r: 0 };
        const ids = w.blokVan(k).filter(id => { const x = w.kavels.get(id)!; return x.zone !== this.zone && (!x.gebouw || this.zone === 'geen'); });
        return { soort: 'zoneSel', kavels: ids, kleur, tekst: ids.length ? `Bouwblok vullen: ${ids.length} kavels → ${naam} · rechts = weghalen` : 'Rechts klikken haalt de zone weg', kader: null, m: null, r: 0 };
      }
      case 'district': return { soort: 'penseel', m, r: this.penseel * 1.5, kleur: this.gum ? '#ffffff' : w.districten.lijst.get(this.district)?.kleur ?? '#ffffff' };
      case 'gebied': {
        const t = w.terrein;
        const info = GRONDSTOFFEN[this.grondstof];
        const hp = this.hoofd ?? (this.gebiedPunten.length ? null : w.economie.hoofdPlek(p));
        const hoofd = hp ? { p: { x: hp.p.x, y: t.hoogte(hp.p.x, hp.p.z), z: hp.p.z }, rot: hp.rot, geldig: true } : null;
        if (!this.gebiedPunten.length) {
          return { soort: 'gebied', punten: [], kleur: info.kleur, tekst: hp ? `${info.naam}: klik om het hoofdgebouw hier aan de weg te zetten` : 'Ga naast een weg staan: daar komt het hoofdgebouw', dicht: false, hoofd };
        }
        const pts = [...this.gebiedPunten, p];
        let tekst = `${info.naam}: klik de hoekpunten van het gebied`;
        if (pts.length >= 3) {
          const ha = Math.abs(getekendOppervlak(pts)) / 10000;
          const rijk = w.economie.gemiddeldeRijkdom(this.grondstof, pts);
          tekst = `${Math.round(ha)} ha · ${info.naam.toLowerCase()} ${Math.round(rijk * 100)}%` + (this.gebiedPunten.length >= 3 && dist2(p, this.gebiedPunten[0]) < 14 ? ' · klik om af te ronden' : '');
        }
        return { soort: 'gebied', punten: pts.map(q => ({ x: q.x, y: t.hoogte(q.x, q.z), z: q.z })), kleur: info.kleur, tekst, dicht: pts.length >= 3, hoofd };
      }
      case 'opwaarderen': {
        const s = w.net.segmentBij(p, 1);
        return s ? { soort: 'markeer', segment: s.seg.id, kleur: '#4dabf7', tekst: `${WEGTYPEN[s.seg.type].naam} → ${WEGTYPEN[this.wegtype].naam}` } : { soort: 'geen' };
      }
      case 'dienst': {
        const info = DIENSTEN[this.dienst];
        const r = w.voorzieningen.plek(this.dienst, p);
        if (!r) return { soort: 'dienst', voet: [], geldig: false, tekst: `${info.naam}: ga naast een weg staan` };
        const t = w.terrein;
        const levert = Object.entries(info.levert).map(([n, x]) => `${(x as number).toLocaleString('nl-NL')} ${NUT_EENHEID[n as keyof typeof NUT_EENHEID]}`).join(' + ');
        return { soort: 'dienst', voet: r.dienst.voet.map(q => ({ x: q.x, y: t.hoogte(q.x, q.z), z: q.z })), geldig: !r.fout, tekst: r.fout ?? `${info.naam} · € ${info.kosten.toLocaleString('nl-NL')} · ${levert}` };
      }
      case 'sloop': {
        const vz = w.voorzieningen.dienstOp(p);
        if (vz) return { soort: 'markeer', dienst: vz.id, kleur: '#ff6b6b', tekst: `${DIENSTEN[vz.soort].naam} slopen (20% terug)` };
        const g = w.gebouwOp(p);
        if (g) return { soort: 'markeer', gebouw: g.id, kleur: '#ff6b6b', tekst: 'Gebouw slopen' };
        const s = w.net.segmentBij(p, 1);
        if (s) return { soort: 'markeer', segment: s.seg.id, kleur: '#ff6b6b', tekst: `${WEGTYPEN[s.seg.type].naam} slopen` };
        const gb = w.economie.gebiedOp(p);
        return gb ? { soort: 'markeer', gebied: gb.id, kleur: '#ff6b6b', tekst: `${GRONDSTOFFEN[gb.soort].naam}gebied opheffen` } : { soort: 'geen' };
      }
      case 'kijk': {
        // Onder de muis: licht oplichten wat je kunt aanklikken.
        const vz = w.voorzieningen.dienstOp(p);
        if (vz) return { soort: 'markeer', dienst: vz.id, kleur: '#74c0fc', tekst: DIENSTEN[vz.soort].naam };
        const g = w.gebouwOp(p);
        return g ? { soort: 'markeer', gebouw: g.id, kleur: '#74c0fc', tekst: '' } : { soort: 'geen' };
      }
      default: return { soort: 'geen' };
    }
  }
}
