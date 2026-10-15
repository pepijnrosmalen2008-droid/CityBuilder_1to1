import { Wereld } from '../core/wereld';
import { ICOON, gezicht, wapen } from './iconen';
import type { KwaliteitRegelaar, Keuze } from '../render/kwaliteit';

const fmt = (n: number) => Math.round(n).toLocaleString('nl-NL');
const geldFmt = (n: number) => Math.abs(n) >= 1e6 ? `€ ${(n / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln` : `€ ${fmt(n)}`;

/** Bovenbalk: stadskaart (wapen, naam, datum), kerngetallen, tevredenheid, snelheid en vraag. Plus de nieuwsbalk. */
export class Hud {
  private el = document.getElementById('hud')!;
  private v: Record<string, HTMLElement> = {};
  private staven: Record<string, HTMLElement> = {};
  private knoppen: HTMLElement[] = [];
  private nieuwsEl: HTMLElement;
  private laatsteNieuws = 0;

  private fpsEl!: HTMLElement;
  private begroting!: HTMLElement;
  private schuiversGetekend = false;
  private menu!: HTMLElement;

  /** Opslaan / nieuwe stad / voorbeeldstad (gezet door main). */
  opStad: (wat: 'opslaan' | 'nieuw' | 'voorbeeld') => void = () => {};

  /** Melding in het menu (bijv. 'Opgeslagen om 14:02'). */
  meldOpgeslagen(tekst: string) { const el = this.menu.querySelector('[data-opgeslagen]'); if (el) el.textContent = tekst; }

