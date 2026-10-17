import { Gereedschap, Modus, Stijl, VerkeerTool } from '../core/gereedschap';
import type { Verbod } from '../core/verkeer/regels';

const ZONE_TOOL_ICOON: Record<'vullen' | 'selectie' | 'penseel' | 'groot', string> = {
  vullen: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 11l7-7 7 7-7 7z" fill="#74c0fc"/><path d="M19 14c1.5 2 1.5 3.5 0 4s-1.5-2 0-4z" fill="#74c0fc"/></svg>',
  selectie: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="4" y="6" width="16" height="12" fill="none" stroke="#e9ecef" stroke-width="2" stroke-dasharray="3 2"/></svg>',
  penseel: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4" fill="none" stroke="#e9ecef" stroke-width="2"/></svg>',
  groot: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8" fill="none" stroke="#e9ecef" stroke-width="2"/></svg>',
};
const WEG_STIJL_ICOON: Record<Stijl | 'op', string> = {
  recht: '<svg viewBox="0 0 24 24" class="si"><path d="M4 19 20 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="4" cy="19" r="2.4" fill="currentColor"/><circle cx="20" cy="5" r="2.4" fill="currentColor"/></svg>',
  bocht: '<svg viewBox="0 0 24 24" class="si"><path d="M4 20C4 9 9 4 20 4" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="4" cy="20" r="2.4" fill="currentColor"/><circle cx="20" cy="4" r="2.4" fill="currentColor"/><circle cx="4" cy="4" r="1.6" fill="none" stroke="currentColor"/></svg>',
  vrij: '<svg viewBox="0 0 24 24" class="si"><path d="M3 18c4 0 4-10 9-10s5 8 9 6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  raster: '<svg viewBox="0 0 24 24" class="si"><path d="M4 4h16v16H4zM4 12h16M12 4v16" stroke="currentColor" stroke-width="2.4" fill="none"/></svg>',
  op: '<svg viewBox="0 0 24 24" class="si"><path d="M12 4 5 12h4v8h6v-8h4z" fill="currentColor"/></svg>',
};
import { WEGTYPEN, WEGTYPE_VOLGORDE, WegTypeId, strookGrenzen, totaleBreedte } from '../core/wegen/typen';
import { ZONES, Zone } from '../core/zones';
import { ICOON } from './iconen';
import { GRONDSTOFFEN, Grondstof } from '../core/economie';
import { DIENSTEN, DienstSoort, NUT_EENHEID, NUT_NAAM, Nut, Voorzieningen } from '../core/voorzieningen';
import { Districten, Hoogtegrens, BELEID_KOSTEN } from '../core/districten';
import { BOUWSTIJLEN, DistrictStijl } from '../core/stijlen';

const STIJL_KEUZE: { id: DistrictStijl; naam: string; uitleg: string }[] = [
  { id: 'gemengd', naam: 'Gemengd', uitleg: 'De ontwikkelaar kiest; hogere niveaus worden vaker nieuwbouw.' },
  ...(['stadshart', 'klassiek', 'gracht', 'naoorlogs', 'jaren70', 'nieuwbouw'] as const).map(id => ({ id, naam: BOUWSTIJLEN[id].naam, uitleg: BOUWSTIJLEN[id].uitleg })),
];

/** Klein plaatje per bouwstijl (silhouet). */
const STIJL_ICOON: Record<DistrictStijl, string> = {
  stadshart: '<svg viewBox="0 0 86 46"><path d="M8 40V18h22v22zM32 40V14h22v26zM56 40V18h22v22z" fill="#e3d6bd"/><path d="M6 18l4-6h18l4 6zM30 14l4-6h18l4 6zM54 18l4-6h18l4 6z" fill="#8a96a3"/><path d="M14 24h4v4h-4zM22 24h4v4h-4zM38 20h4v4h-4zM46 20h4v4h-4zM62 24h4v4h-4zM70 24h4v4h-4z" fill="#3b4b5c"/><path d="M8 30h22M32 28h22M56 30h22" stroke="#222" stroke-width="1.4"/><circle cx="43" cy="7" r="4" fill="#5fa58c"/></svg>',
  gemengd: '<svg viewBox="0 0 86 46"><path d="M12 40V24l8-6 8 6v16zM32 40V12h14v28zM50 40V20h12v20zM66 40V28l6-5 6 5v12z" fill="#adb5bd"/></svg>',
  klassiek: '<svg viewBox="0 0 86 46"><path d="M10 40V24l12-10 12 10v16zM34 40V24l12-10 12 10v16zM58 40V24l12-10 12 10v16z" fill="#c2553a"/><path d="M10 24l12-10 12 10M34 24l12-10 12 10M58 24l12-10 12 10" stroke="#7a2e1f" stroke-width="2" fill="none"/></svg>',
  gracht: '<svg viewBox="0 0 86 46"><path d="M10 40V14h3v-3h3v-3h4v3h3v3h3v26zM28 40V16l3-4V6h6v6l3 4v24zM44 40V18c0-4 3-4 3-8s3-4 4-4 4 0 4 4 3 4 3 8v22zM62 40V12h16v28z" fill="#8a3b28"/><path d="M28 40V16l3-4V6h6v6l3 4v24z" fill="#e9ecef"/></svg>',
  naoorlogs: '<svg viewBox="0 0 86 46"><rect x="8" y="16" width="70" height="24" fill="#e0c98a"/><path d="M8 22h70M8 28h70M8 34h70" stroke="#5c7cfa" stroke-width="2"/><rect x="40" y="16" width="6" height="24" fill="#adb5bd"/></svg>',
  jaren70: '<svg viewBox="0 0 86 46"><path d="M8 40l14-22 10 14v8zM30 40l14-22 12 16v6zM54 40l14-22 12 18v4z" fill="#5c3d2e"/><rect x="18" y="34" width="6" height="6" fill="#e8590c"/><rect x="42" y="34" width="6" height="6" fill="#e8590c"/><rect x="66" y="34" width="6" height="6" fill="#e8590c"/></svg>',
  nieuwbouw: '<svg viewBox="0 0 86 46"><path d="M10 40V20l10-8 10 8v20z" fill="#343a40"/><path d="M34 40V10h20v30z" fill="#f1f3f5"/><path d="M58 40V18h18v22z" fill="#a0784a"/><path d="M36 18h16M36 26h16M36 34h16" stroke="#74c0fc" stroke-width="2"/></svg>',
};

