// ════════════════════════════════════════════════════════════════════════════════════
// PARKEREN
// Parkeerhavens langs wegen met een parkeerstrook (vakken van 5,5 m). Auto's die op hun
// bestemming aankomen, parkeren in het dichtstbijzijnde vrije vak en blijven een tijd staan;
// wie vanaf een gebouw vertrekt, neemt zo mogelijk een geparkeerde auto mee (zelfde model en
// kleur). Een parkeerverbod (TM:PE) haalt de vakken van die weg weg. Puur engine-onafhankelijk.
// ════════════════════════════════════════════════════════════════════════════════════

import { Wegennet } from '../wegen/netwerk';
import { profiel, strookGrenzen } from '../wegen/typen';
import { asPunt } from '../geom/wegmesh';
import type { VoertuigSoort } from './verkeer';

export interface GeparkeerdeAuto { soort: VoertuigSoort; lak: number; tot: number }
export interface Parkeervak {
  id: string; seg: number; kant: 1 | -1; s: number;
  x: number; y: number; z: number; dx: number; dz: number;
  auto: GeparkeerdeAuto | null;
}

const VAK = 5.5;

export class Parkeren {
  vakken = new Map<string, Parkeervak>();
  perSeg = new Map<number, Parkeervak[]>();
  /** Simulatietijd (s). */
  tijd = 0;
  private versie = -1;
  private regelVersie = -1;
  private zaad = 9001;

  constructor(private net: Wegennet, private nieuweAuto: () => { soort: VoertuigSoort; lak: number }) {}

  private rnd() { this.zaad = (this.zaad * 1664525 + 1013904223) >>> 0; return this.zaad / 4294967296; }

  get bezet() { let n = 0; for (const v of this.vakken.values()) if (v.auto) n++; return n; }

  /** Vakken opnieuw bepalen na wegwerk of een gewijzigd parkeerverbod; geparkeerde auto's blijven staan. */
  bijwerken() {
    if (this.versie === this.net.versie && this.regelVersie === this.net.regels.versie) return;
    this.versie = this.net.versie; this.regelVersie = this.net.regels.versie;
    const oud = this.vakken;
    this.vakken = new Map(); this.perSeg = new Map();
    for (const seg of this.net.segmenten.values()) {
      if (!seg.pad.length || this.net.regels.verboden(seg.id).includes('parkeren')) continue;
      const g = strookGrenzen(profiel(seg.type, seg.om)).filter(x => x.s.soort === 'parkeer');
      if (!g.length) continue;
      const ka = this.net.eindKnip(seg, 'a'), kb = this.net.eindKnip(seg, 'b');
      const s0 = Math.max(ka.links, ka.rechts) + 4, s1 = seg.lengte - Math.max(kb.links, kb.rechts) - 4;
      const lijst: Parkeervak[] = [];
      for (const x of g) {
        const o = (x.a + x.b) / 2, kant: 1 | -1 = o > 0 ? 1 : -1;
        let i = 0;
        for (let d = s0; d + VAK <= s1; d += VAK, i++) {
          const s = d + VAK / 2, a = asPunt(seg.pad, s);
          if (a.brug || a.tunnel) continue;
          const id = `${seg.id}:${kant}:${i}`;
          // Rechts rijdend: rechts van de as staat de auto met de tekenrichting mee, links ertegenin.
          const v: Parkeervak = { id, seg: seg.id, kant, s, x: a.x - a.dz * o, y: a.y, z: a.z + a.dx * o, dx: a.dx * kant, dz: a.dz * kant, auto: oud.get(id)?.auto ?? null };
          if (!oud.has(id) && this.rnd() < 0.45) v.auto = { ...this.nieuweAuto(), tot: this.tijd + 120 + this.rnd() * 1600 };
          this.vakken.set(id, v); lijst.push(v);
        }
      }
      if (lijst.length) this.perSeg.set(seg.id, lijst);
    }
  }

  /** Tijd laten lopen: auto's waarvan de tijd om is rijden weg (zonder verkeer: alleen het vak komt vrij). */
  stap(dt: number) {
    this.tijd += dt;
    for (const v of this.vakken.values()) if (v.auto && v.auto.tot < this.tijd) v.auto = null;
  }

  /** Parkeren op weg `seg` dicht bij booglengte s. Geeft false als er geen vrij vak in de buurt is. */
  parkeer(seg: number, s: number, soort: VoertuigSoort, lak: number): boolean {
    let best: Parkeervak | null = null, bd = 90;
    for (const v of this.perSeg.get(seg) ?? []) if (!v.auto && Math.abs(v.s - s) < bd) { bd = Math.abs(v.s - s); best = v; }
    if (!best) return false;
    best.auto = { soort, lak, tot: this.tijd + 240 + this.rnd() * 1300 };
    return true;
  }

  /** Vertrekken vanaf weg `seg` bij s: de dichtstbijzijnde geparkeerde auto rijdt weg (model en kleur). */
  vertrek(seg: number, s: number): { soort: VoertuigSoort; lak: number } | null {
    let best: Parkeervak | null = null, bd = 60;
    for (const v of this.perSeg.get(seg) ?? []) if (v.auto && Math.abs(v.s - s) < bd) { bd = Math.abs(v.s - s); best = v; }
    if (!best || !best.auto) return null;
    const a = best.auto;
    best.auto = null;
    return { soort: a.soort, lak: a.lak };
  }
}
