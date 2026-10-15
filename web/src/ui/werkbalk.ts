import { Gereedschap, Modus, Stijl } from '../core/gereedschap';

const STIJL_ICOON: Record<Stijl | 'op', string> = {
  recht: '<svg viewBox="0 0 24 24" class="si"><path d="M4 19 20 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="4" cy="19" r="2.4" fill="currentColor"/><circle cx="20" cy="5" r="2.4" fill="currentColor"/></svg>',
  bocht: '<svg viewBox="0 0 24 24" class="si"><path d="M4 20C4 9 9 4 20 4" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="4" cy="20" r="2.4" fill="currentColor"/><circle cx="20" cy="4" r="2.4" fill="currentColor"/><circle cx="4" cy="4" r="1.6" fill="none" stroke="currentColor"/></svg>',
  vrij: '<svg viewBox="0 0 24 24" class="si"><path d="M3 18c4 0 4-10 9-10s5 8 9 6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  op: '<svg viewBox="0 0 24 24" class="si"><path d="M12 4 5 12h4v8h6v-8h4z" fill="currentColor"/></svg>',
};
import { WEGTYPEN, WEGTYPE_VOLGORDE, WegTypeId, strookGrenzen, totaleBreedte } from '../core/wegen/typen';
import { ZONES, Zone } from '../core/zones';
import { ICOON } from './iconen';
import { GRONDSTOFFEN, Grondstof } from '../core/economie';
import { DIENSTEN, DienstSoort, NUT_EENHEID, NUT_NAAM, Nut, Voorzieningen } from '../core/voorzieningen';

const DIENST_ICOON: Record<DienstSoort, string> = {
  windmolen: '<svg viewBox="0 0 86 46"><path d="M43 44V14" stroke="#e9ecef" stroke-width="2.6"/><circle cx="43" cy="13" r="2.4" fill="#e9ecef"/><path d="M43 13 41 1h3zM43 13l11 6-2 2zM43 13l-11 6 1 2z" fill="#e9ecef"/></svg>',
  zonnepark: '<svg viewBox="0 0 86 46"><path d="M10 34l8-12h22l-8 12zM46 34l8-12h22l-8 12z" fill="#3b5bdb"/><path d="M18 22l-8 12M30 22l-8 12M54 22l-8 12M66 22l-8 12" stroke="#91a7ff" stroke-width="1"/><circle cx="70" cy="9" r="5" fill="#fcc419"/></svg>',
  gascentrale: '<svg viewBox="0 0 86 46"><rect x="14" y="22" width="40" height="20" fill="#868e96"/><rect x="58" y="6" width="6" height="36" fill="#adb5bd"/><rect x="68" y="10" width="6" height="32" fill="#adb5bd"/><path d="M61 4c-3-3 2-4 0-6" stroke="#ced4da" stroke-width="2" fill="none"/></svg>',
  pompstation: '<svg viewBox="0 0 86 46"><rect x="14" y="20" width="22" height="20" fill="#c2553a"/><path d="M12 20l13-8 13 8z" fill="#495057"/><ellipse cx="60" cy="34" rx="14" ry="6" fill="#adb5bd"/><path d="M60 8c6 8 8 11 8 14a8 8 0 0 1-16 0c0-3 2-6 8-14z" fill="#4dabf7"/></svg>',
  rwzi: '<svg viewBox="0 0 86 46"><ellipse cx="28" cy="28" rx="18" ry="9" fill="#adb5bd"/><ellipse cx="28" cy="27" rx="14" ry="6.5" fill="#5c7a54"/><rect x="50" y="20" width="26" height="16" fill="#adb5bd"/><rect x="53" y="23" width="20" height="10" fill="#5c7a54"/></svg>',
  stortplaats: '<svg viewBox="0 0 86 46"><path d="M8 40l16-22h30l18 22z" fill="#8a7a63"/><rect x="32" y="12" width="10" height="7" fill="#fcc419"/></svg>',
  afvalcentrale: '<svg viewBox="0 0 86 46"><rect x="12" y="18" width="40" height="24" fill="#495057"/><rect x="58" y="4" width="7" height="38" fill="#e9ecef"/><rect x="14" y="30" width="14" height="10" fill="#868e96"/></svg>',
};