const DIENST_ICOON: Record<DienstSoort, string> = {
  windmolen: '<svg viewBox="0 0 86 46"><path d="M43 44V14" stroke="#e9ecef" stroke-width="2.6"/><circle cx="43" cy="13" r="2.4" fill="#e9ecef"/><path d="M43 13 41 1h3zM43 13l11 6-2 2zM43 13l-11 6 1 2z" fill="#e9ecef"/></svg>',
  zonnepark: '<svg viewBox="0 0 86 46"><path d="M10 34l8-12h22l-8 12zM46 34l8-12h22l-8 12z" fill="#3b5bdb"/><path d="M18 22l-8 12M30 22l-8 12M54 22l-8 12M66 22l-8 12" stroke="#91a7ff" stroke-width="1"/><circle cx="70" cy="9" r="5" fill="#fcc419"/></svg>',
  gascentrale: '<svg viewBox="0 0 86 46"><rect x="14" y="22" width="40" height="20" fill="#868e96"/><rect x="58" y="6" width="6" height="36" fill="#adb5bd"/><rect x="68" y="10" width="6" height="32" fill="#adb5bd"/><path d="M61 4c-3-3 2-4 0-6" stroke="#ced4da" stroke-width="2" fill="none"/></svg>',
  pompstation: '<svg viewBox="0 0 86 46"><rect x="14" y="20" width="22" height="20" fill="#c2553a"/><path d="M12 20l13-8 13 8z" fill="#495057"/><ellipse cx="60" cy="34" rx="14" ry="6" fill="#adb5bd"/><path d="M60 8c6 8 8 11 8 14a8 8 0 0 1-16 0c0-3 2-6 8-14z" fill="#4dabf7"/></svg>',
  rwzi: '<svg viewBox="0 0 86 46"><ellipse cx="28" cy="28" rx="18" ry="9" fill="#adb5bd"/><ellipse cx="28" cy="27" rx="14" ry="6.5" fill="#5c7a54"/><rect x="50" y="20" width="26" height="16" fill="#adb5bd"/><rect x="53" y="23" width="20" height="10" fill="#5c7a54"/></svg>',
  stortplaats: '<svg viewBox="0 0 86 46"><path d="M8 40l16-22h30l18 22z" fill="#8a7a63"/><rect x="32" y="12" width="10" height="7" fill="#fcc419"/></svg>',
  afvalcentrale: '<svg viewBox="0 0 86 46"><rect x="12" y="18" width="40" height="24" fill="#495057"/><rect x="58" y="4" width="7" height="38" fill="#e9ecef"/><rect x="14" y="30" width="14" height="10" fill="#868e96"/></svg>',
  brandweer: '<svg viewBox="0 0 86 46"><rect x="10" y="16" width="46" height="26" fill="#b5462e"/><rect x="58" y="4" width="10" height="38" fill="#a33d28"/><rect x="14" y="26" width="10" height="16" fill="#e03131"/><rect x="28" y="26" width="10" height="16" fill="#e03131"/><rect x="42" y="26" width="10" height="16" fill="#e03131"/></svg>',
  politie: '<svg viewBox="0 0 86 46"><rect x="18" y="10" width="50" height="32" fill="#343a40"/><rect x="18" y="8" width="50" height="5" fill="#1c3f94"/><rect x="38" y="30" width="10" height="12" fill="#74c0fc"/><path d="M43 16l5 3v4c0 4-3 6-5 7-2-1-5-3-5-7v-4z" fill="#ffd43b"/></svg>',
  ziekenhuis: '<svg viewBox="0 0 86 46"><rect x="10" y="12" width="44" height="30" fill="#dee2e6"/><rect x="54" y="20" width="22" height="22" fill="#a5d8ff"/><rect x="27" y="17" width="10" height="20" fill="#e03131"/><rect x="22" y="22" width="20" height="10" fill="#e03131"/></svg>',
  gezondheidscentrum: '<svg viewBox="0 0 86 46"><rect x="18" y="16" width="50" height="26" fill="#e9c46a"/><rect x="38" y="22" width="10" height="16" fill="#2f9e44"/><rect x="35" y="25" width="16" height="10" fill="#2f9e44"/></svg>',
};

const GROEPEN: { id: import('../core/voorzieningen').DienstGroep; naam: string }[] = [
  { id: 'stroom', naam: 'Stroom' }, { id: 'water', naam: 'Water' }, { id: 'afval', naam: 'Afval' }, { id: 'veiligheid', naam: 'Brandweer & politie' }, { id: 'zorg', naam: 'Zorg' },
];

const GRONDSTOF_ICOON: Record<Grondstof, string> = {
  landbouw: '<svg viewBox="0 0 86 46"><path d="M14 34h58" stroke="#8a6b3c" stroke-width="3"/><path d="M20 34c0-8 3-14 6-18M30 34c0-9 2-15 5-20M40 34c0-8 3-15 6-19M50 34c0-9 2-15 5-20M60 34c0-8 3-14 6-18" stroke="#c0d36b" stroke-width="2.4" fill="none"/><circle cx="26" cy="15" r="2.6" fill="#e9c46a"/><circle cx="35" cy="13" r="2.6" fill="#e9c46a"/><circle cx="46" cy="14" r="2.6" fill="#e9c46a"/><circle cx="55" cy="13" r="2.6" fill="#e9c46a"/><circle cx="66" cy="15" r="2.6" fill="#e9c46a"/></svg>',
  bosbouw: '<svg viewBox="0 0 86 46"><path d="M30 6 18 30h24zM56 10 45 32h22z" fill="#2f9e44"/><path d="M30 30v8M56 32v6" stroke="#8a6b3c" stroke-width="3"/><rect x="62" y="34" width="16" height="4" rx="2" fill="#a0784a"/><rect x="64" y="29" width="12" height="4" rx="2" fill="#a0784a"/></svg>',
  olie: '<svg viewBox="0 0 86 46"><path d="M18 38h40M28 38l8-22 8 22" stroke="#868e96" stroke-width="2.6" fill="none"/><path d="M14 18l46-6" stroke="#ffd43b" stroke-width="4"/><path d="M60 10v10" stroke="#ffd43b" stroke-width="5"/><rect x="66" y="22" width="12" height="16" rx="3" fill="#dee2e6"/></svg>',
  delfstoffen: '<svg viewBox="0 0 86 46"><path d="M10 38l14-16 12 16z" fill="#d9a066"/><path d="M30 38l14-12 12 12z" fill="#adb5bd"/><path d="M52 38l12-18 14 18z" fill="#d9a066"/><path d="M8 38h72" stroke="#6c757d" stroke-width="2"/></svg>',
};

const DIENST_VOLGORDE: DienstSoort[] = ['windmolen', 'zonnepark', 'gascentrale', 'pompstation', 'rwzi', 'stortplaats', 'afvalcentrale', 'brandweer', 'politie', 'ziekenhuis', 'gezondheidscentrum'];

const STROOKKLEUR: Record<string, string> = { stoep: '#9aa0a6', fiets: '#a8473b', auto: '#3b3f45', gedeeld: '#7b4a3a', bus: '#7a3f35', tram: '#55575c', berm: '#5f8d3e', middenberm: '#5f8d3e', vluchtstrook: '#4a4e55', parkeer: '#6d6a66' };

