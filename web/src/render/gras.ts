import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { WEGTYPEN, totaleBreedte } from '../core/wegen/typen';
import { ZEENIVEAU } from '../core/terrain';

// ════════════════════════════════════════════════════════════════════════════════════
// GRAS EN BLOEMEN DICHTBIJ
// Eén instanced mesh met grasplukjes op een raster rond het kijkpunt. Alles gebeurt in de shader:
// het raster schuift in stappen mee (geen zwemmen), elk plukje krijgt een vaste plek per wereldcel,
// staat op het terrein (hoogtetextuur), buigt in de wind en vervaagt naar de rand. Een grasmasker
// (2 m per texel) houdt wegen, gebouwen, verharding, strand en water vrij. Een paar procent van
// de plukjes bloeit (gele, witte en paarse toppen). Alleen ingezoomd en vanaf 'midden'.
// ════════════════════════════════════════════════════════════════════════════════════

const STAP = 0.5, RMAX = 40, MASKER = 1024;

export class GrasWeergave {
  mesh: THREE.Mesh;
  private masker: THREE.DataTexture;
  private hoogte: THREE.DataTexture;
  private uni = { uDoel: { value: new THREE.Vector2() }, uR: { value: 30 }, uTijd: { value: 0 }, uG: { value: 2048 }, uN: { value: 513 }, tMasker: { value: null as THREE.Texture | null }, tHoogte: { value: null as THREE.Texture | null } };
  private sleutel = '';
  private klok = 99;

