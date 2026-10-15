import { V2, dist2, puntInPolygoon, smoothstep } from './math';
import { fbm } from './noise';
import { Terrein, bosDichtheid } from './terrain';
import { Rng } from './rng';
import { knipHalfvlak, getekendOppervlak, zwaartepunt, afstandTotLijn } from './poly';
import { halveBreedte } from './wegen/typen';
import type { Wereld } from './wereld';

// ════════════════════════════════════════════════════════════════════════════════════
// GRONDSTOFFEN EN PRODUCTIEKETENS
// De speler tekent gebieden (zoals in Cities: Skylines 2) voor landbouw, bosbouw, olie of
// delfstoffen. Daarin ontstaan bedrijven die grondstoffen winnen; de verwerkende industrie in
// de industriezone maakt er producten van, de rest gaat de export in.
// Kengetallen zijn Nederlandse ordegroottes (per jaar):
//   akkerbouw ~9 t graan per ha, 1 arbeidsjaar per ~30 ha
//   bosbouw ~6 m³ hout per ha (duurzame kap)
//   oliewinning ~15 m³ per put per dag (kleine velden, zoals in Drenthe)
//   zand- en grindwinning ~150.000 t per groeve, ~12 banen
// ════════════════════════════════════════════════════════════════════════════════════

export type Grondstof = 'landbouw' | 'bosbouw' | 'olie' | 'delfstoffen';
export type Gewas = 'tarwe' | 'mais' | 'aardappel' | 'gras' | 'tulpen' | 'kaal';

export interface GrondstofInfo { id: Grondstof; naam: string; kleur: string; product: string; eenheid: string; verwerkt: string; prijsRuw: number; prijsVerwerkt: number }
export const GRONDSTOFFEN: Record<Grondstof, GrondstofInfo> = {
  landbouw: { id: 'landbouw', naam: 'Landbouw', kleur: '#c0d36b', product: 'Akkerbouwproducten', eenheid: 't', verwerkt: 'Voedingsmiddelen', prijsRuw: 220, prijsVerwerkt: 900 },
  bosbouw: { id: 'bosbouw', naam: 'Bosbouw', kleur: '#2f9e44', product: 'Rondhout', eenheid: 'm³', verwerkt: 'Timmerhout en meubels', prijsRuw: 70, prijsVerwerkt: 450 },
  olie: { id: 'olie', naam: 'Olie', kleur: '#495057', product: 'Ruwe olie', eenheid: 'm³', verwerkt: 'Brandstof en kunststof', prijsRuw: 450, prijsVerwerkt: 1100 },
  delfstoffen: { id: 'delfstoffen', naam: 'Delfstoffen', kleur: '#d9a066', product: 'Zand, grind en steen', eenheid: 't', verwerkt: 'Beton en bouwmaterialen', prijsRuw: 12, prijsVerwerkt: 60 },
};

/** Rijkdom van een grondstof op een punt (0–1). */
export function rijkdom(t: Terrein, soort: Grondstof, x: number, z: number): number {
  const h = t.hoogte(x, z);
  if (h < 1) return 0;
  switch (soort) {
    case 'landbouw': {
      const vlak = smoothstep(0.93, 0.99, t.normaal(x, z).y);
      const grond = fbm(x / 650, z / 650, 1, 3, 71, 0.5, false);
      return vlak * (1 - smoothstep(14, 26, h)) * (0.35 + grond * 0.75) * (1 - bosDichtheid(x, z, t) * 0.6);
    }
    case 'bosbouw': return bosDichtheid(x, z, t) * (0.6 + 0.4 * fbm(x / 300, z / 300, 1, 2, 72, 0.5, false));
    case 'olie': return smoothstep(0.6, 0.72, fbm(x / 900 + 3.1, z / 900 - 1.7, 1, 4, 73, 0.55, false));
    case 'delfstoffen': {
      const heuvel = smoothstep(16, 32, h) * smoothstep(0.35, 0.6, fbm(x / 400, z / 400, 1, 3, 74, 0.5, false));
      const rivier = 1 - smoothstep(30, 180, Math.abs(x - Terrein.rivierX(z)));
      return Math.min(1, Math.max(heuvel, rivier * 0.8));
    }
  }
}

export interface Veld { poly: V2[]; gewas: Gewas; as: V2; bedrijf: number; ha: number }
export interface Gebied { id: number; soort: Grondstof; poly: V2[]; ha: number; rijk: number; velden: Veld[] }

