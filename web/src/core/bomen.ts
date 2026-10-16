import { Terrein, bosDichtheid } from './terrain';
import { hash01 } from './rng';
import { V2, puntInPolygoon } from './math';

export type BoomSoort = 'eik' | 'linde' | 'berk' | 'den' | 'plataan';
export const BOOMSOORTEN: BoomSoort[] = ['eik', 'linde', 'berk', 'den', 'plataan'];

/** Alle bomen in de natuur, in vakken van 256 m zodat de render-laag per vak kan bijwerken. */
export class Bomen {
  static VAK = 256;
  x: Float32Array; z: Float32Array; schaal: Float32Array; rot: Float32Array;
  soort: Uint8Array; variant: Uint8Array; levend: Uint8Array;
  n = 0;
  private raster = new Map<number, number[]>(); // 16 m-cellen → boomindices
  private vuileVakken = new Set<number>();

  constructor(readonly terrein: Terrein, seed = 4242) {
    const g = terrein.grootte / 2 - 10, stap = 6.5;
    const cap = Math.ceil((g * 2 / stap) ** 2);
    this.x = new Float32Array(cap); this.z = new Float32Array(cap); this.schaal = new Float32Array(cap); this.rot = new Float32Array(cap);
    this.soort = new Uint8Array(cap); this.variant = new Uint8Array(cap); this.levend = new Uint8Array(cap);
    let i = 0, gx = 0;
    for (let x = -g; x < g; x += stap, gx++) {
      let gz = 0;
      for (let z = -g; z < g; z += stap, gz++) {
        const jx = x + (hash01(gx, gz, seed) - 0.5) * stap * 0.9;
        const jz = z + (hash01(gx, gz, seed + 1) - 0.5) * stap * 0.9;
        const bos = bosDichtheid(jx, jz, terrein);
        const kans = bos * 0.8 + 0.006;
        if (hash01(gx, gz, seed + 2) > kans) continue;
        const h = terrein.hoogte(jx, jz);
        if (h < 1.2 || terrein.normaal(jx, jz).y < 0.8) continue;
        // Naaldbos op de heuvels, loofbos laag, berken aan de randen.
        const s = hash01(gx, gz, seed + 3);
        const hoog = h > 22;
        const soort = hoog ? (s < 0.7 ? 3 : 2) : bos < 0.4 ? (s < 0.5 ? 2 : 0) : (s < 0.45 ? 0 : s < 0.75 ? 1 : s < 0.9 ? 2 : 3);
        this.x[i] = jx; this.z[i] = jz;
        this.schaal[i] = 0.75 + hash01(gx, gz, seed + 4) * 0.55;
        this.rot[i] = hash01(gx, gz, seed + 5) * Math.PI * 2;
        this.soort[i] = soort; this.variant[i] = hash01(gx, gz, seed + 6) < 0.5 ? 0 : 1; this.levend[i] = 1;
        const c = this.cel(jx, jz);
        let lijst = this.raster.get(c); if (!lijst) this.raster.set(c, lijst = []); lijst.push(i);
        i++;
      }
    }
    this.n = i;
    this.nOrig = i;
  }

  /** Aantal natuurbomen bij het maken van de kaart; daarna komen geplante bomen (Move It: plakken). */
  nOrig = 0;

  /** Een nieuwe boom planten; geeft de index. */
  plant(x: number, z: number, soort: number, variant: number, schaal: number, rot: number): number {
    if (this.n >= this.x.length) {
      const groei = <T extends Float32Array | Uint8Array>(a: T): T => { const b = new (a.constructor as new (n: number) => T)(Math.max(64, a.length * 2)); b.set(a); return b; };
      this.x = groei(this.x); this.z = groei(this.z); this.schaal = groei(this.schaal); this.rot = groei(this.rot);
      this.soort = groei(this.soort); this.variant = groei(this.variant); this.levend = groei(this.levend);
    }
    const i = this.n++;
    this.x[i] = x; this.z[i] = z; this.schaal[i] = schaal; this.rot[i] = rot; this.soort[i] = soort; this.variant[i] = variant; this.levend[i] = 1;
    const c = this.cel(x, z);
    let l = this.raster.get(c); if (!l) this.raster.set(c, l = []); l.push(i);
    this.vuileVakken.add(this.vak(x, z));
    return i;
  }
  naarJsonGeplant() { const r: number[][] = []; for (let i = this.nOrig; i < this.n; i++) r.push([this.x[i], this.z[i], this.soort[i], this.variant[i], this.schaal[i], this.rot[i]]); return r; }
  laadGeplant(l: number[][] | undefined) { for (const b of l ?? []) this.plant(b[0], b[1], b[2], b[3], b[4], b[5]); }

  private cel(x: number, z: number) { return (Math.floor(x / 16) + 1000) * 4096 + (Math.floor(z / 16) + 1000); }
  vak(x: number, z: number) { return (Math.floor(x / Bomen.VAK) + 100) * 1000 + (Math.floor(z / Bomen.VAK) + 100); }
  static vakOorsprong(vak: number) { return { x: (Math.floor(vak / 1000) - 100) * Bomen.VAK, z: ((vak % 1000) - 100) * Bomen.VAK }; }

