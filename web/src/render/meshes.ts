import * as THREE from 'three';
import type { MeshData } from '../core/geom/mesh';
import { Materialen } from './materialen';
import { materiaal } from '../core/materialen';

/** MeshData (één groep per materiaal) → één three.js-mesh met materiaalgroepen. */
export function naarMesh(data: MeshData, mats: Materialen, schaduw = true, bron = ''): THREE.Mesh | null {
  if (!data.groepen.length) return null;
  for (const g of data.groepen) if (g.posities.some(v => !Number.isFinite(v))) { console.warn(`NaN in mesh ${bron} (${g.materiaal})`); return null; }
  let nv = 0, ni = 0;
  for (const g of data.groepen) { nv += g.posities.length / 3; ni += g.indices.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const geo = new THREE.BufferGeometry();
  const materialen: THREE.Material[] = [];
  let ov = 0, oi = 0, werpt = false;
  data.groepen.forEach((g, k) => {
    pos.set(g.posities, ov * 3); nrm.set(g.normalen, ov * 3); uv.set(g.uvs, ov * 2);
    for (let i = 0; i < g.indices.length; i++) idx[oi + i] = g.indices[i] + ov;
    geo.addGroup(oi, g.indices.length, k);
    materialen.push(mats.haal(g.materiaal));
    if (materiaal(g.materiaal).schaduw !== false) werpt = true;
    ov += g.posities.length / 3; oi += g.indices.length;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  const m = new THREE.Mesh(geo, materialen);
  m.castShadow = schaduw && werpt; m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}

export function weg(obj: THREE.Object3D | undefined | null) {
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
}
