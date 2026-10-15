import { V2 } from './math';
import { Rng } from './rng';
import { Dienst, DIENSTEN, DekkingSoort } from './voorzieningen';
import type { Plek, VoertuigSoort } from './verkeer/verkeer';
import type { Wereld } from './wereld';

// ════════════════════════════════════════════════════════════════════════════════════
// HULPDIENSTEN: BRANDWEER, POLITIE, ZORG
// Dekking zoals in Cities: Skylines 2: per gebouw de afstand over het wegennet tot de
// dichtstbijzijnde kazerne, bureau of zorgpost. Incidenten ontstaan vaker zonder dekking:
// branden (worden erger tot het gebouw afbrandt), misdrijven en zieken. Een vrij voertuig rukt
// uit met zwaailicht en sirene, rijdt echt door het verkeer, helpt ter plaatse en rijdt terug;
// een ambulance brengt de patiënt naar het ziekenhuis. Politiewagens rijden ook surveillance.
// ════════════════════════════════════════════════════════════════════════════════════

export type IncidentSoort = 'brand' | 'misdaad' | 'ziekte';
export interface Incident { id: number; soort: IncidentSoort; gebouw: number; t: number; ernst: number; inzet: number; geholpen: number }

interface Inzet {
  id: number; station: number; voertuig: number; incident: number;
  fase: 'heen' | 'terplaatse' | 'naarZiekenhuis' | 'terug' | 'surveillance';
  t: number;
  /** Laatste plek (voor de terugweg). */
  hier: Plek | null;
}

const VOERTUIG: Record<DekkingSoort, VoertuigSoort> = { brand: 'brandweer', politie: 'politie', zorg: 'ambulance' };

export class Hulpdiensten {
  /** Dekking per gebouw (0-1). */
  dekking = new Map<number, Record<DekkingSoort, number>>();
  incidenten = new Map<number, Incident>();
  /** Stadsbrede cijfers voor de HUD en de tevredenheid. */
  stat = { brandveiligheid: 0, misdaad: 0, gezondheid: 0, branden: 0, afgebrand: 0, geblust: 0, misdrijven: 0, opgelost: 0, patienten: 0, overleden: 0 };
  private inzetten = new Map<number, Inzet>();
  private volgende = 1;
  private klok = 99;
  private rng = new Rng(9090);

  constructor(private w: Wereld) {}

  // ─── Dekking ─────────────────────────────────────────────────────────────────

