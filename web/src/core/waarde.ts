import { ZEENIVEAU } from './terrain';
import type { V2 } from './math';
import { DienstSoort, DIENSTEN } from './voorzieningen';
import type { Wereld, Gebouw } from './wereld';

// ════════════════════════════════════════════════════════════════════════════════════
// GRONDWAARDE EN GEBOUWNIVEAUS
// De kernlus van Cities: Skylines: voorzieningen in de buurt maken een plek meer waard; een
// gebouw dat vol zit en alles heeft wat het nodig heeft, wordt opgeknapt naar een hoger niveau
// (1-5). Een hoger niveau levert meer WOZ/OZB op en ziet er beter uit (zonnepanelen, dakterras).
// Vervuiling (industrie, centrales, stort) en lawaai van drukke wegen drukken de waarde;
// water in de buurt verhoogt hem (Nederlands: wonen aan het water).
// ════════════════════════════════════════════════════════════════════════════════════

const VERVUILERS: Partial<Record<DienstSoort, number>> = { gascentrale: 450, stortplaats: 400, afvalcentrale: 350, rwzi: 250 };

export interface Waardering {
  waarde: number;
  /** Onderdelen (voor het infopaneel). */
  delen: { naam: string; x: number }[];
}

export class Grondwaarde {
  waarde = new Map<number, Waardering>();
  private klok = 99;
  private niveauKlok = 0;
  private eersteVijf = false;

  constructor(private w: Wereld) {}

  /** Euro per m² (ordegrootte Nederlandse grondprijzen). */
  static euroPerM2(x: number) { return Math.round(120 + x * 880); }

  /** Lijsten voor de lopende ronde (worden aan het begin van elke ronde ververst). */
  private ronde: { ids: number[]; i: number; winkels: Map<number, V2[]>; bedrijven: V2[]; vervuilers: { p: V2; r: number }[]; monumenten: { p: V2; r: number; x: number }[] } | null = null;

  private static cel = (x: number, z: number) => (Math.floor(x / 100) + 500) * 1000 + Math.floor(z / 100) + 500;

  /** Grondwaarde van een deel van de gebouwen (verdeeld over de beelden: geen haperingen). */
  private bereken(max: number) {
    const w = this.w;
    if (!this.ronde || this.ronde.i >= this.ronde.ids.length) {
      const winkels = new Map<number, V2[]>();
      for (const g of w.gebouwen.values()) if (g.klaar && (g.cap.banen.detailhandel + g.cap.banen.horeca) > 0) {
        const k = Grondwaarde.cel(g.centrum.x, g.centrum.z); let l = winkels.get(k); if (!l) winkels.set(k, l = []); l.push(g.centrum);
      }
      this.ronde = {
        ids: [...w.gebouwen.keys()], i: 0, winkels,
        bedrijven: [...w.gebouwen.values()].filter(g => g.klaar && g.vorm === 'bedrijfshal').map(g => g.centrum),
        vervuilers: [...w.voorzieningen.diensten.values()].filter(d => d.klaar && VERVUILERS[d.soort]).map(d => ({ p: d.p, r: VERVUILERS[d.soort]! })),
        monumenten: [...w.voorzieningen.diensten.values()].filter(d => d.klaar && DIENSTEN[d.soort].aanzien).map(d => ({ p: d.p, r: DIENSTEN[d.soort].aanzien!.bereik, x: DIENSTEN[d.soort].aanzien!.waarde })),
      };
      for (const id of this.waarde.keys()) if (!w.gebouwen.has(id)) this.waarde.delete(id);
    }
    const r = this.ronde;
    const eind = Math.min(r.ids.length, r.i + max);
    for (; r.i < eind; r.i++) {
      const g = w.gebouwen.get(r.ids[r.i]);
      if (!g) continue;
      const dek = w.hulpdiensten.dekkingVan(g.id);
      const delen: { naam: string; x: number }[] = [];
      delen.push({ naam: 'Basis', x: 0.22 });
      delen.push({ naam: 'Brandweer', x: 0.12 * dek.brand });
      delen.push({ naam: 'Politie', x: 0.12 * dek.politie });
      delen.push({ naam: 'Zorg', x: 0.12 * dek.zorg });
      delen.push({ naam: 'Nutsvoorzieningen', x: w.voorzieningen.tekort.has(g.id) ? -0.2 : 0.08 });
      // Winkels en horeca op loopafstand (alleen de omliggende cellen van 100 m).
      let winkel = 0;
      const ci = Math.floor(g.centrum.x / 100), cj = Math.floor(g.centrum.z / 100);
      for (let i = ci - 5; i <= ci + 5; i++) for (let j = cj - 5; j <= cj + 5; j++) for (const p of r.winkels.get((i + 500) * 1000 + j + 500) ?? []) {
        const d = Math.hypot(p.x - g.centrum.x, p.z - g.centrum.z); if (d < 450) winkel = Math.max(winkel, 1 - d / 450);
      }
      if (g.vorm !== 'bedrijfshal') delen.push({ naam: 'Winkels in de buurt', x: 0.08 * winkel });
      let water = 0;
      for (const [dx, dz] of [[90, 0], [-90, 0], [0, 90], [0, -90], [60, 60], [-60, 60], [60, -60], [-60, -60]]) if (w.terrein.hoogte(g.centrum.x + dx, g.centrum.z + dz) < ZEENIVEAU + 0.3) water = 1;
      // Monumenten in de buurt: de sterkste telt volledig, de rest voor een derde (samen max 0,25).
      let mon: number[] = [];
      for (const m of r.monumenten) { const d = Math.hypot(m.p.x - g.centrum.x, m.p.z - g.centrum.z); if (d < m.r) mon.push(m.x * Math.pow(1 - d / m.r, 0.6)); }
      if (mon.length) { mon.sort((a, b) => b - a); delen.push({ naam: 'Monumenten in de buurt', x: Math.min(0.25, mon[0] + mon.slice(1).reduce((s, x) => s + x / 3, 0)) }); }
      if (water) delen.push({ naam: 'Aan het water', x: 0.1 });
      let vuil = 0;
      if (g.vorm !== 'bedrijfshal') {
        for (const p of r.bedrijven) { const d = Math.hypot(p.x - g.centrum.x, p.z - g.centrum.z); if (d < 180) vuil = Math.max(vuil, 0.6 * (1 - d / 180)); }
        for (const v of r.vervuilers) { const d = Math.hypot(v.p.x - g.centrum.x, v.p.z - g.centrum.z); if (d < v.r) vuil = Math.max(vuil, 1 - d / v.r); }
        if (vuil > 0.02) delen.push({ naam: 'Vervuiling', x: -0.3 * vuil });
      }
      const k = w.kavels.get(g.kavel), seg = k ? w.net.segmenten.get(k.seg) : null;
      if (seg && (seg.type === 'gow' || seg.type === 'snelweg' || seg.type === 'laan') && g.vorm !== 'bedrijfshal' && g.vorm !== 'kantoortoren') delen.push({ naam: 'Verkeerslawaai', x: seg.type === 'laan' ? -0.04 : -0.12 });
      const stap = w.districten.belastingStap(g.centrum, g.cap.woningen > 0);
      if (stap) delen.push({ naam: 'Belasting district', x: -0.03 * stap });
      if (g.dakBeleid?.groen) delen.push({ naam: 'Groene daken', x: 0.04 });
      const waarde = Math.max(0, Math.min(1, delen.reduce((s, d) => s + d.x, 0)));
      this.waarde.set(g.id, { waarde, delen });
    }
  }

