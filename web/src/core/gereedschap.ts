import { V2, V3, dist2, lerp2, bezier2, norm2, sub2 } from './math';
import { Wereld } from './wereld';

import { WegTypeId, halveBreedte, WEGTYPEN } from './wegen/typen';
import { Wegennet } from './wegen/netwerk';
import { Zone, zoneKleur } from './zones';
import { Grondstof, GRONDSTOFFEN } from './economie';
import { getekendOppervlak, afstandTotLijn } from './poly';
import { PERCEEL_BREEDTE, vrijeDiepte } from './percelen';

// Gereedschap met abstracte invoer: de render-/ui-laag geeft het grondpunt onder de muis en de
// knoppen door; dit bestand bepaalt wat er gebeurt en welk voorbeeld getekend moet worden.

export type Modus = 'weg' | 'zone' | 'gebied' | 'opwaarderen' | 'sloop' | 'kijk';

/** Tekenstijl van het wegengereedschap (zoals in Cities: Skylines). */
export type Stijl = 'recht' | 'bocht' | 'vrij';

/** Hulplijn: oneindige lijn door p met richting d. */
export interface Hulplijn { p: V2; d: V2; soort: 'verlengde' | 'haaks' | 'blok' | 'hoek' }

/** Kavelvoorbeeld langs één kant van de spookweg. */
export interface KavelBand { voor: V3[]; achter: V3[]; streepjes: [V3, V3][] }

export type Voorbeeld =
  | { soort: 'geen' }
  | { soort: 'weg'; as: V3[]; breedte: number; geldig: boolean; tekst: string; punten: V3[]; lijnen: [V3, V3][]; snap: V3 | null; kavels: KavelBand[] }
  | { soort: 'penseel'; m: V3; r: number; kleur: string }
  | { soort: 'markeer'; segment?: number; gebouw?: number; gebied?: number; kleur: string; tekst: string }
  | { soort: 'gebied'; punten: V3[]; kleur: string; tekst: string; dicht: boolean };

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
  melding = '';
  private start: V2 | null = null;
  private ctrl: V2 | null = null;
  /** Richting waarin een bocht vanaf het startpunt vloeiend doorloopt (wegeinde of vorige bocht). */
  private raak: V2 | null = null;
  /** Referentierichting voor hoeksnappen (de weg waar je op aansluit). */
  private ref: V2 | null = null;
  private muis: V3 | null = null;
  private schilderen = false;
  private schilderKlok = 0;
  private meldingKlok = 0;
  grondstof: Grondstof = 'landbouw';
  private gebiedPunten: V2[] = [];

  constructor(private wereld: Wereld) {}

  /** Wordt er een weg getekend (startpunt gezet)? */
  get tekent() { return (this.modus === 'weg' && !!this.start) || (this.modus === 'gebied' && this.gebiedPunten.length > 0); }

  /** Gebied afronden (knop of klik op het eerste punt). */
  rondGebiedAf() {
    if (this.gebiedPunten.length < 3) { this.melding = 'Zet minstens drie punten'; return; }
    const fout = this.wereld.economie.maakGebied(this.grondstof, this.gebiedPunten);
    if (fout) this.melding = fout; else this.gebiedPunten = [];
  }

  zetModus(m: Modus) { this.modus = m; this.annuleer(); this.melding = ''; }
  annuleer() { this.start = null; this.ctrl = null; this.raak = null; this.ref = null; this.schilderen = false; this.gebiedPunten = []; }

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
        const r = w.legWeg(this.start, c, b, this.wegtype, this.niveau, this.afronden && this.stijl === 'recht');
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
      case 'zone': this.schilderen = true; this.schilder(p); return;
      case 'gebied': {
        const pp = this.gebiedPunten;
        if (pp.length >= 3 && dist2(p, pp[0]) < 14) { this.rondGebiedAf(); return; }
        pp.push(p);
        return;
      }
      case 'opwaarderen': {
        const s = w.net.segmentBij(p, 1);
        if (s && !w.wijzigWeg(s.seg.id, this.wegtype)) this.melding = 'Opwaarderen lukt niet (geld?)';
        return;
      }
      case 'sloop': {
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

  los() { this.schilderen = false; }

  /** Rechtermuisknop / Escape: eerst de lopende actie stoppen. Geeft true als er iets te stoppen was. */
  terug(): boolean {
    if (this.modus === 'gebied' && this.gebiedPunten.length) { this.gebiedPunten.pop(); return true; }
    if (this.start || this.ctrl) { this.annuleer(); return true; }
    return false;
  }

  private schilder(p: V2) { this.wereld.zoneer(p, this.penseel, this.zone); }

  stap(dt: number) {
    if (this.melding) { this.meldingKlok += dt; if (this.meldingKlok > 2.5) { this.melding = ''; this.meldingKlok = 0; } } else this.meldingKlok = 0;
    if (this.modus === 'zone' && this.schilderen && this.muis) {
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
        };
      }
      case 'zone': return { soort: 'penseel', m, r: this.penseel, kleur: zoneKleur(this.zone) };
      case 'gebied': {
        const t = w.terrein;
        const pts = [...this.gebiedPunten, p];
        const info = GRONDSTOFFEN[this.grondstof];
        let tekst = `${info.naam}: klik de hoekpunten van het gebied`;
        if (pts.length >= 3) {
          const ha = Math.abs(getekendOppervlak(pts)) / 10000;
          const rijk = w.economie.gemiddeldeRijkdom(this.grondstof, pts);
          tekst = `${Math.round(ha)} ha · ${info.naam.toLowerCase()} ${Math.round(rijk * 100)}%` + (this.gebiedPunten.length >= 3 && dist2(p, this.gebiedPunten[0]) < 14 ? ' · klik om af te ronden' : '');
        }
        return { soort: 'gebied', punten: pts.map(q => ({ x: q.x, y: t.hoogte(q.x, q.z), z: q.z })), kleur: info.kleur, tekst, dicht: pts.length >= 3 };
      }
      case 'opwaarderen': {
        const s = w.net.segmentBij(p, 1);
        return s ? { soort: 'markeer', segment: s.seg.id, kleur: '#4dabf7', tekst: `${WEGTYPEN[s.seg.type].naam} → ${WEGTYPEN[this.wegtype].naam}` } : { soort: 'geen' };
      }
      case 'sloop': {
        const g = w.gebouwOp(p);
        if (g) return { soort: 'markeer', gebouw: g.id, kleur: '#ff6b6b', tekst: 'Gebouw slopen' };
        const s = w.net.segmentBij(p, 1);
        if (s) return { soort: 'markeer', segment: s.seg.id, kleur: '#ff6b6b', tekst: `${WEGTYPEN[s.seg.type].naam} slopen` };
        const gb = w.economie.gebiedOp(p);
        return gb ? { soort: 'markeer', gebied: gb.id, kleur: '#ff6b6b', tekst: `${GRONDSTOFFEN[gb.soort].naam}gebied opheffen` } : { soort: 'geen' };
      }
      default: return { soort: 'geen' };
    }
  }
}
