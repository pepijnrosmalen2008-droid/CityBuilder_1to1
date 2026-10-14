import { Wereld } from '../core/wereld';

const fmt = (n: number) => Math.round(n).toLocaleString('nl-NL');

/** Bovenbalk: datum, geld, inwoners, banen, werkloosheid, snelheid en de vraagbalken (W/D/K/I). */
export class Hud {
  private el = document.getElementById('hud')!;
  private velden: Record<string, HTMLElement> = {};
  private staven: Record<string, HTMLElement> = {};
  private knoppen: HTMLElement[] = [];

  constructor(private w: Wereld) {
    this.el.className = 'paneel';
    const blok = (id: string, label: string) => `<div class="hud-blok"><div class="hud-label">${label}</div><div class="hud-waarde" data-v="${id}">–</div></div>`;
    this.el.innerHTML = `
      ${blok('datum', 'Datum')}${blok('geld', 'Begroting')}${blok('inw', 'Inwoners')}${blok('won', 'Woningen')}${blok('banen', 'Banen')}${blok('wl', 'Werkloosheid')}
      <div class="snelheid">${[0, 1, 2, 4].map(s => `<button class="knop" data-s="${s}">${s === 0 ? '❚❚' : s + '×'}</button>`).join('')}</div>
      <div class="vraag" title="Vraag naar wonen, detailhandel, kantoren en industrie">
        ${[['W', 'wonen', '#51cf66'], ['D', 'detailhandel', '#4dabf7'], ['K', 'kantoor', '#9775fa'], ['I', 'industrie', '#fcc419']].map(([l, k, c]) =>
          `<div class="vraag-kolom"><div class="vraag-staaf"><div data-q="${k}" style="background:${c}"></div></div><div class="vraag-letter">${l}</div></div>`).join('')}
      </div>`;
    this.el.querySelectorAll<HTMLElement>('[data-v]').forEach(e => (this.velden[e.dataset.v!] = e));
    this.el.querySelectorAll<HTMLElement>('[data-q]').forEach(e => (this.staven[e.dataset.q!] = e));
    this.el.querySelectorAll<HTMLElement>('[data-s]').forEach(e => {
      this.knoppen.push(e);
      e.onclick = () => { this.w.snelheid = Number(e.dataset.s); this.werkBij(); };
    });
    addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); this.w.snelheid = this.w.snelheid ? 0 : 1; }
      if (e.key === '+' && e.ctrlKey) this.w.snelheid = Math.min(4, this.w.snelheid * 2 || 1);
    });
  }

  werkBij() {
    const w = this.w, s = w.stat;
    const d = new Date(2026, 0, 1); d.setDate(d.getDate() + Math.floor(w.dagen));
    this.velden.datum.textContent = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
    this.velden.geld.textContent = '€ ' + fmt(w.geld);
    this.velden.inw.textContent = fmt(s.inwoners);
    this.velden.won.textContent = fmt(s.woningen);
    this.velden.banen.textContent = fmt(s.banen);
    this.velden.wl.textContent = (s.werkloosheid * 100).toFixed(1) + '%';
    for (const [k, e] of Object.entries(this.staven)) e.style.height = Math.round((w.vraag as unknown as Record<string, number>)[k] * 100) + '%';
    for (const k of this.knoppen) k.classList.toggle('aan', Number(k.dataset.s) === w.snelheid);
  }
}