  /** Verwijder bomen waarvoor `raak(x,z)` waar is, binnen de bounding box. */
  wis(x0: number, z0: number, x1: number, z1: number, raak: (x: number, z: number) => boolean) {
    for (let cx = Math.floor(x0 / 16); cx <= Math.floor(x1 / 16); cx++)
      for (let cz = Math.floor(z0 / 16); cz <= Math.floor(z1 / 16); cz++) {
        const lijst = this.raster.get((cx + 1000) * 4096 + (cz + 1000));
        if (!lijst) continue;
        for (const i of lijst) {
          if (!this.levend[i] || !raak(this.x[i], this.z[i])) continue;
          this.levend[i] = 0;
          this.vuileVakken.add(this.vak(this.x[i], this.z[i]));
        }
      }
  }

  /** Gekapte bomen (voor opslaan). */
  gekapt(): number[] { const r: number[] = []; for (let i = 0; i < this.n; i++) if (!this.levend[i]) r.push(i); return r; }
  laadGekapt(lijst: number[]) { for (const i of lijst) if (i < this.n) { this.levend[i] = 0; this.vuileVakken.add(this.vak(this.x[i], this.z[i])); } }

  wisInPolygoon(poly: V2[], marge = 0) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const groot = marge > 0 ? poly.map(p => { const dx = p.x - cx, dz = p.z - cz, l = Math.hypot(dx, dz) || 1; return { x: p.x + dx / l * marge, z: p.z + dz / l * marge }; }) : poly;
    this.wis(x0 - marge, z0 - marge, x1 + marge, z1 + marge, (x, z) => puntInPolygoon({ x, z }, groot));
  }

  // ─── Move It: selecteren, verplaatsen, kappen en terugzetten ───
  /** Verplaatste bomen (index → plek), om op te slaan. */
  verplaatst = new Map<number, { x: number; z: number; rot: number }>();

  /** Levende bomen binnen een polygoon. */
  inPolygoon(poly: V2[]): number[] {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const r: number[] = [];
    for (let cx = Math.floor(x0 / 16); cx <= Math.floor(x1 / 16); cx++)
      for (let cz = Math.floor(z0 / 16); cz <= Math.floor(z1 / 16); cz++)
        for (const i of this.raster.get((cx + 1000) * 4096 + (cz + 1000)) ?? []) if (this.levend[i] && puntInPolygoon({ x: this.x[i], z: this.z[i] }, poly)) r.push(i);
    return r;
  }
  /** Dichtstbijzijnde levende boom binnen `max` m. */
  boomBij(p: V2, max = 3): number | null {
    let best: number | null = null, bd = max;
    for (let cx = Math.floor((p.x - max) / 16); cx <= Math.floor((p.x + max) / 16); cx++)
      for (let cz = Math.floor((p.z - max) / 16); cz <= Math.floor((p.z + max) / 16); cz++)
        for (const i of this.raster.get((cx + 1000) * 4096 + (cz + 1000)) ?? []) {
          if (!this.levend[i]) continue;
          const d = Math.hypot(this.x[i] - p.x, this.z[i] - p.z);
          if (d < bd) { bd = d; best = i; }
        }
    return best;
  }
  zetLevend(ids: number[], aan: boolean) { for (const i of ids) if (i < this.n) { this.levend[i] = aan ? 1 : 0; this.vuileVakken.add(this.vak(this.x[i], this.z[i])); } }
  verplaats(i: number, x: number, z: number, rot = this.rot[i]) {
    if (i >= this.n) return;
    const oud = this.cel(this.x[i], this.z[i]), nieuw = this.cel(x, z);
    this.vuileVakken.add(this.vak(this.x[i], this.z[i]));
    if (oud !== nieuw) {
      const l = this.raster.get(oud); if (l) { const j = l.indexOf(i); if (j >= 0) l.splice(j, 1); }
      let m = this.raster.get(nieuw); if (!m) this.raster.set(nieuw, m = []); m.push(i);
    }
    this.x[i] = x; this.z[i] = z; this.rot[i] = rot;
    this.verplaatst.set(i, { x, z, rot });
    this.vuileVakken.add(this.vak(x, z));
  }
  stand(ids: number[]) { return ids.map(i => ({ i, x: this.x[i], z: this.z[i], rot: this.rot[i], levend: !!this.levend[i] })); }
  zetStand(lijst: { i: number; x: number; z: number; rot: number; levend: boolean }[]) {
    for (const b of lijst) { if (this.x[b.i] !== b.x || this.z[b.i] !== b.z || this.rot[b.i] !== b.rot) this.verplaats(b.i, b.x, b.z, b.rot); this.zetLevend([b.i], b.levend); }
  }
  naarJsonVerplaatst() { return [...this.verplaatst]; }
  laadVerplaatst(l: [number, { x: number; z: number; rot: number }][] | undefined) { for (const [i, p] of l ?? []) this.verplaats(i, p.x, p.z, p.rot); }

  haalVuileVakken() { const v = [...this.vuileVakken]; this.vuileVakken.clear(); return v; }
  alleVakken() { const s = new Set<number>(); for (let i = 0; i < this.n; i++) s.add(this.vak(this.x[i], this.z[i])); return [...s]; }

  /** Indices van levende bomen in één vak. */
  inVak(vak: number): number[] {
    const o = Bomen.vakOorsprong(vak), r: number[] = [];
    for (let cx = Math.floor(o.x / 16); cx < Math.floor((o.x + Bomen.VAK) / 16); cx++)
      for (let cz = Math.floor(o.z / 16); cz < Math.floor((o.z + Bomen.VAK) / 16); cz++) {
        const lijst = this.raster.get((cx + 1000) * 4096 + (cz + 1000));
        if (lijst) for (const i of lijst) if (this.levend[i]) r.push(i);
      }
    return r;
  }
}
