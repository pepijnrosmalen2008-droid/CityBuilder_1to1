// Zones, gebouwvormen en de kengetallen waarmee een gebouw zijn capaciteit krijgt
// (overgenomen uit FunctieKengetallen.cs van de Unity-versie).

export type Zone = 'geen' | 'wonenLaag' | 'wonenHoog' | 'gemengd' | 'kantoor' | 'industrie';
export type GebouwVorm = 'rijwoningen' | 'appartementen' | 'winkelsMetWonen' | 'kantoortoren' | 'bedrijfshal';
export type Functie = 'wonen' | 'detailhandel' | 'horeca' | 'kantoor' | 'industrie' | 'maatschappelijk';

export const ZONES: { id: Zone; naam: string; kleur: string; toets: string }[] = [
  { id: 'wonenLaag', naam: 'Wonen laag', kleur: '#5fcf5a', toets: '1' },
  { id: 'wonenHoog', naam: 'Wonen hoog', kleur: '#2f9e44', toets: '2' },
  { id: 'gemengd', naam: 'Gemengd (winkels + wonen)', kleur: '#4dabf7', toets: '3' },
  { id: 'kantoor', naam: 'Kantoren', kleur: '#9775fa', toets: '4' },
  { id: 'industrie', naam: 'Industrie', kleur: '#f59f00', toets: '5' },
  { id: 'geen', naam: 'Zone weghalen', kleur: '#adb5bd', toets: '6' },
];
export const zoneKleur = (z: Zone) => ZONES.find(q => q.id === z)?.kleur ?? '#888';

export const KENGETALLEN = {
  beroepsbevolking: 0.52,
  woningBvo: { rijwoningen: 125, winkelsMetWonen: 85, anders: 80 } as Record<string, number>,
  huishouden: { rijwoningen: 2.6, winkelsMetWonen: 1.7, anders: 1.8 } as Record<string, number>,
  bvoPerBaan: { detailhandel: 45, horeca: 30, kantoor: 24, industrie: 95, maatschappelijk: 40, wonen: 0 } as Record<Functie, number>,
};

export function verdiepingHoogte(f: Functie, begane: boolean): number {
  switch (f) {
    case 'wonen': return begane ? 3.0 : 2.9;
    case 'detailhandel': return 4.4;
    case 'horeca': return 4.2;
    case 'kantoor': return begane ? 4.8 : 3.7;
    case 'industrie': return 9;
    default: return 3.5;
  }
}

export interface Capaciteit {
  vloer: number; woningen: number; bewoners: number;
  banen: Record<'detailhandel' | 'horeca' | 'kantoor' | 'industrie' | 'overig', number>;
}
export const banenTotaal = (c: Capaciteit) => c.banen.detailhandel + c.banen.horeca + c.banen.kantoor + c.banen.industrie + c.banen.overig;

export function berekenCapaciteit(vorm: GebouwVorm, footprint: number, lagen: Functie[], eenheden: number): Capaciteit {
  const c: Capaciteit = { vloer: 0, woningen: 0, bewoners: 0, banen: { detailhandel: 0, horeca: 0, kantoor: 0, industrie: 0, overig: 0 } };
  const netto = 0.82; // bvo → bruikbaar (trappenhuizen, gangen, wanden)
  let woonVloer = 0;
  for (const f of lagen) {
    c.vloer += footprint;
    if (f === 'wonen') woonVloer += footprint;
    else {
      const n = Math.round(footprint * netto / KENGETALLEN.bvoPerBaan[f]);
      if (f === 'detailhandel' || f === 'horeca' || f === 'kantoor' || f === 'industrie') c.banen[f] += n; else c.banen.overig += n;
    }
  }
  if (woonVloer > 0) {
    c.woningen = vorm === 'rijwoningen' ? eenheden : Math.max(1, Math.round(woonVloer / (KENGETALLEN.woningBvo[vorm] ?? KENGETALLEN.woningBvo.anders)));
    c.bewoners = Math.round(c.woningen * (KENGETALLEN.huishouden[vorm] ?? KENGETALLEN.huishouden.anders));
  }
  return c;
}
