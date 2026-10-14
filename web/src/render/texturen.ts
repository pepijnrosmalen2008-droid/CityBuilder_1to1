import * as THREE from 'three';
import type { TexData } from '../core/tex/doek';

export interface TexSet { map: THREE.DataTexture; normalMap?: THREE.DataTexture; ormMap?: THREE.DataTexture; alfa: boolean }

/** Vraagt texturen aan bij een pool van webworkers en zet ze om naar three.js-texturen. */
export class TextuurBron {
  private workers: Worker[] = [];
  private wachtrij: { id: number; sleutel: string }[] = [];
  private bezig = new Map<Worker, number>();
  private klaar = new Map<string, TexSet>();
  private wachtend = new Map<string, ((t: TexSet) => void)[]>();
  private ids = new Map<number, string>();
  private volgende = 1;
  anisotropie = 8;
  open = 0;

  constructor(aantal = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < aantal; i++) {
      const w = new Worker(new URL('./texworker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; t: TexData }>) => this.ontvang(w, e.data.id, e.data.t);
      this.workers.push(w);
    }
  }

  haal(sleutel: string, cb: (t: TexSet) => void) {
    const k = this.klaar.get(sleutel);
    if (k) { cb(k); return; }
    const w = this.wachtend.get(sleutel);
    if (w) { w.push(cb); return; }
    this.wachtend.set(sleutel, [cb]);
    const id = this.volgende++;
    this.ids.set(id, sleutel);
    this.wachtrij.push({ id, sleutel });
    this.open++;
    this.pomp();
  }

  /** Alles wat nu in de wachtrij staat is klaar. */
  wacht(): Promise<void> {
    return new Promise(res => { const tik = () => (this.open === 0 ? res() : setTimeout(tik, 50)); tik(); });
  }

  private pomp() {
    for (const w of this.workers) {
      if (this.bezig.has(w) || !this.wachtrij.length) continue;
      const taak = this.wachtrij.shift()!;
      this.bezig.set(w, taak.id);
      w.postMessage(taak);
    }
  }

  private ontvang(w: Worker, id: number, t: TexData) {
    this.bezig.delete(w);
    const sleutel = this.ids.get(id)!;
    this.ids.delete(id);
    const maak = (data: Uint8ClampedArray, srgb: boolean) => {
      const tex = new THREE.DataTexture(data, t.b, t.h, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true; tex.anisotropy = this.anisotropie;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.needsUpdate = true;
      return tex;
    };
    const set: TexSet = { map: maak(t.albedo, true), normalMap: t.normaal && maak(t.normaal, false), ormMap: t.orm && maak(t.orm, false), alfa: t.alfa };
    this.klaar.set(sleutel, set);
    for (const cb of this.wachtend.get(sleutel) ?? []) cb(set);
    this.wachtend.delete(sleutel);
    this.open--;
    this.pomp();
  }
}
