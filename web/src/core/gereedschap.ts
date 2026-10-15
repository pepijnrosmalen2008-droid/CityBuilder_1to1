import { V2, V3, dist2, lerp2, bezier2, norm2, sub2 } from './math';
import { Wereld } from './wereld';
import { WegTypeId, halveBreedte, WEGTYPEN } from './wegen/typen';
import { Wegennet } from './wegen/netwerk';
import { Zone, zoneKleur } from './zones';
import { Grondstof, GRONDSTOFFEN } from './economie';
import { getekendOppervlak } from './poly';

// Gereedschap met abstracte invoer: de render-/ui-laag geeft het grondpunt onder de muis en de
// knoppen door; dit bestand bepaalt wat er gebeurt en welk voorbeeld getekend moet worden.

export type Modus = 'weg' | 'zone' | 'gebied' | 'opwaarderen' | 'sloop' | 'kijk';

export type Voorbeeld =
  | { soort: 'geen' }
  | { soort: 'weg'; as: V3[]; breedte: number; geldig: boolean; tekst: string; punten: V3[] }
  | { soort: 'penseel'; m: V3; r: number; kleur: string }
  | { soort: 'markeer'; segment?: number; gebouw?: number; gebied?: number; kleur: string; tekst: string }
  | { soort: 'gebied'; punten: V3[]; kleur: string; tekst: string; dicht: boolean };

export class Gereedschap {
  modus: Modus = 'weg';
  wegtype: WegTypeId = 'straat';
  bocht = false;
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

  /** Punt snappen aan bestaande knopen (en anders aan een weg). */
  private snap(p: V2): V2 {
    const net = this.wereld.net;
    const k = net.knoopBij(p, Math.max(8, halveBreedte(this.wegtype) + 2));
    if (k) return { ...k.p };
    const s = net.segmentBij(p, 2);
    if (s) {
      const A = net.knopen.get(s.seg.a)!, B = net.knopen.get(s.seg.b)!;
      return bezier2(A.p, s.seg.c, B.p, s.t);
    }
    return { x: Math.round(p.x), z: Math.round(p.z) };
  }

  /** Lengte afronden op hele meters vanaf het startpunt (zoals in CS), richting behouden. */
  private eindpunt(p: V2): V2 {
    const s = this.snap(p);
    if (!this.start || (s.x !== Math.round(p.x) || s.z !== Math.round(p.z))) return s;
    const d = sub2(s, this.start), l = Math.round(Math.hypot(d.x, d.z) / 2) * 2;
    let n = norm2(d);
    // Hoeksnappen op stappen van 15° ten opzichte van de weg waar je op aansluit (of het noorden).
    if (!(this.bocht && this.raak)) {
      const ref = this.ref ?? { x: 1, z: 0 };
      const h = Math.atan2(n.z, n.x), h0 = Math.atan2(ref.z, ref.x);
      const stap = Math.PI / 12, rel = h - h0;
      const doel = Math.round(rel / stap) * stap;
      if (Math.abs(rel - doel) < 0.045) n = { x: Math.cos(h0 + doel), z: Math.sin(h0 + doel) };
    }
    return { x: this.start.x + n.x * l, z: this.start.z + n.z * l };
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
        const auto = this.bocht ? this.vloeiend(this.eindpunt(p)) : null;
        if (this.bocht && !this.ctrl && !auto) { this.ctrl = { ...p }; return; }
        const b = this.eindpunt(p);
        const c = this.ctrl ?? auto ?? lerp2(this.start, b, 0.5);
        const r = w.legWeg(this.start, c, b, this.wegtype);
        if (r.ok) {
          // Verder vanaf het eindpunt; een bocht loopt vloeiend door.
          const raak = norm2(sub2(b, c));
          this.begin(b);
          if (this.bocht) this.raak = raak;
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
        if (!this.start) {
          const s = this.snap(p);
          return { soort: 'weg', as: [], breedte: halveBreedte(this.wegtype) * 2, geldig: true, tekst: WEGTYPEN[this.wegtype].naam, punten: [{ x: s.x, y: t.hoogte(s.x, s.z), z: s.z }] };
        }
        const e = this.eindpunt(p);
        const auto = this.bocht && !this.ctrl ? this.vloeiend(e) : null;
        const wachtOpCtrl = this.bocht && !this.ctrl && !auto;
        const b = wachtOpCtrl ? { ...p } : e;
        const c = this.ctrl ?? auto ?? lerp2(this.start, b, 0.5);
        const fout = w.net.controleer(this.start, c, b, this.wegtype);
        const lengte = Wegennet.curve(this.start, c, b, 24).reduce((s, q, i, arr) => i ? s + dist2(arr[i - 1], q) : 0, 0);
        const kosten = lengte * WEGTYPEN[this.wegtype].kosten;
        const geld = kosten <= w.geld;
        const as = Wegennet.curve(this.start, c, b, 32).map(q => ({ x: q.x, y: Math.max(t.hoogte(q.x, q.z), 0.5), z: q.z }));
        const tekst = fout ?? (!geld ? 'Niet genoeg geld' : `${Math.round(lengte)} m · € ${Math.round(kosten).toLocaleString('nl-NL')}`);
        return { soort: 'weg', as, breedte: halveBreedte(this.wegtype) * 2, geldig: !fout && geld && !wachtOpCtrl, tekst: wachtOpCtrl ? 'Klik het bochtpunt' : tekst, punten: [this.start, ...(this.ctrl ? [this.ctrl] : []), b].map(q => ({ x: q.x, y: t.hoogte(q.x, q.z), z: q.z })) };
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
