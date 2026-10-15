import { V2, dist2, puntInPolygoon, polygonenOverlappen } from './math';
import { afstandTotLijn } from './poly';
import { halveBreedte } from './wegen/typen';
import type { Wereld } from './wereld';

// ════════════════════════════════════════════════════════════════════════════════════
// NUTSVOORZIENINGEN: STROOM, WATER, RIOOL, AFVAL
// Zoals in Cities: Skylines 2 lopen leidingen en kabels langs de wegen: een voorziening levert aan
// alle gebouwen die via het wegennet met haar verbonden zijn. Per los netwerk wordt productie
// tegen verbruik gezet; is er een verbinding met de buitenwereld, dan kan het tekort (duur)
// worden ingekocht. Gebouwen zonder voorziening lopen leeg en remmen de groei.
// Verbruik met Nederlandse ordegroottes: ~3.300 kWh stroom per huishouden per jaar, 130 liter
// drinkwater per persoon per dag, ~450 kg huishoudelijk afval per persoon per jaar.
// ════════════════════════════════════════════════════════════════════════════════════

export type Nut = 'stroom' | 'water' | 'riool' | 'afval';
export type DienstSoort = 'windmolen' | 'zonnepark' | 'gascentrale' | 'pompstation' | 'rwzi' | 'stortplaats' | 'afvalcentrale';

export interface DienstInfo {
  naam: string; groep: 'stroom' | 'water' | 'afval';
  /** Breedte langs de weg en diepte (m). */
  b: number; d: number;
  kosten: number; onderhoud: number; // euro, euro per maand
  levert: Partial<Record<Nut, number>>; // MW, m³/dag, m³/dag, ton/jaar
  uitleg: string;
}

export const DIENSTEN: Record<DienstSoort, DienstInfo> = {
  windmolen: { naam: 'Windturbine', groep: 'stroom', b: 40, d: 40, kosten: 5_500_000, onderhoud: 14_000, levert: { stroom: 1.5 }, uitleg: '4,2 MW, gemiddeld ~1,5 MW. Ashoogte 120 m.' },
  zonnepark: { naam: 'Zonnepark', groep: 'stroom', b: 180, d: 120, kosten: 2_600_000, onderhoud: 6_000, levert: { stroom: 0.35 }, uitleg: '2,2 ha panelen, ~3 MWp, gemiddeld ~0,35 MW.' },
  gascentrale: { naam: 'Gascentrale (WKK)', groep: 'stroom', b: 90, d: 80, kosten: 32_000_000, onderhoud: 160_000, levert: { stroom: 40 }, uitleg: '40 MW, altijd beschikbaar, wel uitstoot.' },
  pompstation: { naam: 'Drinkwaterpompstation', groep: 'water', b: 60, d: 50, kosten: 7_000_000, onderhoud: 22_000, levert: { water: 9000 }, uitleg: '9.000 m³ drinkwater per dag (~60.000 inwoners).' },
  rwzi: { naam: 'Rioolwaterzuivering', groep: 'water', b: 100, d: 80, kosten: 11_000_000, onderhoud: 34_000, levert: { riool: 9000 }, uitleg: 'Zuivert 9.000 m³ afvalwater per dag.' },
  stortplaats: { naam: 'Afvalstortplaats', groep: 'afval', b: 140, d: 110, kosten: 3_500_000, onderhoud: 18_000, levert: { afval: 15000 }, uitleg: '15.000 ton afval per jaar.' },
  afvalcentrale: { naam: 'Afvalenergiecentrale', groep: 'afval', b: 90, d: 80, kosten: 45_000_000, onderhoud: 130_000, levert: { afval: 60000, stroom: 6 }, uitleg: '60.000 ton per jaar en 6 MW stroom.' },
};

export const NUT_EENHEID: Record<Nut, string> = { stroom: 'MW', water: 'm³/dag', riool: 'm³/dag', afval: 'ton/jaar' };
export const NUT_NAAM: Record<Nut, string> = { stroom: 'Stroom', water: 'Drinkwater', riool: 'Riolering', afval: 'Afval' };
/** Inkoopprijs per eenheid per maand (stroom per MW gemiddeld, water/riool per m³/dag, afval per ton/jaar). */
const INKOOP: Record<Nut, number> = { stroom: 0.16 * 1000 * 730, water: 1.6 * 30, riool: 1.4 * 30, afval: 140 / 12 };

