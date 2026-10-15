import * as THREE from 'three';
import { materiaal } from '../core/materialen';
import { TextuurBron } from './texturen';

/** MatDef (engine-onafhankelijk) → three.js-materiaal. Texturen komen later binnen uit de workers. */
export class Materialen {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  constructor(private bron: TextuurBron) {}

  haal(sleutel: string): THREE.MeshStandardMaterial {
    let m = this.cache.get(sleutel);
    if (m) return m;
    const d = materiaal(sleutel);
    m = sleutel === 'autolak'
      // Autolak: metallic basislaag met een blanke laklaag erover.
      ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(...d.kleur, THREE.SRGBColorSpace), roughness: d.ruwheid, metalness: d.metaal, clearcoat: 1, clearcoatRoughness: 0.06 })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...d.kleur, THREE.SRGBColorSpace), roughness: d.ruwheid, metalness: d.metaal });
    m.name = sleutel;
    if (d.dubbelzijdig) m.side = THREE.DoubleSide;
    if (d.alfa === 'knip') { m.alphaTest = 0.5; m.transparent = false; m.alphaToCoverage = !sleutel.startsWith('blad'); }
    if (d.alfa === 'mengen') { m.transparent = true; m.depthWrite = false; }
    if (d.emissie) { m.emissive = new THREE.Color(...d.emissie); m.emissiveIntensity = 2.5; }
    if (sleutel.startsWith('blad')) {
      m.emissive = new THREE.Color(0x081304); m.emissiveIntensity = 1; m.envMapIntensity = 0.5;
      // Volume in de kroon: onderin en binnenin donkerder (zelfschaduw), de top vangt het licht.
      m.onBeforeCompile = s => {
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vKroon;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKroon = clamp((position.y - 3.5) / 10.0, 0.0, 1.0);');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vKroon;')
          .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  float kroonAO = smoothstep(0.0, 1.0, vKroon);
  reflectedLight.indirectDiffuse *= mix(0.42, 1.08, kroonAO);
  reflectedLight.directDiffuse *= mix(0.62, 1.04, kroonAO);`);
      };
    }
    if (sleutel.startsWith('gevel:')) parallaxRamen(m);
    if (d.bovenop) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
    if (d.tex) {
      // Zolang de textuur er niet is: een rustige grijswaarde in plaats van wit.
      if (d.alfa === 'knip') m.visible = false;
      m.color.multiplyScalar(0.55);
      const mat = m;
      this.bron.haal(d.tex, t => {
        const herhaal = d.meter > 0 ? 1 / d.meter : 1;
        const kloon = (x: THREE.DataTexture) => { if (herhaal === 1) return x; const c = x.clone(); c.repeat.set(herhaal, herhaal); c.needsUpdate = true; return c; };
        mat.map = kloon(t.map);
        if (t.normalMap && d.normaal) { mat.normalMap = kloon(t.normalMap); mat.normalScale.set(d.normaal, d.normaal); }
        if (t.ormMap) { mat.roughnessMap = kloon(t.ormMap); mat.metalnessMap = mat.roughnessMap; mat.roughness = 1; mat.metalness = 1; }
        mat.color.setRGB(...d.kleur, THREE.SRGBColorSpace);
        mat.visible = true;
        mat.needsUpdate = true;
      });
    }
    this.cache.set(sleutel, m);
    return m;
  }
}

/**
 * Ramen die in de gevel liggen: parallax op de hoogte in het alfakanaal van de normal map.
 * Alleen diepe delen (glas) zakken weg, ~15 cm; bij een schuine blik schuift het muurwerk over het
 * glas en wordt de neggekant zichtbaar, zoals bij echte vensters. Werkt met afgeleiden, dus zonder tangents.
 */
function parallaxRamen(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = s => {
    const C = THREE.ShaderChunk;
    const met = (chunk: string) => chunk.replace(/vMapUv|vNormalMapUv|vRoughnessMapUv|vMetalnessMapUv/g, 'pUv');
    s.fragmentShader = s.fragmentShader
      .replace('#include <map_fragment>', `
  vec2 pUv = vMapUv;
  float pDiep = 0.0;
  #ifdef USE_NORMALMAP
  {
    vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition);
    vec2 du1 = dFdx(vMapUv), du2 = dFdy(vMapUv);
    vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
    vec3 T = dp2p * du1.x + dp1p * du2.x, B = dp2p * du1.y + dp1p * du2.y;
    float im = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-12);
    mat3 tbn = mat3(T * im, B * im, N);
    vec3 v = normalize(vViewPosition) * tbn;
    // Diepte: alleen lage delen (glas) liggen terug.
    const float SCHAAL = 0.026;
    const int N_STAP = 10;
    vec2 stap = v.xy / max(v.z, 0.3) * SCHAAL / float(N_STAP);
    float laag = 0.0;
    float d = clamp((0.5 - texture2D(normalMap, pUv).a) / 0.4, 0.0, 1.0);
    for (int i = 0; i < N_STAP; i++) {
      if (laag >= d) break;
      pUv -= stap;
      laag += 1.0 / float(N_STAP);
      d = clamp((0.5 - texture2D(normalMap, pUv).a) / 0.4, 0.0, 1.0);
    }
    // Muurwerk geraakt op diepte = de negge (binnenkant van de raamopening).
    pDiep = laag * (1.0 - d);
  }
  #endif
` + met(C.map_fragment) + `
  // Neggekant en binnenkant van het venster wat donkerder.
  diffuseColor.rgb *= 1.0 - 0.35 * pDiep;`)
      .replace('#include <roughnessmap_fragment>', met(C.roughnessmap_fragment))
      .replace('#include <metalnessmap_fragment>', met(C.metalnessmap_fragment))
      .replace('#include <normal_fragment_maps>', met(C.normal_fragment_maps));
  };
}