  van(id: number): Waardering { return this.waarde.get(id) ?? { waarde: 0.2, delen: [] }; }

  /** Welk niveau past bij deze plek (en welke dienst ontbreekt er nog voor het volgende). */
  doelNiveau(g: Gebouw): { niveau: number; mist: string | null } {
    const x = this.van(g.id).waarde;
    const dek = this.w.hulpdiensten.dekkingVan(g.id);
    // Drempels voor niveau 2-5.
    let n = 1 + [0.32, 0.47, 0.6, 0.72].filter(t => x >= t).length;
    let mist: string | null = null;
    if (this.w.voorzieningen.tekort.has(g.id)) { n = 1; mist = 'stroom, water en afvalophaal'; }
    else if (n >= 3 && (dek.brand < 0.25 || dek.zorg < 0.25)) { n = 2; mist = dek.brand < 0.25 ? 'brandweer' : 'zorg'; }
    else if (n >= 4 && dek.politie < 0.3) { n = 3; mist = 'politie'; }
    if (!mist && n < 5) mist = 'hogere grondwaarde';
    return { niveau: Math.max(1, Math.min(5, n)), mist };
  }

  stap(dt: number) {
    // Een ronde over alle gebouwen duurt ~4 s; per stap een evenredig deel (minstens 20).
    this.klok += dt;
    if (this.klok > 0.05) { this.bereken(Math.max(8, Math.ceil(this.w.gebouwen.size * this.klok / 4))); this.klok = 0; }
    // Opknappen (of verloederen): af en toe, één niveau per keer.
    this.niveauKlok += dt;
    if (this.niveauKlok < 6) return;
    this.niveauKlok = 0;
    for (const g of this.w.gebouwen.values()) {
      if (!g.klaar) continue;
      const nu = g.niveau ?? 1;
      const doel = this.doelNiveau(g).niveau;
      if (g.verbouw) continue;
      if (doel > nu && g.bezetting > 0.85 && Math.random() < 0.06) {
        // Zoals in CS2: het pand gaat in de steigers en komt terug op het nieuwe niveau.
        // In een beschermd stadsgezicht blijft het uiterlijk zoals het is.
        const d = this.w.districten.van(g.centrum);
        if (d?.beleid.beschermd) g.niveau = nu + 1;
        else this.w.startVerbouw(g, nu + 1);
        if (nu + 1 === 5 && !this.eersteVijf) { this.eersteVijf = true; this.w.meld(`Eerste pand op het hoogste niveau: ${this.w.straatVan(g) || 'een straat'} wordt een gewilde buurt`, 'mijlpaal'); }
      } else if (doel < nu - 1 && Math.random() < 0.15) {
        g.niveau = nu - 1;
        this.w.events.push({ soort: 'gebouw~', id: g.id });
      }
    }
  }
}
