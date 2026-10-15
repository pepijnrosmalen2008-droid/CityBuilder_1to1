/** Detailniveau bij het opbouwen van een mesh: `ver` = versie voor op afstand (zelfde silhouet en
 *  gevels, zonder tuinspullen, deuren, balkons, installaties). */
export const LOD = { ver: false };

import type { MeshData, MeshGroep } from './mesh';
import { materiaal } from '../materialen';
import { samenvoegen } from './mesh';

/** Gemiddelde kleur van getextureerde materialen (op afstand zie je de textuur toch niet). */
const GEMIDDELD: Record<string, [number, number, number]> = {
  beton: [0.62, 0.61, 0.58], band: [0.72, 0.71, 0.68], plint: [0.24, 0.17, 0.13], hout: [0.45, 0.32, 0.2], schutting: [0.33, 0.32, 0.25],
  haag: [0.16, 0.28, 0.1], schors: [0.25, 0.19, 0.14], keet: [0.2, 0.32, 0.5], grind: [0.55, 0.53, 0.5], klinkers: [0.42, 0.25, 0.2],
  roldeur: [0.55, 0.57, 0.6], zandberg: [0.72, 0.6, 0.42], afval: [0.4, 0.38, 0.33], silo: [0.85, 0.85, 0.83], tank: [0.86, 0.86, 0.84],
};

/** Materialen die op afstand hun eigen textuur houden (gevels, daken, grond, wegdek). */
const HOUDT = (m: string) => /^(gevel|muur|golfplaat|winkelpui|luifel|gewas|blad|deur)/.test(m) || ['dakpannen', 'dakpannenAntraciet', 'dakgrind', 'golfdak', 'tuin', 'gras', 'stoeptegels', 'erfverharding', 'asfalt', 'fietsasfalt', 'busbaan', 'zonnepaneel', 'markering', 'water', 'sloot', 'plas', 'steiger', 'hekwerk'].includes(m) || materiaal(m).alfa !== undefined || !!materiaal(m).emissie;

import { GEVELSTIJLEN } from './gebouwmesh';

/**
 * Getextureerde materialen die op afstand uit één textuurreeks (texture array) komen. Zo tekent een
 * heel blok van 512 m met gevels, daken, grond en wegdek in een paar tekenopdrachten.
 */
let _atlas: string[] | null = null;
/** (Lui opgebouwd: gebouwmesh en lod importeren elkaar.) */
export function atlas(): string[] { return _atlas ??= [
  ...GEVELSTIJLEN.map(s => `gevel:${s}`), ...GEVELSTIJLEN.map(s => `muur:${s}`), 'plint',
  'golfplaat:0', 'golfplaat:1', 'golfplaat:2', 'golfplaat:3', 'golfdak', 'dakpannen', 'dakpannenAntraciet', 'dakgrind',
  'tuin', 'gras', 'stoeptegels', 'erfverharding', 'klinkers', 'asfalt', 'fietsasfalt', 'busbaan',
  'winkelpui:0', 'winkelpui:1', 'winkelpui:2', 'winkelpui:3', 'luifel:0', 'luifel:1', 'luifel:2', 'luifel:3', 'beton', 'hout', 'schutting', 'haag', 'grind',
]; }
let _index: Map<string, number> | null = null;
const atlasIndex = () => _index ??= new Map(atlas().map((k, i) => [k, i]));

/**
 * Versie voor op afstand: alle kleine, effen materialen (metaal, randen, hout, beton, …) worden één
 * groep 'kleurVer' met de kleur per hoekpunt. Scheelt per vak tientallen tekenopdrachten.
 */
export function vereenvoudig(data: MeshData): MeshData {
  const houd: MeshGroep[] = [], kleur: MeshGroep[] = [], inAtlas: MeshGroep[] = [];
  for (const g of data.groepen) {
    const ai = atlasIndex().get(g.materiaal);
    if (ai !== undefined) {
      // UV's naar de textuurruimte (1 = één herhaling), laag per hoekpunt.
      const m = materiaal(g.materiaal).meter, f = m > 0 ? 1 / m : 1;
      const uvs = f === 1 ? g.uvs : g.uvs.map(x => x * f);
      inAtlas.push({ ...g, materiaal: 'atlasVer', uvs, lagen: new Float32Array(g.posities.length / 3).fill(ai) });
      continue;
    }
    if (HOUDT(g.materiaal)) { houd.push(g); continue; }
    kleur.push(alsKleur(g));
  }
  return samenvoegen([{ groepen: houd }, { groepen: kleur }, { groepen: inAtlas }]);
}

/** Groep omzetten naar 'kleurVer': kleur, ruwheid en metaal per hoekpunt. */
function alsKleur(g: MeshGroep): MeshGroep {
  const d = materiaal(g.materiaal);
  const c = GEMIDDELD[g.materiaal] ?? d.kleur;
  const n = g.posities.length / 3, k = new Float32Array(n * 3), rm = new Float32Array(n * 2);
  const ruw = d.tex ? 0.85 : d.ruwheid, met = d.tex ? 0 : d.metaal;
  for (let i = 0; i < n; i++) { k[i * 3] = c[0]; k[i * 3 + 1] = c[1]; k[i * 3 + 2] = c[2]; rm[i * 2] = ruw; rm[i * 2 + 1] = met; }
  return { ...g, materiaal: 'kleurVer', kleuren: k, rm };
}

/** Materialen die dichtbij samen kunnen: effen, zonder textuur, alfa, gloed of bijzondere instellingen. */
const EFFEN = (m: string) => {
  if (m === 'autolak' || m === 'kleurVer') return false;
  const d = materiaal(m);
  return !d.tex && d.alfa === undefined && !d.emissie && !d.dubbelzijdig && !d.bovenop && !d.instantieTint && d.schaduw !== false && !m.startsWith('deur');
};

/** Dichtbij: alle effen materialen in één groep (zelfde uiterlijk, veel minder tekenopdrachten). */
export function effenSamen(data: MeshData): MeshData {
  const houd: MeshGroep[] = [], kleur: MeshGroep[] = [];
  for (const g of data.groepen) (EFFEN(g.materiaal) ? kleur.push(alsKleur(g)) : houd.push(g));
  return kleur.length ? samenvoegen([{ groepen: houd }, { groepen: kleur }]) : data;
}
