import * as THREE from 'three';
import type { MeshData } from '../core/geom/mesh';
import { Materialen } from './materialen';
import { materiaal } from '../core/materialen';
import type { VakGeometrie } from './tegelworker';

/** MeshData (één groep per materiaal) → één three.js-mesh met materiaalgroepen. */
export function naarMesh(data: MeshData, mats: Materialen, schaduw = true, bron = ''): THREE.Mesh | null {
  if (!data.groepen.length) return null;
  for (const g of data.groepen) if (g.posities.some(v => !Number.isFinite(v))) { console.warn(`NaN in mesh ${bron} (${g.materiaal})`); return null; }
  let nv = 0, ni = 0;
  for (const g of data.groepen) { nv += g.posities.length / 3; ni += g.indices.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const kl = data.groepen.some(g => g.kleuren) ? new Float32Array(nv * 3).fill(1) : null;
  const la = data.groepen.some(g => g.lagen) ? new Float32Array(nv) : null;
  const rm = data.groepen.some(g => g.rm) ? new Float32Array(nv * 2).fill(0.8) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const geo = new THREE.BufferGeometry();
  const materialen: THREE.Material[] = [];
  let ov = 0, oi = 0, werpt = false;
  data.groepen.forEach((g, k) => {
    pos.set(g.posities, ov * 3); nrm.set(g.normalen, ov * 3); uv.set(g.uvs, ov * 2);
    if (kl && g.kleuren) kl.set(g.kleuren, ov * 3);
    if (la && g.lagen) la.set(g.lagen, ov);
    if (rm && g.rm) rm.set(g.rm, ov * 2);
    for (let i = 0; i < g.indices.length; i++) idx[oi + i] = g.indices[i] + ov;
    geo.addGroup(oi, g.indices.length, k);
    materialen.push(mats.haal(g.materiaal));
    if (materiaal(g.materiaal).schaduw !== false) werpt = true;
    ov += g.posities.length / 3; oi += g.indices.length;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (kl) geo.setAttribute('color', new THREE.BufferAttribute(kl, 3));
  if (la) geo.setAttribute('atlaslaag', new THREE.BufferAttribute(la, 1));
  if (rm) geo.setAttribute('rm', new THREE.BufferAttribute(rm, 2));
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

/**
 * Schaduwvervanger: alle schaduwwerpende driehoeken als één geometrie zonder materiaalgroepen
 * (één tekenopdracht in de schaduwpass i.p.v. tientallen). Alleen zichtbaar voor de zonnecamera (laag 1).
 */
export const SCHADUWLAAG = 1;
const schaduwMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
export function schaduwMesh(data: MeshData): THREE.Mesh | null {
  const gs = data.groepen.filter(g => { const d = materiaal(g.materiaal); return d.schaduw !== false && d.alfa === undefined && !g.materiaal.startsWith('autoglas'); });
  if (!gs.length) return null;
  let nv = 0, ni = 0;
  for (const g of gs) { nv += g.posities.length / 3; ni += g.indices.length; }
  const pos = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const g of gs) { pos.set(g.posities, ov * 3); for (let i = 0; i < g.indices.length; i++) idx[oi + i] = g.indices[i] + ov; ov += g.posities.length / 3; oi += g.indices.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, schaduwMat);
  m.castShadow = true; m.receiveShadow = false; m.matrixAutoUpdate = false;
  m.layers.set(SCHADUWLAAG);
  return m;
}

/** Mesh uit de buffers die de vakkenworker teruggeeft (alleen nog attributen maken: goedkoop). */
export function meshUitBuffers(g: VakGeometrie, mats: Materialen): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
  if (g.kl) geo.setAttribute('color', new THREE.BufferAttribute(g.kl, 3));
  if (g.la) geo.setAttribute('atlaslaag', new THREE.BufferAttribute(g.la, 1));
  if (g.rm) geo.setAttribute('rm', new THREE.BufferAttribute(g.rm, 2));
  geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
  const materialen = g.groepen.map((x, i) => { geo.addGroup(x.start, x.aantal, i); return mats.haal(x.materiaal); });
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, materialen);
  m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false;
  return m;
}

export function schaduwUitBuffers(s: { pos: Float32Array; idx: Uint32Array }): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(s.pos, 3));
  geo.setIndex(new THREE.BufferAttribute(s.idx, 1));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, schaduwMat);
  m.castShadow = true; m.receiveShadow = false; m.matrixAutoUpdate = false;
  m.layers.set(SCHADUWLAAG);
  return m;
}
