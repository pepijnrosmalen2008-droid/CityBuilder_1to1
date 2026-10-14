import * as THREE from 'three';
import type { Prop } from '../core/geom/mesh';
import { propMesh, isBoom } from '../core/geom/props';
import { Materialen } from './materialen';
import { naarMesh } from './meshes';
import { hash01 } from '../core/rng';

const VAK = 256;
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
  private lod = new Map<number, boolean>();
  private modellen = new Map<string, Model>();
  private klok = 0;

  constructor(private mats: Materialen) {}

  private model(soort: string, variant: number, laag: boolean): Model {
    const k = `${soort}|${variant}|${laag && isBoom(soort) ? 1 : 0}`;
    let m = this.modellen.get(k);
    if (!m) {
      const mesh = naarMesh(propMesh(soort, variant, laag), this.mats)!;
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

  private bouwVak(v: number, laag: boolean) {
    for (const m of this.meshes.get(v) ?? []) { this.groep.remove(m); m.dispose(); }
    this.meshes.delete(v);
    const perModel = new Map<string, Prop[]>();
    for (const e of this.vakInhoud.get(v) ?? []) for (const p of this.bronnen.get(e)!.props) {
      if (vakVan(p.x, p.z) !== v) continue;
      const k = `${p.soort}|${p.variant}`;
      let l = perModel.get(k); if (!l) perModel.set(k, l = []); l.push(p);
    }
    const lijst: THREE.InstancedMesh[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), as = new THREE.Vector3(0, 1, 0), kleur = new THREE.Color();
    for (const [k, props] of perModel) {
      const [soort, variant] = k.split('|');
      const mdl = this.model(soort, Number(variant), laag);
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
      im.castShadow = true; im.receiveShadow = true;
      im.matrixAutoUpdate = false;
      lijst.push(im); this.groep.add(im);
    }
    this.meshes.set(v, lijst);
    this.lod.set(v, laag);
  }

  /** Vuile vakken herbouwen en het detailniveau bijstellen op afstand van de camera. */
  werkBij(cam: THREE.Vector3, dt: number, alles = false) {
    this.klok += dt;
    const vakken = new Set(this.vuil);
    this.vuil.clear();
    if (this.klok > 0.4 || alles) {
      this.klok = 0;
      for (const v of this.vakInhoud.keys()) {
        const laag = vakMidden(v).setY(cam.y * 0.3).distanceTo(cam) > 750;
        if (this.lod.get(v) !== laag) vakken.add(v);
      }
    }
    const lijst = [...vakken];
    const max = alles ? lijst.length : 12;
    lijst.forEach((v, i) => {
      if (i >= max) { this.vuil.add(v); return; }
      this.bouwVak(v, vakMidden(v).setY(cam.y * 0.3).distanceTo(cam) > 750);
    });
  }
}
