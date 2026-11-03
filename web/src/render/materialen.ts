import * as THREE from 'three';
import { materiaal } from '../core/materialen';
import { TextuurBron } from './texturen';
import { atlas } from '../core/geom/lod';

/** Nachtwaarde (0 = dag, 1 = nacht), gedeeld door alle materialen die 's nachts licht geven. */
export const NACHT = { value: 0 };
/** Luchtkleuren voor de spiegeling in ramen (dagnacht.ts werkt ze bij). */
export const LUCHT = { zenit: { value: new THREE.Color(0.20, 0.42, 0.80) }, horizon: { value: new THREE.Color(0.68, 0.78, 0.90) }, grond: { value: new THREE.Color(0.18, 0.18, 0.17) } };

/** GLSL: spiegeling van de lucht in glas (Fresnel). n en vd in kijkruimte; geeft kleur en sterkte. */
const SPIEGEL_GLSL = `
uniform vec3 uZenit, uHorizon, uGrond;
vec4 luchtSpiegel(vec3 n, vec3 vd, float ruw) {
  vec3 r = inverseTransformDirection(reflect(-vd, n), viewMatrix);
  float fr = 0.06 + 0.94 * pow(1.0 - clamp(dot(vd, n), 0.0, 1.0), 4.0);
  vec3 sky = r.y > 0.0 ? mix(uHorizon, uZenit, pow(r.y, 0.6)) : mix(uHorizon * 0.55, uGrond, clamp(-r.y * 4.0, 0.0, 1.0));
  // Wolkjes en weerspiegelde gebouwen tegenover: wat variatie zodat ramen niet allemaal gelijk zijn.
  float w = fract(sin(dot(floor(r.xz / max(0.08, r.y + 0.12) * 3.0), vec2(12.9, 78.2))) * 43758.5);
  sky *= r.y > 0.0 ? 0.9 + 0.2 * w : 1.0;
  return vec4(sky, fr * (1.0 - ruw * 0.6));
}`;
const spiegelUni = (s: { uniforms: Record<string, unknown> }) => { s.uniforms.uZenit = LUCHT.zenit; s.uniforms.uHorizon = LUCHT.horizon; s.uniforms.uGrond = LUCHT.grond; };

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
}
/** Interieur achter een raamvak (interior mapping): straal vanuit het glas (f = plek in het vak 0-1, cel = vak)
 *  in richting d (raakvlakruimte, z < 0 = de kamer in) door een doos met wanden, vloer, plafond en meubels. */
