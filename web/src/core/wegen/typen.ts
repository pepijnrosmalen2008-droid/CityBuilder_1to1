// Dwarsprofielen, van links naar rechts in de tekenrichting van het segment (B = tegen de
// tekenrichting in, A = met de tekenrichting mee; Nederlands rechts rijden). Breedtes volgen de
// orde van grootte van de CROW-richtlijnen. Overgenomen uit de Unity-versie (WegTypeCatalogus).

export type StrookSoort = 'auto' | 'bus' | 'tram' | 'fiets' | 'stoep' | 'gedeeld' | 'berm' | 'middenberm' | 'vluchtstrook';
export type Richting = 'A' | 'B' | 'T';
export interface Strook { soort: StrookSoort; richting: Richting; breedte: number }

export type WegTypeId = 'voetpad' | 'fietspad' | 'woonstraat' | 'straat' | 'straatBus' | 'laan' | 'tramstraat' | 'gow' | 'snelweg';

export interface WegType {
  id: WegTypeId;
  naam: string;
  stroken: Strook[];
  snelheid: number;
  /** Mogen er kavels (en dus gebouwen) direct aan liggen? */
  erf: boolean;
  /** Wegdek: asfalt, klinkers of (voor paden) tegels/rood asfalt. */
  dek: 'asfalt' | 'klinkers' | 'tegels' | 'rood';
  kosten: number; // euro per meter
  bomen: boolean;
}

const S = (soort: StrookSoort, richting: Richting, breedte: number): Strook => ({ soort, richting, breedte });

export const WEGTYPEN: Record<WegTypeId, WegType> = {
  voetpad: { id: 'voetpad', naam: 'Voetpad', stroken: [S('stoep', 'T', 2.5)], snelheid: 5, erf: false, dek: 'tegels', kosten: 150, bomen: false },
  fietspad: { id: 'fietspad', naam: 'Fietspad', stroken: [S('fiets', 'T', 3.0)], snelheid: 20, erf: false, dek: 'rood', kosten: 250, bomen: false },
  woonstraat: {
    id: 'woonstraat', naam: 'Woonstraat (30)', snelheid: 30, erf: true, dek: 'klinkers', kosten: 900, bomen: true,
    stroken: [S('stoep', 'T', 1.8), S('gedeeld', 'B', 2.75), S('gedeeld', 'A', 2.75), S('stoep', 'T', 1.8)],
  },
  straat: {
    id: 'straat', naam: 'Straat (50)', snelheid: 50, erf: true, dek: 'asfalt', kosten: 1400, bomen: true,
    stroken: [S('stoep', 'T', 2), S('fiets', 'B', 1.75), S('auto', 'B', 3), S('auto', 'A', 3), S('fiets', 'A', 1.75), S('stoep', 'T', 2)],
  },
  straatBus: {
    id: 'straatBus', naam: 'Straat met busbaan', snelheid: 50, erf: true, dek: 'asfalt', kosten: 1900, bomen: true,
    stroken: [S('stoep', 'T', 2.2), S('fiets', 'B', 1.75), S('bus', 'B', 3.25), S('auto', 'B', 3), S('auto', 'A', 3), S('bus', 'A', 3.25), S('fiets', 'A', 1.75), S('stoep', 'T', 2.2)],
  },
  laan: {
    id: 'laan', naam: 'Stadslaan 2x2', snelheid: 50, erf: true, dek: 'asfalt', kosten: 3200, bomen: true,
    stroken: [S('stoep', 'T', 3), S('fiets', 'B', 2), S('berm', 'T', 1), S('auto', 'B', 3.25), S('auto', 'B', 3.25), S('middenberm', 'T', 3.5),
      S('auto', 'A', 3.25), S('auto', 'A', 3.25), S('berm', 'T', 1), S('fiets', 'A', 2), S('stoep', 'T', 3)],
  },
  tramstraat: {
    id: 'tramstraat', naam: 'Tramstraat', snelheid: 50, erf: true, dek: 'asfalt', kosten: 4200, bomen: false,
    stroken: [S('stoep', 'T', 2.5), S('fiets', 'B', 1.75), S('auto', 'B', 3), S('tram', 'B', 3), S('tram', 'A', 3), S('auto', 'A', 3), S('fiets', 'A', 1.75), S('stoep', 'T', 2.5)],
  },
  gow: {
    id: 'gow', naam: 'Ontsluitingsweg (70)', snelheid: 70, erf: false, dek: 'asfalt', kosten: 3500, bomen: true,
    stroken: [S('fiets', 'B', 2.5), S('berm', 'T', 2.5), S('auto', 'B', 3.25), S('auto', 'B', 3.25), S('middenberm', 'T', 3),
      S('auto', 'A', 3.25), S('auto', 'A', 3.25), S('berm', 'T', 2.5), S('fiets', 'A', 2.5)],
  },
  snelweg: {
    id: 'snelweg', naam: 'Snelweg 2x3', snelheid: 100, erf: false, dek: 'asfalt', kosten: 9000, bomen: false,
    stroken: [S('berm', 'T', 1.5), S('vluchtstrook', 'B', 3.5), S('auto', 'B', 3.5), S('auto', 'B', 3.5), S('auto', 'B', 3.5), S('middenberm', 'T', 4),
      S('auto', 'A', 3.5), S('auto', 'A', 3.5), S('auto', 'A', 3.5), S('vluchtstrook', 'A', 3.5), S('berm', 'T', 1.5)],
  },
};

