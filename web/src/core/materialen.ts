// Engine-onafhankelijke materiaalbeschrijvingen. Een andere engine leest dezelfde tabel en maakt
// er zijn eigen materialen van (Unity: URP/Lit, Godot: StandardMaterial3D, ...).

export interface MatDef {
  /** Textuursleutel voor tex/index.ts (albedo + normaal + orm). */
  tex?: string;
  /** Kleur (sRGB 0-1); met een textuur werkt dit als tint. */
  kleur: [number, number, number];
  ruwheid: number;
  metaal: number;
  /** Meters per herhaling van de textuur; 0 = de UV's zijn al genormaliseerd. */
  meter: number;
  normaal?: number;
  alfa?: 'knip' | 'mengen';
  dubbelzijdig?: boolean;
  emissie?: [number, number, number];
  /** Ligt bovenop een ander vlak (markering): diepteverschuiving tegen z-fighting. */
  bovenop?: boolean;
  /** Mag schaduw werpen. */
  schaduw?: boolean;
  /** Kleurvariatie per instantie (bomen). */
  instantieTint?: boolean;
}

const D = (m: Partial<MatDef>): MatDef => ({ kleur: [1, 1, 1], ruwheid: 1, metaal: 0, meter: 1, schaduw: true, ...m });

const VAST: Record<string, MatDef> = {
  asfalt: D({ tex: 'asfalt', meter: 4, normaal: 0.6 }),
  fietsasfalt: D({ tex: 'fietsasfalt', meter: 4, normaal: 0.6 }),
  busbaan: D({ tex: 'busbaan', meter: 4, normaal: 0.6 }),
  klinkers: D({ tex: 'klinkers', meter: 2.1, normaal: 1 }),
  stoeptegels: D({ tex: 'stoeptegels', meter: 1.8, normaal: 0.8 }),
  erfverharding: D({ tex: 'erfverharding', meter: 3, normaal: 0.8 }),
  beton: D({ tex: 'beton', meter: 2, normaal: 0.5 }),
  band: D({ tex: 'band', meter: 2, normaal: 0.4 }),
  gras: D({ tex: 'gras', meter: 6, normaal: 0.8 }),
  tuin: D({ tex: 'tuin', meter: 5, normaal: 0.8 }),
  markering: D({ kleur: [0.92, 0.92, 0.88], ruwheid: 0.6, bovenop: true, schaduw: false }),
  rail: D({ kleur: [0.55, 0.55, 0.57], ruwheid: 0.3, metaal: 1, bovenop: true, schaduw: false }),
  metaal: D({ kleur: [0.55, 0.57, 0.6], ruwheid: 0.45, metaal: 0.8 }),
  paal: D({ kleur: [0.22, 0.23, 0.24], ruwheid: 0.5, metaal: 0.6 }),
  lamp: D({ kleur: [1, 0.95, 0.8], ruwheid: 0.3, emissie: [1.0, 0.85, 0.6], schaduw: false }),
  trim: D({ kleur: [0.92, 0.92, 0.9], ruwheid: 0.55 }),
  trimDonker: D({ kleur: [0.16, 0.16, 0.17], ruwheid: 0.5, metaal: 0.2 }),
  glas: D({ kleur: [0.22, 0.30, 0.36], ruwheid: 0.08, metaal: 0.6 }),
  raam: D({ kleur: [0.16, 0.22, 0.28], ruwheid: 0.06, metaal: 0.5 }),
  lichtstraat: D({ kleur: [0.55, 0.62, 0.68], ruwheid: 0.15, metaal: 0.3 }),
  dakpannen: D({ tex: 'dakpannen', meter: 2, normaal: 1 }),
  dakpannenAntraciet: D({ tex: 'dakpannenAntraciet', meter: 2, normaal: 1 }),
  dakgrind: D({ tex: 'dakgrind', meter: 3, normaal: 0.8 }),
  golfdak: D({ tex: 'golfdak', meter: 4, normaal: 1 }),
  roldeur: D({ tex: 'roldeur', meter: 4, normaal: 0.8 }),
  plint: D({ tex: 'plint', meter: 6, normaal: 1 }),
  haag: D({ tex: 'haag', meter: 2, normaal: 1 }),
  hout: D({ tex: 'hout', meter: 2, normaal: 0.7 }),
  keet: D({ tex: 'keet', meter: 3, normaal: 0.8 }),
  kraan: D({ kleur: [0.93, 0.70, 0.08], ruwheid: 0.45, metaal: 0.3 }),
  steiger: D({ tex: 'steiger', meter: 2, alfa: 'knip', dubbelzijdig: true }),
  hekwerk: D({ tex: 'hekwerk', meter: 0, alfa: 'knip', dubbelzijdig: true }),
  schors: D({ tex: 'schors', meter: 1, normaal: 1 }),
  schorsBerk: D({ tex: 'schorsBerk', meter: 1, normaal: 0.8 }),
};

const DEUR: [number, number, number][] = [[0.12, 0.22, 0.16], [0.55, 0.12, 0.10], [0.12, 0.16, 0.30], [0.15, 0.15, 0.16], [0.85, 0.84, 0.78]];

export function materiaal(sleutel: string): MatDef {
  const v = VAST[sleutel];
  if (v) return v;
  const [naam, arg] = sleutel.split(':');
  switch (naam) {
    case 'gevel': return D({ tex: sleutel, meter: 0, normaal: 1 });
    case 'muur': return D({ tex: sleutel, meter: 6, normaal: 1 });
    case 'winkelpui': return D({ tex: sleutel, meter: 0, normaal: 0.8 });
    case 'luifel': return D({ tex: sleutel, meter: 0.6, dubbelzijdig: true });
    case 'golfplaat': return D({ tex: sleutel, meter: 4, normaal: 1 });
    case 'deur': return D({ kleur: DEUR[Number(arg) % DEUR.length], ruwheid: 0.4 });
    case 'blad': return D({ tex: sleutel, meter: 0, alfa: 'knip', dubbelzijdig: true, normaal: 0.6, instantieTint: true });
    case 'bladkern': return D({ tex: sleutel, meter: 3, instantieTint: true });
    default: return D({ kleur: [1, 0, 1] });
  }
}