export interface Dienst {
  id: number; soort: DienstSoort;
  /** Midden, richting naar de weg (rad, zoals bedrijven), voetafdruk. */
  p: V2; rot: number; voet: V2[]; seg: number;
  voortgang: number; klaar: boolean;
}

export interface Balans { productie: number; verbruik: number; inkoop: number; tekort: number }

export class Voorzieningen {
  diensten = new Map<number, Dienst>();
  events: { soort: 'dienst+' | 'dienst-' | 'dienst~'; id: number }[] = [];
  /** Balans voor de hele stad. */
  balans: Record<Nut, Balans> = { stroom: leeg(), water: leeg(), riool: leeg(), afval: leeg() };
  /** Gebouwen zonder voorziening (per gebouw-id). */
  tekort = new Map<number, Set<Nut>>();
  /** Aandeel gebouwen met een tekort (0-1), voor vraag en tevredenheid. */
  tekortAandeel = 0;
  onderhoud = 0; inkoopKosten = 0;
  private volgende = 1;
  private klok = 99;

  constructor(private w: Wereld) {}

  /** Plek voor een voorziening bij p: aan de dichtstbijzijnde weg, met de voorkant naar de weg. */
  plek(soort: DienstSoort, p: V2): { dienst: Omit<Dienst, 'id' | 'voortgang' | 'klaar'>; fout: string | null } | null {
    const info = DIENSTEN[soort];
    const s = this.w.net.segmentBij(p, Math.max(40, info.d));
    if (!s) return null;
    let best = s.seg.pad[0], bd = Infinity;
    for (const q of s.seg.pad) { const d = dist2(q, p); if (d < bd) { bd = d; best = q; } }
    let n = { x: -best.dz, z: best.dx };
    if ((p.x - best.x) * n.x + (p.z - best.z) * n.z < 0) n = { x: -n.x, z: -n.z };
    const afstand = halveBreedte(s.seg.type) + 2 + info.d / 2;
    const c = { x: best.x + n.x * afstand, z: best.z + n.z * afstand };
    const t = { x: -n.z, z: n.x };
    const hoek = (a: number, b: number) => ({ x: c.x + t.x * a + n.x * b, z: c.z + t.z * a + n.z * b });
    const voet = [hoek(-info.b / 2, -info.d / 2), hoek(info.b / 2, -info.d / 2), hoek(info.b / 2, info.d / 2), hoek(-info.b / 2, info.d / 2)];
    const dienst = { soort, p: c, rot: Math.atan2(-n.x, -n.z), voet, seg: s.seg.id };
    return { dienst, fout: this.controleer(voet) ?? (info.kosten > this.w.geld ? 'Niet genoeg geld' : null) };
  }

  private controleer(voet: V2[]): string | null {
    const t = this.w.terrein;
    for (const q of voet) if (!t.binnen(q.x, q.z, 10) || t.hoogte(q.x, q.z) < 0.6) return 'Niet in het water of buiten de kaart';
    for (const g of this.w.gebouwen.values()) if (polygonenOverlappen(voet, g.voet)) return 'Er staat een gebouw in de weg';
    for (const d of this.diensten.values()) if (polygonenOverlappen(voet, d.voet)) return 'Overlapt een andere voorziening';
    for (const sg of this.w.net.segmenten.values()) {
      const hb = halveBreedte(sg.type) + 1;
      if (sg.pad.some(q => puntInPolygoon(q, voet))) return 'Er loopt een weg doorheen';
      if (voet.some(q => afstandTotLijn(q, sg.pad).d < hb)) return 'Er loopt een weg doorheen';
    }
    for (const b of this.w.economie.bedrijven.values()) if (puntInPolygoon(b.p, voet)) return 'Er staat een bedrijf in de weg';
    return null;
  }

