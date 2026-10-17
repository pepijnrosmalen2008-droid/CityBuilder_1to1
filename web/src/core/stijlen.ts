import type { Zone } from './zones';
import type { GevelStijl } from './geom/gebouwmesh';
import { Rng } from './rng';

// ════════════════════════════════════════════════════════════════════════════════════
// BOUWSTIJLEN
// Elk gebouw heeft een bouwstijl (tijdperk) en een type. Een district kan een stijl
// voorschrijven; anders kiest de ontwikkelaar per gebouw, waarbij een hoger niveau vaker
// nieuwbouw oplevert (zoals in Cities: Skylines: elk niveau ziet er anders uit).
// ════════════════════════════════════════════════════════════════════════════════════

export type Bouwstijl = 'klassiek' | 'gracht' | 'naoorlogs' | 'jaren70' | 'nieuwbouw' | 'stadshart';
/** Stijl van een district: 'gemengd' laat de ontwikkelaar kiezen. */
export type DistrictStijl = 'gemengd' | Bouwstijl;

export const BOUWSTIJLEN: Record<Bouwstijl, { naam: string; uitleg: string }> = {
  klassiek: { naam: 'Jaren dertig', uitleg: 'Baksteen, pannendaken, roedes in de ramen, erkers en portieken.' },
  gracht: { naam: 'Grachtengordel', uitleg: 'Smalle, hoge panden met trap-, hals- en klokgevels; pakhuizen met hijsbalken.' },
  naoorlogs: { naam: 'Naoorlogs', uitleg: 'Wederopbouw: gele en grijze baksteen, portiek- en galerijflats, platte daken, sheddaken.' },
  jaren70: { naam: 'Jaren zeventig', uitleg: 'Bloemkoolwijken: donkerbruine steen en hout, steile kappen tot op de begane grond, terrasflats.' },
  stadshart: { naam: 'Stadshart', uitleg: 'Gesloten bouwblokken zoals in Parijs, Brussel en Berlijn: natuursteen en baksteen met witte omlijsting, smeedijzeren balkons, zinken mansardedaken, hoektorens met koepels.' },
  nieuwbouw: { naam: 'Nieuwbouw', uitleg: 'Donkere steen, hout en wit stucwerk, grote ramen, glazen balkons, terugliggende bovenste laag.' },
};

export type GebouwType =
  // wonen laag
  | 'rijtjes30' | 'grachtpand' | 'rijtjes50' | 'bloemkool' | 'vinex' | 'villa'
  // wonen hoog
  | 'flat30' | 'grachtblok' | 'portiekflat' | 'galerijflat' | 'terrasflat' | 'appModern' | 'woontoren'
  // gemengd
  | 'winkels30' | 'grachtWinkel' | 'wederopbouw' | 'gemengdModern'
  // kantoor
  | 'kantoor30' | 'grachtKantoor' | 'kantoorBeton' | 'kantoorGlas'
  // industrie
  | 'pakhuis' | 'sheddak' | 'halModern'
  // stadshart
  | 'stadsblok' | 'stadsWinkel' | 'stadsKantoor';

export interface Ontwerpkeuze {
  stijl: Bouwstijl;
  type: GebouwType;
  /** Aantal lagen (voor hoogbouw nog te begrenzen door buren en district). */
  lagen: number;
  diepte: [number, number];
  terug: [number, number];
  gevel: GevelStijl;
  /** Breedte van een woning/pand langs de straat (rijen). */
  eenheid?: number;
}