export interface Bedrijf {
  id: number; gebied: number; soort: Grondstof; naam: string;
  p: V2; rot: number; y: number;
  /** Wingebied (akkers, kapvlak, putten of de groeve). */
  ha: number; banen: number;
  /** Productie per maand (eenheid van de grondstof) bij volle bezetting. */
  productie: number;
  voortgang: number; klaar: boolean;
  putten: V2[]; seed: number;
}

/** Verwerkingscapaciteit per arbeidsplaats per maand. */
export const PER_BAAN: Record<Grondstof, number> = { landbouw: 30, bosbouw: 80, olie: 300, delfstoffen: 1500 };

export interface Keten { soort: Grondstof; productie: number; verwerkt: number; exportRuw: number; exportVerwerkt: number; banenWinning: number; banenVerwerking: number; waarde: number }

const NAMEN: Record<Grondstof, string[]> = {
  landbouw: ['Hoeve De Eendracht', 'Boerderij Zonnehoek', 'Hoeve Welgelegen', 'Akkerbouwbedrijf Van Dijk', 'Hoeve De Hoop', 'Maatschap Bakker', 'Hoeve Groenendaal', 'Bollenkwekerij Tulpenland'],
  bosbouw: ['Houtvesterij Het Woud', 'Bosbedrijf De Eik', 'Houthandel Veluwerand', 'Bosbouw Hazenberg'],
  olie: ['Olieveld Noord', 'NAM-put De Kolk', 'Olieveld Schoonebeek-West', 'Winning De Venen'],
  delfstoffen: ['Zandwinning De Plas', 'Grindgroeve Maasoever', 'Steengroeve Bergrand', 'Zand & Grind Rivierland'],
};

export class Economie {
  gebieden = new Map<number, Gebied>();
  bedrijven = new Map<number, Bedrijf>();
  ketens: Record<Grondstof, Keten>;
  events: { soort: 'gebied+' | 'gebied-' | 'bedrijf+' | 'bedrijf-' | 'bedrijf~'; id: number }[] = [];
  private volgende = 1;
  private klok = 0;
  private maandKlok = 0;
  private rng = new Rng(9133);

  constructor(private w: Wereld) {
    this.ketens = Object.fromEntries((Object.keys(GRONDSTOFFEN) as Grondstof[]).map(s => [s, { soort: s, productie: 0, verwerkt: 0, exportRuw: 0, exportVerwerkt: 0, banenWinning: 0, banenVerwerking: 0, waarde: 0 }])) as Record<Grondstof, Keten>;
  }

  /** Gemiddelde rijkdom in een polygoon (bemonsterd op 20 m). */
  gemiddeldeRijkdom(soort: Grondstof, poly: V2[]): number {
    let s = 0, n = 0;
    const [x0, z0, x1, z1] = omhulling(poly);
    for (let x = x0; x <= x1; x += 20) for (let z = z0; z <= z1; z += 20) {
      if (!puntInPolygoon({ x, z }, poly)) continue;
      s += rijkdom(this.w.terrein, soort, x, z); n++;
    }
    return n ? s / n : 0;
  }

  /** Een gebied tekenen. Geeft een foutmelding of null. */
  maakGebied(soort: Grondstof, poly: V2[]): string | null {
    if (poly.length < 3) return 'Teken minstens drie punten';
    const ha = Math.abs(getekendOppervlak(poly)) / 10000;
    if (ha < 1.5) return 'Gebied te klein (minimaal 1,5 ha)';
    for (const g of this.gebieden.values()) if (poly.some(p => puntInPolygoon(p, g.poly)) || g.poly.some(p => puntInPolygoon(p, poly))) return 'Overlapt een ander gebied';
    // Bereikbaar: een weg moet het gebied raken (binnen 40 m).
    let weg = false;
    for (const s of this.w.net.segmenten.values()) {
      if (s.pad.some(p => puntInPolygoon(p, poly) || afstandTotLijn(p, [...poly, poly[0]]).d < 40 + halveBreedte(s.type))) { weg = true; break; }
    }
    if (!weg) return 'Het gebied moet aan een weg liggen';
    const rijk = this.gemiddeldeRijkdom(soort, poly);
    if (rijk < 0.12) return `Hier zit (bijna) geen ${GRONDSTOFFEN[soort].naam.toLowerCase()}grond`;
    const g: Gebied = { id: this.volgende++, soort, poly: poly.map(p => ({ ...p })), ha, rijk, velden: [] };
    if (soort === 'landbouw') g.velden = this.verdeelVelden(g);
    this.gebieden.set(g.id, g);
    this.events.push({ soort: 'gebied+', id: g.id });
    this.w.meld(`Nieuw ${GRONDSTOFFEN[soort].naam.toLowerCase()}gebied van ${Math.round(ha)} ha aangewezen`, 'weg');
    return null;
  }

