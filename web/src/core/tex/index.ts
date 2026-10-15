import { TexData, K } from './doek';
import * as G from './generatoren';

/** Alle textuursleutels en hun generator. De render-laag (of een worker) roept `maakTextuur` aan. */
export function maakTextuur(sleutel: string): TexData {
  const [naam, arg] = sleutel.split(':');
  switch (naam) {
    case 'gras': return G.gras(false);
    case 'weide': return G.gras(true);
    case 'tuin': return G.gras(false, true);
    case 'bosgrond': return G.bosgrond();
    case 'zand': return G.zand();
    case 'asfalt': return G.asfalt('grijs');
    case 'fietsasfalt': return G.asfalt('rood');
    case 'busbaan': return G.asfalt('bus');
    case 'klinkers': return G.klinkers();
    case 'stoeptegels': return G.tegels(false);
    case 'erfverharding': return G.tegels(true);
    case 'beton': return G.beton();
    case 'band': return G.beton(K(0.74, 0.73, 0.70));
    case 'gevel': return G.gevel(arg, true);
    case 'muur': return G.gevel(arg, false);
    case 'plint': return G.gevel('plint', false);
    case 'golfplaat': return G.golfplaat(([K(0.78, 0.79, 0.80), K(0.33, 0.45, 0.58), K(0.42, 0.52, 0.40), K(0.62, 0.58, 0.52)])[Number(arg) % 4]);
    case 'golfdak': return G.golfplaat(K(0.55, 0.56, 0.58), true);
    case 'roldeur': return G.roldeur();
    case 'winkelpui': return G.winkelpui(Number(arg));
    case 'luifel': return G.luifel(Number(arg));
    case 'dakpannen': return G.dakpannen(false);
    case 'dakpannenAntraciet': return G.dakpannen(true);
    case 'dakgrind': return G.dakgrind();
    case 'haag': return G.haag();
    case 'hout': return G.hout();
    case 'schutting': return G.schutting();
    case 'keet': return G.keet();
    case 'steiger': return G.steiger();
    case 'hekwerk': return G.hekwerk();
    case 'schors': return G.schors(false);
    case 'schorsBerk': return G.schors(true);
    case 'blad': return G.bladkaart(arg);
    case 'bladkern': return G.bladkern(arg);
    case 'water': return G.waterNormaal();
    case 'gewas': return G.akker(arg);
    case 'sloot': return G.sloot();
    case 'grind': return G.grind();
    default: throw new Error(`Onbekende textuur: ${sleutel}`);
  }
}