/** Welke stijl kiest een ontwikkelaar zonder voorschrift (per niveau een ander tijdperk). */
export function kiesStijl(niveau: number, r: Rng): Bouwstijl {
  const w = [
    // klassiek, naoorlogs, jaren70, nieuwbouw, stadshart
    [0.17, 0.45, 0.18, 0.08, 0.12],
    [0.22, 0.25, 0.15, 0.13, 0.25],
    [0.20, 0.10, 0.10, 0.25, 0.35],
    [0.15, 0.03, 0.05, 0.37, 0.40],
    [0.12, 0.00, 0.03, 0.45, 0.40],
  ][Math.max(0, Math.min(4, niveau - 1))];
  const stijlen: Bouwstijl[] = ['klassiek', 'naoorlogs', 'jaren70', 'nieuwbouw', 'stadshart'];
  let x = r.next();
  for (let i = 0; i < 5; i++) { if (x < w[i]) return stijlen[i]; x -= w[i]; }
  return 'nieuwbouw';
}

const kies = <T>(r: Rng, l: readonly T[]) => l[Math.floor(r.next() * l.length) % l.length];
const STADS_GEVELS = ['haussmann', 'haussmannWit', 'gruender', 'haussmann'] as const;

/**
 * Ontwerp voor zone + stijl + niveau. `breed` = er zijn meerdere kavels samengevoegd.
 * Hoogtes groeien met het niveau: een niveau 1-flat is een lage portiekflat, niveau 5 een woontoren.
 */