const GRONDSTOF_ICOON: Record<Grondstof, string> = {
  landbouw: '<svg viewBox="0 0 86 46"><path d="M14 34h58" stroke="#8a6b3c" stroke-width="3"/><path d="M20 34c0-8 3-14 6-18M30 34c0-9 2-15 5-20M40 34c0-8 3-15 6-19M50 34c0-9 2-15 5-20M60 34c0-8 3-14 6-18" stroke="#c0d36b" stroke-width="2.4" fill="none"/><circle cx="26" cy="15" r="2.6" fill="#e9c46a"/><circle cx="35" cy="13" r="2.6" fill="#e9c46a"/><circle cx="46" cy="14" r="2.6" fill="#e9c46a"/><circle cx="55" cy="13" r="2.6" fill="#e9c46a"/><circle cx="66" cy="15" r="2.6" fill="#e9c46a"/></svg>',
  bosbouw: '<svg viewBox="0 0 86 46"><path d="M30 6 18 30h24zM56 10 45 32h22z" fill="#2f9e44"/><path d="M30 30v8M56 32v6" stroke="#8a6b3c" stroke-width="3"/><rect x="62" y="34" width="16" height="4" rx="2" fill="#a0784a"/><rect x="64" y="29" width="12" height="4" rx="2" fill="#a0784a"/></svg>',
  olie: '<svg viewBox="0 0 86 46"><path d="M18 38h40M28 38l8-22 8 22" stroke="#868e96" stroke-width="2.6" fill="none"/><path d="M14 18l46-6" stroke="#ffd43b" stroke-width="4"/><path d="M60 10v10" stroke="#ffd43b" stroke-width="5"/><rect x="66" y="22" width="12" height="16" rx="3" fill="#dee2e6"/></svg>',
  delfstoffen: '<svg viewBox="0 0 86 46"><path d="M10 38l14-16 12 16z" fill="#d9a066"/><path d="M30 38l14-12 12 12z" fill="#adb5bd"/><path d="M52 38l12-18 14 18z" fill="#d9a066"/><path d="M8 38h72" stroke="#6c757d" stroke-width="2"/></svg>',
};

