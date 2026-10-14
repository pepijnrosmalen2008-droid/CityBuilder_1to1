import { Rng } from './rng';
import { WegTypeId } from './wegen/typen';

// Nederlandse straat- en plaatsnamen, deterministisch per seed.

const BOMEN = ['Linden', 'Eiken', 'Beuken', 'Kastanje', 'Esdoorn', 'Wilgen', 'Populieren', 'Berken', 'Iepen', 'Platanen', 'Essen', 'Elzen', 'Hazelaar', 'Meidoorn', 'Lijsterbes'];
const BLOEMEN = ['Tulpen', 'Rozen', 'Narcissen', 'Krokus', 'Hyacinten', 'Lelie', 'Dahlia', 'Klaver', 'Madelief', 'Zonnebloem', 'Viooltjes', 'Irissen'];
const VOGELS = ['Merel', 'Lijster', 'Spreeuw', 'Mussen', 'Kievit', 'Reiger', 'Zwaluw', 'Specht', 'Ooievaar', 'Grutto', 'Fazant', 'Uilen'];
const AMBACHT = ['Molen', 'Smids', 'Bakkers', 'Brouwers', 'Schippers', 'Kerk', 'Haven', 'Dijk', 'Sluis', 'Gasthuis', 'Raadhuis', 'Markt'];
const MENSEN = ['Erasmus', 'Rembrandt', 'Vondel', 'Spinoza', 'Huygens', 'Mondriaan', 'Escher', 'Annie M.G. Schmidt', 'Aletta Jacobs', 'Multatuli', 'Van Gogh', 'Lorentz', 'Thorbecke', 'Drees'];

const ACHTER: Record<WegTypeId, string[]> = {
  woonstraat: ['straat', 'hof', 'erf', 'pad', 'plein', 'gaarde'],
  straat: ['straat', 'weg', 'straat', 'singel'],
  straatBus: ['straat', 'weg'],
  laan: ['laan', 'laan', 'boulevard', 'singel'],
  tramstraat: ['straat', 'weg', 'laan'],
  gow: ['weg', 'ring', 'baan'],
  snelweg: [''],
  fietspad: ['pad', 'fietspad'],
  voetpad: ['pad', 'steeg', 'gang'],
};

export class Namen {
  private rng: Rng;
  private gebruikt = new Set<string>();
  private snelweg = 1;
  constructor(seed: number) { this.rng = new Rng(seed * 31 + 7); }

  straat(type: WegTypeId): string {
    if (type === 'snelweg') return `A${[1, 2, 4, 12, 27, 28, 50][this.snelweg++ % 7]}`;
    for (let poging = 0; poging < 40; poging++) {
      const thema = this.rng.next();
      const achter = this.rng.kies(ACHTER[type]);
      let naam: string;
      if (thema < 0.3) naam = this.rng.kies(BOMEN) + achter;
      else if (thema < 0.5) naam = this.rng.kies(BLOEMEN) + achter;
      else if (thema < 0.68) naam = this.rng.kies(VOGELS) + achter;
      else if (thema < 0.85) naam = this.rng.kies(AMBACHT) + achter;
      else naam = this.rng.kies(MENSEN) + (achter === 'straat' || achter === 'laan' || achter === 'weg' ? achter : 'straat');
      if (type === 'gow' && achter === 'ring') naam = `Ring ${this.rng.kies(['Noord', 'Oost', 'Zuid', 'West'])}`;
      if (/^[A-Z][a-z]+ [A-Z]/.test(naam) || naam.includes(' ')) naam = naam.replace(/(straat|laan|weg)$/, ' $1').replace(/  /g, ' ');
      if (!this.gebruikt.has(naam)) { this.gebruikt.add(naam); return naam; }
    }
    return `Weg ${this.gebruikt.size + 1}`;
  }
}

const VOOR = ['Nieuw', 'Oud', 'Groot', 'Hoog', 'Klein', 'West', 'Oost', ''];
const STAM = ['Vliet', 'Brug', 'Haven', 'Molen', 'Linde', 'Eiken', 'Water', 'Zand', 'Heide', 'Bree', 'Dijk', 'Gouw', 'Rijn', 'Berg', 'Lee', 'Wester'];
const ACHTERSTAD = ['dam', 'dorp', 'hoven', 'wijk', 'veen', 'drecht', 'stede', 'kerk', 'burg', 'mond', 'horst', 'loo'];

export function stadsnaam(seed: number): string {
  const r = new Rng(seed * 101 + 3);
  const v = r.kies(VOOR), s = r.kies(STAM), a = r.kies(ACHTERSTAD);
  return (v ? v + '-' : '') + s + a;
}
