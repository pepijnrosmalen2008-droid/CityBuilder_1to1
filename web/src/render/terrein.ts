import * as THREE from 'three';
import { Terrein, ZEENIVEAU } from '../core/terrain';
import { bouwTerreinVak, aantalVakken, VAK_CELLEN } from '../core/geom/terreinmesh';
import { TextuurBron, TexSet } from './texturen';

/** Terrein in vakken; bodemtexturen worden per hoekpunt gemengd in een aangepaste standaard-shader. */
export class TerreinWeergave {
  groep = new THREE.Group();
  private vakken = new Map<number, THREE.Mesh>();
  materiaal!: THREE.MeshStandardMaterial;
  water!: THREE.Mesh;
  private waterNormaal?: THREE.Texture;

  constructor(private t: Terrein, private bron: TextuurBron) {}

  async init() {
    const sets = await Promise.all(['gras', 'weide', 'bosgrond', 'zand', 'water'].map(k => new Promise<TexSet>(r => this.bron.haal(k, r))));
    const [gras, weide, bos, zand, water] = sets;
    this.materiaal = maakTerreinMateriaal(gras, weide, bos, zand);
    const n = aantalVakken(this.t);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.bouwVak(i, j);
    this.maakWater(water);
  }

  private bouwVak(i: number, j: number) {
    const key = j * 1000 + i;
    const oud = this.vakken.get(key);
    const v = bouwTerreinVak(this.t, i, j);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v.posities, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(v.normalen, 3));
    geo.setAttribute('bodem', new THREE.BufferAttribute(v.bodem, 4));
    geo.setIndex(new THREE.BufferAttribute(v.indices, 1));
    geo.computeBoundingSphere();
    if (oud) { oud.geometry.dispose(); oud.geometry = geo; return; }
    const m = new THREE.Mesh(geo, this.materiaal);
    m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false;
    this.vakken.set(key, m);
    this.groep.add(m);
  }

  /** Vakken opnieuw opbouwen waar het terrein is veranderd (grondverzet onder wegen). */
  werkBij() {
    const vuil = this.t.haalVuil();
    if (!vuil.length) return;
    const n = aantalVakken(this.t), stap = this.t.stap * VAK_CELLEN, half = this.t.grootte / 2;
    const te = new Set<number>();
    for (const r of vuil) {
      const i0 = Math.max(0, Math.floor((r.x0 + half - 4) / stap)), i1 = Math.min(n - 1, Math.floor((r.x1 + half + 4) / stap));
      const j0 = Math.max(0, Math.floor((r.z0 + half - 4) / stap)), j1 = Math.min(n - 1, Math.floor((r.z1 + half + 4) / stap));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) te.add(j * 1000 + i);
    }
    for (const k of te) this.bouwVak(k % 1000, Math.floor(k / 1000));
  }

  private maakWater(w: TexSet) {
    this.waterNormaal = w.map.clone();
    // De waternormal zit in de albedo-plek van de set niet; gebruik de normaalkaart.
    const n = (w.normalMap ?? w.map).clone();
    n.repeat.set(1 / 24, 1 / 24); n.needsUpdate = true;
    this.waterNormaal = n;
    const g = new THREE.PlaneGeometry(this.t.grootte * 3, this.t.grootte * 3, 1, 1);
    g.rotateX(-Math.PI / 2);
    // UV in meters zodat de golven op schaal zijn.
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * this.t.grootte * 3, uv.getY(i) * this.t.grootte * 3);
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1d4250), roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.82, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.2 });
    this.water = new THREE.Mesh(g, m);
    this.water.position.y = ZEENIVEAU;
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
    this.water.userData.geenAO = true;
    this.groep.add(this.water);
  }

  tik(tijd: number) {
    if (this.waterNormaal) this.waterNormaal.offset.set(tijd * 0.004, tijd * 0.0025);
  }
}

function maakTerreinMateriaal(gras: TexSet, weide: TexSet, bos: TexSet, zand: TexSet) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, color: 0xffffff });
  const uniforms = {
    tGras: { value: gras.map }, tWeide: { value: weide.map }, tBos: { value: bos.map }, tZand: { value: zand.map },
    nGras: { value: gras.normalMap }, nBos: { value: bos.normalMap },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 bodem;\nvarying vec4 vBodem;\nvarying vec3 vWereld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBodem = bodem;\nvWereld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tGras, tWeide, tBos, tZand, nGras, nBos;
varying vec4 vBodem;
varying vec3 vWereld;
// Twee schalen mengen tegen zichtbare herhaling.
vec3 laag(sampler2D t, vec2 p, float m) {
  vec3 a = texture2D(t, p / m).rgb;
  vec3 b = texture2D(t, vec2(p.y, -p.x) / (m * 3.7) + 0.31).rgb;
  return mix(a, b, 0.35);
}`)
      .replace('#include <map_fragment>', `
  vec2 p = vWereld.xz;
  vec4 w = vBodem / max(0.001, vBodem.x + vBodem.y + vBodem.z + vBodem.w);
  vec3 kleur = laag(tGras, p, 6.0) * w.x + laag(tWeide, p, 9.0) * w.y + laag(tBos, p, 5.0) * w.z + laag(tZand, p, 7.0) * w.w;
  // Grote vlekken kleurvariatie.
  float vlek = texture2D(tWeide, p / 340.0).g;
  kleur *= mix(0.88, 1.1, vlek);
  // Natte zandrand vlak bij het water.
  kleur *= mix(0.62, 1.0, smoothstep(-0.3, 0.6, vWereld.y));
  diffuseColor.rgb *= kleur;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 nd = (texture2D(nGras, p / 6.0).xyz * 2.0 - 1.0) * (w.x + w.y) + (texture2D(nBos, p / 5.0).xyz * 2.0 - 1.0) * w.z + vec3(0.0, 0.0, 1.0) * w.w;
    // Reliëf langs de wereldassen (het terrein is vrijwel horizontaal).
    vec3 bump = vec3(nd.x, 0.0, -nd.y) * 0.5;
    normal = normalize(normal + (viewMatrix * vec4(bump, 0.0)).xyz);
  }`);
  };
  return m;
}
