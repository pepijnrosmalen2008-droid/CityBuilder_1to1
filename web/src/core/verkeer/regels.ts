// ════════════════════════════════════════════════════════════════════════════════════
// VERKEERSREGELS (zoals Traffic Manager: President Edition)
// Alles wat de speler per weg, wegeinde, rijstrook of kruispunt kan instellen:
// - voorrangsborden per wegeinde (voorrangsweg, voorrang verlenen, stop);
// - verkeerslichten per kruispunt aan of uit (automatisch = volgens de regel), met groentijd;
// - rijstrookpijlen per aankomende strook (links, rechtdoor, rechts);
// - kruispuntregels per wegeinde: keren, van strook wisselen op het kruispunt, het kruispunt op
//   rijden als het vol staat, oversteekplaats voor voetgangers, rechtsaf door rood;
// - maximumsnelheid per weg; verboden voor auto's, vrachtwagens of bussen per weg;
// - vastgelopen voertuigen laten verdwijnen (aan/uit).
// Puur data: de rijstrookgraaf en de verkeerssimulatie lezen het; `versie` gaat omhoog bij elke
// wijziging, zodat die opnieuw opbouwen.
// ════════════════════════════════════════════════════════════════════════════════════

import type { Afslag } from './rijstroken';

export type Bord = 'voorrang' | 'geef' | 'stop';
export type LichtKeuze = 'auto' | 'aan' | 'uit';
export type Verbod = 'auto' | 'vracht' | 'bus' | 'parkeren';

export interface EindRegels {
  bord?: Bord;
  /** Keren toegestaan (standaard alleen op een doodlopend einde). */
  keren?: boolean;
  /** Van strook wisselen tijdens het rechtdoor oversteken. */
  wisselen?: boolean;
  /** Het kruispunt op rijden ook als er erachter geen plek is (standaard niet). */
  blokkeren?: boolean;
  /** Oversteekplaats voor voetgangers (standaard ja). */
  oversteek?: boolean;
  /** Rechtsaf door rood (na stoppen, als het vrij is). */
  rechtsDoorRood?: boolean;
}

export const EIND_STANDAARD: Required<Omit<EindRegels, 'bord'>> = { keren: false, wisselen: false, blokkeren: false, oversteek: true, rechtsDoorRood: false };

/** Eigen lichtfase: welke aankomende wegen tegelijk groen hebben, en hoe lang (s). */
export interface LichtFase { segs: number[]; tijd: number }
export interface KnoopRegels { licht?: LichtKeuze; groen?: number; fasen?: LichtFase[] }
/** Doelstrook van een eigen rijstrookverbinding: uitgaande weg en strook (0 = rechts). */
export interface Doelstrook { seg: number; index: number }

const eindSleutel = (seg: number, knoop: number) => `${seg}:${knoop}`;
const strookSleutel = (seg: number, knoop: number, index: number) => `${seg}:${knoop}:${index}`;

export class Verkeersregels {
  versie = 0;
  /** Weergave en wegdek opnieuw opbouwen (oversteekplaats, borden): segmenten en knopen. */
  vuil: { segs: Set<number>; knopen: Set<number> } = { segs: new Set(), knopen: new Set() };
  eind = new Map<string, EindRegels>();
  knoop = new Map<number, KnoopRegels>();
  pijlen = new Map<string, Afslag[]>();
  /** Rijstrookverbinder: per aankomende strook (seg:knoop:index) precies deze doelstroken. */
  verbinder = new Map<string, Doelstrook[]>();
  snelheid = new Map<number, number>();
  verbod = new Map<number, Verbod[]>();
  /** Vastgelopen voertuigen verdwijnen na een tijd (zoals CS); TM:PE kan dat uitzetten. */
  verdwijnen = true;

  private gewijzigd(seg?: number, knoop?: number) {
    this.versie++;
    if (seg !== undefined) this.vuil.segs.add(seg);
    if (knoop !== undefined) this.vuil.knopen.add(knoop);
  }

  // ─── Wegeinden ───
  eindVan(seg: number, knoop: number): EindRegels { return this.eind.get(eindSleutel(seg, knoop)) ?? {}; }
  regel<K extends keyof typeof EIND_STANDAARD>(seg: number, knoop: number, k: K): boolean {
    const r = this.eind.get(eindSleutel(seg, knoop));
    return r?.[k] ?? EIND_STANDAARD[k];
  }
  zetEind(seg: number, knoop: number, deel: Partial<EindRegels>) {
    const k = eindSleutel(seg, knoop);
    const r = { ...(this.eind.get(k) ?? {}), ...deel };
    for (const x of Object.keys(r) as (keyof EindRegels)[]) {
      if (r[x] === undefined || (x !== 'bord' && r[x] === EIND_STANDAARD[x as keyof typeof EIND_STANDAARD])) delete r[x];
    }
    if (Object.keys(r).length) this.eind.set(k, r); else this.eind.delete(k);
    this.gewijzigd(seg, knoop);
  }
  bord(seg: number, knoop: number): Bord | undefined { return this.eind.get(eindSleutel(seg, knoop))?.bord; }

  // ─── Kruispunten ───
  lichtKeuze(knoop: number): LichtKeuze { return this.knoop.get(knoop)?.licht ?? 'auto'; }
  groenTijd(knoop: number): number | undefined { return this.knoop.get(knoop)?.groen; }
  zetKnoop(knoop: number, deel: Partial<KnoopRegels>) {
    const r = { ...(this.knoop.get(knoop) ?? {}), ...deel };
    if (r.licht === 'auto') delete r.licht;
    if (r.groen === undefined) delete r.groen;
    if (!r.fasen?.length) delete r.fasen;
    if (Object.keys(r).length) this.knoop.set(knoop, r); else this.knoop.delete(knoop);
    this.gewijzigd(undefined, knoop);
  }

