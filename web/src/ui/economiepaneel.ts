import { Wereld } from '../core/wereld';
import { GRONDSTOFFEN, Grondstof } from '../core/economie';

const fmt = (n: number) => Math.round(n).toLocaleString('nl-NL');

/** Overzicht van de productieketens: winning → verwerking → export. */
export class EconomiePaneel {
  private el = document.createElement('div');
  constructor(private w: Wereld) {
    this.el.className = 'instellingen economie paneel';
    document.body.appendChild(this.el);
    addEventListener('pointerdown', e => { if (!this.el.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-eco]')) this.el.classList.remove('open'); });
  }
  wissel() { this.el.classList.toggle('open'); this.werkBij(); }
  werkBij() {
    if (!this.el.classList.contains('open')) return;
    const e = this.w.economie;
    const rijen = (Object.keys(GRONDSTOFFEN) as Grondstof[]).map(s => {
      const k = e.ketens[s], info = GRONDSTOFFEN[s];
      const gebieden = [...e.gebieden.values()].filter(g => g.soort === s).length;
      const bedrijven = [...e.bedrijven.values()].filter(b => b.soort === s && b.klaar).length;
      const pct = k.productie > 0 ? Math.round(k.verwerkt / k.productie * 100) : 0;
      return `<div class="keten">
        <div class="keten-kop"><span class="stip" style="background:${info.kleur}"></span><b>${info.naam}</b><span>${gebieden} gebied${gebieden === 1 ? '' : 'en'} · ${bedrijven} bedrijf${bedrijven === 1 ? '' : 'en'}</span></div>
        <div class="rij"><span>${info.product}</span><b>${fmt(k.productie)} ${info.eenheid}/mnd</b></div>
        <div class="rij"><span>Lokaal verwerkt tot ${info.verwerkt.toLowerCase()}</span><b>${pct}%</b></div>
        <div class="balk"><div style="width:${pct}%;background:${info.kleur}"></div></div>
        <div class="rij"><span>Banen winning / verwerking</span><b>${fmt(k.banenWinning)} / ${fmt(k.banenVerwerking)}</b></div>
        <div class="rij"><span>Exportwaarde</span><b>€ ${fmt(k.waarde)}/mnd</b></div>
      </div>`;
    }).join('');
    this.el.innerHTML = `<div class="menu-kop">Economie van ${this.w.naam}</div>${rijen}
      <div class="fps">Teken gebieden onder Economie (G). Onverwerkte grondstoffen trekken verwerkende industrie aan: wijs industriezones aan om ze lokaal te verwerken (meer banen en waarde).</div>`;
  }
}
