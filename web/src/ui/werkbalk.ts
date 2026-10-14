import { Gereedschap, Modus } from '../core/gereedschap';
import { WEGTYPEN, WEGTYPE_VOLGORDE, WegTypeId, strookGrenzen, totaleBreedte } from '../core/wegen/typen';
import { ZONES, Zone } from '../core/zones';
import { ICOON } from './iconen';

const STROOKKLEUR: Record<string, string> = { stoep: '#9aa0a6', fiets: '#a8473b', auto: '#3b3f45', gedeeld: '#7b4a3a', bus: '#7a3f35', tram: '#55575c', berm: '#5f8d3e', middenberm: '#5f8d3e', vluchtstrook: '#4a4e55' };

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

  constructor(private g: Gereedschap, private opZoneModus: (aan: boolean) => void) {
    this.el.className = 'paneel';
    addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (!this.g.terug()) this.kies('kijk'); }
      if (k === 'z') this.kies('zone');
      if (k === 'x') this.kies('weg');
      if (k === 'u') this.kies('opwaarderen');
      if (k === 'b') this.kies('sloop');
      if (k === 'c' && this.g.modus === 'weg') { this.g.bocht = !this.g.bocht; this.g.annuleer(); this.teken(); }
      if (/^[1-9]$/.test(k)) {
        const i = Number(k) - 1;
        if (this.g.modus === 'zone' && ZONES[i]) { this.g.zone = ZONES[i].id; this.teken(); }
        else if ((this.g.modus === 'weg' || this.g.modus === 'opwaarderen') && WEGTYPE_VOLGORDE[i]) { this.g.wegtype = WEGTYPE_VOLGORDE[i]; this.teken(); }
      }
      if ((k === '+' || k === '=') && this.g.modus === 'zone') { this.g.penseel = Math.min(80, this.g.penseel + 4); this.teken(); }
      if (k === '-' && this.g.modus === 'zone') { this.g.penseel = Math.max(6, this.g.penseel - 4); this.teken(); }
    });
    this.teken();
  }

  kies(m: Modus) { this.g.zetModus(m); this.opZoneModus(m === 'zone'); this.teken(); }

  teken() {
    const g = this.g;
    const ic: Record<Modus, string> = { weg: ICOON.weg, zone: ICOON.zone, opwaarderen: ICOON.pijl, sloop: ICOON.sloop, kijk: ICOON.oog };
    const tab = (m: Modus, naam: string, toets: string) => `<button class="knop tab ${g.modus === m ? 'aan' : ''}" data-m="${m}"><span class="ic">${ic[m]}</span><span class="tab-tekst">${naam}</span><span class="toets">${toets}</span></button>`;
    let items = '', opties = '';
    if (g.modus === 'weg' || g.modus === 'opwaarderen') {
      items = WEGTYPE_VOLGORDE.map((id, i) => `<div class="item ${g.wegtype === id ? 'aan' : ''}" data-w="${id}">${dwarsprofiel(id)}<div class="item-naam">${WEGTYPEN[id].naam}</div><div class="item-sub">${i + 1} · € ${WEGTYPEN[id].kosten}/m</div></div>`).join('');
      if (g.modus === 'weg') opties = `<button class="knop ${!g.bocht ? 'aan' : ''}" data-b="0">Recht</button><button class="knop ${g.bocht ? 'aan' : ''}" data-b="1">Bocht</button><span>C wisselt</span>`;
    } else if (g.modus === 'zone') {
      items = ZONES.map(z => `<div class="item ${g.zone === z.id ? 'aan' : ''}" data-z="${z.id}">${zoneIcoon(z.id, z.kleur)}<div class="item-naam">${z.naam}</div><div class="item-sub">${z.toets}</div></div>`).join('');
      opties = `<span>Penseel</span><button class="knop" data-p="-4">−</button><span style="color:#e9eef5;font-weight:600">${g.penseel} m</span><button class="knop" data-p="4">+</button>`;
    } else if (g.modus === 'sloop') {
      items = `<div class="item-sub" style="padding:14px">Klik op een weg of gebouw om het te slopen. Je krijgt een kwart van de wegkosten terug.</div>`;
    } else {
      items = `<div class="item-sub" style="padding:14px">Kies een gereedschap. Camera: WASD of middelste muisknop = schuiven, rechts slepen of Q/E = draaien, R/F = kantelen, scrollen = zoomen. Spatie = pauze.</div>`;
    }
    this.el.innerHTML = `<div class="tabs">${tab('weg', 'Wegen', 'X')}${tab('zone', 'Zones', 'Z')}${tab('opwaarderen', 'Opwaarderen', 'U')}${tab('sloop', 'Slopen', 'B')}${tab('kijk', 'Kijken', 'Esc')}<div class="opties">${opties}</div></div><div class="items">${items}</div>`;
    this.el.querySelectorAll<HTMLElement>('[data-m]').forEach(e => (e.onclick = () => this.kies(e.dataset.m as Modus)));
    this.el.querySelectorAll<HTMLElement>('[data-w]').forEach(e => (e.onclick = () => { g.wegtype = e.dataset.w as WegTypeId; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-z]').forEach(e => (e.onclick = () => { g.zone = e.dataset.z as Zone; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-b]').forEach(e => (e.onclick = () => { g.bocht = e.dataset.b === '1'; g.annuleer(); this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-p]').forEach(e => (e.onclick = () => { g.penseel = Math.max(6, Math.min(80, g.penseel + Number(e.dataset.p))); this.teken(); }));
  }

  /** Ligt de muis boven de werkbalk of de HUD? */
  static boven(x: number, y: number) {
    return [document.getElementById('werkbalk')!, ...document.querySelectorAll('.kaart')].some(el => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
  }
}