  bouw(soort: DienstSoort, p: V2): string | null {
    const r = this.plek(soort, p);
    if (!r) return 'Zet een voorziening naast een weg';
    if (r.fout) return r.fout;
    const d: Dienst = { ...r.dienst, id: this.volgende++, voortgang: 0, klaar: false };
    this.diensten.set(d.id, d);
    this.w.geld -= DIENSTEN[soort].kosten;
    // Kavels onder de voorziening vrijmaken (geen zones meer).
    for (const k of this.w.kavels.values()) if (this.binnen(k.voor) || puntInPolygoon(midden(k.poly), d.voet)) {
      if (k.zone !== 'geen') { k.zone = 'geen'; this.w.events.push({ soort: 'kavel~', id: k.id }); }
    }
    this.w.bomen.wisInPolygoon(d.voet, 2);
    this.events.push({ soort: 'dienst+', id: d.id });
    this.w.meld(`${DIENSTEN[soort].naam} in aanbouw`, 'bouw');
    this.klok = 99;
    return null;
  }

  sloop(id: number) {
    const d = this.diensten.get(id);
    if (!d) return;
    this.diensten.delete(id);
    this.w.geld += DIENSTEN[d.soort].kosten * 0.2;
    this.events.push({ soort: 'dienst-', id });
    this.klok = 99;
  }

  dienstOp(p: V2): Dienst | null {
    for (const d of this.diensten.values()) if (puntInPolygoon(p, d.voet)) return d;
    return null;
  }

  /** Ligt p op het terrein van een voorziening? (Daar wordt niet gezoneerd of gebouwd.) */
  binnen(p: V2) { for (const d of this.diensten.values()) if (puntInPolygoon(p, d.voet)) return true; return false; }

  /** Verbruik van een gebouw. */
  static verbruik(g: { cap: { bewoners: number; woningen: number; banen: Record<string, number> }; bezetting: number }): Record<Nut, number> {
    const b = g.cap.banen, f = Math.max(0.15, g.bezetting);
    const kantoor = (b.kantoor ?? 0) + (b.overig ?? 0), winkel = (b.detailhandel ?? 0) + (b.horeca ?? 0), ind = b.industrie ?? 0;
    const stroom = (g.cap.woningen * 0.00038 + kantoor * 0.0007 + winkel * 0.0011 + ind * 0.003) * f;
    const water = (g.cap.bewoners * 0.13 + (kantoor + winkel) * 0.04 + ind * 0.25) * f;
    return { stroom, water, riool: water * 0.95, afval: (g.cap.bewoners * 0.45 + (kantoor + winkel) * 0.15 + ind * 0.6) * f };
  }

  stap(dt: number) {
    for (const d of this.diensten.values()) {
      if (d.klaar) continue;
      d.voortgang = Math.min(1, d.voortgang + dt / 30);
      if (d.voortgang >= 1) { d.klaar = true; this.events.push({ soort: 'dienst~', id: d.id }); this.w.meld(`${DIENSTEN[d.soort].naam} is in bedrijf`, 'bouw'); this.klok = 99; }
    }
    this.klok += dt;
    if (this.klok < 2) return;
    this.klok = 0;
    this.bereken();
  }