  datumTekst() {
    const d = new Date(2026, 0, 1 + Math.floor(this.w.dagen));
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  constructor(private w: Wereld, private regelaar: KwaliteitRegelaar) {
    this.el.innerHTML = `
      <div class="kaart stadskaart paneel">
        <div class="wapen">${wapen(w.seed + 11)}</div>
        <div><div class="stadsnaam" title="Klik om de naam te wijzigen" data-v="naam"></div><div class="datum" data-v="datum"></div></div>
        <div class="inw"><span class="ic">${ICOON.mensen}</span><b data-v="inw"></b></div>
      </div>
      <div class="kaart cijfers paneel">
        <div class="cijfer klikbaar" title="Begroting" data-begroting><span class="ic geel">${ICOON.munt}</span><b data-v="geld"></b><small data-v="saldo"></small></div>
        <div class="cijfer" title="Woningen"><span class="ic">${ICOON.huis}</span><b data-v="won"></b></div>
        <div class="cijfer" title="Banen"><span class="ic">${ICOON.koffer}</span><b data-v="banen"></b></div>
        <div class="cijfer" title="Werkloosheid"><span class="ic">${ICOON.grafiek}</span><b data-v="wl"></b></div>
        <div class="cijfer" title="Verkeer: doorstroming (aantal voertuigen onderweg)"><span class="ic">${ICOON.auto}</span><b data-v="vk"></b></div>
        <div class="cijfer" title="Tevredenheid van de inwoners"><span class="ic" data-v="gezicht"></span><b data-v="tev"></b></div>
      </div>
      <div class="kaart bediening paneel">
        <div class="snelheid">${[0, 1, 2, 4].map(s => `<button class="knop rond" data-s="${s}" title="${s ? s + '× snelheid' : 'Pauze (spatie)'}">${s === 0 ? ICOON.pauze : '<span class="snel">' + '›'.repeat(s === 4 ? 3 : s) + '</span>'}</button>`).join('')}</div>
        <button class="knop rond" data-instel title="Grafische kwaliteit">${ICOON.tandwiel}</button>
        <div class="vraag" title="Vraag naar wonen, winkels, kantoren en industrie">
          ${[['W', 'wonen', '#69db7c', 'Wonen'], ['D', 'detailhandel', '#4dabf7', 'Winkels'], ['K', 'kantoor', '#b197fc', 'Kantoren'], ['I', 'industrie', '#ffd43b', 'Industrie']].map(([l, k, c, n]) =>
            `<div class="vraag-kolom" title="${n}"><div class="vraag-staaf"><div data-q="${k}" style="background:${c}"></div></div><div class="vraag-letter">${l}</div></div>`).join('')}
        </div>
      </div>`;
    this.el.querySelectorAll<HTMLElement>('[data-v]').forEach(e => (this.v[e.dataset.v!] = e));
    this.el.querySelectorAll<HTMLElement>('[data-q]').forEach(e => (this.staven[e.dataset.q!] = e));
    this.el.querySelectorAll<HTMLElement>('[data-s]').forEach(e => { this.knoppen.push(e); e.onclick = () => { this.w.snelheid = Number(e.dataset.s); this.werkBij(); }; });
    this.v.naam.onclick = () => { const n = prompt('Naam van je stad', this.w.naam); if (n && n.trim()) { this.w.naam = n.trim().slice(0, 32); this.werkBij(); } };
    addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') { e.preventDefault(); this.w.snelheid = this.w.snelheid ? 0 : 1; this.werkBij(); }
    });
    this.menu = document.createElement('div');
    this.menu.className = 'instellingen paneel';
    document.body.appendChild(this.menu);
    const tekenMenu = () => {
      const opties: [Keuze, string, string][] = [['auto', 'Automatisch', 'Past zich aan je apparaat aan'], ['laag', 'Laag', 'Snel, ook op oudere laptops'], ['midden', 'Midden', 'Zachte schaduwen, gloed'], ['hoog', 'Hoog', 'Ambient occlusion, scherpste schaduw']];
      this.menu.innerHTML = `<div class="menu-kop">Grafische kwaliteit</div>` + opties.map(([k, n, u]) =>
        `<button class="optie ${this.regelaar.keuze === k ? 'aan' : ''}" data-k="${k}"><b>${n}</b><span>${u}</span></button>`).join('') +
        `<div class="fps">Nu: <b data-fps>–</b></div>` +
        `<div class="menu-kop" style="margin-top:12px">Stad</div><button class="optie" data-stad="opslaan"><b>Opslaan</b><span data-opgeslagen>Wordt ook elke twee minuten automatisch bewaard</span></button><button class="optie" data-stad="nieuw"><b>Nieuwe stad</b><span>Begin opnieuw op een lege kaart</span></button><button class="optie" data-stad="voorbeeld"><b>Voorbeeldstad</b><span>Een stad van 10.000 inwoners om te verkennen</span></button>`;
      this.menu.querySelectorAll<HTMLElement>('[data-stad]').forEach(b => (b.onclick = () => this.opStad(b.dataset.stad as 'opslaan' | 'nieuw' | 'voorbeeld')));
      this.fpsEl = this.menu.querySelector('[data-fps]')!;
      this.menu.querySelectorAll<HTMLElement>('[data-k]').forEach(b => (b.onclick = () => { this.regelaar.kies(b.dataset.k as Keuze); tekenMenu(); }));
    };
    tekenMenu();
    this.el.querySelector<HTMLElement>('[data-instel]')!.onclick = e => { e.stopPropagation(); this.menu.classList.toggle('open'); };
    addEventListener('pointerdown', e => { if (!this.menu.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-instel]')) this.menu.classList.remove('open'); });
    // Begrotingspaneel.
    this.begroting = document.createElement('div');
    this.begroting.className = 'instellingen begroting paneel';
    document.body.appendChild(this.begroting);
    this.el.querySelector<HTMLElement>('[data-begroting]')!.onclick = e => { e.stopPropagation(); this.begroting.classList.toggle('open'); this.tekenBegroting(); };
    addEventListener('pointerdown', e => { if (!this.begroting.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-begroting]')) this.begroting.classList.remove('open'); });
    this.nieuwsEl = document.createElement('div');
    this.nieuwsEl.id = 'nieuws';
    document.body.appendChild(this.nieuwsEl);
  }

  private tekenBegroting() {
    if (!this.begroting.classList.contains('open')) return;
    const p = this.w.prognose, v = this.w.vorigeMaand;
    const rij = (n: string, b: number, kl = '') => `<div class="rij ${kl}"><span>${n}</span><b>${b >= 0 ? '' : '−'}€ ${fmt(Math.abs(b))}</b></div>`;
    const tabel = `<div class="menu-kop">Begroting per maand</div>
      <div class="groep">Inkomsten</div>
      ${rij('Woonlasten (OZB, riool, afval)', p.woonlasten)}${rij('OZB bedrijven', p.bedrijfslasten)}${rij('Gemeentefonds', p.gemeentefonds)}${p.export ? rij('Heffing op export', p.export) : ''}
      <div class="groep">Uitgaven</div>
      ${rij('Voorzieningen', -p.voorzieningen)}${rij('Onderhoud wegen', -p.wegen)}${p.nuts ? rij('Nutsvoorzieningen', -p.nuts) : ''}${p.inkoop ? rij('Inkoop stroom, water, afval', -p.inkoop) : ''}
      ${rij('Saldo', p.saldo, p.saldo >= 0 ? 'plus' : 'min')}
      ${v ? `<div class="fps">Vorige maand: ${v.saldo >= 0 ? '+' : '−'}€ ${fmt(Math.abs(v.saldo))}</div>` : ''}`;
    if (!this.schuiversGetekend) {
      this.begroting.innerHTML = `<div data-tabel></div>
        <div class="menu-kop" style="margin-top:10px">Lokale lasten</div>
        ${[['wonen', 'Woonlasten'], ['bedrijven', 'OZB bedrijven']].map(([k, n]) => `<label class="schuif"><span>${n}</span><input type="range" min="50" max="150" step="5" data-t="${k}"><b data-tw="${k}"></b></label>`).join('')}
        <div class="fps">Hogere lasten: meer inkomsten, maar minder vraag naar wonen of bedrijven.</div>`;
      this.begroting.querySelectorAll<HTMLInputElement>('[data-t]').forEach(inp => {
        inp.value = String(Math.round((this.w.tarieven as unknown as Record<string, number>)[inp.dataset.t!] * 100));
        inp.oninput = () => { (this.w.tarieven as unknown as Record<string, number>)[inp.dataset.t!] = Number(inp.value) / 100; this.w.berekenStatistiek(); this.tekenBegroting(); };
      });
      this.schuiversGetekend = true;
    }
    this.begroting.querySelector('[data-tabel]')!.innerHTML = tabel;
    this.begroting.querySelectorAll<HTMLElement>('[data-tw]').forEach(b => (b.textContent = Math.round((this.w.tarieven as unknown as Record<string, number>)[b.dataset.tw!] * 100) + '%'));
  }

  fps(r: KwaliteitRegelaar) {
    if (this.fpsEl) this.fpsEl.textContent = `${Math.round(r.fps)} fps · ${r.keuze === 'auto' ? 'auto, ' : ''}${r.sfeer.niveau}`;
  }

  werkBij() {
    const w = this.w, s = w.stat;
    const d = new Date(2026, 0, 1); d.setDate(d.getDate() + Math.floor(w.dagen));
    this.v.naam.textContent = w.naam;
    this.v.datum.textContent = d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    this.v.inw.textContent = fmt(s.inwoners);
    this.v.geld.textContent = geldFmt(w.geld);
    const sd = w.prognose.saldo;
    this.v.saldo.textContent = `${sd >= 0 ? '+' : '−'}${geldFmt(Math.abs(sd)).replace('€ ', '€')}/mnd`;
    this.v.saldo.className = sd >= 0 ? 'plus' : 'min';
    this.tekenBegroting();
    this.v.won.textContent = fmt(s.woningen);
    this.v.banen.textContent = fmt(s.banen);
    this.v.wl.textContent = (s.werkloosheid * 100).toFixed(1) + '%';
    const vk = this.w.verkeer;
    if (this.v.vk) { this.v.vk.textContent = vk.voertuigen.size ? `${Math.round(vk.doorstroming * 100)}%` : '–'; (this.v.vk.parentElement as HTMLElement).title = `Doorstroming verkeer: ${Math.round(vk.doorstroming * 100)}% · ${vk.voertuigen.size} voertuigen onderweg`; }
    const t = w.tevredenheid;
    this.v.tev.textContent = t + '%';
    this.v.gezicht.innerHTML = gezicht(t);
    for (const [k, e] of Object.entries(this.staven)) e.style.height = Math.round((w.vraag as unknown as Record<string, number>)[k] * 100) + '%';
    for (const k of this.knoppen) k.classList.toggle('aan', Number(k.dataset.s) === w.snelheid);
    // Nieuws: de laatste vier berichten, nieuwe schuiven erbij.
    const laatste = w.nieuws[w.nieuws.length - 1];
    if (laatste && laatste.id !== this.laatsteNieuws) {
      this.laatsteNieuws = laatste.id;
      const icoon = { weg: ICOON.weg, bouw: ICOON.huis, mijlpaal: ICOON.vlag, waarschuwing: ICOON.let };
      this.nieuwsEl.innerHTML = `<div class="nieuws-kop"><span class="ic">${ICOON.krant}</span>${w.naam} Courant</div>` + w.nieuws.slice(-4).reverse().map((n, i) => {
        const dd = new Date(2026, 0, 1); dd.setDate(dd.getDate() + Math.floor(n.dag));
        return `<div class="bericht ${n.soort} ${i === 0 ? 'nieuw' : ''}"><span class="ic">${icoon[n.soort]}</span><span>${n.tekst}</span><time>${dd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</time></div>`;
      }).join('');
    }
    this.nieuwsEl.style.display = w.nieuws.length ? 'block' : 'none';
  }
}