const DIENST_VOLGORDE: DienstSoort[] = ['windmolen', 'zonnepark', 'gascentrale', 'pompstation', 'rwzi', 'stortplaats', 'afvalcentrale'];

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

  /** Wordt aangeroepen om het economiepaneel te openen. */
  opEconomie: () => void = () => {};

  constructor(private g: Gereedschap, private opZoneModus: (aan: boolean) => void, private v: Voorzieningen) {
    this.el.className = 'paneel';
    addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (!this.g.terug()) this.kies('kijk'); }
      if (k === 'z') this.kies('zone');
      if (k === 'g') this.kies('gebied');
      if (k === 'n') this.kies('dienst');
      if (k === 'x') this.kies('weg');
      if (k === 'u') this.kies('opwaarderen');
      if (k === 'b') this.kies('sloop');
      if (k === 'c' && this.g.modus === 'weg') { const v: Stijl[] = ['recht', 'bocht', 'vrij']; this.g.stijl = v[(v.indexOf(this.g.stijl) + 1) % 3]; this.g.annuleer(); this.teken(); }
      if ((e.key === 'PageUp' || e.key === 'PageDown') && this.g.modus === 'weg') { e.preventDefault(); this.g.hoger(e.key === 'PageUp' ? 1 : -1); this.teken(); }
      if (k === 'h' && this.g.modus === 'weg') { this.g.hulplijnen = !this.g.hulplijnen; this.teken(); }
      if (/^[1-9]$/.test(k)) {
        const i = Number(k) - 1;
        if (this.g.modus === 'zone' && ZONES[i]) { this.g.zone = ZONES[i].id; this.teken(); }
        else if (this.g.modus === 'dienst' && DIENST_VOLGORDE[i]) { this.g.dienst = DIENST_VOLGORDE[i]; this.teken(); }
        else if (this.g.modus === 'gebied' && i < 4) { this.g.grondstof = (Object.keys(GRONDSTOFFEN) as Grondstof[])[i]; this.teken(); }
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
    const ic: Record<Modus, string> = { weg: ICOON.weg, zone: ICOON.zone, gebied: ICOON.fabriek, dienst: ICOON.bliksem, opwaarderen: ICOON.pijl, sloop: ICOON.sloop, kijk: ICOON.oog };
    const tab = (m: Modus, naam: string, toets: string) => `<button class="knop tab ${g.modus === m ? 'aan' : ''}" data-m="${m}"><span class="ic">${ic[m]}</span><span class="tab-tekst">${naam}</span><span class="toets">${toets}</span></button>`;
    let items = '', opties = '';
    if (g.modus === 'weg' || g.modus === 'opwaarderen') {
      items = WEGTYPE_VOLGORDE.map((id, i) => `<div class="item ${g.wegtype === id ? 'aan' : ''}" data-w="${id}">${dwarsprofiel(id)}<div class="item-naam">${WEGTYPEN[id].naam}</div><div class="item-sub">${i + 1} · € ${WEGTYPEN[id].kosten}/m</div></div>`).join('');
      const st = (id: Stijl, naam: string) => `<button class="knop ${g.modus === 'weg' && g.stijl === id ? 'aan' : ''}" data-st="${id}" title="${naam} (C wisselt)">${STIJL_ICOON[id]}<span class="tab-tekst">${naam}</span></button>`;
      opties = `<div class="groep">${st('recht', 'Recht')}${st('bocht', 'Bocht')}${st('vrij', 'Vrij')}<button class="knop ${g.modus === 'opwaarderen' ? 'aan' : ''}" data-op title="Opwaarderen (U)">${STIJL_ICOON.op}<span class="tab-tekst">Opwaarderen</span></button></div>`;
      if (g.modus === 'weg') opties += `<div class="groep hoogte"><button class="knop" data-h="-1" title="Lager (PgDn)">▼</button><span class="waarde">${g.niveau === 0 ? 'maaiveld' : g.niveau > 0 ? '+' + g.niveau + ' m' : g.niveau + ' m'}</span><button class="knop" data-h="1" title="Hoger (PgUp)">▲</button></div>` +
        `<button class="knop schakel ${g.afronden ? 'aan' : ''}" data-af title="Knikken in rechte wegen automatisch afronden">Afronden</button><button class="knop schakel ${g.hulplijnen ? 'aan' : ''}" data-hl title="Hulplijnen en snappen (H)">Hulplijnen</button>`;
    } else if (g.modus === 'zone') {
      items = ZONES.map(z => `<div class="item ${g.zone === z.id ? 'aan' : ''}" data-z="${z.id}">${zoneIcoon(z.id, z.kleur)}<div class="item-naam">${z.naam}</div><div class="item-sub">${z.toets}</div></div>`).join('');
      opties = `<span>Penseel</span><button class="knop" data-p="-4">−</button><span style="color:#e9eef5;font-weight:600">${g.penseel} m</span><button class="knop" data-p="4">+</button>`;
    } else if (g.modus === 'gebied') {
      items = (Object.values(GRONDSTOFFEN)).map((x, i) => `<div class="item ${g.grondstof === x.id ? 'aan' : ''}" data-gs="${x.id}">${GRONDSTOF_ICOON[x.id]}<div class="item-naam">${x.naam}</div><div class="item-sub">${i + 1} · ${x.product.toLowerCase()}</div></div>`).join('');
      opties = `<button class="knop" data-eco>Overzicht economie</button>`;
    } else if (g.modus === 'dienst') {
      items = DIENST_VOLGORDE.map((id, i) => { const d = DIENSTEN[id]; const lev = Object.entries(d.levert).map(([n, x]) => `${(x as number).toLocaleString('nl-NL')} ${NUT_EENHEID[n as Nut]}`).join(' + '); return `<div class="item ${g.dienst === id ? 'aan' : ''}" data-d="${id}" title="${d.uitleg}">${DIENST_ICOON[id]}<div class="item-naam">${d.naam}</div><div class="item-sub">${i + 1} · € ${(d.kosten / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln · ${lev}</div></div>`; }).join('');
      opties = `<div class="balans" data-balans></div>`;
    } else if (g.modus === 'sloop') {
      items = `<div class="item-sub" style="padding:14px">Klik op een weg of gebouw om het te slopen. Je krijgt een kwart van de wegkosten terug.</div>`;
    } else {
      items = `<div class="item-sub" style="padding:14px">Kies een gereedschap. Camera: WASD of middelste muisknop = schuiven, rechts slepen of Q/E = draaien, R/F = kantelen, scrollen = zoomen. Spatie = pauze.</div>`;
    }
    this.el.innerHTML = `<div class="tabs">${tab('weg', 'Wegen', 'X')}${tab('zone', 'Zones', 'Z')}${tab('gebied', 'Economie', 'G')}${tab('dienst', 'Voorzieningen', 'N')}${tab('opwaarderen', 'Opwaarderen', 'U')}${tab('sloop', 'Slopen', 'B')}${tab('kijk', 'Kijken', 'Esc')}</div>${opties ? `<div class="opties">${opties}</div>` : ''}<div class="items">${items}</div>`;
    this.el.querySelectorAll<HTMLElement>('[data-m]').forEach(e => (e.onclick = () => this.kies(e.dataset.m as Modus)));
    this.el.querySelectorAll<HTMLElement>('[data-w]').forEach(e => (e.onclick = () => { g.wegtype = e.dataset.w as WegTypeId; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-z]').forEach(e => (e.onclick = () => { g.zone = e.dataset.z as Zone; this.teken(); }));
    this.el.querySelectorAll<HTMLElement>('[data-st]').forEach(e => (e.onclick = () => { if (g.modus !== 'weg') g.zetModus('weg'); g.stijl = e.dataset.st as Stijl; g.annuleer(); this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-op]')?.addEventListener('click', () => this.kies('opwaarderen'));
    this.el.querySelectorAll<HTMLElement>('[data-h]').forEach(e => (e.onclick = () => { g.hoger(Number(e.dataset.h)); this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-af]')?.addEventListener('click', () => { g.afronden = !g.afronden; this.teken(); });
    this.el.querySelector<HTMLElement>('[data-hl]')?.addEventListener('click', () => { g.hulplijnen = !g.hulplijnen; this.teken(); });
    this.el.querySelectorAll<HTMLElement>('[data-d]').forEach(e => (e.onclick = () => { g.dienst = e.dataset.d as DienstSoort; this.teken(); }));
    this.werkBijBalans();
    this.el.querySelectorAll<HTMLElement>('[data-gs]').forEach(e => (e.onclick = () => { g.grondstof = e.dataset.gs as Grondstof; g.annuleer(); this.teken(); }));
    this.el.querySelector<HTMLElement>('[data-eco]')?.addEventListener('click', () => this.opEconomie());
    this.el.querySelectorAll<HTMLElement>('[data-p]').forEach(e => (e.onclick = () => { g.penseel = Math.max(6, Math.min(80, g.penseel + Number(e.dataset.p))); this.teken(); }));
  }

  /** Balans van stroom, water, riool en afval (in het tabblad Voorzieningen). */
  werkBijBalans() {
    const el = this.el.querySelector<HTMLElement>('[data-balans]');
    if (!el) return;
    const b = this.v.balans;
    const fmt = (x: number, n: Nut) => n === 'stroom' ? x.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : Math.round(x).toLocaleString('nl-NL');
    el.innerHTML = (['stroom', 'water', 'riool', 'afval'] as Nut[]).map(n => {
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
