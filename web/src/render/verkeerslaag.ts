import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { Gereedschap } from '../core/gereedschap';
import type { Afslag } from '../core/verkeer/rijstroken';
import { puntBijEind, eindAfstand } from '../core/verkeer/tmpe';
import { Bord, Verbod, EindRegels } from '../core/verkeer/regels';
import { WEGTYPEN, halveBreedte } from '../core/wegen/typen';

// ════════════════════════════════════════════════════════════════════════════════════
// VERKEERSLAAG (TM:PE-overlay)
// In het verkeersgereedschap staan boven de kaart klikbare iconen, zoals in Traffic Manager:
// borden bij elk wegeinde, verkeerslichten met groentijd op elk kruispunt, pijlen per rijstrook,
// kruispuntregels per wegeinde, maximumsnelheid en verboden per weg. Alleen rond het kijkpunt en
// met een vast maximum, zodat het licht blijft.
// ════════════════════════════════════════════════════════════════════════════════════

const BORD_SVG: Record<Bord | 'geen', string> = {
  voorrang: '<svg viewBox="0 0 24 24"><path d="M12 1.5 22.5 12 12 22.5 1.5 12z" fill="#fff"/><path d="M12 5 19 12 12 19 5 12z" fill="#f2c200"/></svg>',
  geef: '<svg viewBox="0 0 24 24"><path d="M2 3.5h20L12 21.5z" fill="#d6262c"/><path d="M6.4 6h11.2L12 16.2z" fill="#fff"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M8 1.5h8L22.5 8v8L16 22.5H8L1.5 16V8z" fill="#fff"/><path d="M8.6 3h6.8L21 8.6v6.8L15.4 21H8.6L3 15.4V8.6z" fill="#d6262c"/><text x="12" y="14.6" text-anchor="middle" font-size="6.6" font-weight="800" fill="#fff" font-family="Inter,sans-serif">STOP</text></svg>',
  geen: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="rgba(20,26,36,.55)" stroke="#fff" stroke-dasharray="3 2.2" stroke-width="1.5"/><path d="M12 8v8M8 12h8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const PIJL_SVG: Record<Afslag, string> = {
  links: '<svg viewBox="0 0 24 24"><path d="M15 20v-7a3 3 0 0 0-3-3H6M9 6 5 10l4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  rechtdoor: '<svg viewBox="0 0 24 24"><path d="M12 20V5M7 9.5 12 4.5l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  rechts: '<svg viewBox="0 0 24 24"><path d="M9 20v-7a3 3 0 0 1 3-3h6M15 6l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  keer: '<svg viewBox="0 0 24 24"><path d="M15 20V9a4 4 0 0 0-8 0v4M4 10l3 3.5L10 10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
type RegelSleutel = keyof Required<Omit<EindRegels, 'bord'>>;
const REGELS: { k: RegelSleutel; naam: string; svg: string; alleenLicht?: boolean }[] = [
  { k: 'keren', naam: 'Keren toegestaan', svg: PIJL_SVG.keer },
  { k: 'wisselen', naam: 'Van strook wisselen op het kruispunt', svg: '<svg viewBox="0 0 24 24"><path d="M8 20V8M5 11l3-3 3 3M16 4v12M13 13l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { k: 'blokkeren', naam: 'Kruispunt op rijden als het vol staat', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 12h16M12 4v16" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/></svg>' },
  { k: 'oversteek', naam: 'Oversteekplaats voor voetgangers', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="2" fill="currentColor"/><path d="M12 7.5v6l-3 6M12 13.5l3 6M8 11l4-3 4 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { k: 'rechtsDoorRood', naam: 'Rechtsaf door rood (na stoppen)', svg: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="3.5" fill="#e03131"/><path d="M11 20v-6a3 3 0 0 1 3-3h5M16 8l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', alleenLicht: true },
];
const VERBOD_SVG: Record<Verbod, string> = {
  auto: '<path d="M6 15v1.8M18 15v1.8M4.8 15v-2.6l1.7-3.7A1.6 1.6 0 0 1 8 7.8h8a1.6 1.6 0 0 1 1.5.9l1.7 3.7V15z" fill="none" stroke="#222" stroke-width="1.6" stroke-linejoin="round"/>',
  vracht: '<path d="M3.5 7.5h10v8h-10zM13.5 10h4l2.5 3v2.5h-6.5z" fill="#222"/><circle cx="7" cy="16.5" r="1.6" fill="#222"/><circle cx="16.5" cy="16.5" r="1.6" fill="#222"/>',
  bus: '<rect x="5" y="5" width="14" height="12" rx="2" fill="#222"/><rect x="6.6" y="7" width="10.8" height="4.4" fill="#fff"/><circle cx="8.5" cy="18" r="1.3" fill="#222"/><circle cx="15.5" cy="18" r="1.3" fill="#222"/>',
};
const verbodBord = (v: Verbod) => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#d6262c"/><circle cx="12" cy="12" r="8.4" fill="#fff"/><g transform="translate(2.4 2.4) scale(.8)">${VERBOD_SVG[v]}</g></svg>`;
const snelBord = (kmu: number, eigen: boolean) => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#d6262c"/><circle cx="12" cy="12" r="8.6" fill="#fff"/><text x="12" y="15.6" text-anchor="middle" font-size="${kmu >= 100 ? 8.4 : 10}" font-weight="800" fill="#111" font-family="Inter,sans-serif">${kmu}</text>${eigen ? '' : '<circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.28)"/>'}</svg>`;

interface Item { el: HTMLElement; sig: string; gezien: boolean }

export class VerkeersLaag {
  private el = document.createElement('div');
  private pool = new Map<string, Item>();
  private v = new THREE.Vector3();
  aan = false;

  constructor(private w: Wereld, private cam: THREE.PerspectiveCamera, private g: Gereedschap, private klaar: () => void = () => {}) {
    this.el.id = 'verkeerslaag';
    document.body.appendChild(this.el);
  }

  private scherm(x: number, y: number, z: number): [number, number] | null {
    this.v.set(x, y, z).project(this.cam);
    if (this.v.z > 1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) return null;
    return [(this.v.x + 1) / 2 * innerWidth, (1 - this.v.y) / 2 * innerHeight];
  }

  /** Element op een plek; html alleen vervangen als de inhoud (sig) veranderde. */
  private zet(sleutel: string, klasse: string, xy: [number, number], sig: string, html: () => string, bind: (el: HTMLElement) => void) {
    let it = this.pool.get(sleutel);
    if (!it) {
      const el = document.createElement('div');
      el.className = klasse;
      this.el.appendChild(el);
      it = { el, sig: '', gezien: true };
      this.pool.set(sleutel, it);
    }
    if (it.sig !== sig) { it.sig = sig; it.el.innerHTML = html(); bind(it.el); }
    it.el.style.transform = `translate(${xy[0].toFixed(1)}px, ${xy[1].toFixed(1)}px) translate(-50%, -50%)`;
    it.el.style.display = '';
    it.gezien = true;
  }

  private klik(el: HTMLElement, f: (e: MouseEvent) => void) {
    el.onpointerdown = e => e.stopPropagation();
    el.onclick = e => { e.stopPropagation(); f(e); this.klaar(); };
    el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); };
  }

  werkBij(doel: THREE.Vector3, afstand: number) {
    const aan = this.aan && this.g.modus === 'verkeer';
    this.el.style.display = aan ? '' : 'none';
    if (!aan) return;
    for (const it of this.pool.values()) it.gezien = false;
    const net = this.w.net, R = net.regels, vk = this.w.verkeer.stroken;
    const tool = this.g.verkeerTool;
    const straal = Math.max(140, Math.min(520, afstand * 1.2));
    const dichtbij = (x: number, z: number) => Math.hypot(x - doel.x, z - doel.z) < straal;
    const ver = afstand > 330;
    let n = 0;
    const MAX = 320;
    // Kruispunten: borden, lichten, pijlen, regels.
    if (tool === 'voorrang' || tool === 'lichten' || tool === 'pijlen' || tool === 'regels' || tool === 'hoofdweg') {
      for (const k of net.knopen.values()) {
        if (n > MAX) break;
        if (k.segs.length < 3 || !dichtbij(k.p.x, k.p.z)) continue;
        const lichten = net.heeftLichten(k.id);
        if (tool === 'lichten') {
          const xy = this.scherm(k.p.x, k.y + 4, k.p.z);
          if (!xy) continue;
          const keuze = R.lichtKeuze(k.id), groen = vk.lichten.get(k.id)?.groen;
          const sig = `${lichten}|${keuze}|${groen ?? ''}|${ver}`;
          this.zet(`l${k.id}`, 'vl-licht', xy, sig, () =>
            `<button class="vl-knop ${lichten ? 'aan' : ''}" title="${lichten ? 'Verkeerslichten uitzetten' : 'Verkeerslichten plaatsen'} (rechts klikken = automatisch)">${lichtSvg(lichten)}</button>` +
            (keuze !== 'auto' ? `<span class="vl-label">${keuze === 'aan' ? 'handmatig' : 'uit'}</span>` : '') +
            (lichten && groen && !ver ? `<span class="vl-groen"><button data-g="-5">−</button><b>${Math.round(groen)} s</b><button data-g="5">+</button></span>` : ''),
          el => {
            const knop = el.querySelector<HTMLElement>('.vl-knop')!;
            this.klik(knop, () => R.zetKnoop(k.id, { licht: lichten ? 'uit' : 'aan' }));
            knop.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); R.zetKnoop(k.id, { licht: 'auto', groen: undefined }); this.klaar(); };
            el.querySelectorAll<HTMLElement>('[data-g]').forEach(b => this.klik(b, () => {
              const nu = vk.lichten.get(k.id)?.groen ?? 20;
              R.zetKnoop(k.id, { licht: R.lichtKeuze(k.id) === 'auto' ? 'aan' : R.lichtKeuze(k.id), groen: Math.max(8, Math.min(90, nu + Number(b.dataset.g))) });
            }));
          });
          n++;
          continue;
        }
        for (const sid of k.segs) {
          const seg = net.segmenten.get(sid);
          if (!seg) continue;
          const ea = eindAfstand(net, seg, k.id);
          if (tool === 'voorrang' || tool === 'hoofdweg') {
            // Bord rechts van de weg, net voor de stopstreep (voor het verkeer dat aankomt).
            const q = puntBijEind(net, seg, k.id, ea);
            const hb = halveBreedte(seg.type) + 1.2;
            const xy = this.scherm(q.x + q.dz * hb, q.y + 2.5, q.z - q.dx * hb);
            if (!xy) continue;
            const b = R.bord(sid, k.id);
            if (tool === 'hoofdweg' && !b) continue;
            this.zet(`b${sid}:${k.id}`, 'vl-bord', xy, `${b ?? 'geen'}|${lichten}`, () => `<button class="vl-knop bord ${b ? '' : 'leeg'} ${lichten ? 'gedimd' : ''}" title="${b ? ({ voorrang: 'Voorrangsweg', geef: 'Voorrang verlenen', stop: 'Stop' } as const)[b] : 'Geen bord'}${lichten ? ' (verkeerslichten gaan voor)' : ''} · klik = volgende, rechts = weg">${BORD_SVG[b ?? 'geen']}</button>`, el => {
              const knop = el.querySelector<HTMLElement>('button')!;
              this.klik(knop, () => R.zetEind(sid, k.id, { bord: Gereedschap.volgendBord(R.bord(sid, k.id)) }));
              knop.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); R.zetEind(sid, k.id, { bord: undefined }); this.klaar(); };
            });
            n++;
          } else if (tool === 'pijlen') {
            // Eén paneel per wegeinde met per rijstrook (van links naar rechts, zoals de bestuurder ze ziet) de richtingen.
            const af = vk.afslagen.get(`${sid}:${k.id}`);
            if (!af || !af.perStrook.length) continue;
            const q = puntBijEind(net, seg, k.id, ea + 4);
            const xy = this.scherm(q.x, q.y + 1, q.z);
            if (!xy) continue;
            const volgorde: Afslag[] = (['links', 'rechtdoor', 'rechts', 'keer'] as Afslag[]).filter(a => af.mogelijk.includes(a));
            const eigen = R.heeftPijlen(sid, k.id);
            const nL = af.perStrook.length;
            const sig = `${af.perStrook.map(x => x.join('+')).join('|')}#${volgorde.join(',')}#${eigen}#${ver}`;
            this.zet(`p${sid}:${k.id}`, 'vl-pijlen', xy, sig, () =>
              `<div class="vl-paneel">` + Array.from({ length: nL }, (_, c) => {
                const i = nL - 1 - c; // kolom 0 = linkse strook = index nL-1
                const nu = af.perStrook[i];
                return `<div class="vl-kolom">` + (ver ? volgorde.filter(a => nu.includes(a)) : volgorde).map(a => `<button class="vl-pijl ${nu.includes(a) ? 'aan' : ''}" data-i="${i}" data-a="${a}" title="Strook ${c + 1}: ${({ links: 'linksaf', rechtdoor: 'rechtdoor', rechts: 'rechtsaf', keer: 'keren' } as const)[a]}">${PIJL_SVG[a]}</button>`).join('') + `</div>`;
              }).join('') + (eigen ? `<button class="vl-terug" title="Terug naar standaard">↺</button>` : '') + `</div>`,
            el => {
              el.querySelectorAll<HTMLElement>('[data-a]').forEach(btn => this.klik(btn, () => {
                const a = btn.dataset.a as Afslag, i = Number(btn.dataset.i);
                const lijst = vk.afslagen.get(`${sid}:${k.id}`)?.perStrook ?? af.perStrook;
                const huidig = lijst[i] ?? [];
                const nieuw = huidig.includes(a) ? huidig.filter(x => x !== a) : [...huidig, a];
                if (!nieuw.length) { this.g.melding = 'Een rijstrook moet minstens één richting houden'; return; }
                // Eerste eigen pijl: alle stroken van dit wegeinde vastleggen zoals ze nu zijn.
                if (!R.heeftPijlen(sid, k.id)) lijst.forEach((x, j) => R.zetPijlen(sid, k.id, j, x));
                R.zetPijlen(sid, k.id, i, nieuw);
              }));
              const t = el.querySelector<HTMLElement>('.vl-terug');
              if (t) this.klik(t, () => R.wisPijlen(sid, k.id));
            });
            n++;
          } else if (tool === 'regels') {
            const q = puntBijEind(net, seg, k.id, ea + 3);
            const xy = this.scherm(q.x, q.y + 1.5, q.z);
            if (!xy) continue;
            const zicht = REGELS.filter(x => !x.alleenLicht || lichten);
            const sig = zicht.map(x => R.regel(sid, k.id, x.k) ? 1 : 0).join('') + `|${ver}`;
            this.zet(`r${sid}:${k.id}`, 'vl-regels', xy, sig, () =>
              (ver ? zicht.filter(x => R.regel(sid, k.id, x.k) !== (x.k === 'oversteek')) : zicht).map(x => `<button class="vl-regel ${R.regel(sid, k.id, x.k) ? 'aan' : ''}" data-k="${x.k}" title="${x.naam}: ${R.regel(sid, k.id, x.k) ? 'aan' : 'uit'}">${x.svg}</button>`).join('') || '<span class="vl-punt"></span>',
            el => el.querySelectorAll<HTMLElement>('[data-k]').forEach(btn => this.klik(btn, () => {
              const key = btn.dataset.k as RegelSleutel;
              R.zetEind(sid, k.id, { [key]: !R.regel(sid, k.id, key) });
            })));
            n++;
          }
        }
      }
    }
    // Wegen: snelheid en verboden in het midden van elk segment.
    if (tool === 'snelheid' || tool === 'verbod') {
      for (const seg of net.segmenten.values()) {
        if (n > MAX) break;
        const m = seg.pad[seg.pad.length >> 1];
        if (!m || !dichtbij(m.x, m.z) || WEGTYPEN[seg.type].snelheid < 15) continue;
        if (ver && seg.lengte < 30) continue;
        const xy = this.scherm(m.x, m.y + 3, m.z);
        if (!xy) continue;
        if (tool === 'snelheid') {
          const eigen = R.limiet(seg.id), kmu = eigen ?? WEGTYPEN[seg.type].snelheid;
          this.zet(`s${seg.id}`, 'vl-snel', xy, `${kmu}|${!!eigen}`, () => `<button class="vl-knop snel" title="${kmu} km/u${eigen ? '' : ' (standaard)'} · klik = ${this.g.snelheidKeuze ?? 'standaard'}, rechts = standaard">${snelBord(kmu, !!eigen)}</button>`, el => {
            const knop = el.querySelector<HTMLElement>('button')!;
            this.klik(knop, () => R.zetLimiet(seg.id, this.g.snelheidKeuze));
            knop.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); R.zetLimiet(seg.id, undefined); this.klaar(); };
          });
        } else {
          const lijst = R.verboden(seg.id);
          this.zet(`v${seg.id}`, 'vl-verbod', xy, lijst.join(','), () => lijst.length ? lijst.map(x => `<button class="vl-knop klein" data-v="${x}" title="Verbod opheffen">${verbodBord(x)}</button>`).join('') : `<button class="vl-knop klein leeg" title="Verbod toevoegen">${BORD_SVG.geen}</button>`, el => {
            el.querySelectorAll<HTMLElement>('button').forEach(btn => this.klik(btn, () => {
              const x = (btn.dataset.v as Verbod | undefined) ?? this.g.verbodKeuze;
              const l = R.verboden(seg.id);
              R.zetVerbod(seg.id, l.includes(x) ? l.filter(y => y !== x) : [...l, x]);
            }));
          });
        }
        n++;
      }
    }
    for (const [k, it] of this.pool) if (!it.gezien) { if (this.pool.size > 600) { it.el.remove(); this.pool.delete(k); } else it.el.style.display = 'none'; }
  }
}

function lichtSvg(aan: boolean) {
  return `<svg viewBox="0 0 24 24"><rect x="7.5" y="1.5" width="9" height="21" rx="3" fill="#1f2328" stroke="#fff" stroke-width="1"/><circle cx="12" cy="6.5" r="2.2" fill="${aan ? '#ff4d4f' : '#5a1f1f'}"/><circle cx="12" cy="12" r="2.2" fill="${aan ? '#ffb300' : '#5a4510'}"/><circle cx="12" cy="17.5" r="2.2" fill="${aan ? '#40c057' : '#1f4a2a'}"/></svg>`;
}