  // ─── Rijstrookpijlen ───
  /** Ingestelde afslagen voor strook `index` (0 = rechts) van het wegeinde, of null = standaard. */
  pijlenVan(seg: number, knoop: number, index: number): Afslag[] | null { return this.pijlen.get(strookSleutel(seg, knoop, index)) ?? null; }
  heeftPijlen(seg: number, knoop: number) { for (const k of this.pijlen.keys()) if (k.startsWith(eindSleutel(seg, knoop) + ':')) return true; return false; }
  zetPijlen(seg: number, knoop: number, index: number, a: Afslag[] | null) {
    const k = strookSleutel(seg, knoop, index);
    if (a) this.pijlen.set(k, [...new Set(a)]); else this.pijlen.delete(k);
    this.gewijzigd(seg, knoop);
  }
  // ─── Rijstrookverbinder ───
  verbindingenVan(seg: number, knoop: number, index: number): Doelstrook[] | null { return this.verbinder.get(strookSleutel(seg, knoop, index)) ?? null; }
  heeftVerbinder(seg: number, knoop: number) { for (const k of this.verbinder.keys()) if (k.startsWith(eindSleutel(seg, knoop) + ':')) return true; return false; }
  zetVerbinder(seg: number, knoop: number, index: number, lijst: Doelstrook[] | null) {
    const k = strookSleutel(seg, knoop, index);
    if (lijst) this.verbinder.set(k, lijst.map(x => ({ ...x }))); else this.verbinder.delete(k);
    this.gewijzigd(seg, knoop);
  }
  wisVerbinder(knoop: number) {
    for (const k of [...this.verbinder.keys()]) if (Number(k.split(':')[1]) === knoop) this.verbinder.delete(k);
    this.gewijzigd(undefined, knoop);
  }
  heeftVerbinderOp(knoop: number) { for (const k of this.verbinder.keys()) if (Number(k.split(':')[1]) === knoop) return true; return false; }

  wisPijlen(seg: number, knoop: number) {
    for (const k of [...this.pijlen.keys()]) if (k.startsWith(eindSleutel(seg, knoop) + ':')) this.pijlen.delete(k);
    this.gewijzigd(seg, knoop);
  }

  // ─── Wegen ───
  /** Ingestelde maximumsnelheid (km/u) of undefined = standaard van het wegtype. */
  limiet(seg: number) { return this.snelheid.get(seg); }
  zetLimiet(seg: number, kmu: number | undefined) {
    if (kmu === undefined) this.snelheid.delete(seg); else this.snelheid.set(seg, kmu);
    this.gewijzigd(seg);
  }
  verboden(seg: number): Verbod[] { return this.verbod.get(seg) ?? []; }
  magRijden(seg: number, v: Verbod) { return !this.verbod.get(seg)?.includes(v); }
  zetVerbod(seg: number, lijst: Verbod[]) {
    if (lijst.length) this.verbod.set(seg, [...new Set(lijst)]); else this.verbod.delete(seg);
    this.gewijzigd(seg);
  }

  /** Een segment wordt gesplitst of vervangen: de wegregels gaan mee naar de nieuwe stukken. */
  kopieerWeg(van: number, naar: number) {
    const l = this.snelheid.get(van); if (l !== undefined) this.snelheid.set(naar, l);
    const v = this.verbod.get(van); if (v) this.verbod.set(naar, [...v]);
  }
  /** Regels die bij verwijderde wegen of knopen hoorden opruimen. */
  ruimOp(bestaatSeg: (id: number) => boolean, bestaatKnoop: (id: number) => boolean) {
    const weg = (k: string) => { const [s, n] = k.split(':').map(Number); return !bestaatSeg(s) || !bestaatKnoop(n); };
    for (const k of [...this.eind.keys()]) if (weg(k)) this.eind.delete(k);
    for (const k of [...this.pijlen.keys()]) if (weg(k)) this.pijlen.delete(k);
    for (const k of [...this.verbinder.keys()]) if (weg(k)) this.verbinder.delete(k);
    for (const k of [...this.knoop.keys()]) if (!bestaatKnoop(k)) this.knoop.delete(k);
    for (const k of [...this.snelheid.keys()]) if (!bestaatSeg(k)) this.snelheid.delete(k);
    for (const k of [...this.verbod.keys()]) if (!bestaatSeg(k)) this.verbod.delete(k);
  }

  haalVuil() { const v = this.vuil; this.vuil = { segs: new Set(), knopen: new Set() }; return v; }

  naarJson() {
    return { eind: [...this.eind], knoop: [...this.knoop], pijlen: [...this.pijlen], verbinder: [...this.verbinder], snelheid: [...this.snelheid], verbod: [...this.verbod], verdwijnen: this.verdwijnen };
  }
  vanJson(j: Partial<ReturnType<Verkeersregels['naarJson']>> | undefined) {
    this.eind = new Map(j?.eind ?? []); this.knoop = new Map(j?.knoop ?? []); this.pijlen = new Map(j?.pijlen ?? []); this.verbinder = new Map(j?.verbinder ?? []);
    this.snelheid = new Map(j?.snelheid ?? []); this.verbod = new Map(j?.verbod ?? []); this.verdwijnen = j?.verdwijnen ?? true;
    this.versie++;
  }
}