function dwarsprofiel(type: WegTypeId): string {
  const t = WEGTYPEN[type], W = totaleBreedte(t.stroken), schaal = 80 / Math.max(W, 12);
  const x0 = 43 - (W * schaal) / 2;
  const rects = strookGrenzen(t.stroken).map(g => {
    const h = g.s.soort === 'stoep' ? 10 : g.s.soort === 'berm' || g.s.soort === 'middenberm' ? 9 : 7;
    const kleur = g.s.soort === 'auto' && t.dek === 'klinkers' ? '#7b4a3a' : STROOKKLEUR[g.s.soort];
    return `<rect x="${x0 + g.a * schaal + W * schaal / 2}" y="${36 - h}" width="${Math.max(1, g.s.breedte * schaal - 0.6)}" height="${h}" rx="1" fill="${kleur}"/>` +
      (g.s.soort === 'berm' || g.s.soort === 'middenberm' ? `<circle cx="${x0 + (g.a + g.b) / 2 * schaal + W * schaal / 2}" cy="20" r="${Math.min(6, g.s.breedte * schaal)}" fill="#3f7d34"/>` : '');
  }).join('');
  return `<svg viewBox="0 0 86 46">${rects}<text x="43" y="44" text-anchor="middle" font-size="7" fill="#9aa7b8">${W.toFixed(1)} m</text></svg>`;
}

function zoneIcoon(z: Zone, kleur: string): string {
  const huis: Record<string, string> = {
    wonenLaag: '<path d="M18 34 V22 L28 14 L38 22 V34 Z M42 34 V22 L52 14 L62 22 V34 Z"/>',
    wonenHoog: '<rect x="28" y="6" width="30" height="30" rx="2"/>',
    gemengd: '<rect x="22" y="10" width="42" height="26" rx="2"/><rect x="22" y="27" width="42" height="9" fill="#fff" opacity=".35"/>',
    kantoor: '<rect x="34" y="2" width="18" height="34" rx="1"/><rect x="22" y="14" width="12" height="22" rx="1"/>',
    industrie: '<path d="M14 36 V20 L28 26 V20 L42 26 V20 L56 26 V12 H64 V36 Z"/>',
    geen: '<path d="M30 12 L56 34 M56 12 L30 34" stroke-width="5" stroke="currentColor"/>',
  };
  return `<svg viewBox="0 0 86 46" style="color:${kleur}" fill="${kleur}">${huis[z]}</svg>`;
}

/** Werkbalk onderaan, in de stijl van Cities: Skylines: tabs met per tab de opties. */
export class Werkbalk {
  private el = document.getElementById('werkbalk')!;

  /** Wordt aangeroepen om het economiepaneel te openen. */
  opEconomie: () => void = () => {};

