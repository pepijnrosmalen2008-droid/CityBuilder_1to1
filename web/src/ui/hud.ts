import { Wereld } from '../core/wereld';
import { ICOON, gezicht, wapen } from './iconen';

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

  constructor(private w: Wereld) {
    this.el.innerHTML = `
      <div class="kaart stadskaart paneel">
        <div class="wapen">${wapen(w.seed + 11)}</div>
        <div><div class="stadsnaam" title="Klik om de naam te wijzigen" data-v="naam"></div><div class="datum" data-v="datum"></div></div>
        <div class="inw"><span class="ic">${ICOON.mensen}</span><b data-v="inw"></b></div>
      </div>
      <div class="kaart cijfers paneel">
        <div class="cijfer" title="Begroting"><span class="ic geel">${ICOON.munt}</span><b data-v="geld"></b></div>
        <div class="cijfer" title="Woningen"><span class="ic">${ICOON.huis}</span><b data-v="won"></b></div>
        <div class="cijfer" title="Banen"><span class="ic">${ICOON.koffer}</span><b data-v="banen"></b></div>
        <div class="cijfer" title="Werkloosheid"><span class="ic">${ICOON.grafiek}</span><b data-v="wl"></b></div>
        <div class="cijfer" title="Tevredenheid van de inwoners"><span class="ic" data-v="gezicht"></span><b data-v="tev"></b></div>
      </div>
      <div class="kaart bediening paneel">
        <div class="snelheid">${[0, 1, 2, 4].map(s => `<button class="knop rond" data-s="${s}" title="${s ? s + '× snelheid' : 'Pauze (spatie)'}">${s === 0 ? ICOON.pauze : '<span class="snel">' + '›'.repeat(s === 4 ? 3 : s) + '</span>'}</button>`).join('')}</div>
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
    this.nieuwsEl = document.createElement('div');
    this.nieuwsEl.id = 'nieuws';
    document.body.appendChild(this.nieuwsEl);
  }

  werkBij() {
    const w = this.w, s = w.stat;
    const d = new Date(2026, 0, 1); d.setDate(d.getDate() + Math.floor(w.dagen));
    this.v.naam.textContent = w.naam;
    this.v.datum.textContent = d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    this.v.inw.textContent = fmt(s.inwoners);
    this.v.geld.textContent = geldFmt(w.geld);
    this.v.won.textContent = fmt(s.woningen);
    this.v.banen.textContent = fmt(s.banen);
    this.v.wl.textContent = (s.werkloosheid * 100).toFixed(1) + '%';
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
