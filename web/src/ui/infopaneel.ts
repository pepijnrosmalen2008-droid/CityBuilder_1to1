import { Wereld, Gebouw, totaleHoogte } from '../core/wereld';
import { DIENSTEN, Nut, NUT_NAAM, NUT_EENHEID } from '../core/voorzieningen';
import { Grondwaarde } from '../core/waarde';
import { banenTotaal } from '../core/zones';

// Infopaneel zoals in Cities: Skylines: klik in Kijken op een gebouw of voorziening.

const VORM_NAAM: Record<string, string> = { rijwoningen: 'Rijwoningen', appartementen: 'Appartementen', winkelsMetWonen: 'Winkels met woningen', kantoortoren: 'Kantoorgebouw', bedrijfshal: 'Bedrijfshal' };
const ZONE_NAAM: Record<string, string> = { wonenLaag: 'Laagbouw wonen', wonenHoog: 'Hoogbouw wonen', gemengd: 'Gemengd', kantoor: 'Kantoren', industrie: 'Industrie' };

const balk = (x: number, kleur = '') => `<i class="ip-balk"><u style="width:${Math.round(Math.max(0, Math.min(1, x)) * 100)}%${kleur ? `;background:${kleur}` : ''}"></u></i>`;
const kleurVoor = (x: number) => x > 0.66 ? '#69db7c' : x > 0.33 ? '#ffd43b' : '#ff8787';
const sterren = (n: number) => '<span class="ip-ster">' + '★'.repeat(n) + '<s>' + '★'.repeat(5 - n) + '</s></span>';
const nl = (x: number) => Math.round(x).toLocaleString('nl-NL');

export class InfoPaneel {
  private el: HTMLElement;
  sluit: () => void = () => {};
  sloop: (soort: 'gebouw' | 'dienst', id: number) => void = () => {};
  private huidig: { soort: 'gebouw' | 'dienst'; id: number } | null = null;