  /** Positie van een plek langs zijn segment (booglengte op de as). */
  private positie(seg: number, p: V2): number {
    const s = this.w.net.segmenten.get(seg);
    if (!s) return 0;
    let best = 0, bd = Infinity;
    for (const q of s.pad) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q.s; } }
    return best;
  }

  /** Plek van een voorziening (voor het verkeer): de kant van de weg waar ze ligt. */
  dienstPlek(d: Dienst): Plek | null {
    const s = this.w.net.segmenten.get(d.seg);
    if (!s) return null;
    let best = s.pad[0], bd = Infinity;
    for (const q of s.pad) { const x = Math.hypot(q.x - d.p.x, q.z - d.p.z); if (x < bd) { bd = x; best = q; } }
    const zijde: 1 | -1 = ((d.p.x - best.x) * -best.dz + (d.p.z - best.z) * best.dx) > 0 ? 1 : -1;
    return { seg: d.seg, zijde, p: d.p, gewicht: 1 };
  }

  gebouwPlek(id: number): Plek | null {
    const g = this.w.gebouwen.get(id);
    const k = g ? this.w.kavels.get(g.kavel) : null;
    if (!g || !k || !this.w.net.segmenten.has(k.seg)) return null;
    return { seg: k.seg, zijde: k.zijde, p: k.voor, gewicht: 1 };
  }

  /** Afstanden over het wegennet vanaf een plek (Dijkstra over de knopen), tot een maximum. */
  private afstanden(seg: number, s: number, max: number): Map<number, number> {
    const net = this.w.net;
    const d = new Map<number, number>();
    const sg = net.segmenten.get(seg);
    if (!sg) return d;
    const open: [number, number][] = [[sg.a, s], [sg.b, sg.lengte - s]];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][1] < open[bi][1]) bi = i;
      const [k, dk] = open.splice(bi, 1)[0];
      if (dk > max || (d.has(k) && d.get(k)! <= dk)) continue;
      d.set(k, dk);
      const kn = net.knopen.get(k);
      if (!kn) continue;
      for (const sid of kn.segs) {
        const x = net.segmenten.get(sid);
        if (!x) continue;
        const ander = x.a === k ? x.b : x.a;
        const nd = dk + x.lengte;
        if (nd <= max && (!d.has(ander) || d.get(ander)! > nd)) open.push([ander, nd]);
      }
    }
    return d;
  }

  private berekenDekking() {
    const net = this.w.net;
    this.dekking.clear();
    const stations = [...this.w.voorzieningen.diensten.values()].filter(d => d.klaar && DIENSTEN[d.soort].dekking);
    const velden = stations.map(d => {
      const info = DIENSTEN[d.soort].dekking!;
      return { info, dist: this.afstanden(d.seg, this.positie(d.seg, d.p), info.bereik), seg: d.seg, s: this.positie(d.seg, d.p) };
    });
    for (const g of this.w.gebouwen.values()) {
      const k = this.w.kavels.get(g.kavel);
      const r: Record<DekkingSoort, number> = { brand: 0, politie: 0, zorg: 0 };
      if (k) {
        const sg = net.segmenten.get(k.seg);
        if (sg) {
          const s = (k.s0 + k.s1) / 2;
          for (const v of velden) {
            let d = Infinity;
            if (v.seg === k.seg) d = Math.abs(v.s - s);
            const da = v.dist.get(sg.a), db = v.dist.get(sg.b);
            if (da !== undefined) d = Math.min(d, da + s);
            if (db !== undefined) d = Math.min(d, db + sg.lengte - s);
            if (d > v.info.bereik) continue;
            const x = Math.pow(1 - d / v.info.bereik, 0.6) * v.info.kwaliteit;
            r[v.info.soort] = Math.max(r[v.info.soort], x);
          }
        }
      }
      this.dekking.set(g.id, r);
    }
  }

  dekkingVan(id: number): Record<DekkingSoort, number> { return this.dekking.get(id) ?? { brand: 0, politie: 0, zorg: 0 }; }

  // ─── Inzetten ────────────────────────────────────────────────────────────────

  private bezet(station: number) { let n = 0; for (const z of this.inzetten.values()) if (z.station === station) n++; return n; }

  /** Dichtstbijzijnde station met een vrij voertuig voor een gebouw (hemelsbreed als maat). */
  private vrijStation(soort: DekkingSoort, gebouw: number): Dienst | null {
    const g = this.w.gebouwen.get(gebouw);
    if (!g) return null;
    let best: Dienst | null = null, bd = Infinity;
    for (const d of this.w.voorzieningen.diensten.values()) {
      const info = DIENSTEN[d.soort].dekking;
      if (!d.klaar || !info || info.soort !== soort) continue;
      if (this.bezet(d.id) >= info.voertuigen) continue;
      const afst = Math.hypot(d.p.x - g.centrum.x, d.p.z - g.centrum.z);
      if (afst > info.bereik * 1.2) continue;
      if (afst < bd) { bd = afst; best = d; }
    }
    return best;
  }

  private rukUit(inc: Incident) {
    const soort: DekkingSoort = inc.soort === 'brand' ? 'brand' : inc.soort === 'misdaad' ? 'politie' : 'zorg';
    if (this.dekkingVan(inc.gebouw)[soort] <= 0) return;
    const st = this.vrijStation(soort, inc.gebouw);
    if (!st) return;
    const van = this.dienstPlek(st), naar = this.gebouwPlek(inc.gebouw);
    if (!van || !naar) return;
    const z: Inzet = { id: this.volgende++, station: st.id, voertuig: 0, incident: inc.id, fase: 'heen', t: 0, hier: null };
    const v = this.w.verkeer.stuur(VOERTUIG[soort], van, naar, true, () => this.aangekomen(z.id));
    if (!v) return;
    z.voertuig = v.id; z.hier = naar;
    inc.inzet = z.id;
    this.inzetten.set(z.id, z);
  }

  private aangekomen(id: number) {
    const z = this.inzetten.get(id);
    if (!z) return;
    z.voertuig = 0; z.t = 0;
    if (z.fase === 'heen') z.fase = 'terplaatse';
    else if (z.fase === 'naarZiekenhuis') { this.stat.patienten++; z.fase = 'terug'; this.terug(z, true); }
    else if (z.fase === 'terug') this.inzetten.delete(id);
    else if (z.fase === 'surveillance') { z.fase = 'surveillance'; this.surveilleer(z); }
  }

  /** Terug naar het station (een nieuw voertuig op de weg; zonder sirene). */
  private terug(z: Inzet, al = false) {
    const st = this.w.voorzieningen.diensten.get(z.station);
    if (!st || !z.hier) { this.inzetten.delete(z.id); return; }
    if (al) {
      // Al bij het ziekenhuis = het station zelf; klaar.
      this.inzetten.delete(z.id);
      return;
    }
    const soort = DIENSTEN[st.soort].dekking!.soort;
    const van = z.hier, naar = this.dienstPlek(st);
    if (!naar) { this.inzetten.delete(z.id); return; }
    const v = this.w.verkeer.stuur(VOERTUIG[soort], van, naar, false, () => this.aangekomen(z.id));
    if (v) { z.voertuig = v.id; z.fase = 'terug'; }
  }

  /** Surveillance: naar een willekeurig gebouw binnen het bereik van het bureau. */
  private surveilleer(z: Inzet) {
    const st = this.w.voorzieningen.diensten.get(z.station);
    if (!st) { this.inzetten.delete(z.id); return; }
    const kandidaten = [...this.dekking.entries()].filter(([, d]) => d.politie > 0.15).map(([id]) => id);
    if (!kandidaten.length) { this.inzetten.delete(z.id); return; }
    const doel = kandidaten[Math.floor(this.rng.next() * kandidaten.length)];
    const van = z.hier ?? this.dienstPlek(st), naar = this.gebouwPlek(doel);
    if (!van || !naar) return;
    const v = this.w.verkeer.stuur('politie', van, naar, false, () => this.aangekomen(z.id));
    if (v) { z.voertuig = v.id; z.hier = naar; z.fase = 'surveillance'; }
  }

  // ─── Simulatie ───────────────────────────────────────────────────────────────

  stap(dt: number) {
    this.klok += dt;
    if (this.klok > 3) { this.klok = 0; this.berekenDekking(); this.berekenStat(); }
    if (!this.dekking.size) return;
    const groei = Math.min(1, this.w.stat.inwoners / 1500);
    // Nieuwe incidenten.
    for (const g of this.w.gebouwen.values()) {
      if (!g.klaar) continue;
      const d = this.dekkingVan(g.id);
      const r = this.rng.next();
      const zone = g.vorm === 'bedrijfshal' ? 2.5 : g.vorm === 'kantoortoren' ? 1 : 0.8;
      const pBrand = 3.2e-5 * zone * (1 - 0.85 * d.brand) * groei;
      const pMisdaad = 2.5e-5 * (1 - 0.8 * d.politie) * (0.5 + this.w.stat.werkloosheid * 3) * groei;
      const pZiek = 8e-7 * g.cap.bewoners * g.bezetting * (1 - 0.3 * d.zorg);
      let soort: IncidentSoort | null = null;
      if (r < pBrand * dt) soort = 'brand';
      else if (r < (pBrand + pMisdaad) * dt) soort = 'misdaad';
      else if (r < (pBrand + pMisdaad + pZiek) * dt) soort = 'ziekte';
      if (!soort || [...this.incidenten.values()].some(i => i.gebouw === g.id)) continue;
      const inc: Incident = { id: this.volgende++, soort, gebouw: g.id, t: 0, ernst: soort === 'brand' ? 0.1 : 0, inzet: 0, geholpen: 0 };
      this.incidenten.set(inc.id, inc);
      if (soort === 'brand') this.stat.branden++;
      if (soort === 'misdaad') this.stat.misdrijven++;
    }
    // Incidenten bijwerken.
    for (const inc of [...this.incidenten.values()]) {
      inc.t += dt;
      const g = this.w.gebouwen.get(inc.gebouw);
      if (!g) { this.incidenten.delete(inc.id); continue; }
      const z = inc.inzet ? this.inzetten.get(inc.inzet) : undefined;
      if (!z && (inc.t < 0.5 || Math.floor(inc.t) !== Math.floor(inc.t - dt))) this.rukUit(inc);
      const terPlaatse = z?.fase === 'terplaatse';
      if (inc.soort === 'brand') {
        if (terPlaatse) inc.ernst = Math.max(0, inc.ernst - dt / 10);
        else inc.ernst += dt / 150;
        if (inc.ernst >= 1) {
          this.stat.afgebrand++;
          this.w.meld(`Brand: een ${g.vorm === 'rijwoningen' ? 'rij woningen' : g.vorm === 'bedrijfshal' ? 'bedrijfshal' : 'pand'} aan de ${this.w.straatVan(g) || 'straat'} is afgebrand`, 'waarschuwing');
          this.w.verwijderGebouw(g.id);
          this.incidenten.delete(inc.id);
          if (z) { z.hier = this.gebouwPlek(g.id) ?? z.hier; }
          continue;
        }
        if (terPlaatse && inc.ernst <= 0) { this.stat.geblust++; this.klaar(inc, z!); }
      } else if (inc.soort === 'misdaad') {
        if (terPlaatse) { inc.geholpen += dt; if (inc.geholpen > 8) { this.stat.opgelost++; this.klaar(inc, z!); } }
        else if (inc.t > 140) this.incidenten.delete(inc.id);
      } else {
        if (terPlaatse) {
          inc.geholpen += dt;
          if (inc.geholpen > 6) {
            // Patiënt mee naar het ziekenhuis (of de post waar de ambulance vandaan komt).
            this.incidenten.delete(inc.id);
            const st = this.w.voorzieningen.diensten.get(z!.station);
            const zh = [...this.w.voorzieningen.diensten.values()].filter(d => d.klaar && d.soort === 'ziekenhuis').sort((a, b) => Math.hypot(a.p.x - g.centrum.x, a.p.z - g.centrum.z) - Math.hypot(b.p.x - g.centrum.x, b.p.z - g.centrum.z))[0] ?? st;
            const naar = zh ? this.dienstPlek(zh) : null;
            if (naar && z!.hier) {
              const v = this.w.verkeer.stuur('ambulance', z!.hier, naar, true, () => this.aangekomen(z!.id));
              if (v) { z!.voertuig = v.id; z!.fase = 'naarZiekenhuis'; if (zh) z!.station = zh.id; }
              else { z!.fase = 'terug'; this.terug(z!); }
            }
          }
        } else if (inc.t > 90) {
          // Binnen de dekking gaat de patiënt zelf naar de huisarts; zonder zorg in de buurt loopt het slecht af.
          this.incidenten.delete(inc.id);
          if (this.dekkingVan(inc.gebouw).zorg <= 0) {
            this.stat.overleden++;
            if (this.stat.overleden % 5 === 1) this.w.meld('Een zieke inwoner is overleden voordat er hulp kwam: zorg voor een ziekenhuis of gezondheidscentrum', 'waarschuwing');
          }
        }
      }
    }
    // Inzetten: voertuigen die vastliepen en verdwenen, terugrit opnieuw proberen, surveillance.
    for (const z of [...this.inzetten.values()]) {
      z.t += dt;
      if (z.voertuig && !this.w.verkeer.voertuigen.has(z.voertuig)) {
        // Voertuig onderweg verdwenen (vastgelopen): inzet vervalt.
        const inc = this.incidenten.get(z.incident);
        if (inc && inc.inzet === z.id) inc.inzet = 0;
        this.inzetten.delete(z.id);
        continue;
      }
      if (!z.voertuig && z.fase === 'terug') this.terug(z);
      if (!z.voertuig && z.fase === 'surveillance') this.surveilleer(z);
      if (z.fase === 'terplaatse' && !this.incidenten.has(z.incident)) { z.fase = 'terug'; this.terug(z); }
    }
    // Surveillance: elk politiebureau houdt de helft van zijn wagens op straat.
    for (const d of this.w.voorzieningen.diensten.values()) {
      if (!d.klaar || d.soort !== 'politie') continue;
      const patrouilles = [...this.inzetten.values()].filter(z => z.station === d.id && z.fase === 'surveillance').length;
      if (patrouilles < 2 && this.bezet(d.id) < DIENSTEN.politie.dekking!.voertuigen) {
        const z: Inzet = { id: this.volgende++, station: d.id, voertuig: 0, incident: 0, fase: 'surveillance', t: 0, hier: null };
        this.inzetten.set(z.id, z);
        this.surveilleer(z);
        if (!z.voertuig) this.inzetten.delete(z.id);
      }
    }
  }

  /** Brand stichten (voor tests en screenshots). */
  steekAan(gebouw: number, ernst = 0.3) {
    const inc: Incident = { id: this.volgende++, soort: 'brand', gebouw, t: 0, ernst, inzet: 0, geholpen: 0 };
    this.incidenten.set(inc.id, inc);
    this.stat.branden++;
  }

  private klaar(inc: Incident, z: Inzet) {
    this.incidenten.delete(inc.id);
    z.fase = 'terug';
    this.terug(z);
  }

  private berekenStat() {
    let n = 0, br = 0, mis = 0, zorg = 0;
    for (const g of this.w.gebouwen.values()) {
      if (!g.klaar) continue;
      const d = this.dekkingVan(g.id), gew = Math.max(1, g.cap.bewoners + (g.cap.banen.kantoor + g.cap.banen.industrie + g.cap.banen.detailhandel) * 0.5);
      n += gew; br += d.brand * gew; zorg += d.zorg * gew;
      mis += (1 - 0.8 * d.politie) * (0.4 + this.w.stat.werkloosheid * 2) * gew;
    }
    this.stat.brandveiligheid = n ? br / n : 0;
    this.stat.gezondheid = n ? zorg / n : 0;
    this.stat.misdaad = n ? Math.min(1, mis / n) : 0;
  }

  /** Aantal voertuigen van een station dat onderweg is. */
  onderweg(station: number) { return this.bezet(station); }
}