export function ontwerpKeuze(zone: Zone, stijl: Bouwstijl, niveau: number, breed: boolean, r: Rng, lengte = 99): Ontwerpkeuze | null {
  const n = Math.max(1, Math.min(5, niveau));
  const tussen = (a: number, b: number) => a + Math.floor(r.next() * (b - a + 1));
  switch (zone) {
    case 'wonenLaag':
      // Niveau 5: vrijstaande villa's op ruime kavels.
      if (n >= 5 && lengte >= 13 && (stijl === 'klassiek' || stijl === 'nieuwbouw') && r.next() < 0.55)
        return { stijl, type: 'villa', lagen: 2, diepte: [10, 12], terug: [5, 8], eenheid: 14 + r.next() * 3, gevel: stijl === 'klassiek' ? kies(r, ['baksteenRood', 'stuc', 'baksteenGeel'] as const) : kies(r, ['witStuc', 'antraciet', 'houtGevel'] as const) };
      switch (stijl) {
        case 'jaren70': return { stijl, type: 'bloemkool', lagen: 1, diepte: [9, 10.5], terug: [3, 6], eenheid: 5.6, gevel: kies(r, ['bruin70', 'baksteenBruin', 'baksteenRood', 'naoorlogsGrijs'] as const) };
        case 'stadshart': return { stijl, type: 'stadsblok', lagen: 3 + (n >= 3 ? 1 : 0), diepte: [12, 14], terug: [0.2, 0.3], eenheid: 8 + r.next() * 3, gevel: kies(r, STADS_GEVELS) };
        case 'gracht': return { stijl, type: 'grachtpand', lagen: tussen(3, 4) + (n >= 4 ? 1 : 0), diepte: [12, 15], terug: [0.3, 0.6], eenheid: 6 + r.next() * 1.5, gevel: kies(r, ['grachtRood', 'grachtDonker', 'grachtRood', 'stuc'] as const) };
        case 'naoorlogs': return { stijl, type: 'rijtjes50', lagen: 2 + (n >= 3 && r.next() < 0.5 ? 1 : 0), diepte: [8.5, 9.5], terug: [3, 5], eenheid: 5.4, gevel: n <= 2 ? kies(r, ['naoorlogsGeel', 'naoorlogsGrijs'] as const) : kies(r, ['naoorlogsGeel', 'baksteenBruin'] as const) };
        case 'nieuwbouw': return { stijl, type: 'vinex', lagen: n >= 3 ? 3 : 2 + (r.next() < 0.4 ? 1 : 0), diepte: [9.5, 11], terug: [3, 4.5], eenheid: n >= 4 ? 6.6 : 5.7, gevel: n <= 2 ? kies(r, ['nieuwRood', 'witStuc'] as const) : kies(r, ['antraciet', 'houtGevel', 'nieuwRood', 'witStuc'] as const) };
        default: return { stijl: 'klassiek', type: 'rijtjes30', lagen: n >= 4 ? 3 : r.next() < 0.65 ? 2 : 3, diepte: [9, 10.5], terug: [3, 5], eenheid: n >= 4 ? 6.2 : 5.4, gevel: kies(r, ['baksteenRood', 'baksteenRood', 'baksteenBruin', 'baksteenGeel'] as const) };
      }
    case 'wonenHoog': {
      // Lagen per niveau; breed (samengevoegde kavels) iets hoger.
      const basis = [[4, 5], [5, 6], [6, 8], [7, 10], [9, 13]][n - 1];
      const l = tussen(basis[0], basis[1]) + (breed ? 1 : 0);
      switch (stijl) {
        case 'stadshart': return { stijl, type: 'stadsblok', lagen: Math.min(7, Math.max(4, l - 1)), diepte: [13, 17], terug: [0.2, 0.3], eenheid: 10 + r.next() * 5, gevel: kies(r, STADS_GEVELS) };
        case 'gracht': return { stijl, type: 'grachtblok', lagen: Math.min(6, Math.max(4, l)), diepte: [12, 15], terug: [0.3, 0.6], eenheid: 7 + r.next() * 2, gevel: kies(r, ['grachtRood', 'grachtDonker', 'stuc'] as const) };
        case 'naoorlogs': return n <= 3
          ? { stijl, type: 'portiekflat', lagen: Math.min(5, Math.max(3, l)), diepte: [10, 12], terug: [4, 7], gevel: kies(r, ['naoorlogsGeel', 'naoorlogsGrijs', 'baksteenBruin'] as const) }
          : { stijl, type: 'galerijflat', lagen: Math.max(6, l), diepte: [11, 13], terug: [6, 9], gevel: kies(r, ['betonPaneel', 'naoorlogsGrijs'] as const) };
        case 'jaren70': return { stijl, type: 'terrasflat', lagen: Math.max(3, Math.min(7, l)), diepte: [13, 16], terug: [3, 5], gevel: kies(r, ['bruin70', 'baksteenBruin', 'betonPaneel'] as const) };
        case 'nieuwbouw': if (n >= 5 && r.next() < 0.45) return { stijl, type: 'woontoren', lagen: tussen(14, 22), diepte: [16, 20], terug: [3, 5], gevel: kies(r, ['witStuc', 'antraciet', 'nieuwRood'] as const) };
          return { stijl, type: 'appModern', lagen: l, diepte: [13, 16], terug: [2.5, 4.5], gevel: kies(r, ['witStuc', 'antraciet', 'nieuwRood', 'houtGevel'] as const) };
        default: return { stijl: 'klassiek', type: 'flat30', lagen: Math.min(6, l), diepte: [12, 14], terug: [2.5, 4], gevel: kies(r, ['baksteenBruin', 'baksteenRood', 'baksteenGeel', 'stuc'] as const) };
      }
    }
    case 'gemengd': {
      const l = tussen(2, 3) + Math.floor((n - 1) * 0.6);
      switch (stijl) {
        case 'stadshart': return { stijl, type: 'stadsWinkel', lagen: Math.min(7, Math.max(4, l + 2)), diepte: [13, 17], terug: [0.2, 0.3], eenheid: 10 + r.next() * 5, gevel: kies(r, STADS_GEVELS) };
        case 'gracht': return { stijl, type: 'grachtWinkel', lagen: Math.max(3, Math.min(5, l + 1)), diepte: [12, 15], terug: [0.2, 0.3], eenheid: 6 + r.next() * 1.5, gevel: kies(r, ['grachtRood', 'grachtDonker', 'stuc'] as const) };
        case 'naoorlogs': return { stijl, type: 'wederopbouw', lagen: Math.max(3, Math.min(4, l)), diepte: [12, 15], terug: [0.2, 0.3], gevel: kies(r, ['naoorlogsGeel', 'naoorlogsGrijs', 'baksteenBruin'] as const) };
        case 'jaren70': return { stijl, type: 'wederopbouw', lagen: Math.max(2, Math.min(4, l)), diepte: [12, 15], terug: [0.2, 0.3], gevel: kies(r, ['bruin70', 'baksteenBruin', 'naoorlogsGrijs'] as const) };
        case 'nieuwbouw': return { stijl, type: 'gemengdModern', lagen: Math.max(3, l + 1), diepte: [13, 16], terug: [0.2, 0.3], gevel: kies(r, ['witStuc', 'antraciet', 'nieuwRood'] as const) };
        default: return { stijl: 'klassiek', type: 'winkels30', lagen: Math.max(3, Math.min(5, l)), diepte: [12, 16], terug: [0.2, 0.3], gevel: kies(r, ['baksteenRood', 'baksteenBruin', 'stuc', 'baksteenGeel'] as const) };
      }
    }
    case 'kantoor': {
      const basis = [[5, 7], [6, 9], [8, 12], [10, 15], [12, 20]][n - 1];
      const l = tussen(basis[0], basis[1]) + (breed ? 2 : 0);
      switch (stijl) {
        case 'stadshart': return n >= 4 && r.next() < 0.5
          ? { stijl: 'nieuwbouw', type: 'kantoorGlas', lagen: l + 4, diepte: [16, 22], terug: [1, 3], gevel: kies(r, ['vliesgevel', 'vliesgevel', 'modernDonker'] as const) }
          : { stijl, type: 'stadsKantoor', lagen: Math.min(8, Math.max(5, l)), diepte: [14, 18], terug: [0.2, 0.3], eenheid: 14 + r.next() * 6, gevel: kies(r, ['kalksteen', 'kalksteen', 'haussmann', 'gruender'] as const) };
        case 'gracht': return { stijl, type: 'grachtKantoor', lagen: Math.min(5, Math.max(3, l)), diepte: [13, 16], terug: [0.3, 0.6], eenheid: 7 + r.next() * 2, gevel: kies(r, ['grachtRood', 'grachtDonker', 'stuc'] as const) };
        case 'naoorlogs': return { stijl, type: 'kantoorBeton', lagen: Math.min(10, l), diepte: [14, 18], terug: [3, 5], gevel: 'betonband' };
        case 'jaren70': return { stijl, type: 'kantoorBeton', lagen: Math.min(9, l), diepte: [14, 18], terug: [3, 5], gevel: 'bruin70' };
        case 'nieuwbouw': return { stijl, type: 'kantoorGlas', lagen: l, diepte: [16, 22], terug: [3, 5], gevel: kies(r, ['vliesgevel', 'vliesgevel', 'modernDonker'] as const) };
        default: return { stijl: 'klassiek', type: 'kantoor30', lagen: Math.min(7, l), diepte: [14, 18], terug: [2, 4], gevel: kies(r, ['baksteenBruin', 'stuc', 'baksteenRood'] as const) };
      }
    }
    case 'industrie':
      switch (stijl) {
        case 'gracht': case 'klassiek': case 'stadshart': return { stijl, type: 'pakhuis', lagen: 1, diepte: [16, 22], terug: [1, 3], eenheid: 9 + r.next() * 3, gevel: kies(r, ['grachtRood', 'grachtDonker', 'baksteenBruin'] as const) };
        case 'naoorlogs': return { stijl, type: 'sheddak', lagen: 1, diepte: [20, 30], terug: [5, 8], gevel: 'naoorlogsGeel' };
        case 'jaren70': return { stijl, type: 'sheddak', lagen: 1, diepte: [20, 30], terug: [5, 8], gevel: 'bruin70' };
        default: return { stijl, type: 'halModern', lagen: 1, diepte: [20, 30], terug: [5, 8], gevel: 'modernDonker' };
      }
    default: return null;
  }
}
