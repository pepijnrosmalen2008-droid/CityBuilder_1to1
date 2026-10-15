import { WEGTYPEN, totaleBreedte } from './wegen/typen';

// Gemeentebegroting met Nederlandse ordegroottes (per jaar):
// - OZB + rioolheffing + afvalstoffenheffing per woning: ca. € 1.100
// - OZB niet-woningen: grofweg € 350 per arbeidsplaats
// - Algemene uitkering uit het Gemeentefonds: ca. € 1.400 per inwoner
// - Voorzieningen (onderwijshuisvesting, zorg, groen, veiligheid, bestuur): ca. € 2.050 per inwoner (spelbalans)
// - Wegonderhoud: ca. € 3 per m² verharding
// In het spel wordt per maand (30 dagen) afgerekend.

export interface Tarieven {
  /** Factor op de standaard woonlasten (0,5–1,5). */
  wonen: number;
  /** Factor op de standaard OZB voor bedrijven (0,5–1,5). */
  bedrijven: number;
}

export interface Maandstaat {
  woonlasten: number; bedrijfslasten: number; gemeentefonds: number; export: number;
  wegen: number; voorzieningen: number;
  saldo: number;
}

export const STANDAARD = {
  woonlastenPerWoning: 1100,
  ozbPerBaan: 350,
  gemeentefondsPerInwoner: 1400,
  voorzieningenPerInwoner: 2050,
  wegPerM2: 3,
};

export function maandstaat(t: Tarieven, woningen: number, banen: number, inwoners: number, wegM2: number, exportHeffing: number): Maandstaat {
  const m = 1 / 12;
  const woonlasten = woningen * STANDAARD.woonlastenPerWoning * t.wonen * m;
  const bedrijfslasten = banen * STANDAARD.ozbPerBaan * t.bedrijven * m;
  const gemeentefonds = inwoners * STANDAARD.gemeentefondsPerInwoner * m;
  const wegen = wegM2 * STANDAARD.wegPerM2 * m;
  const voorzieningen = inwoners * STANDAARD.voorzieningenPerInwoner * m;
  const saldo = woonlasten + bedrijfslasten + gemeentefonds + exportHeffing - wegen - voorzieningen;
  return { woonlasten, bedrijfslasten, gemeentefonds, export: exportHeffing, wegen, voorzieningen, saldo };
}

/** Oppervlak verharding (m²) van een wegsegment. */
export function wegOppervlak(type: keyof typeof WEGTYPEN, lengte: number) {
  return totaleBreedte(WEGTYPEN[type].stroken) * lengte;
}

/** Invloed van de tarieven op de vraag: hogere lasten remmen de groei. */
export function tariefEffect(factor: number) {
  return -(factor - 1) * 0.6;
}