  verwijderGebied(id: number) {
    const g = this.gebieden.get(id);
    if (!g) return;
    for (const b of [...this.bedrijven.values()]) if (b.gebied === id) { this.bedrijven.delete(b.id); this.events.push({ soort: 'bedrijf-', id: b.id }); }
    this.gebieden.delete(id);
    this.events.push({ soort: 'gebied-', id });
  }

  gebiedOp(p: V2): Gebied | null {
    for (const g of this.gebieden.values()) if (puntInPolygoon(p, g.poly)) return g;
    return null;
  }

  /** Akkers: het gebied in kavels van ~90 × 180 m langs de hoofdrichting, wegen eruit. */
  private verdeelVelden(g: Gebied): Veld[] {
    // Hoofdrichting: langste rand.
    let as = { x: 1, z: 0 }, lang = 0;
    for (let i = 0; i < g.poly.length; i++) {
      const a = g.poly[i], b = g.poly[(i + 1) % g.poly.length], L = dist2(a, b);
      if (L > lang) { lang = L; as = { x: (b.x - a.x) / L, z: (b.z - a.z) / L }; }
    }
    const dw = { x: -as.z, z: as.x };
    const c = zwaartepunt(g.poly);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of g.poly) { const u = (p.x - c.x) * as.x + (p.z - c.z) * as.z, v = (p.x - c.x) * dw.x + (p.z - c.z) * dw.z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const BU = 180, BV = 90, SLOOT = 3;
    const velden: Veld[] = [];
    const gewassen: Gewas[] = ['tarwe', 'tarwe', 'mais', 'aardappel', 'gras', 'gras', 'tulpen', 'kaal'];
    for (let u = u0; u < u1; u += BU) for (let v = v0; v < v1; v += BV) {
      const P = (a: number, b: number) => ({ x: c.x + as.x * a + dw.x * b, z: c.z + as.z * a + dw.z * b });
      let poly = [P(u + SLOOT, v + SLOOT), P(u + BU - SLOOT, v + SLOOT), P(u + BU - SLOOT, v + BV - SLOOT), P(u + SLOOT, v + BV - SLOOT)];
      // Afknippen op het gebied (per rand van het gebied, werkt voor bolle gebieden; holle randen benaderd).
      const A = getekendOppervlak(g.poly);
      for (let i = 0; i < g.poly.length && poly.length >= 3; i++) {
        const a = g.poly[i], b = g.poly[(i + 1) % g.poly.length];
        const t = { x: b.x - a.x, z: b.z - a.z };
        const n = A > 0 ? { x: -t.z, z: t.x } : { x: t.z, z: -t.x };
        poly = knipHalfvlak(poly, a, n);
      }
      if (poly.length < 3) continue;
      const m = zwaartepunt(poly);
      if (!puntInPolygoon(m, g.poly)) continue;
      const ha = Math.abs(getekendOppervlak(poly)) / 10000;
      if (ha < 0.3) continue;
      // Geen akker over een weg.
      let opWeg = false;
      for (const s of this.w.net.segmenten.values()) if (s.pad.some(p => puntInPolygoon(p, poly)) || afstandTotLijn(m, s.pad).d < halveBreedte(s.type) + 6) { opWeg = true; break; }
      if (opWeg) continue;
      if (rijkdom(this.w.terrein, 'landbouw', m.x, m.z) < 0.1) continue;
      velden.push({ poly, gewas: this.rng.kies(gewassen), as, bedrijf: 0, ha });
    }
    return velden;
  }

  /** Vrij punt voor een nieuw bedrijf: rijk genoeg, niet op een weg, kavel of ander bedrijf. */
  private plek(g: Gebied, afstandTussen: number): V2 | null {
    const [x0, z0, x1, z1] = omhulling(g.poly);
    let best: V2 | null = null, br = 0;
    for (let poging = 0; poging < 40; poging++) {
      const p = { x: x0 + this.rng.next() * (x1 - x0), z: z0 + this.rng.next() * (z1 - z0) };
      if (!puntInPolygoon(p, g.poly)) continue;
      const r = rijkdom(this.w.terrein, g.soort, p.x, p.z);
      if (r < 0.2 || r <= br) continue;
      if ([...this.bedrijven.values()].some(b => b.gebied === g.id && dist2(b.p, p) < afstandTussen)) continue;
      let vrij = true;
      for (const s of this.w.net.segmenten.values()) if (afstandTotLijn(p, s.pad).d < halveBreedte(s.type) + 22) { vrij = false; break; }
      if (vrij && this.w.gebouwOp(p)) vrij = false;
      if (vrij) { best = p; br = r; }
    }
    return best;
  }

