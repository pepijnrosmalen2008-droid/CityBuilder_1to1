import * as THREE from 'three';
import type { Prop } from '../core/geom/mesh';
import { propMesh, isBoom, KLEIN_MEUBILAIR } from '../core/geom/props';
import { Materialen } from './materialen';
import { naarMesh } from './meshes';
import { hash01 } from '../core/rng';

const VAK = 512;
/** Afstanden (tot het midden van een vak) voor detailniveau 1 en 2. */
const LOD1 = 260, LOD2 = 720, LOD3 = 1300;
const niveauVoor = (d: number) => (d > LOD3 ? 3 : d > LOD2 ? 2 : d > LOD1 ? 1 : 0);
const vakVan = (x: number, z: number) => (Math.floor(x / VAK) + 100) * 1000 + (Math.floor(z / VAK) + 100);
const vakMidden = (v: number) => new THREE.Vector3((Math.floor(v / 1000) - 100 + 0.5) * VAK, 0, ((v % 1000) - 100 + 0.5) * VAK);

interface Model { geo: THREE.BufferGeometry; mat: THREE.Material[] }

/** Alle bomen en straatmeubilair als instanties, per vak van 256 m en per model. */
export class PropLaag {
  groep = new THREE.Group();
  private bronnen = new Map<string, { props: Prop[]; vakken: Set<number> }>();
  private vakInhoud = new Map<number, Set<string>>();
  private vuil = new Set<number>();
  private meshes = new Map<number, THREE.InstancedMesh[]>();
  private gebouwdBij = new Map<number, THREE.Vector3>();
  private modellen = new Map<string, Model>();
  private klok = 0;

  constructor(private mats: Materialen) {}

  private model(soort: string, variant: number, niveau: number): Model {
    const k = `${soort}|${variant}|${isBoom(soort) ? niveau : 0}`;
    let m = this.modellen.get(k);
    if (!m) {
      const mesh = naarMesh(propMesh(soort, variant, niveau), this.mats)!;
      m = { geo: mesh.geometry, mat: mesh.material as THREE.Material[] };
      this.modellen.set(k, m);
    }
    return m;
  }

  zet(eigenaar: string, props: Prop[]) {
    this.wis(eigenaar);
    if (!props.length) return;
    const vakken = new Set<number>();
    for (const p of props) vakken.add(vakVan(p.x, p.z));
    this.bronnen.set(eigenaar, { props, vakken });
    for (const v of vakken) {
      let s = this.vakInhoud.get(v); if (!s) this.vakInhoud.set(v, s = new Set());
      s.add(eigenaar); this.vuil.add(v);
    }
  }

  wis(eigenaar: string) {
    const b = this.bronnen.get(eigenaar);
    if (!b) return;
    for (const v of b.vakken) { this.vakInhoud.get(v)?.delete(eigenaar); this.vuil.add(v); }
    this.bronnen.delete(eigenaar);
  }

  /** Een vak opbouwen; het detailniveau wordt per boom gekozen op afstand van de camera. */
  private bouwVak(v: number, cam: THREE.Vector3) {
    for (const m of this.meshes.get(v) ?? []) { this.groep.remove(m); m.dispose(); }
    this.meshes.delete(v);
    const perModel = new Map<string, Prop[]>();
    for (const e of this.vakInhoud.get(v) ?? []) for (const p of this.bronnen.get(e)!.props) {
      if (vakVan(p.x, p.z) !== v) continue;
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const boom = isBoom(p.soort);
      if (!boom && d > 900) continue; // lantaarnpalen zie je ver weg niet
      if (KLEIN_MEUBILAIR.has(p.soort) && d > 260) continue; // bankjes en paaltjes alleen dichtbij
      const niveau = boom ? niveauVoor(d) : 0;
      const k = `${p.soort}|${niveau === 0 || !boom ? p.variant : 0}|${niveau}`;
      let l = perModel.get(k); if (!l) perModel.set(k, l = []); l.push(p);
    }
    const lijst: THREE.InstancedMesh[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), as = new THREE.Vector3(0, 1, 0), kleur = new THREE.Color();
    for (const [k, props] of perModel) {
      const [soort, variant, nv] = k.split('|');
      const niveau = Number(nv);
      const mdl = this.model(soort, Number(variant), niveau);
      const im = new THREE.InstancedMesh(mdl.geo, mdl.mat, props.length);
      const boom = isBoom(soort);
      props.forEach((p, i) => {
        q.setFromAxisAngle(as, p.rot); s.setScalar(p.schaal); pos.set(p.x, p.y, p.z);
        im.setMatrixAt(i, m4.compose(pos, q, s));
        if (boom) {
          const h = hash01(Math.round(p.x * 10), Math.round(p.z * 10), 3);
          kleur.setRGB(0.86 + h * 0.24, 0.9 + h * 0.16, 0.82 + (1 - h) * 0.2);
          im.setColorAt(i, kleur);
        }
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      // Alleen dichtbij schaduw werpen; verder weg zie je dat toch niet.
      im.castShadow = niveau === 0; im.receiveShadow = niveau === 0;
      im.matrixAutoUpdate = false;
      lijst.push(im); this.groep.add(im);
    }
    this.meshes.set(v, lijst);
    this.gebouwdBij.set(v, cam.clone());
  }

  /** Vuile vakken herbouwen, en vakken in de buurt opnieuw indelen als de camera flink verschoof. */
  werkBij(cam: THREE.Vector3, dt: number, alles = false): boolean {
    this.klok += dt;
    const vakken = new Set(this.vuil);
    this.vuil.clear();
    if (this.klok > 0.3 || alles) {
      this.klok = 0;
      for (const v of this.vakInhoud.keys()) {
        const b = this.gebouwdBij.get(v);
        if (!b) { vakken.add(v); continue; }
        // Alleen vakken waar een grens van een detailniveau doorheen kan lopen.
        const d = vakMidden(v).setY(cam.y * 0.3).distanceTo(cam);
        if (d - VAK * 0.75 > LOD3 + 100 && b.distanceTo(cam) < 400) continue;
        if (b.distanceTo(cam) > 80) vakken.add(v);
      }
    }
    const lijst = [...vakken].sort((a, b) => vakMidden(a).distanceTo(cam) - vakMidden(b).distanceTo(cam));
    const max = alles ? lijst.length : 2;
    lijst.forEach((v, i) => { if (i >= max) this.vuil.add(v); else this.bouwVak(v, cam); });
    return lijst.length > 0;
  }
}
