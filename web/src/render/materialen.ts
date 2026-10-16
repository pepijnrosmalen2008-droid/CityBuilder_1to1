import * as THREE from 'three';
import { materiaal } from '../core/materialen';
import { TextuurBron } from './texturen';
import { atlas } from '../core/geom/lod';

/** Nachtwaarde (0 = dag, 1 = nacht), gedeeld door alle materialen die 's nachts licht geven. */
export const NACHT = { value: 0 };

/** GLSL: willekeurig getal per raamvak en de kleur van het licht erachter (warm, soms koel of tv-blauw). */
const RAAM_GLSL = `
uniform float uNacht;
float raamHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 raamLicht(vec2 cel, float glas) {
  float h = raamHash(cel), h2 = raamHash(cel + 17.3);
  // Een deel van de ramen brandt (meer naarmate het later en donkerder is); de rest is donker.
  float aan = step(h, 0.12 + uNacht * 0.33) * glas;
  vec3 kl = h2 < 0.72 ? vec3(1.0, 0.62, 0.32) : h2 < 0.92 ? vec3(1.0, 0.8, 0.58) : vec3(0.45, 0.62, 1.0);
  float sterk = 0.35 + 0.65 * raamHash(cel + 3.1);
  return kl * aan * sterk * uNacht * uNacht;
}`

/** MatDef (engine-onafhankelijk) → three.js-materiaal. Texturen komen later binnen uit de workers. */
export class Materialen {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  constructor(private bron: TextuurBron) {}

  haal(sleutel: string): THREE.MeshStandardMaterial {
    let m = this.cache.get(sleutel);
    if (m) return m;
    if (sleutel === 'atlasVer') { m = this.maakAtlas(); this.cache.set(sleutel, m); return m; }
    const d = materiaal(sleutel);
    m = sleutel === 'autolak'
      // Autolak: metallic basislaag met een blanke laklaag erover.
      ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(...d.kleur, THREE.SRGBColorSpace), roughness: d.ruwheid, metalness: d.metaal, clearcoat: 1, clearcoatRoughness: 0.06 })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...d.kleur, THREE.SRGBColorSpace), roughness: d.ruwheid, metalness: d.metaal });
    m.name = sleutel;
    if (sleutel === 'kleurVer') {
      // Kleur, ruwheid en metaal per hoekpunt (samengevoegde effen materialen).
      m.vertexColors = true; m.roughness = 1; m.metalness = 1;
      m.onBeforeCompile = s => {
        s.uniforms.uNacht = NACHT;
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRm;\nvarying vec3 vWereldP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRm = rm;\nvWereldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRm;\nvarying vec3 vWereldP;\n' + RAAM_GLSL)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n// Glas (glad en spiegelend): ramen in deuren, dakkapellen, lobby\'s lichten op.\ntotalEmissiveRadiance += raamLicht(floor(vWereldP.xz / 3.0 + vWereldP.y / 3.0), step(vRm.x, 0.16) * step(0.25, vRm.y)) * 0.7;')
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRm.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRm.y;');
      };
    }
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
    if (sleutel.startsWith('winkelpui:')) etalage(m);
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

  /**
   * Alle getextureerde materialen voor op afstand in één textuurreeks (256×256 per laag): kleur in RGB
   * (met de ingebakken occlusie), glans in alfa. Lagen vullen zich zodra de texturen klaar zijn.
   */
  private maakAtlas(): THREE.MeshStandardMaterial {
    const N = 256, sleutels = atlas(), L = sleutels.length;
    const data = new Uint8Array(N * N * 4 * L).fill(128);
    const arr = new THREE.DataArrayTexture(data, N, N, L);
    arr.format = THREE.RGBAFormat; arr.type = THREE.UnsignedByteType;
    arr.wrapS = arr.wrapT = THREE.RepeatWrapping;
    arr.minFilter = THREE.LinearMipmapLinearFilter; arr.magFilter = THREE.LinearFilter;
    arr.generateMipmaps = true; arr.anisotropy = 4;
    arr.colorSpace = THREE.SRGBColorSpace;
    arr.needsUpdate = true;
    let wacht = 0, uploadGepland = false;
    sleutels.forEach((k, laag) => {
      const tex = materiaal(k).tex;
      if (!tex) return;
      this.bron.haal(tex, t => {
        const img = t.map.image as { data: Uint8ClampedArray; width: number; height: number };
        const orm = t.ormMap?.image as { data: Uint8ClampedArray } | undefined;
        const tint = materiaal(k).kleur;
        const fx = img.width / N, fy = img.height / N, o = laag * N * N * 4;
        // Doosfilter: gemiddelde van de bronpixels die in een doelpixel vallen.
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let sy = Math.floor(y * fy); sy < Math.floor((y + 1) * fy); sy++) for (let sx = Math.floor(x * fx); sx < Math.floor((x + 1) * fx); sx++) {
            const i = (sy * img.width + sx) * 4;
            const ao = orm ? orm.data[i] / 255 : 1;
            r += img.data[i] * ao; g += img.data[i + 1] * ao; b += img.data[i + 2] * ao;
            a += orm ? 255 - orm.data[i + 1] : 40; n++;
          }
          const j = o + (y * N + x) * 4;
          data[j] = r / n * tint[0]; data[j + 1] = g / n * tint[1]; data[j + 2] = b / n * tint[2]; data[j + 3] = a / n;
        }
        // Uploaden gebundeld (niet per laag de hele reeks opnieuw).
        wacht--;
        if (!uploadGepland) { uploadGepland = true; setTimeout(() => { uploadGepland = false; arr.needsUpdate = true; }, wacht > 0 ? 250 : 0); }
      });
      wacht++;
    });
    const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    dummy.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ map: dummy, roughness: 1, metalness: 0 });
    m.name = 'atlasVer';
    m.onBeforeCompile = s => {
      s.uniforms.tAtlas = { value: arr };
      s.uniforms.uNacht = NACHT;
      s.uniforms.uGevels = { value: sleutels.filter(k => k.startsWith('gevel:')).length };
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float atlaslaag;\nvarying float vLaag;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLaag = atlaslaag;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform highp sampler2DArray tAtlas;\nuniform float uGevels;\nvarying float vLaag;\n' + RAAM_GLSL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vLaag < uGevels - 0.5) totalEmissiveRadiance += raamLicht(floor(vMapUv * 2.0), smoothstep(0.55, 0.8, atlasT.a)) * 0.9;')
        .replace('#include <map_fragment>', 'vec4 atlasT = texture(tAtlas, vec3(vMapUv, floor(vLaag + 0.5)));\ndiffuseColor.rgb *= atlasT.rgb;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.95, 0.12, atlasT.a);');
    };
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
    s.uniforms.uNacht = NACHT;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + RAAM_GLSL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  #ifdef USE_NORMALMAP
  {
    // Glas = lage delen van de hoogtekaart; per raamvak (2 × 2 per textuurherhaling) aan of uit.
    float glasM = smoothstep(0.32, 0.18, texture2D(normalMap, pUv).a);
    totalEmissiveRadiance += raamLicht(floor(pUv * 2.0), glasM) * 0.9;
  }
  #endif`);
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

/** Etalages branden 's avonds: het glas (gladde delen) licht warm op. */
function etalage(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = s => {
    s.uniforms.uNacht = NACHT;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNacht;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  #ifdef USE_ROUGHNESSMAP
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.6, 1.3, 1.0) * smoothstep(0.35, 0.15, texture2D(roughnessMap, vRoughnessMapUv).g) * uNacht * 1.2;
  #endif`);
  };
}