  /** Richting naar de dichtstbijzijnde weg (voor de oriëntatie van het erf). */
  private naarWeg(p: V2): number {
    let best = Infinity, dir = 0;
    for (const s of this.w.net.segmenten.values()) for (const q of s.pad) { const d = dist2(p, q); if (d < best) { best = d; dir = Math.atan2(q.x - p.x, q.z - p.z); } }
    return dir;
  }

  private nieuwBedrijf(g: Gebied) {
    const tussen = { landbouw: 90, bosbouw: 140, olie: 110, delfstoffen: 160 }[g.soort];
    const p = this.plek(g, tussen);
    if (!p) return;
    const r = rijkdom(this.w.terrein, g.soort, p.x, p.z);
    const b: Bedrijf = {
      id: this.volgende++, gebied: g.id, soort: g.soort, naam: this.rng.kies(NAMEN[g.soort]),
      p, rot: this.naarWeg(p), y: this.w.terrein.hoogte(p.x, p.z), ha: 0, banen: 0, productie: 0,
      voortgang: 0, klaar: false, putten: [], seed: Math.floor(this.rng.next() * 1e9),
    };
    switch (g.soort) {
      case 'landbouw': {
        // Een boerderij neemt de dichtstbijzijnde vrije akkers (samen ~25 ha in het spel).
        const vrij = g.velden.filter(v => !v.bedrijf).sort((a, c) => dist2(zwaartepunt(a.poly), p) - dist2(zwaartepunt(c.poly), p));
        let ha = 0;
        for (const v of vrij) { if (ha > 2.5) break; v.bedrijf = b.id; ha += v.ha; }
        if (ha < 1) return;
        b.ha = ha;
        b.banen = Math.max(2, Math.round(ha * 0.8));
        b.productie = ha * 9 / 12 * (0.6 + r * 0.6);
        break;
      }
      case 'bosbouw': b.ha = 8; b.banen = 4; b.productie = b.ha * 6 / 12 * (0.6 + r * 0.6); break;
      case 'olie': {
        // Een paar jaknikkers rond een tankpark.
        for (let i = 0; i < 6 && b.putten.length < 4; i++) {
          const h = this.rng.next() * Math.PI * 2, d = 45 + this.rng.next() * 60;
          const q = { x: p.x + Math.cos(h) * d, z: p.z + Math.sin(h) * d };
          if (puntInPolygoon(q, g.poly) && rijkdom(this.w.terrein, 'olie', q.x, q.z) > 0.15) b.putten.push(q);
        }
        if (!b.putten.length) return;
        b.banen = 3 + b.putten.length; b.productie = b.putten.length * 15 * 30 * (0.6 + r * 0.6); break;
      }
      case 'delfstoffen': b.ha = 8; b.banen = 12; b.productie = 150000 / 12 * (0.6 + r * 0.6); break;
    }
    this.bedrijven.set(b.id, b);
    this.events.push({ soort: 'bedrijf+', id: b.id });
    if (g.soort === 'delfstoffen') this.graafGroeve(b);
    if (g.soort === 'bosbouw') {
      // Kapvlak naast het houtterrein.
      const k = { x: p.x - Math.sin(b.rot) * 75, z: p.z - Math.cos(b.rot) * 75 };
      this.w.bomen.wis(k.x - 50, k.z - 50, k.x + 50, k.z + 50, (x, z) => Math.hypot((x - k.x) * 1.4, z - k.z) < 46 && puntInPolygoon({ x, z }, g.poly));
    }
    for (const q of b.putten) if (g.soort === 'olie') this.w.bomen.wis(q.x - 20, q.z - 20, q.x + 20, q.z + 20, (x, z) => Math.hypot(x - q.x, z - q.z) < 16);
    if (g.soort === 'landbouw') for (const v of g.velden) if (v.bedrijf === b.id) this.w.bomen.wisInPolygoon(v.poly, 1);
    this.w.bomen.wis(p.x - 40, p.z - 40, p.x + 40, p.z + 40, (x, z) => Math.hypot(x - p.x, z - p.z) < 34);
  }

