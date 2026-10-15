import { Sfeer, Niveau } from './sfeer';

export type Keuze = 'auto' | Niveau;
const VOLGORDE: Niveau[] = ['laag', 'midden', 'hoog'];

/**
 * Houdt de framerate in de gaten. In de stand 'auto' gaat eerst de resolutie omlaag (dynamische
 * resolutie), daarna het niveau; bij ruim voldoende fps weer omhoog.
 */
export class KwaliteitRegelaar {
  keuze: Keuze;
  fps = 60;
  private som = 0; private n = 0; private klok = 0;
  private slecht = 0; private goed = 0;

  constructor(readonly sfeer: Sfeer, keuze: Keuze) { this.keuze = keuze; }

  static startNiveau(keuze: Keuze): Niveau {
    if (keuze !== 'auto') return keuze;
    const aanraak = matchMedia('(pointer: coarse)').matches;
    return aanraak ? 'laag' : 'midden';
  }

  kies(k: Keuze) {
    this.keuze = k;
    try { localStorage.setItem('stad_kwaliteit', k); } catch { /* geen opslag */ }
    this.sfeer.dynamisch = 1;
    this.sfeer.zetNiveau(KwaliteitRegelaar.startNiveau(k));
    this.slecht = this.goed = 0;
  }

  tik(dt: number) {
    this.som += dt; this.n++; this.klok += dt;
    if (this.klok < 1) return;
    this.fps = this.n / this.som;
    this.som = 0; this.n = 0; this.klok = 0;
    if (this.keuze !== 'auto') return;
    const s = this.sfeer;
    if (this.fps < 28) { this.slecht++; this.goed = 0; } else if (this.fps > 52) { this.goed++; this.slecht = 0; } else { this.slecht = 0; this.goed = 0; }
    if (this.slecht >= 2) {
      this.slecht = 0;
      // Resolutie niet verder dan 80% omlaag (daaronder wordt het beeld korrelig); daarna liever een lager niveau.
      if (s.dynamisch > 0.85) { s.dynamisch = Math.max(0.8, s.dynamisch - 0.1); s.pasAan(); }
      else { const i = VOLGORDE.indexOf(s.niveau); if (i > 0) { s.dynamisch = 0.85; s.zetNiveau(VOLGORDE[i - 1]); } }
    } else if (this.goed >= 5) {
      this.goed = 0;
      if (s.dynamisch < 1) { s.dynamisch = Math.min(1, s.dynamisch + 0.1); s.pasAan(); }
      else { const i = VOLGORDE.indexOf(s.niveau); if (i < VOLGORDE.length - 1 && this.fps > 58) { s.dynamisch = 0.85; s.zetNiveau(VOLGORDE[i + 1]); } }
    }
  }
}
