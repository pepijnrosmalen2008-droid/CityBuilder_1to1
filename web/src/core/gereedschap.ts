import { V2, V3, dist2, lerp2, bezier2, norm2, sub2 } from './math';
import { Wereld } from './wereld';
import { WegTypeId, halveBreedte, WEGTYPEN } from './wegen/typen';
import { Wegennet } from './wegen/netwerk';
import { Zone, zoneKleur } from './zones';

// Gereedschap met abstracte invoer: de render-/ui-laag geeft het grondpunt onder de muis en de
// knoppen door; dit bestand bepaalt wat er gebeurt en welk voorbeeld getekend moet worden.

export type Modus = 'weg' | 'zone' | 'opwaarderen' | 'sloop' | 'kijk';

export type Voorbeeld =
  | { soort: 'geen' }
  | { soort: 'weg'; as: V3[]; breedte: number; geldig: boolean; tekst: string; punten: V3[] }
  | { soort: 'penseel'; m: V3; r: number; kleur: string }
  | { soort: 'markeer'; segment?: number; gebouw?: number; kleur: string; tekst: string };

export class Gereedschap {
  modus: Modus = 'weg';
  wegtype: WegTypeId = 'straat';
  bocht = false;
  zone: Zone = 'wonenLaag';
  penseel = 22;
  melding = '';
  private start: V2 | null = null;
  private ctrl: V2 | null = null;
  private muis: V3 | null = null;
  private schilderen = false;
  private schilderKlok = 0;
  private meldingKlok = 0;

  constructor(private wereld: Wereld) {}

  zetModus(m: Modus) { this.modus = m; this.annuleer(); this.melding = ''; }
  annuleer() { this.start = null; this.ctrl = null; this.schilderen = false; }

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
    const n = norm2(d);
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
        if (!this.start) { this.start = this.snap(p); return; }
        if (this.bocht && !this.ctrl) { this.ctrl = { ...p }; return; }
        const b = this.eindpunt(p);
        const c = this.ctrl ?? lerp2(this.start, b, 0.5);
        const r = w.legWeg(this.start, c, b, this.wegtype);
        if (r.ok) { this.start = b; this.ctrl = null; this.melding = ''; }
        else this.melding = r.fout ?? '';
        return;
      }
      case 'zone': this.schilderen = true; this.schilder(p); return;
      case 'opwaarderen': {
        const s = w.net.segmentBij(p, 1);
        if (s && !w.wijzigWeg(s.seg.id, this.wegtype)) this.melding = 'Opwaarderen lukt niet (geld?)';
        return;
      }
      case 'sloop': {
        const g = w.gebouwOp(p);
        if (g) { w.verwijderGebouw(g.id); return; }
        const s = w.net.segmentBij(p, 1);
        if (s) w.sloopWeg(s.seg.id);
        return;
      }
    }
  }

  los() { this.schilderen = false; }

  /** Rechtermuisknop / Escape: eerst de lopende actie stoppen. Geeft true als er iets te stoppen was. */
  terug(): boolean {
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
        const b = this.bocht && !this.ctrl ? { ...p } : this.eindpunt(p);
        const c = this.ctrl ?? lerp2(this.start, b, 0.5);
        const fout = w.net.controleer(this.start, c, b, this.wegtype);
        const lengte = Wegennet.curve(this.start, c, b, 24).reduce((s, q, i, arr) => i ? s + dist2(arr[i - 1], q) : 0, 0);
        const kosten = lengte * WEGTYPEN[this.wegtype].kosten;
        const geld = kosten <= w.geld;
        const as = Wegennet.curve(this.start, c, b, 32).map(q => ({ x: q.x, y: Math.max(t.hoogte(q.x, q.z), 0.5), z: q.z }));
        const tekst = fout ?? (!geld ? 'Niet genoeg geld' : `${Math.round(lengte)} m · € ${Math.round(kosten).toLocaleString('nl-NL')}`);
        return { soort: 'weg', as, breedte: halveBreedte(this.wegtype) * 2, geldig: !fout && geld && !(this.bocht && !this.ctrl), tekst: this.bocht && !this.ctrl ? 'Klik het bochtpunt' : tekst, punten: [this.start, ...(this.ctrl ? [this.ctrl] : []), b].map(q => ({ x: q.x, y: t.hoogte(q.x, q.z), z: q.z })) };
      }
      case 'zone': return { soort: 'penseel', m, r: this.penseel, kleur: zoneKleur(this.zone) };
      case 'opwaarderen': {
        const s = w.net.segmentBij(p, 1);
        return s ? { soort: 'markeer', segment: s.seg.id, kleur: '#4dabf7', tekst: `${WEGTYPEN[s.seg.type].naam} → ${WEGTYPEN[this.wegtype].naam}` } : { soort: 'geen' };
      }
      case 'sloop': {
        const g = w.gebouwOp(p);
        if (g) return { soort: 'markeer', gebouw: g.id, kleur: '#ff6b6b', tekst: 'Gebouw slopen' };
        const s = w.net.segmentBij(p, 1);
        return s ? { soort: 'markeer', segment: s.seg.id, kleur: '#ff6b6b', tekst: `${WEGTYPEN[s.seg.type].naam} slopen` } : { soort: 'geen' };
      }
      default: return { soort: 'geen' };
    }
  }
}