vec3 kamer(vec2 cel, vec2 f, vec3 d) {
  float h1 = raamHash(cel + 5.1), h2 = raamHash(cel + 9.7), h3 = raamHash(cel + 2.3), h4 = raamHash(cel + 7.9);
  float D = 1.0 + h1 * 0.7;
  d.z = min(d.z, -0.05);
  float tx = (d.x > 0.0 ? 1.0 - f.x : -f.x) / (abs(d.x) < 1e-4 ? (d.x < 0.0 ? -1e-4 : 1e-4) : d.x);
  float ty = (d.y > 0.0 ? 1.0 - f.y : -f.y) / (abs(d.y) < 1e-4 ? (d.y < 0.0 ? -1e-4 : 1e-4) : d.y);
  float tz = -D / d.z;
  float t = min(min(tx, ty), tz);
  vec3 p = vec3(f, 0.0) + d * t;
  vec3 wand = h2 < 0.4 ? vec3(0.80, 0.76, 0.68) : h2 < 0.7 ? vec3(0.86, 0.85, 0.82) : h2 < 0.85 ? vec3(0.66, 0.72, 0.70) : vec3(0.78, 0.66, 0.55);
  vec3 c;
  if (t == tz) {
    c = wand * 0.92;
    // Achterwand: kast, schilderij, deur of bank.
    if (h3 < 0.3 && abs(p.x - 0.3) < 0.16 && p.y < 0.75) c = vec3(0.32, 0.22, 0.14) * (fract(p.y * 6.0) < 0.12 ? 0.6 : 1.0);
    else if (h3 < 0.6 && abs(p.x - 0.55) < 0.15 && abs(p.y - 0.55) < 0.1) c = mix(vec3(0.25, 0.3, 0.38), vec3(0.6, 0.45, 0.3), h4);
    else if (h3 < 0.75 && abs(p.x - 0.7) < 0.1 && p.y < 0.7) c = wand * 0.65;
    if (p.y < 0.24 && abs(p.x - 0.45) < 0.3 && h4 > 0.35) c = mix(vec3(0.20, 0.22, 0.28), vec3(0.45, 0.30, 0.22), h1) * (p.y > 0.2 ? 1.2 : 1.0);
  } else if (t == ty) {
    c = d.y < 0.0 ? mix(vec3(0.42, 0.28, 0.17), vec3(0.62, 0.52, 0.40), h4) * (0.85 + 0.15 * step(0.5, fract(p.x * 9.0))) : vec3(0.88, 0.87, 0.84);
  } else {
    c = wand * 0.78;
    if (p.y < 0.24 && -p.z > D * 0.25 && -p.z < D * 0.7 && h1 > 0.5) c = vec3(0.30, 0.20, 0.12);
  }
  // Dieper in de kamer donkerder; plafond en wanden boven vangen het meeste licht.
  return c * mix(1.0, 0.5, clamp(-p.z / D, 0.0, 1.0)) * (0.8 + 0.25 * p.y);
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
  reflectedLight.directDiffuse *= mix(0.62, 1.04, kroonAO);`)
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  #if NUM_DIR_LIGHTS > 0
  {
    // Doorschijnend blad: tegen de zon in gloeit de kroon geelgroen op; ook de schaduwkant krijgt wat licht.
    vec3 Lz = directionalLights[0].direction;
    float tegen = pow(max(0.0, dot(-normalize(vViewPosition), Lz)), 3.0);
    float omslag = max(0.0, -dot(normal, Lz));
    vec3 door = diffuseColor.rgb * vec3(1.15, 1.25, 0.6) * directionalLights[0].color;
    reflectedLight.directDiffuse += door * (tegen * 0.42 + omslag * 0.12) * mix(0.5, 1.0, smoothstep(0.0, 1.0, vKroon));
  }
  #endif`);
      };
    }
    if (sleutel.startsWith('gevel:')) parallaxRamen(m);
    if (sleutel === 'asfalt' || sleutel === 'busbaan') straatDek(m, true);
    else if (sleutel === 'fietsasfalt' || sleutel === 'stoeptegels' || sleutel === 'klinkers') straatDek(m, false);
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
    arr.generateMipmaps = true; arr.anisotropy = 16;
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
      spiegelUni(s);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform highp sampler2DArray tAtlas;\nuniform float uGevels;\nvarying float vLaag;\n' + RAAM_GLSL + SPIEGEL_GLSL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vLaag < uGevels - 0.5) { float gm = smoothstep(0.55, 0.8, atlasT.a); totalEmissiveRadiance += raamLicht(floor(vMapUv * 2.0), gm) * 0.9; vec4 sp = luchtSpiegel(normal, normalize(vViewPosition), 0.0); totalEmissiveRadiance += sp.rgb * sp.a * gm * (1.0 - uNacht * 0.85) * 0.8; diffuseColor.rgb *= 1.0 - 0.15 * smoothstep(0.32, 0.0, vMapUv.y); }')
        .replace('#include <map_fragment>', `vec4 atlasT = texture(tAtlas, vec3(vMapUv, floor(vLaag + 0.5)), -0.8);
diffuseColor.rgb *= atlasT.rgb;
if (vLaag < uGevels - 0.5) {
  // Van ver: raamrijen per verdieping blijven zichtbaar (de mipmap middelt ze anders weg tot een egale muur).
  float fwy = fwidth(vMapUv.y * 2.0);
  float rij = smoothstep(0.12, 0.2, fract(vMapUv.y * 2.0)) * smoothstep(0.88, 0.8, fract(vMapUv.y * 2.0));
  float ver = smoothstep(0.15, 0.5, fwy);
  diffuseColor.rgb *= mix(1.0, mix(1.0, 0.58, rij), ver * 0.75);
}`)
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nif (vLaag < uGevels - 0.5) reflectedLight.indirectDiffuse *= mix(0.5, 1.0, smoothstep(0.0, 3.0, vMapUv.y));')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.95, 0.12, atlasT.a);');
    };
    return m;
  }
}