  /** Netwerken (samenhangende delen van het wegennet) en de balans per netwerk. */
  bereken() {
    const net = this.w.net;
    // Union-find over knopen.
    const ouder = new Map<number, number>();
    const zoek = (k: number): number => { let r = k; while (ouder.has(r) && ouder.get(r) !== r) r = ouder.get(r)!; ouder.set(k, r); return r; };
    for (const k of net.knopen.keys()) ouder.set(k, k);
    for (const s of net.segmenten.values()) { const a = zoek(s.a), b = zoek(s.b); if (a !== b) ouder.set(a, b); }
    const netVan = (seg: number) => { const s = net.segmenten.get(seg); return s ? zoek(s.a) : -1; };
    // Buitenaansluitingen: knopen aan de rand van de kaart.
    const buiten = new Set<number>();
    const g = this.w.terrein.grootte / 2;
    for (const k of net.knopen.values()) if (k.segs.length === 1 && Math.max(Math.abs(k.p.x), Math.abs(k.p.z)) > g - 160) buiten.add(zoek(k.id));
    const NUTS: Nut[] = ['stroom', 'water', 'riool', 'afval'];
    type Pot = Record<Nut, { p: number; v: number }>;
    const potten = new Map<number, Pot>();
    const pot = (n: number) => { let x = potten.get(n); if (!x) potten.set(n, x = { stroom: { p: 0, v: 0 }, water: { p: 0, v: 0 }, riool: { p: 0, v: 0 }, afval: { p: 0, v: 0 } }); return x; };
    this.onderhoud = 0;
    for (const d of this.diensten.values()) {
      const info = DIENSTEN[d.soort];
      this.onderhoud += info.onderhoud * (d.klaar ? 1 : 0.2);
      if (!d.klaar) continue;
      const n = netVan(d.seg);
      if (n < 0) continue;
      for (const [nut, x] of Object.entries(info.levert) as [Nut, number][]) pot(n)[nut].p += x;
    }
    // Gebouwen per netwerk, in vaste volgorde (bij een tekort valt steeds hetzelfde deel uit).
    const perNet = new Map<number, { id: number; v: Record<Nut, number> }[]>();
    for (const gb of this.w.gebouwen.values()) {
      if (!gb.klaar) continue;
      const k = this.w.kavels.get(gb.kavel);
      const n = k ? netVan(k.seg) : -1;
      const v = Voorzieningen.verbruik(gb);
      let l = perNet.get(n); if (!l) perNet.set(n, l = []); l.push({ id: gb.id, v });
      if (n >= 0) for (const nut of NUTS) pot(n)[nut].v += v[nut];
    }
    // Ook de winningsbedrijven gebruiken stroom en water.
    this.tekort.clear();
    const totaal: Record<Nut, Balans> = { stroom: leeg(), water: leeg(), riool: leeg(), afval: leeg() };
    let inkoop = 0, metTekort = 0, n = 0;
    for (const [netId, lijst] of perNet) {
      const p = netId >= 0 ? pot(netId) : null;
      const kanInkopen = netId >= 0 && buiten.has(netId);
      const beschikbaar: Record<Nut, number> = { stroom: 0, water: 0, riool: 0, afval: 0 };
      for (const nut of NUTS) {
        const prod = p ? p[nut].p : 0, verbr = p ? p[nut].v : lijst.reduce((s, x) => s + x.v[nut], 0);
        const ingekocht = kanInkopen ? Math.max(0, verbr - prod) : 0;
        beschikbaar[nut] = prod + ingekocht;
        inkoop += ingekocht * INKOOP[nut];
        totaal[nut].productie += prod; totaal[nut].verbruik += verbr; totaal[nut].inkoop += ingekocht;
        totaal[nut].tekort += Math.max(0, verbr - prod - ingekocht);
      }
      lijst.sort((a, b) => ((a.id * 2654435761) >>> 0) - ((b.id * 2654435761) >>> 0));
      for (const x of lijst) {
        n++;
        let mis: Set<Nut> | null = null;
        for (const nut of NUTS) {
          if (x.v[nut] <= 1e-9) continue;
          if (beschikbaar[nut] >= x.v[nut]) beschikbaar[nut] -= x.v[nut];
          else { beschikbaar[nut] = 0; (mis ??= new Set()).add(nut); }
        }
        if (mis) { this.tekort.set(x.id, mis); metTekort++; }
      }
    }
    // Productie die niet gebruikt wordt (netwerk zonder gebouwen) telt ook mee in het totaal.
    for (const [netId, p] of potten) if (!perNet.has(netId)) for (const nut of NUTS) totaal[nut].productie += p[nut].p;
    this.balans = totaal;
    this.inkoopKosten = inkoop;
    this.tekortAandeel = n ? metTekort / n : 0;
  }

  haalEvents() { const e = this.events; this.events = []; return e; }
}

function leeg(): Balans { return { productie: 0, verbruik: 0, inkoop: 0, tekort: 0 }; }
function midden(poly: V2[]): V2 { let x = 0, z = 0; for (const p of poly) { x += p.x; z += p.z; } return { x: x / poly.length, z: z / poly.length }; }