export const WEGTYPE_VOLGORDE: WegTypeId[] = ['woonstraat', 'straat', 'straatBus', 'laan', 'tramstraat', 'gow', 'snelweg', 'fietspad', 'voetpad'];

export function totaleBreedte(stroken: Strook[]) { return stroken.reduce((s, l) => s + l.breedte, 0); }
export function halveBreedte(type: WegTypeId) { return totaleBreedte(WEGTYPEN[type].stroken) / 2; }

/** Strookgrenzen als offsets vanaf de as (links negatief). */
export function strookGrenzen(stroken: Strook[]): { a: number; b: number; s: Strook }[] {
  const tot = totaleBreedte(stroken);
  let o = -tot / 2;
  return stroken.map(s => { const r = { a: o, b: o + s.breedte, s }; o += s.breedte; return r; });
}

/** Rijdt er gemotoriseerd verkeer? (bepaalt verhoogde stoep langs de rijbaan, markering, enz.) */
export const isRijbaan = (s: StrookSoort) => s === 'auto' || s === 'bus' || s === 'tram' || s === 'gedeeld' || s === 'vluchtstrook' || s === 'fiets';

/** Randen van de rijbaan voor gemotoriseerd verkeer en de buitenranden, als offsets vanaf de as.
 *  Stoepen, fietspaden en bermen aan de buitenkant liggen daarbuiten (en lopen op een kruispunt
 *  door als afgeronde hoek). */
export function randen(stroken: Strook[]) {
  const g = strookGrenzen(stroken);
  const W = totaleBreedte(stroken);
  const motor = (x: Strook) => x.soort === 'auto' || x.soort === 'bus' || x.soort === 'tram' || x.soort === 'gedeeld' || x.soort === 'vluchtstrook';
  const i0 = g.findIndex(x => motor(x.s)), i1 = g.length - 1 - [...g].reverse().findIndex(x => motor(x.s));
  const heeft = i0 >= 0;
  return {
    binnenL: heeft ? g[i0].a : -W / 2, binnenR: heeft ? g[i1].b : W / 2,
    buitenL: -W / 2, buitenR: W / 2,
    stoep: heeft && i0 > 0 && g.slice(0, i0).some(x => x.s.soort === 'stoep'),
  };
}

/** Straal van de stoeprandhoek op een kruispunt, naar wegtype. */
export const HOEKSTRAAL: Record<WegTypeId, number> = { voetpad: 1, fietspad: 2, woonstraat: 3.5, straat: 4.5, straatBus: 6, laan: 7, tramstraat: 6, gow: 9, snelweg: 14 };