  constructor(private g: Gereedschap, private opZoneModus: (aan: boolean) => void, private v: Voorzieningen) {
    this.el.className = 'paneel';
    addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      // Verplaatsen (Move It) gaat voor: pijltjes, Q/E, PgUp/PgDn, Delete, Ctrl+C/V/Z/Y.
      if (this.g.verplaatsToets(k, e.shiftKey, e.ctrlKey || e.metaKey)) { e.preventDefault(); this.teken(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'escape') { if (!this.g.terug()) this.kies('kijk'); }
      if (k === 'z') this.kies('zone');
      if (k === 'k') this.kies('district');
      if (k === 'g') this.kies('gebied');
      if (k === 'n') this.kies('dienst');
      if (k === 'x') this.kies('weg');
      if (k === 'u') this.kies('opwaarderen');
      if (k === 'b') this.kies('sloop');
      if (k === 't') this.kies('verkeer');
      if (k === 'm') this.kies('verplaats');
      if (k === 'c' && this.g.modus === 'weg') { const v: Stijl[] = ['recht', 'bocht', 'vrij', 'raster']; this.g.stijl = v[(v.indexOf(this.g.stijl) + 1) % 4]; this.g.annuleer(); this.teken(); }
      if ((e.key === 'PageUp' || e.key === 'PageDown') && this.g.modus === 'weg') { e.preventDefault(); this.g.hoger(e.key === 'PageUp' ? 1 : -1); this.teken(); }
      if (k === 'p' && this.g.modus === 'weg') this.wisselParallel();
      if (k === 'h' && this.g.modus === 'weg') { this.g.hulplijnen = !this.g.hulplijnen; this.teken(); }
      if (/^[1-9]$/.test(k)) {
        const i = Number(k) - 1;
        if (this.g.modus === 'zone' && ZONES[i]) { this.g.zone = ZONES[i].id; this.teken(); }
        else if (this.g.modus === 'dienst' && this.inGroep()[i]) { this.g.dienst = this.inGroep()[i]; this.teken(); }
        else if (this.g.modus === 'gebied' && i < 4) { this.g.grondstof = (Object.keys(GRONDSTOFFEN) as Grondstof[])[i]; this.teken(); }
        else if ((this.g.modus === 'weg' || this.g.modus === 'opwaarderen') && WEGTYPE_VOLGORDE[i]) { this.g.wegtype = WEGTYPE_VOLGORDE[i]; this.teken(); }
      }
      if ((k === '+' || k === '=') && (this.g.modus === 'zone' || this.g.modus === 'district')) { this.g.penseel = Math.min(80, this.g.penseel + 4); this.teken(); }
      if (k === '-' && (this.g.modus === 'zone' || this.g.modus === 'district')) { this.g.penseel = Math.max(6, this.g.penseel - 4); this.teken(); }
    });
    this.teken();
  }

  /** Parallel: uit → 2×30 m bouwblok → 2×50 m → uit (plus de breedte van de weg). */
  private wisselParallel() {
    const W = Math.round(totaleBreedte(WEGTYPEN[this.g.wegtype].stroken));
    const v = [0, 60 + W, 100 + W];
    const i = v.findIndex(x => x === this.g.parallel);
    this.g.parallel = v[(i + 1) % v.length];
    this.teken();
  }

  /** Verkeersregels en verkeer wissen (gezet door main.ts). */
  regels: () => import('../core/verkeer/regels').Verkeersregels | null = () => null;
  opVerkeerWissen: () => number = () => 0;

  /** Tabblad Verkeer: het verkeersgereedschap zoals TM:PE. */
  private verkeerTab(): { items: string; opties: string } {
    const g = this.g, R = this.regels();
    const tools: { id: VerkeerTool; naam: string; sub: string; svg: string }[] = [
      { id: 'voorrang', naam: 'Voorrangsborden', sub: 'per wegeinde', svg: '<svg viewBox="0 0 86 46"><path d="M24 8 38 22 24 36 10 22z" fill="#fff"/><path d="M24 12.5 33.5 22 24 31.5 14.5 22z" fill="#f2c200"/><path d="M46 10h28L60 36z" fill="#d6262c"/><path d="M51.5 13.4h17L60 29z" fill="#fff"/></svg>' },
      { id: 'hoofdweg', naam: 'Voorrangsweg', sub: 'hele weg in één klik', svg: '<svg viewBox="0 0 86 46"><path d="M6 23h74" stroke="#f2c200" stroke-width="7"/><path d="M30 6v12M56 28v12" stroke="#adb5bd" stroke-width="5"/><path d="M43 14 50 21 43 28 36 21z" fill="#fff" stroke="#f2c200" stroke-width="2"/></svg>' },
      { id: 'lichten', naam: 'Verkeerslichten', sub: 'aan/uit, groentijd', svg: '<svg viewBox="0 0 86 46"><rect x="36" y="4" width="14" height="36" rx="4" fill="#1f2328" stroke="#adb5bd"/><circle cx="43" cy="12" r="4" fill="#ff4d4f"/><circle cx="43" cy="22" r="4" fill="#ffb300"/><circle cx="43" cy="32" r="4" fill="#40c057"/></svg>' },
      { id: 'pijlen', naam: 'Rijstrookpijlen', sub: 'per rijstrook', svg: '<svg viewBox="0 0 86 46"><g fill="none" stroke="#e9ecef" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M28 40V24a6 6 0 0 0-6-6h-8M18 13l-5 5 5 5"/><path d="M43 40V8M37 14l6-6 6 6"/><path d="M58 40V24a6 6 0 0 1 6-6h8M68 13l5 5-5 5"/></g></svg>' },
      { id: 'verbinder', naam: 'Rijstrookverbinder', sub: 'strook → strook', svg: '<svg viewBox="0 0 86 46"><g fill="none" stroke-width="2.6" stroke-linecap="round"><path d="M18 38C18 20 40 14 66 10" stroke="#74c0fc"/><path d="M30 38C32 26 50 24 68 24" stroke="#ffa94d"/></g><circle cx="18" cy="38" r="4.5" fill="#74c0fc"/><circle cx="30" cy="38" r="4.5" fill="#ffa94d"/><circle cx="68" cy="10" r="4" fill="none" stroke="#e9ecef" stroke-width="2"/><circle cx="68" cy="24" r="4" fill="none" stroke="#e9ecef" stroke-width="2"/></svg>' },
      { id: 'regels', naam: 'Kruispuntregels', sub: 'keren, wisselen, …', svg: '<svg viewBox="0 0 86 46"><rect x="24" y="8" width="38" height="30" rx="4" fill="none" stroke="#e9ecef" stroke-width="2.4"/><path d="M24 23h38M43 8v30" stroke="#e9ecef" stroke-width="1.6" stroke-dasharray="3 3"/><path d="M50 33V24a5 5 0 0 0-10 0v4M36 25l4 4 4-4" fill="none" stroke="#74c0fc" stroke-width="2.6" stroke-linecap="round"/></svg>' },
      { id: 'snelheid', naam: 'Maximumsnelheid', sub: 'klik of sleep', svg: '<svg viewBox="0 0 86 46"><circle cx="43" cy="23" r="18" fill="#d6262c"/><circle cx="43" cy="23" r="14" fill="#fff"/><text x="43" y="29" text-anchor="middle" font-size="16" font-weight="800" fill="#111" font-family="Inter,sans-serif">30</text></svg>' },
      { id: 'verbod', naam: 'Verboden', sub: 'vracht, bus, parkeren', svg: '<svg viewBox="0 0 86 46"><circle cx="43" cy="23" r="18" fill="#d6262c"/><circle cx="43" cy="23" r="14" fill="#fff"/><path d="M33 17h12v11H33zM45 20h5l3 4v4h-8z" fill="#222"/><circle cx="37" cy="30" r="2" fill="#222"/><circle cx="49" cy="30" r="2" fill="#222"/></svg>' },
    ];
    const items = tools.map(t => `<div class="item ${g.verkeerTool === t.id ? 'aan' : ''}" data-vt="${t.id}">${t.svg}<div class="item-naam">${t.naam}</div><div class="item-sub">${t.sub}</div></div>`).join('');
    let opties = '';
    const hint = (t: string) => `<span class="hint">${t}</span>`;
    switch (g.verkeerTool) {
      case 'voorrang': opties = hint('Klik op een bord: geen → voorrangsweg → voorrang verlenen → stop · rechts = weg'); break;
      case 'hoofdweg': opties = `<div class="groep"><span>Zijwegen</span><button class="knop ${g.zijBord === 'geef' ? 'aan' : ''}" data-zb="geef">Voorrang verlenen</button><button class="knop ${g.zijBord === 'stop' ? 'aan' : ''}" data-zb="stop">Stop</button></div>` + hint('Klik op een weg: de hele doorgaande weg krijgt voorrang'); break;
      case 'lichten': opties = hint('Klik op een kruispunt: lichten plaatsen of weghalen · ✎ = fasen per richting · rechts = automatisch'); break;
      case 'verbinder': opties = hint('Klik een aankomende strook (gekleurde stip), dan de doelstroken (ringen) · rechts op een stip = standaard'); break;
      case 'pijlen': opties = hint('Zet per rijstrook de richtingen aan of uit · ↺ = standaard'); break;
      case 'regels': opties = hint('Per wegeinde: keren, strook wisselen, kruispunt opblokken, oversteekplaats, rechtsaf door rood'); break;
      case 'snelheid': opties = `<div class="groep">${[30, 50, 60, 70, 80, 100, 120, 130].map(v => `<button class="knop ${g.snelheidKeuze === v ? 'aan' : ''}" data-kmu="${v}">${v}</button>`).join('')}<button class="knop ${g.snelheidKeuze === undefined ? 'aan' : ''}" data-kmu="">Standaard</button></div>` + hint('Klik of sleep over wegen · rechts = standaard'); break;
      case 'verbod': opties = `<div class="groep">${(['auto', 'vracht', 'bus', 'parkeren'] as Verbod[]).map(v => `<button class="knop ${g.verbodKeuze === v ? 'aan' : ''}" data-vb="${v}">${({ auto: "Auto's", vracht: 'Vrachtverkeer', bus: 'Bussen', parkeren: 'Parkeren' } as const)[v]}</button>`).join('')}</div>` + hint('Klik of sleep: verbod aan/uit · rechts = alles toestaan'); break;
    }
    opties += `<div class="groep"><button class="knop" data-wis title="Alle voertuigen van de weg halen (hulpdiensten blijven rijden)">Verkeer wissen</button><button class="knop schakel ${R?.verdwijnen ? 'aan' : ''}" data-verdw title="Voertuigen die lang vaststaan verdwijnen (zoals in CS)">Vastgelopen verdwijnen</button></div>`;
    return { items, opties };
  }

  /** Tabblad Verplaatsen (zoals Move It): bewerkingen, filters, ongedaan maken. */
  private verplaatsTab(): { items: string; opties: string } {
    const g = this.g, m = g.verplaatser, leeg = m.leeg;
    const ic = (d: string) => `<svg viewBox="0 0 86 46"><g fill="none" stroke="#e9ecef" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`;
    const acties: { id: string; naam: string; sub: string; svg: string; uit?: boolean }[] = [
      { id: 'draaiL', naam: 'Draai links', sub: 'Q · Shift = 1°', svg: ic('<path d="M34 12a13 13 0 1 1-6 16"/><path d="M36 4l-3 8 8 2"/>'), uit: leeg },
      { id: 'draaiR', naam: 'Draai rechts', sub: 'E · Shift = 1°', svg: ic('<path d="M52 12a13 13 0 1 0 6 16"/><path d="M50 4l3 8-8 2"/>'), uit: leeg },
      { id: 'hoger', naam: 'Hoger', sub: 'PgUp · 1 m', svg: ic('<path d="M43 36V10M33 20l10-10 10 10"/><path d="M28 40h30"/>'), uit: leeg },
      { id: 'lager', naam: 'Lager', sub: 'PgDn · 1 m', svg: ic('<path d="M43 8v26M33 24l10 10 10-10"/><path d="M28 40h30"/>'), uit: leeg },
      { id: 'uitlijnen', naam: 'Hoogte gelijk', sub: 'zelfde hoogte', svg: ic('<path d="M16 22h54"/><circle cx="24" cy="22" r="4"/><circle cx="43" cy="22" r="4"/><circle cx="62" cy="22" r="4"/>'), uit: leeg },
      { id: 'recht', naam: 'Rechttrekken', sub: 'wegen recht', svg: ic('<path d="M14 34C30 6 56 6 72 34" stroke-dasharray="4 4" stroke="#868e96"/><path d="M14 34h58"/>'), uit: leeg },
      { id: 'kopieer', naam: 'Kopiëren', sub: 'Ctrl+C', svg: ic('<rect x="26" y="12" width="22" height="26" rx="3"/><path d="M36 8h20a3 3 0 0 1 3 3v21"/>'), uit: leeg },
      { id: 'plak', naam: 'Plakken', sub: 'Ctrl+V', svg: ic('<rect x="28" y="10" width="30" height="30" rx="3"/><path d="M36 10V6h14v4M35 22h16M35 30h12"/>'), uit: !m.heeftKlembord },
      { id: 'weg', naam: 'Verwijderen', sub: 'Delete', svg: ic('<path d="M30 14h26M38 14v-4h10v4M32 14l2 24h18l2-24"/>').replace('#e9ecef', '#ff8787'), uit: leeg },
    ];
    const items = acties.map(a => `<div class="item ${a.uit ? 'uit' : ''} ${a.id === 'plak' && g.plakModus ? 'aan' : ''}" data-mv="${a.id}">${a.svg}<div class="item-naam">${a.naam}</div><div class="item-sub">${a.sub}</div></div>`).join('');
    const f = m.filter;
    const fk = (k: keyof typeof f, naam: string) => `<button class="knop schakel ${f[k] ? 'aan' : ''}" data-mf="${k}">${naam}</button>`;
    const n = m.aantal;
    const opties = `<div class="groep"><span>Kiezen</span>${fk('seg', 'Wegen')}${fk('knoop', 'Knopen')}${fk('gebouw', 'Gebouwen')}${fk('dienst', 'Voorzieningen')}${fk('boom', 'Bomen')}</div>`
      + `<div class="groep"><button class="knop schakel ${g.shiftVast ? 'aan' : ''}" data-mshift title="Elke klik voegt toe of haalt weg (zoals Shift)">Meerdere</button>`
      + `<button class="knop" data-mleeg ${n ? '' : 'disabled'}>${n ? `${n} gekozen · wissen` : 'Niets gekozen'}</button></div>`
      + `<div class="groep"><button class="knop" data-mterug ${m.kanTerug ? '' : 'disabled'} title="Ctrl+Z${m.kanTerug ? ': ' + m.naamTerug() : ''}">↶ Ongedaan</button><button class="knop" data-mopnieuw ${m.kanOpnieuw ? '' : 'disabled'} title="Ctrl+Y${m.kanOpnieuw ? ': ' + m.naamOpnieuw() : ''}">↷ Opnieuw</button></div>`;
    return { items, opties };
  }

  private verplaatsKnoppen() {
    const g = this.g, m = g.verplaatser;
    const graad = Math.PI / 180;
    const doe: Record<string, () => void> = {
      draaiL: () => m.draai(-15 * graad), draaiR: () => m.draai(15 * graad), hoger: () => m.hoogte(1), lager: () => m.hoogte(-1),
      uitlijnen: () => { if (!m.hoogteUitlijnen()) g.melding = 'Kies minstens twee knopen of wegen'; },
      recht: () => { if (!m.rechttrekken()) g.melding = 'Kies een weg (of twee knopen ertussen)'; },
      kopieer: () => { if (m.kopieer()) g.melding = 'Gekopieerd · klik op Plakken of Ctrl+V'; },
      plak: () => { if (m.heeftKlembord) { g.plakModus = !g.plakModus; g.plakHoek = 0; } },
      weg: () => m.verwijder(),
    };
    this.el.querySelectorAll<HTMLElement>('[data-mv]').forEach(e => (e.onclick = () => { if (e.classList.contains('uit')) return; doe[e.dataset.mv!]?.(); this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-mf]').forEach(e => (e.onclick = () => { const k = e.dataset.mf as keyof typeof m.filter; m.filter[k] = !m.filter[k]; this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-mshift]')?.addEventListener('click', () => { g.shiftVast = !g.shiftVast; this.teken(); });
    this.el.querySelector<HTMLElement>('[data-mleeg]')?.addEventListener('click', () => { m.leegmaken(); this.teken(); });
    this.el.querySelector<HTMLElement>('[data-mterug]')?.addEventListener('click', () => { const n = m.terug(); if (n) g.melding = `Ongedaan: ${n.toLowerCase()}`; this.teken(); });
    this.el.querySelector<HTMLElement>('[data-mopnieuw]')?.addEventListener('click', () => { const n = m.opnieuw(); if (n) g.melding = `Opnieuw: ${n.toLowerCase()}`; this.teken(); });
  }

  /** Districten van de wereld (gezet door main.ts). */
  districten: Districten | null = null;
  /** Wordt aangeroepen als de districtsmodus aan of uit gaat (voor de kaartlaag). */
  opDistrictModus: (aan: boolean) => void = () => {};

  kies(m: Modus) { this.g.zetModus(m); this.opZoneModus(m === 'zone'); this.opDistrictModus(m === 'district'); this.opModus(m); this.teken(); }
  /** Wordt aangeroepen bij elke modus-wissel (verkeerslaag, verplaatsen). */
  opModus: (m: Modus) => void = () => {};

  /** Tabblad Districten: lijst, en voor het gekozen district naam, stijl en regels. */
  private districtTab(): { items: string; opties: string } {
    const g = this.g, ds = this.districten;
    if (!ds) return { items: '', opties: '' };
    const lijst = [...ds.lijst.values()];
    const items = lijst.map(d => `<div class="item ${!g.gum && g.district === d.id ? 'aan' : ''}" data-dist="${d.id}">${STIJL_ICOON[d.stijl]}<div class="item-naam"><span class="dist-kleur" style="background:${d.kleur}"></span>${esc(d.naam)}</div><div class="item-sub">${STIJL_KEUZE.find(x => x.id === d.stijl)!.naam}</div></div>`).join('')
      + `<div class="item" data-dist-nieuw><svg viewBox="0 0 86 46"><path d="M43 12v22M32 23h22" stroke="#e9ecef" stroke-width="4" stroke-linecap="round"/></svg><div class="item-naam">Nieuw district</div><div class="item-sub">daarna schilderen</div></div>`
      + `<div class="item ${g.gum ? 'aan' : ''}" data-dist-gum><svg viewBox="0 0 86 46"><path d="M28 34l18-20 12 10-14 14H32z" fill="#ffa8a8"/><path d="M28 34h34" stroke="#e9ecef" stroke-width="2"/></svg><div class="item-naam">Gum</div><div class="item-sub">district weghalen</div></div>`;
    const d = g.gum ? null : ds.lijst.get(g.district);
    let opties = `<span>Penseel</span><button class="knop" data-p="-4">−</button><span style="color:#e9eef5;font-weight:600">${Math.round(g.penseel * 1.5)} m</span><button class="knop" data-p="4">+</button>`;
    if (d) {
      const hg = (id: Hoogtegrens, naam: string) => `<button class="knop ${d.beleid.hoogte === id ? 'aan' : ''}" data-hg="${id}">${naam}</button>`;
      const sch = (k: 'beschermd' | 'groen' | 'zon', naam: string, tip: string) => `<button class="knop schakel ${d.beleid[k] ? 'aan' : ''}" data-bel="${k}" title="${tip}">${naam}</button>`;
      opties = `<input class="dist-naam" data-dnaam value="${esc(d.naam)}" maxlength="28" aria-label="Naam van het district">`
        + `<div class="groep">${STIJL_KEUZE.map(x => `<button class="knop ${d.stijl === x.id ? 'aan' : ''}" data-dstijl="${x.id}" title="${x.uitleg}">${x.naam}</button>`).join('')}</div>`
        + `<div class="groep"><span>Hoogte</span>${hg('vrij', 'Vrij')}${hg('midden', 'Max 6')}${hg('laag', 'Max 3')}</div>`
        + sch('beschermd', 'Beschermd stadsgezicht', 'Panden houden hun uiterlijk, ook als ze een niveau stijgen')
        + sch('groen', 'Groene daken', `Hogere grondwaarde; € ${BELEID_KOSTEN.groen} per pand per maand`)
        + sch('zon', 'Zonnepanelen', `Een derde minder stroom van het net; € ${BELEID_KOSTEN.zon} per pand per maand`)
        + (['wonen', 'bedrijven'] as const).map(k => { const x = d.beleid.belasting?.[k] ?? 0; return `<div class="groep"><span>Belasting ${k}</span><button class="knop" data-bst="${k}" data-stap="-1" title="Lager: sneller groei">−</button><span class="waarde">${x > 0 ? '+' : ''}${x * 10}%</span><button class="knop" data-bst="${k}" data-stap="1" title="Hoger: meer inkomsten, minder groei">+</button></div>`; }).join('')
        + opties + `<button class="knop gevaar" data-dweg title="District opheffen">Opheffen</button>`;
    }
    return { items, opties };
  }

  teken() {
    const g = this.g;
    const ic: Record<Modus, string> = { weg: ICOON.weg, zone: ICOON.zone, district: ICOON.district, gebied: ICOON.fabriek, dienst: ICOON.bliksem, opwaarderen: ICOON.pijl, sloop: ICOON.sloop, kijk: ICOON.oog, verkeer: ICOON.verkeer, verplaats: ICOON.verplaats };
    const tab = (m: Modus, naam: string, toets: string) => `<button class="knop tab ${g.modus === m ? 'aan' : ''}" data-m="${m}"><span class="ic">${ic[m]}</span><span class="tab-tekst">${naam}</span><span class="toets">${toets}</span></button>`;
    let items = '', opties = '';
    if (g.modus === 'weg' || g.modus === 'opwaarderen') {
      items = WEGTYPE_VOLGORDE.map((id, i) => `<div class="item ${g.wegtype === id ? 'aan' : ''}" data-w="${id}">${dwarsprofiel(id)}<div class="item-naam">${WEGTYPEN[id].naam}</div><div class="item-sub">${i + 1} · € ${WEGTYPEN[id].kosten}/m</div></div>`).join('');
      const st = (id: Stijl, naam: string) => `<button class="knop ${g.modus === 'weg' && g.stijl === id ? 'aan' : ''}" data-st="${id}" title="${naam} (C wisselt)">${WEG_STIJL_ICOON[id]}<span class="tab-tekst">${naam}</span></button>`;
      opties = `<div class="groep">${st('recht', 'Recht')}${st('bocht', 'Bocht')}${st('vrij', 'Vrij')}${st('raster', 'Raster')}<button class="knop ${g.modus === 'opwaarderen' ? 'aan' : ''}" data-op title="Opwaarderen (U)">${WEG_STIJL_ICOON.op}<span class="tab-tekst">Opwaarderen</span></button></div>`;
      if (g.modus === 'weg') opties += `<div class="groep hoogte"><button class="knop" data-h="-1" title="Lager (PgDn)">▼</button><span class="waarde">${g.niveau === 0 ? 'maaiveld' : g.niveau > 0 ? '+' + g.niveau + ' m' : g.niveau + ' m'}</span><button class="knop" data-h="1" title="Hoger (PgUp)">▲</button></div>` +
        `<button class="knop schakel ${g.afronden ? 'aan' : ''}" data-af title="Knikken in rechte wegen automatisch afronden">Afronden</button><button class="knop schakel ${g.hulplijnen ? 'aan' : ''}" data-hl title="Hulplijnen en snappen (H)">Hulplijnen</button>` +
        `<button class="knop schakel ${g.parallel ? 'aan' : ''}" data-par title="Parallel bouwen: een tweede weg evenwijdig rechts ervan (P wisselt de afstand)">Parallel${g.parallel ? ' ' + g.parallel + ' m' : ''}</button>`;
      if (g.modus === 'opwaarderen') opties += `<span class="hint">Slepen = hele straat · rechts klikken = rijrichting omdraaien</span>`;
    } else if (g.modus === 'zone') {
      items = ZONES.map(z => `<div class="item ${g.zone === z.id ? 'aan' : ''}" data-z="${z.id}">${zoneIcoon(z.id, z.kleur)}<div class="item-naam">${z.naam}</div><div class="item-sub">${z.toets}</div></div>`).join('');
      // Gereedschap zoals in Cities: Skylines: vullen, selectie, penseel klein/groot. Rechts klikken haalt weg.
      const zt = (id: typeof g.zoneTool, naam: string, tip: string, r?: number) => `<button class="knop ${g.zoneTool === id && (r === undefined || g.penseel === r) ? 'aan' : ''}" data-zt="${id}"${r ? ` data-zr="${r}"` : ''} title="${tip}">${ZONE_TOOL_ICOON[r === 34 ? 'groot' : id]}<span class="tab-tekst">${naam}</span></button>`;
      opties = `<div class="groep">${zt('vullen', 'Vullen', 'Heel bouwblok in één klik')}${zt('selectie', 'Selectie', 'Sleep een rechthoek langs de weg')}${zt('penseel', 'Klein', 'Penseel, klein', 10)}${zt('penseel', 'Groot', 'Penseel, groot', 34)}</div>`
        + (g.zoneTool === 'penseel' ? `<div class="groep"><button class="knop" data-p="-4">−</button><span class="waarde">${g.penseel} m</span><button class="knop" data-p="4">+</button></div>` : '')
        + `<span class="hint">Rechts klikken = zone weghalen</span>`;
    } else if (g.modus === 'district') {
      ({ items, opties } = this.districtTab());
    } else if (g.modus === 'gebied') {
      items = (Object.values(GRONDSTOFFEN)).map((x, i) => `<div class="item ${g.grondstof === x.id ? 'aan' : ''}" data-gs="${x.id}">${GRONDSTOF_ICOON[x.id]}<div class="item-naam">${x.naam}</div><div class="item-sub">${i + 1} · ${x.product.toLowerCase()}</div></div>`).join('');
      opties = `<button class="knop" data-eco>Overzicht economie</button>`;
    } else if (g.modus === 'dienst') {
      items = this.inGroep().map((id, i) => { const d = DIENSTEN[id]; const lev = d.dekking ? `${(d.dekking.bereik / 1000).toLocaleString('nl-NL')} km · ${d.dekking.voertuigen} wagen${d.dekking.voertuigen > 1 ? 's' : ''}` : Object.entries(d.levert).map(([n, x]) => `${(x as number).toLocaleString('nl-NL')} ${NUT_EENHEID[n as Nut]}`).join(' + '); return `<div class="item ${g.dienst === id ? 'aan' : ''}" data-d="${id}" title="${d.uitleg}">${DIENST_ICOON[id]}<div class="item-naam">${d.naam}</div><div class="item-sub">${i + 1} · € ${(d.kosten / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln · ${lev}</div></div>`; }).join('');
      opties = `<div class="groep">${GROEPEN.map(x => `<button class="knop ${this.groep === x.id ? 'aan' : ''}" data-grp="${x.id}">${x.naam}</button>`).join('')}</div><div class="balans" data-balans></div>`;
    } else if (g.modus === 'verkeer') {
      ({ items, opties } = this.verkeerTab());
    } else if (g.modus === 'verplaats') {
      ({ items, opties } = this.verplaatsTab());
    } else if (g.modus === 'sloop') {
      items = `<div class="item-sub" style="padding:14px">Klik of sleep over wegen en gebouwen om ze te slopen. Je krijgt een kwart van de wegkosten terug.</div>`;
    } else {
      items = `<div class="item-sub" style="padding:14px">Kies een gereedschap. Camera: WASD of middelste muisknop = schuiven, rechts slepen of Q/E = draaien, R/F = kantelen, scrollen = zoomen. Spatie = pauze.</div>`;
    }
    this.el.innerHTML = `<div class="tabs">${tab('weg', 'Wegen', 'X')}${tab('zone', 'Zones', 'Z')}${tab('district', 'Districten', 'K')}${tab('gebied', 'Economie', 'G')}${tab('dienst', 'Voorzieningen', 'N')}${tab('opwaarderen', 'Opwaarderen', 'U')}${tab('sloop', 'Slopen', 'B')}${tab('verkeer', 'Verkeer', 'T')}${tab('verplaats', 'Verplaatsen', 'M')}${tab('kijk', 'Kijken', 'Esc')}</div>${opties ? `<div class="opties">${opties}</div>` : ''}<div class="items">${items}</div>`;
    this.el.querySelectorAll<HTMLElement>('[data-m]').forEach(e => (e.onclick = () => this.kies(e.dataset.m as Modus)));
    this.el.querySelector<HTMLElement>('.tab.aan')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    this.el.querySelectorAll<HTMLElement>('[data-w]').forEach(e => (e.onclick = () => { g.wegtype = e.dataset.w as WegTypeId; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-z]').forEach(e => (e.onclick = () => { g.zone = e.dataset.z as Zone; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-st]').forEach(e => (e.onclick = () => { if (g.modus !== 'weg') g.zetModus('weg'); g.stijl = e.dataset.st as Stijl; g.annuleer(); this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-op]')?.addEventListener('click', () => this.kies('opwaarderen'));
    this.el.querySelectorAll<HTMLElement>('[data-h]').forEach(e => (e.onclick = () => { g.hoger(Number(e.dataset.h)); this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-af]')?.addEventListener('click', () => { g.afronden = !g.afronden; this.teken(); });
    this.el.querySelector<HTMLElement>('[data-par]')?.addEventListener('click', () => { this.wisselParallel(); });
    this.el.querySelector<HTMLElement>('[data-hl]')?.addEventListener('click', () => { g.hulplijnen = !g.hulplijnen; this.teken(); });
    this.el.querySelectorAll<HTMLElement>('[data-d]').forEach(e => (e.onclick = () => { g.dienst = e.dataset.d as DienstSoort; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-grp]').forEach(e => (e.onclick = () => { this.groep = e.dataset.grp as typeof this.groep; g.dienst = this.inGroep()[0]; this.teken(); }));
    this.werkBijBalans();
    this.el.querySelectorAll<HTMLElement>('[data-gs]').forEach(e => (e.onclick = () => { g.grondstof = e.dataset.gs as Grondstof; g.annuleer(); this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-eco]')?.addEventListener('click', () => this.opEconomie());
    this.el.querySelectorAll<HTMLElement>('[data-zt]').forEach(e => (e.onclick = () => { g.zoneTool = e.dataset.zt as typeof g.zoneTool; if (e.dataset.zr) g.penseel = Number(e.dataset.zr); this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-vt]').forEach(e => (e.onclick = () => { g.verkeerTool = e.dataset.vt as VerkeerTool; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-kmu]').forEach(e => (e.onclick = () => { g.snelheidKeuze = e.dataset.kmu ? Number(e.dataset.kmu) : undefined; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-vb]').forEach(e => (e.onclick = () => { g.verbodKeuze = e.dataset.vb as Verbod; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-zb]').forEach(e => (e.onclick = () => { g.zijBord = e.dataset.zb as 'geef' | 'stop'; this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-wis]')?.addEventListener('click', () => { const n = this.opVerkeerWissen(); g.melding = `${n} voertuigen van de weg gehaald`; });
    this.el.querySelector<HTMLElement>('[data-verdw]')?.addEventListener('click', () => { const R = this.regels(); if (R) R.verdwijnen = !R.verdwijnen; this.teken(); });
    this.verplaatsKnoppen();
    this.el.querySelectorAll<HTMLElement>('[data-p]').forEach(e => (e.onclick = () => { g.penseel = Math.max(6, Math.min(80, g.penseel + Number(e.dataset.p))); this.teken(); }));
    // Districten.
    const ds = this.districten, huidig = ds?.lijst.get(g.district);
    const gewijzigd = () => { if (ds) ds.versie++; this.teken(); };
    this.el.querySelectorAll<HTMLElement>('[data-dist]').forEach(e => (e.onclick = () => { g.district = Number(e.dataset.dist); g.gum = false; this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-dist-nieuw]')?.addEventListener('click', () => { if (!ds) return; g.district = ds.nieuw().id; g.gum = false; this.teken(); });
    this.el.querySelector<HTMLElement>('[data-dist-gum]')?.addEventListener('click', () => { g.gum = true; this.teken(); });
    this.el.querySelectorAll<HTMLElement>('[data-dstijl]').forEach(e => (e.onclick = () => { if (huidig) { huidig.stijl = e.dataset.dstijl as DistrictStijl; gewijzigd(); } }));
    this.el.querySelectorAll<HTMLElement>('[data-hg]').forEach(e => (e.onclick = () => { if (huidig) { huidig.beleid.hoogte = e.dataset.hg as Hoogtegrens; gewijzigd(); } }));
    this.el.querySelectorAll<HTMLElement>('[data-bel]').forEach(e => (e.onclick = () => { if (huidig) { const k = e.dataset.bel as 'beschermd' | 'groen' | 'zon'; huidig.beleid[k] = !huidig.beleid[k]; gewijzigd(); } }));
    this.el.querySelector<HTMLInputElement>('[data-dnaam]')?.addEventListener('change', e => { if (huidig) { huidig.naam = (e.target as HTMLInputElement).value.trim() || huidig.naam; gewijzigd(); } });
    this.el.querySelectorAll<HTMLElement>('[data-bst]').forEach(e => (e.onclick = () => {
      if (!huidig) return;
      const b = huidig.beleid.belasting ??= { wonen: 0, bedrijven: 0 };
      const k = e.dataset.bst as 'wonen' | 'bedrijven';
      b[k] = Math.max(-2, Math.min(2, b[k] + Number(e.dataset.stap)));
      gewijzigd();
    }));
    this.el.querySelector<HTMLElement>('[data-dweg]')?.addEventListener('click', () => { if (ds && huidig) { ds.verwijder(huidig.id); g.district = 0; this.teken(); } });
  }

  /** Balans van stroom, water, riool en afval (in het tabblad Voorzieningen). */
  /** Stadscijfers van de hulpdiensten (voor het tabblad). */
  hulpStat: () => { brandveiligheid: number; misdaad: number; gezondheid: number; branden: number; afgebrand: number } = () => ({ brandveiligheid: 0, misdaad: 0, gezondheid: 0, branden: 0, afgebrand: 0 });

  private groep: import('../core/voorzieningen').DienstGroep = 'stroom';
  private inGroep() { return DIENST_VOLGORDE.filter(id => DIENSTEN[id].groep === this.groep); }

  werkBijBalans() {
    const el = this.el.querySelector<HTMLElement>('[data-balans]');
    if (!el) return;
    if (this.groep === 'veiligheid' || this.groep === 'zorg') {
      const h = this.hulpStat();
      const balk = (naam: string, x: number, goed: boolean) => `<span class="nut ${goed ? '' : 'tekort'}"><b>${naam}</b><i><u style="width:${Math.round(x * 100)}%"></u></i>${Math.round(x * 100)}%</span>`;
      el.innerHTML = this.groep === 'veiligheid'
        ? balk('Brandveiligheid', h.brandveiligheid, h.brandveiligheid > 0.6) + balk('Veiligheid', 1 - h.misdaad, h.misdaad < 0.3) + `<span class="nut">${h.branden} branden, ${h.afgebrand} afgebrand</span>`
        : balk('Gezondheidszorg', h.gezondheid, h.gezondheid > 0.6);
      return;
    }
    const b = this.v.balans;
    const fmt = (x: number, n: Nut) => n === 'stroom' ? x.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : Math.round(x).toLocaleString('nl-NL');
    const nuts: Nut[] = this.groep === 'stroom' ? ['stroom'] : this.groep === 'water' ? ['water', 'riool'] : ['afval'];
    el.innerHTML = nuts.map(n => {
      const x = b[n], ok = x.tekort <= x.verbruik * 0.01;
      const vol = x.verbruik > 0 ? Math.min(1, x.productie / x.verbruik) : 1;
      return `<span class="nut ${ok ? '' : 'tekort'}" title="${NUT_NAAM[n]}: productie ${fmt(x.productie, n)} / verbruik ${fmt(x.verbruik, n)} ${NUT_EENHEID[n]}${x.inkoop > 0 ? `, inkoop ${fmt(x.inkoop, n)}` : ''}${x.tekort > 0 ? `, tekort ${fmt(x.tekort, n)}` : ''}"><b>${NUT_NAAM[n]}</b><i><u style="width:${Math.round(vol * 100)}%"></u></i>${fmt(x.productie, n)} / ${fmt(x.verbruik, n)} ${NUT_EENHEID[n]}${x.inkoop > 0.001 ? ` <small>(+${fmt(x.inkoop, n)} inkoop)</small>` : ''}</span>`;
    }).join('');
  }

  /** Ligt de muis boven de werkbalk of de HUD? */
  static boven(x: number, y: number) {
    return [document.getElementById('werkbalk')!, ...document.querySelectorAll('.kaart')].some(el => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
  }
}

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