/**
 * Wegdek en stoep in wereldcoördinaten (geen herhaling, geen extra texturen): grote tintverschillen,
 * vuil langs randen. Asfalt krijgt ook reparatieplekken met vers donker asfalt, olie- en rubbervlekken
 * en gietijzeren putdeksels. Ver weg (vakjes kleiner dan een pixel) vallen de kleine details weg.
 */
function straatDek(m: THREE.MeshStandardMaterial, asfalt: boolean) {
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP;
float sdH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sdR(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sdH(i), sdH(i + vec2(1, 0)), f.x), mix(sdH(i + vec2(0, 1)), sdH(i + vec2(1, 1)), f.x), f.y); }
float sdF(vec2 p) { return sdR(p) * 0.5 + sdR(p * 2.1 + 3.7) * 0.3 + sdR(p * 4.3 + 9.1) * 0.2; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec2 wp = vWP.xz;
  float sdFw = length(fwidth(wp));
  float sdDicht = 1.0 - smoothstep(0.15, 0.6, sdFw);
  float sdRuw = 0.0;
  diffuseColor.rgb *= mix(0.88, 1.08, sdF(wp / 38.0)) * mix(0.95, 1.04, sdF(wp / 7.0 + 5.0));
  ${asfalt ? `
  // Reparatieplekken: vers, donkerder en gladder asfalt met een scherpe rand.
  float plek = sdF(wp / 9.0 + 17.0);
  float rep = smoothstep(0.66, 0.665 + sdFw * 0.05, plek);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.72, 0.74), rep);
  diffuseColor.rgb *= 1.0 - 0.25 * smoothstep(0.645, 0.66, plek) * (1.0 - rep) * sdDicht;
  sdRuw -= rep * 0.08;
  // Olie- en rubbervlekken.
  float vlek = smoothstep(0.72, 0.9, sdF(wp / 1.6 + 41.0)) * smoothstep(0.55, 0.7, sdF(wp / 11.0 + 3.0));
  diffuseColor.rgb *= 1.0 - 0.35 * vlek * sdDicht;
  sdRuw -= vlek * 0.25;
  // Putdeksels: één op de paar vakken van 14 m, rond, gietijzer met ribbels.
  vec2 cel = floor(wp / 14.0), loc = fract(wp / 14.0) * 14.0;
  if (sdH(cel + 7.3) > 0.55 && sdDicht > 0.0) {
    vec2 c = vec2(3.0 + sdH(cel + 1.1) * 8.0, 3.0 + sdH(cel + 2.2) * 8.0);
    float r = length(loc - c);
    float put = 1.0 - smoothstep(0.33, 0.34, r);
    float rand = smoothstep(0.30, 0.33, r) * put;
    vec2 q = (loc - c) * 14.0;
    float ribbel = step(0.5, fract((q.x + q.y) * 0.5)) * 0.5 + step(0.5, fract((q.x - q.y) * 0.5)) * 0.5;
    vec3 ijzer = vec3(0.16, 0.155, 0.15) * (0.75 + 0.35 * ribbel);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(ijzer, vec3(0.3, 0.29, 0.28), rand), put * sdDicht);
    sdRuw -= put * 0.3 * sdDicht;
  }` : `
  // Stoep en fietspad: vuil, mos en verkleurde tegels.
  diffuseColor.rgb *= 1.0 - 0.14 * smoothstep(0.62, 0.82, sdF(wp / 3.0 + 13.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.92, 0.80), 0.35 * smoothstep(0.7, 0.9, sdF(wp / 5.0 + 29.0)));`}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor + sdRuw, 0.04, 1.0);');
  };
}