  constructor(private w: Wereld) {
    const t = w.terrein;
    this.uni.uG.value = t.grootte; this.uni.uN.value = t.n;
    this.hoogte = new THREE.DataTexture(t.h, t.n, t.n, THREE.RedFormat, THREE.FloatType);
    this.hoogte.minFilter = this.hoogte.magFilter = THREE.NearestFilter; this.hoogte.needsUpdate = true;
    this.masker = new THREE.DataTexture(new Uint8Array(MASKER * MASKER), MASKER, MASKER, THREE.RedFormat, THREE.UnsignedByteType);
    this.masker.minFilter = this.masker.magFilter = THREE.LinearFilter; this.masker.needsUpdate = true;
    this.uni.tMasker.value = this.masker; this.uni.tHoogte.value = this.hoogte;

    // Plukje: vijf sprieten (smalle driehoeken met een knik), elk 2 driehoeken.
    const pos: number[] = [], top: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + i * 0.7, r = 0.06 + (i % 3) * 0.05, h = 0.3 + ((i * 37) % 10) / 30;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, bx = -Math.sin(a) * 0.035, bz = Math.cos(a) * 0.035;
      const lx = cx + Math.cos(a) * h * 0.35, lz = cz + Math.sin(a) * h * 0.35;
      // onder-links, onder-rechts, midden (2 driehoeken), top
      const m = [cx + Math.cos(a) * h * 0.12, h * 0.55, cz + Math.sin(a) * h * 0.12];
      pos.push(cx - bx, 0, cz - bz, cx + bx, 0, cz + bz, m[0] + bx * 0.6, m[1], m[2] + bz * 0.6);
      pos.push(cx - bx, 0, cz - bz, m[0] + bx * 0.6, m[1], m[2] + bz * 0.6, m[0] - bx * 0.6, m[1], m[2] - bz * 0.6);
      top.push(0, 0, 0.55, 0, 0.55, 0.55);
      pos.push(m[0] - bx * 0.6, m[1], m[2] - bz * 0.6, m[0] + bx * 0.6, m[1], m[2] + bz * 0.6, lx, h, lz);
      top.push(0.55, 0.55, 1);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
    const off: number[] = [];
    for (let z = -RMAX; z <= RMAX; z += STAP) for (let x = -RMAX; x <= RMAX; x += STAP) if (x * x + z * z <= RMAX * RMAX) off.push(x, z);
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(off), 2));
    geo.instanceCount = off.length / 2;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = s => {
      Object.assign(s.uniforms, this.uni);
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 aOff; attribute float aTop;
uniform vec2 uDoel; uniform float uR, uTijd, uG, uN; uniform sampler2D tMasker; uniform highp sampler2D tHoogte;
varying float vTop; varying vec3 vKl; varying float vBloem;
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hoogteOp(vec2 p) {
  vec2 g = (p + uG * 0.5) / uG * (uN - 1.0);
  ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
  float a = texelFetch(tHoogte, i, 0).r, b = texelFetch(tHoogte, i + ivec2(1, 0), 0).r;
  float c = texelFetch(tHoogte, i + ivec2(0, 1), 0).r, d = texelFetch(tHoogte, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`)
        .replace('#include <begin_vertex>', `
  vec2 basis = floor(uDoel / ${STAP.toFixed(2)}) * ${STAP.toFixed(2)};
  vec2 cel = basis + aOff;
  float h1 = gh(cel), h2 = gh(cel + 3.7), h3 = gh(cel + 9.1);
  vec2 wp = cel + (vec2(h1, h2) - 0.5) * ${STAP.toFixed(2)};
  float d = length(wp - uDoel);
  float m = texture2D(tMasker, (wp + uG * 0.5) / uG).r;
  float binnenKaart = step(abs(wp.x), uG * 0.5 - 2.0) * step(abs(wp.y), uG * 0.5 - 2.0);
  float plek = smoothstep(0.35, 0.9, m) * (1.0 - smoothstep(uR * 0.7, uR, d)) * binnenKaart;
  // Dichtheid: grote vlekken met hoger en lager gras.
  float vlek = gh(floor(wp / 9.0)) * 0.5 + gh(floor(wp / 3.0) + 1.3) * 0.5;
  float sc = plek * (0.6 + 0.8 * vlek) * (0.75 + 0.5 * h3);
  float hoek = h1 * 6.2832;
  vec3 transformed = vec3(position.x * cos(hoek) - position.z * sin(hoek), position.y * sc, position.x * sin(hoek) + position.z * cos(hoek));
  // Wind: golven over het veld, de top beweegt het meest.
  float wind = sin(uTijd * 1.7 + wp.x * 0.35 + wp.y * 0.21) * 0.5 + sin(uTijd * 2.9 + wp.x * 0.9) * 0.2;
  transformed.xz += vec2(0.8, 0.5) * wind * aTop * aTop * 0.12 * sc;
  transformed += vec3(wp.x, hoogteOp(wp) - 0.04, wp.y);
  vTop = aTop;
  vKl = mix(vec3(0.13, 0.27, 0.05), vec3(0.27, 0.40, 0.09), vlek * 0.6 + h2 * 0.4);
  vBloem = h3 > 0.965 ? floor(gh(cel + 5.5) * 3.0) + 1.0 : 0.0;`)
        .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
        .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTop; varying vec3 vKl; varying float vBloem;')
        .replace('#include <map_fragment>', `
  vec3 gk = vKl * mix(0.5, 1.15, vTop);
  if (vBloem > 0.5 && vTop > 0.8) gk = vBloem < 1.5 ? vec3(0.95, 0.80, 0.15) : vBloem < 2.5 ? vec3(0.95, 0.95, 0.92) : vec3(0.62, 0.38, 0.85);
  diffuseColor.rgb *= gk;`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.mesh.userData.geenAO = true;
    this.mesh.visible = false;
  }

  /** Grasmasker opnieuw: 255 = gras, 0 = weg, gebouw, verharding, strand of water. */
  private bouwMasker() {
    const w = this.w, t = w.terrein, G = t.grootte, N = MASKER, px = G / N;
    const m = this.masker.image.data as Uint8Array;
    // Terrein: geen gras op strand en onder water, minder in het bos.
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -G / 2 + (i + 0.5) * px, z = -G / 2 + (j + 0.5) * px, h = t.hoogte(x, z);
      m[j * N + i] = h < ZEENIVEAU + 1.2 ? 0 : 255;
    }
    const toIdx = (x: number) => Math.floor((x + G / 2) / px);
    const vul = (poly: { x: number; z: number }[], waarde: number, marge = 0) => {
      let z0 = Infinity, z1 = -Infinity;
      for (const p of poly) { z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      for (let j = Math.max(0, toIdx(z0 - marge)); j <= Math.min(N - 1, toIdx(z1 + marge)); j++) {
        const z = -G / 2 + (j + 0.5) * px, xs: number[] = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length];
          if ((a.z <= z) !== (b.z <= z)) xs.push(a.x + (z - a.z) / (b.z - a.z) * (b.x - a.x));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, toIdx(xs[k] - marge)); i <= Math.min(N - 1, toIdx(xs[k + 1] + marge)); i++) m[j * N + i] = waarde;
      }
    };
    // Wegen: schijven langs het pad over de volle breedte.
    for (const s of w.net.segmenten.values()) {
      const r = totaleBreedte(WEGTYPEN[s.type].stroken) / 2 + 0.6, ri = Math.ceil(r / px);
      for (const p of s.pad) {
        const ci = toIdx(p.x), cj = toIdx(p.z);
        for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++) {
          if ((di * di + dj * dj) * px * px > r * r) continue;
          const i = ci + di, j = cj + dj;
          if (i >= 0 && j >= 0 && i < N && j < N) m[j * N + i] = 0;
        }
      }
    }
    // Percelen: verhard bij kantoren, winkels en bedrijven; bij woningen alleen het gebouw zelf.
    for (const g of w.gebouwen.values()) {
      if (g.zone !== 'wonenLaag' && g.zone !== 'wonenHoog') vul(g.perceel, 0);
      vul(g.voet, 0, 0.8);
    }
    for (const d of w.voorzieningen.diensten.values()) vul(d.voet, 0);
    this.masker.needsUpdate = true;
    this.hoogte.needsUpdate = true;
  }

  werkBij(dt: number, doel: THREE.Vector3, afstand: number, aan: boolean) {
    this.uni.uTijd.value += dt;
    const zichtbaar = aan && afstand < 150;
    this.mesh.visible = zichtbaar;
    if (!zichtbaar) return;
    this.uni.uDoel.value.set(doel.x, doel.z);
    this.uni.uR.value = Math.min(RMAX, Math.max(22, afstand * 0.55));
    // Masker opnieuw als de stad merkbaar veranderde (hooguit eens per 3 s).
    this.klok += dt;
    if (this.klok > 3) {
      this.klok = 0;
      const s = `${this.w.net.segmenten.size}|${this.w.gebouwen.size}|${this.w.voorzieningen.diensten.size}|${this.w.net.versie}`;
      if (s !== this.sleutel) { this.sleutel = s; this.bouwMasker(); }
    }
  }
}