  /** Groeve: het terrein wordt uitgegraven (terrassen naar een put van ~9 m diep). */
  private graafGroeve(b: Bedrijf) {
    const c = { x: b.p.x + Math.sin(b.rot + Math.PI) * 70, z: b.p.z + Math.cos(b.rot + Math.PI) * 70 };
    b.putten = [c];
    const R = 62;
    const t = this.w.terrein;
    const basis = t.hoogte(c.x, c.z);
    t.egaliseer((x, z) => {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > R + 20) return null;
      const diepte = d < R * 0.45 ? 9 : d < R * 0.7 ? 6 : d < R ? 3 : 0;
      return { h: basis - diepte, d: Math.max(0, d - R) };
    }, c.x - R - 30, c.z - R - 30, c.x + R + 30, c.z + R + 30, 0, 14);
    this.w.bomen.wis(c.x - R - 20, c.z - R - 20, c.x + R + 20, c.z + R + 20, (x, z) => Math.hypot(x - c.x, z - c.z) < R + 12);
  }

  haalEvents() { const e = this.events; this.events = []; return e; }

  /** Productieketens per maand: winning → lokale verwerking → export. */
  stap(dt: number) {
    for (const b of this.bedrijven.values()) {
      if (b.klaar) continue;
      b.voortgang = Math.min(1, b.voortgang + dt / 25);
      if (b.voortgang >= 1) { b.klaar = true; this.events.push({ soort: 'bedrijf~', id: b.id }); this.w.meld(`${b.naam} is begonnen met ${b.soort === 'landbouw' ? 'boeren' : b.soort === 'bosbouw' ? 'houtkap' : b.soort === 'olie' ? 'oliewinning' : 'zandwinning'}`, 'bouw'); }
    }
    this.klok += dt;
    if (this.klok > 3) {
      this.klok = 0;
      // Elk gebied groeit met een bedrijf zolang er plek is (exportmarkt: vraag is er altijd).
      for (const g of this.gebieden.values()) {
        const n = [...this.bedrijven.values()].filter(b => b.gebied === g.id).length;
        const max = g.soort === 'landbouw' ? g.velden.length : Math.max(1, Math.floor(g.ha / ({ bosbouw: 4, olie: 2.5, delfstoffen: 3.5 } as Record<string, number>)[g.soort]));
        if (n < max && this.rng.next() < 0.5) this.nieuwBedrijf(g);
      }
    }
    this.maandKlok += dt;
    if (this.maandKlok > 2) { this.maandKlok = 0; this.berekenKetens(); }
  }

  berekenKetens() {
    const w = this.w;
    // Verwerkingscapaciteit: bedrijfshallen met een specialisatie, per baan per maand.
    const perBaan = PER_BAAN;
    let exportWaarde = 0;
    let onverwerkt = 0, totaal = 0;
    for (const s of Object.keys(GRONDSTOFFEN) as Grondstof[]) {
      const k = this.ketens[s];
      k.productie = 0; k.banenWinning = 0; k.banenVerwerking = 0;
      for (const b of this.bedrijven.values()) if (b.soort === s && b.klaar) { k.productie += b.productie; k.banenWinning += b.banen; }
      for (const g of w.gebouwen.values()) if (g.klaar && g.specialisatie === s) k.banenVerwerking += g.cap.banen.industrie * g.bezetting;
      const capaciteit = k.banenVerwerking * perBaan[s];
      k.verwerkt = Math.min(k.productie, capaciteit);
      k.exportRuw = k.productie - k.verwerkt;
      k.exportVerwerkt = k.verwerkt;
      const info = GRONDSTOFFEN[s];
      k.waarde = k.exportRuw * info.prijsRuw + k.exportVerwerkt * info.prijsVerwerkt;
      exportWaarde += k.waarde;
      onverwerkt += k.exportRuw * info.prijsRuw; totaal += k.productie * info.prijsRuw;
    }
    // Gemeente heft 1% op de omzet van lokale producenten (vereenvoudigd, bv. via precario en BIZ).
    w.exportHeffing = exportWaarde * 0.01;
    // Onverwerkte grondstoffen trekken verwerkende industrie aan.
    w.industrieBonus = totaal > 0 ? Math.min(0.35, (onverwerkt / totaal) * 0.45) : 0;
  }

  /** Welke grondstof heeft het meest onverwerkte aanbod, rekening houdend met hallen in aanbouw? */
  kiesSpecialisatie(): Grondstof | null {
    let best: Grondstof | null = null, bv = 0;
    for (const s of Object.keys(GRONDSTOFFEN) as Grondstof[]) {
      let gepland = 0;
      for (const g of this.w.gebouwen.values()) if (g.specialisatie === s) gepland += g.cap.banen.industrie * PER_BAAN[s];
      const over = (this.ketens[s].productie - gepland) * GRONDSTOFFEN[s].prijsRuw;
      if (over > bv) { bv = over; best = s; }
    }
    return bv > 1500 ? best : null;
  }
}

function omhulling(poly: V2[]): [number, number, number, number] {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
  return [x0, z0, x1, z1];
}