  constructor(private w: Wereld) {
    this.el = document.createElement('div');
    this.el.id = 'infopaneel';
    this.el.className = 'paneel';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-sluit]')) this.sluit();
      if (t.closest('[data-sloop]') && this.huidig) this.sloop(this.huidig.soort, this.huidig.id);
    });
  }

  toon(sel: { soort: 'gebouw' | 'dienst'; id: number } | null) {
    this.huidig = sel;
    this.el.style.display = sel ? 'block' : 'none';
    if (sel) this.werkBij();
  }

  /** Huisnummer(s): even/oneven per straatkant, ~12 m per nummer. */
  private adres(g: Gebouw): string {
    const k = this.w.kavels.get(g.kavel);
    const straat = this.w.straatVan(g) || 'Naamloze straat';
    if (!k) return straat;
    const kant = k.zijde > 0 ? 1 : 2;
    const nr = (s: number) => Math.max(1, Math.floor(s / 6) * 2 + kant);
    const s0 = Math.min(...g.kavels.map(id => this.w.kavels.get(id)?.s0 ?? k.s0)), s1 = Math.max(...g.kavels.map(id => this.w.kavels.get(id)?.s1 ?? k.s1));
    const a = nr(s0), b = nr(s1 - 1);
    return g.eenheden > 1 && b > a ? `${straat} ${a}–${b}` : `${straat} ${a}`;
  }

  werkBij() {
    const sel = this.huidig;
    if (!sel) return;
    if (sel.soort === 'gebouw') {
      const g = this.w.gebouwen.get(sel.id);
      if (!g) { this.sluit(); return; }
      this.el.innerHTML = this.gebouwHtml(g);
    } else {
      const d = this.w.voorzieningen.diensten.get(sel.id);
      if (!d) { this.sluit(); return; }
      this.el.innerHTML = this.dienstHtml(d.id);
    }
  }

  private gebouwHtml(g: Gebouw): string {
    const w = this.w;
    const niveau = g.niveau ?? 1;
    const wd = w.grondwaarde.van(g.id);
    const doel = w.grondwaarde.doelNiveau(g);
    const dek = w.hulpdiensten.dekkingVan(g.id);
    const tekort = w.voorzieningen.tekort.get(g.id);
    const inc = [...w.hulpdiensten.incidenten.values()].find(i => i.gebouw === g.id);
    const banen = banenTotaal(g.cap);
    const regels: string[] = [];
    if (!g.klaar) regels.push(`<div class="ip-rij"><span>In aanbouw</span><b>${Math.round(g.voortgang * 100)}%</b></div>${balk(g.voortgang, '#74c0fc')}`);
    else {
      if (g.cap.woningen) regels.push(`<div class="ip-rij"><span>Woningen</span><b>${nl(g.cap.woningen)}</b></div><div class="ip-rij"><span>Bewoners</span><b>${nl(g.cap.bewoners * g.bezetting)} / ${nl(g.cap.bewoners)}</b></div>`);
      if (banen) {
        const b = g.cap.banen;
        const soorten = [['winkel', b.detailhandel], ['horeca', b.horeca], ['kantoor', b.kantoor], ['industrie', b.industrie], ['overig', b.overig]].filter(([, x]) => (x as number) > 0).map(([n, x]) => `${nl(x as number)} ${n}`).join(', ');
        regels.push(`<div class="ip-rij"><span>Banen</span><b>${nl(banen * g.bezetting)} / ${nl(banen)}</b></div><div class="ip-klein">${soorten}${g.specialisatie ? ` · verwerkt ${g.specialisatie}` : ''}</div>`);
      }
      regels.push(`<div class="ip-rij"><span>Bezetting</span><b>${Math.round(g.bezetting * 100)}%</b></div>${balk(g.bezetting, kleurVoor(g.bezetting))}`);
    }
    if (inc) regels.push(`<div class="ip-melding">${inc.soort === 'brand' ? `Brand! ${Math.round(inc.ernst * 100)}% ${inc.inzet ? '· brandweer onderweg' : '· geen brandweer beschikbaar'}` : inc.soort === 'misdaad' ? `Melding van een misdrijf ${inc.inzet ? '· politie onderweg' : ''}` : `Zieke bewoner ${inc.inzet ? '· ambulance onderweg' : ''}`}</div>`);
    // Grondwaarde met de belangrijkste factoren.
    const delen = [...wd.delen].filter(d => Math.abs(d.x) > 0.005).sort((a, b) => Math.abs(b.x) - Math.abs(a.x)).slice(0, 6);
    regels.push(`<h4>Grondwaarde · € ${nl(Grondwaarde.euroPerM2(wd.waarde))}/m²</h4>${balk(wd.waarde, kleurVoor(wd.waarde))}<div class="ip-delen">${delen.map(d => `<span class="${d.x < 0 ? 'min' : 'plus'}">${d.naam} ${d.x > 0 ? '+' : '−'}${Math.round(Math.abs(d.x) * 100)}</span>`).join('')}</div>`);
    regels.push(`<div class="ip-klein">${niveau >= 5 ? 'Hoogste niveau bereikt.' : doel.niveau > niveau ? `Wordt binnenkort opgeknapt naar niveau ${niveau + 1}.` : `Voor niveau ${niveau + 1} nodig: ${doel.mist ?? 'hogere grondwaarde'}.`}</div>`);
    // Voorzieningen.
    if (g.klaar) {
      const nuts: Nut[] = ['stroom', 'water', 'riool', 'afval'];
      regels.push(`<h4>Voorzieningen</h4><div class="ip-nuts">${nuts.map(n => `<span class="${tekort?.has(n) ? 'mis' : 'ok'}">${tekort?.has(n) ? '✕' : '✓'} ${NUT_NAAM[n]}</span>`).join('')}</div>`);
      regels.push(`<h4>Dekking</h4>${[['Brandweer', dek.brand], ['Politie', dek.politie], ['Zorg', dek.zorg]].map(([n, x]) => `<div class="ip-rij"><span>${n}</span>${balk(x as number, kleurVoor(x as number))}</div>`).join('')}`);
    }
    const hoogte = totaleHoogte(g.lagen);
    return `<div class="ip-kop"><div><b>${VORM_NAAM[g.vorm] ?? g.vorm}</b>${sterren(niveau)}<div class="ip-adres">${this.adres(g)}</div><div class="ip-klein">${ZONE_NAAM[g.zone] ?? ''} · ${g.lagen.length} ${g.lagen.length === 1 ? 'laag' : 'lagen'}, ${hoogte.toFixed(0)} m hoog</div></div><button class="knop rond" data-sluit aria-label="Sluiten">×</button></div>${regels.join('')}<div class="ip-knoppen"><button class="knop gevaar" data-sloop>Slopen</button></div>`;
  }

  private dienstHtml(id: number): string {
    const d = this.w.voorzieningen.diensten.get(id)!;
    const info = DIENSTEN[d.soort];
    const regels: string[] = [];
    regels.push(`<div class="ip-klein">${info.uitleg}</div>`);
    if (!d.klaar) regels.push(`<div class="ip-rij"><span>In aanbouw</span><b>${Math.round(d.voortgang * 100)}%</b></div>${balk(d.voortgang, '#74c0fc')}`);
    for (const [n, x] of Object.entries(info.levert) as [Nut, number][]) regels.push(`<div class="ip-rij"><span>${NUT_NAAM[n]}</span><b>${x.toLocaleString('nl-NL')} ${NUT_EENHEID[n]}</b></div>`);
    if (info.dekking) {
      const onderweg = this.w.hulpdiensten.onderweg(d.id);
      regels.push(`<div class="ip-rij"><span>Bereik</span><b>${(info.dekking.bereik / 1000).toLocaleString('nl-NL')} km over de weg</b></div><div class="ip-rij"><span>Voertuigen onderweg</span><b>${onderweg} / ${info.dekking.voertuigen}</b></div>${balk(onderweg / info.dekking.voertuigen, '#74c0fc')}`);
      let n = 0; for (const x of this.w.hulpdiensten.dekking.values()) if (x[info.dekking.soort] > 0.05) n++;
      regels.push(`<div class="ip-rij"><span>Gebouwen in dekking</span><b>${nl(n)}</b></div>`);
    }
    regels.push(`<div class="ip-rij"><span>Onderhoud</span><b>€ ${nl(info.onderhoud)} / maand</b></div>`);
    return `<div class="ip-kop"><div><b>${info.naam}</b><div class="ip-adres">${this.w.net.segmenten.get(d.seg)?.naam ?? ''}</div><div class="ip-klein">${d.klaar ? 'In bedrijf' : 'In aanbouw'}</div></div><button class="knop rond" data-sluit aria-label="Sluiten">×</button></div>${regels.join('')}<div class="ip-knoppen"><button class="knop gevaar" data-sloop>Slopen (20% terug)</button></div>`;
  }
}
