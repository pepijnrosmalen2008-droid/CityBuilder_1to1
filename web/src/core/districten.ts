import { V2 } from './math';
import type { DistrictStijl } from './stijlen';

// ════════════════════════════════════════════════════════════════════════════════════
// DISTRICTEN
// Zoals in Cities: Skylines: je schildert een district over de kaart. Een district heeft een
// naam, een bouwstijl (optioneel) en eigen regels. Opgeslagen als raster van vakjes van 16 m.
// ════════════════════════════════════════════════════════════════════════════════════

export type Hoogtegrens = 'vrij' | 'midden' | 'laag';

export interface Beleid {
  /** Maximaal aantal bouwlagen: laag = 3, midden = 6. */
  hoogte: Hoogtegrens;
  /** Beschermd stadsgezicht: gebouwen houden hun uiterlijk, ook als ze een niveau stijgen. */
  beschermd: boolean;
  /** Groene daken op alle platte daken: hogere grondwaarde, kost onderhoudssubsidie. */
  groen: boolean;
  /** Zonnepanelen verplicht: minder stroomverbruik, kost subsidie. */
  zon: boolean;
}

export interface District {
  id: number; naam: string; kleur: string;
  stijl: DistrictStijl;
  beleid: Beleid;
}

export const MAX_LAGEN: Record<Hoogtegrens, number> = { vrij: 99, midden: 6, laag: 3 };
export const BELEID_NAAM: Record<keyof Beleid, string> = { hoogte: 'Hoogtegrens', beschermd: 'Beschermd stadsgezicht', groen: 'Groene daken', zon: 'Zonnepanelen verplicht' };
/** Subsidie per gebouw per maand. */
export const BELEID_KOSTEN = { groen: 60, zon: 90 };

const KLEUREN = ['#ff922b', '#4dabf7', '#da77f2', '#63e6be', '#ffd43b', '#ff8787', '#a9e34b', '#748ffc'];
const NAMEN = ['Binnenstad', 'Oud-Zuid', 'Het Hof', 'De Weide', 'Havenkwartier', 'Molenwijk', 'Westerpark', 'Kanaalzone', 'De Akkers', 'Rivierenbuurt', 'Stationskwartier', 'Noorderhaven'];

export const CEL = 16;
const sleutel = (i: number, j: number) => (i + 5000) * 10000 + (j + 5000);

export class Districten {
  lijst = new Map<number, District>();
  /** Vakje → district-id. */
  raster = new Map<number, number>();
  private volgende = 1;
  /** Ophoogt bij elke wijziging (voor de weergave). */
  versie = 0;

  nieuw(): District {
    const id = this.volgende++;
    const gebruikt = new Set([...this.lijst.values()].map(d => d.naam));
    const naam = NAMEN.find(n => !gebruikt.has(n)) ?? `District ${id}`;
    const d: District = { id, naam, kleur: KLEUREN[(id - 1) % KLEUREN.length], stijl: 'gemengd', beleid: { hoogte: 'vrij', beschermd: false, groen: false, zon: false } };
    this.lijst.set(id, d);
    this.versie++;
    return d;
  }

  verwijder(id: number) {
    this.lijst.delete(id);
    for (const [k, v] of this.raster) if (v === id) this.raster.delete(k);
    this.versie++;
  }

  van(p: V2): District | null {
    const id = this.raster.get(sleutel(Math.floor(p.x / CEL), Math.floor(p.z / CEL)));
    return id ? this.lijst.get(id) ?? null : null;
  }

  /** Schilder (id) of gum (0) in een cirkel. Geeft het aantal gewijzigde vakjes. */
  schilder(m: V2, r: number, id: number): number {
    let n = 0;
    const i0 = Math.floor((m.x - r) / CEL), i1 = Math.floor((m.x + r) / CEL), j0 = Math.floor((m.z - r) / CEL), j1 = Math.floor((m.z + r) / CEL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (Math.hypot((i + 0.5) * CEL - m.x, (j + 0.5) * CEL - m.z) > r) continue;
      const k = sleutel(i, j), oud = this.raster.get(k) ?? 0;
      if (oud === id) continue;
      if (id) this.raster.set(k, id); else this.raster.delete(k);
      n++;
    }
    if (n) this.versie++;
    return n;
  }

  /** Vakjes per district (voor de weergave en het midden van het naamlabel). */
  vakjes(): { i: number; j: number; id: number }[] {
    const r: { i: number; j: number; id: number }[] = [];
    for (const [k, id] of this.raster) r.push({ i: Math.floor(k / 10000) - 5000, j: (k % 10000) - 5000, id });
    return r;
  }

  midden(id: number): V2 | null {
    let x = 0, z = 0, n = 0;
    for (const [k, v] of this.raster) if (v === id) { x += (Math.floor(k / 10000) - 5000 + 0.5) * CEL; z += ((k % 10000) - 5000 + 0.5) * CEL; n++; }
    return n ? { x: x / n, z: z / n } : null;
  }

  naarJson() { return { volgende: this.volgende, lijst: [...this.lijst.values()], raster: [...this.raster.entries()] }; }
  laadJson(j?: ReturnType<Districten['naarJson']>) {
    if (!j) return;
    this.volgende = j.volgende; this.lijst = new Map(j.lijst.map(d => [d.id, d])); this.raster = new Map(j.raster); this.versie++;
  }
}