/**
 * Ramen die in de gevel liggen: parallax op de hoogte in het alfakanaal van de normal map.
 * Alleen diepe delen (glas) zakken weg, ~15 cm; bij een schuine blik schuift het muurwerk over het
 * glas en wordt de neggekant zichtbaar, zoals bij echte vensters. Werkt met afgeleiden, dus zonder tangents.
 */
function parallaxRamen(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = s => {
    s.uniforms.uNacht = NACHT;
    spiegelUni(s);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + RAAM_GLSL + SPIEGEL_GLSL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  #ifdef USE_NORMALMAP
  {
    // Glas = lage delen van de hoogtekaart; per raamvak (2 × 2 per textuurherhaling) aan of uit.
    float glasM = smoothstep(0.32, 0.18, texture2D(normalMap, pUv).a);
    vec2 cel = floor(pUv * 2.0);
    // Dichtbij: echte kamers achter het glas; ver weg (vakken kleiner dan een paar pixels) de vlakke versie.
    vec2 fw = fwidth(pUv * 2.0);
    float dicht = 1.0 - smoothstep(0.012, 0.04, max(fw.x, fw.y));
    vec3 vlak = raamLicht(cel, glasM) * 0.9;
    vec4 sp = luchtSpiegel(normal, normalize(vViewPosition), 0.0);
    float spF = sp.a * glasM * (1.0 - uNacht * 0.85);
    totalEmissiveRadiance += sp.rgb * spF * 0.9;
    if (dicht > 0.0 && glasM > 0.01) {
      vec3 k = kamer(cel, fract(pUv * 2.0), -pV);
      float aanL = step(raamHash(cel), 0.12 + uNacht * 0.33);
      vec3 licht = vec3(0.16, 0.17, 0.18) * (1.0 - uNacht) + (aanL > 0.5 ? raamLicht(cel, 1.0) * 1.7 + vec3(0.02) * uNacht : vec3(0.008) * uNacht);
      vec3 binnen = k * licht * glasM * (1.0 - spF);
      totalEmissiveRadiance += mix(vlak, binnen, dicht);
    } else totalEmissiveRadiance += vlak;
  }
  #endif`);
    const C = THREE.ShaderChunk;
    const met = (chunk: string) => chunk.replace(/vMapUv|vNormalMapUv|vRoughnessMapUv|vMetalnessMapUv/g, 'pUv');
    s.fragmentShader = s.fragmentShader
      .replace('#include <map_fragment>', `
  vec2 pUv = vMapUv;
  float pDiep = 0.0;
  vec3 pV = vec3(0.0, 0.0, 1.0);
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
    pV = v;
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
  diffuseColor.rgb *= 1.0 - 0.35 * pDiep;
  // Vuil onderaan de gevel (spatwater, straatstof) en verticale regenstrepen; verdwijnt naar boven.
  {
    float onder = smoothstep(0.32, 0.0, pUv.y);
    float streep = fract(sin(floor(pUv.x * 14.0) * 91.7) * 4375.5);
    diffuseColor.rgb *= 1.0 - 0.2 * onder - 0.07 * streep * smoothstep(0.9, 0.0, fract(pUv.y * 0.5)) * 0.5;
  }
  #ifdef USE_NORMALMAP
  {
    float glasA = smoothstep(0.32, 0.18, texture2D(normalMap, pUv).a);
    vec2 fwA = fwidth(pUv * 2.0);
    diffuseColor.rgb *= 1.0 - 0.55 * glasA * (1.0 - smoothstep(0.012, 0.04, max(fwA.x, fwA.y)));
  }
  #endif`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  // Straatkloof: lager in de gevel komt minder hemellicht (de overkant en de buren schermen af).
  reflectedLight.indirectDiffuse *= mix(0.5, 1.0, smoothstep(0.0, 3.0, pUv.y));
  reflectedLight.indirectSpecular *= mix(0.6, 1.0, smoothstep(0.0, 3.0, pUv.y));`)
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
