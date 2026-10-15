import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export type Niveau = 'laag' | 'midden' | 'hoog';
export interface Kwaliteit { schaduw: number; zacht: boolean; ao: boolean; bloom: boolean; msaa: number; schaal: number }
export const NIVEAUS: Record<Niveau, Kwaliteit> = {
  laag: { schaduw: 2048, zacht: false, ao: false, bloom: false, msaa: 0, schaal: 1 },
  midden: { schaduw: 2048, zacht: true, ao: false, bloom: true, msaa: 2, schaal: 1.5 },
  hoog: { schaduw: 4096, zacht: true, ao: true, bloom: true, msaa: 4, schaal: 2 },
};

/** Renderer, lucht, zon, mist en nabewerking. */
export class Sfeer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  zon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: Sky;
  composer: EffectComposer;
  ao?: GTAOPass;
  zonRichting = new THREE.Vector3();

  k: Kwaliteit;
  niveau: Niveau;
  /** Dynamische resolutie bovenop het niveau (0.5–1). */
  dynamisch = 1;
  private fxaa?: ShaderPass;
  private vorigDoel = new THREE.Vector3(1e9, 0, 0);
  private vorigeAfstand = 0;

  constructor(canvas: HTMLCanvasElement, niveau: Niveau) {
    this.niveau = niveau; this.k = NIVEAUS[niveau];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 9000);

    // Lucht.
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.2; u.rayleigh.value = 1.3; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    this.scene.add(this.sky);

    // Zon: middag in de lente, licht van het zuidwesten.
    // (azimut gemeten vanaf +z = zuid, tegen de klok in vanaf boven: 325° = zuidwest)
    const hoogte = THREE.MathUtils.degToRad(38), azimut = THREE.MathUtils.degToRad(325);
    this.zonRichting.setFromSphericalCoords(1, Math.PI / 2 - hoogte, azimut);
    u.sunPosition.value.copy(this.zonRichting);
    this.zon = new THREE.DirectionalLight(0xfff1dc, 3.1);
    this.zon.castShadow = true;
    this.zon.shadow.bias = -0.0004; this.zon.shadow.normalBias = 0.6;
    this.scene.add(this.zon, this.zon.target);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5b5a3c, 0.55);
    this.scene.add(this.hemi);

    // Omgevingslicht en reflecties uit de lucht.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const luchtScene = new THREE.Scene();
    const s2 = new Sky(); s2.scale.setScalar(1000);
    Object.assign(s2.material.uniforms.turbidity, { value: 3.2 });
    s2.material.uniforms.rayleigh.value = 1.3; s2.material.uniforms.mieCoefficient.value = 0.004; s2.material.uniforms.mieDirectionalG.value = 0.82;
    s2.material.uniforms.sunPosition.value.copy(this.zonRichting);
    luchtScene.add(s2);
    this.scene.environment = pmrem.fromScene(luchtScene, 0, 1, 2000).texture;
    this.scene.environmentIntensity = 0.55;

    this.scene.fog = new THREE.Fog(0xb9cbdc, 1500, 7000);

    this.composer = new EffectComposer(this.renderer);
    this.zetNiveau(niveau);
    addEventListener('resize', () => this.pasAan());
  }

  /** Kwaliteit wisselen tijdens het spelen: schaduwkaart, nabewerking en resolutie. */
  zetNiveau(niveau: Niveau) {
    this.niveau = niveau;
    const k = this.k = NIVEAUS[niveau];
    this.renderer.shadowMap.type = k.zacht ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.zon.shadow.mapSize.set(k.schaduw, k.schaduw);
    this.zon.shadow.map?.dispose(); this.zon.shadow.map = null;
    this.renderer.shadowMap.needsUpdate = true;
    // Materialen opnieuw laten compileren voor het andere schaduwtype.
    this.scene.traverse(o => { const m = (o as THREE.Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true; });
    this.composer.dispose();
    const pr = this.pixelRatio();
    const doel = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: k.msaa });
    this.composer = new EffectComposer(this.renderer, doel);
    this.composer.setPixelRatio(pr);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = undefined;
    if (k.ao) {
      this.ao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.blendIntensity = 0.6;
      const ao = this.ao as unknown as { overrideVisibility: () => void };
      const orig = ao.overrideVisibility.bind(ao);
      ao.overrideVisibility = () => { orig(); this.scene.traverse(o => { if (o.userData.geenAO) o.visible = false; }); };
      this.ao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1.5, thickness: 2, scale: 1, samples: 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.ao);
    }
    if (k.bloom) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.12, 0.4, 0.92));
    this.composer.addPass(new OutputPass());
    this.fxaa = undefined;
    if (k.msaa === 0) { this.fxaa = new ShaderPass(FXAAShader); this.composer.addPass(this.fxaa); }
    this.pasAan();
  }

  pixelRatio() { return Math.max(0.4, Math.min(devicePixelRatio, this.k.schaal) * this.dynamisch); }

  pasAan() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    const pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(innerWidth, innerHeight);
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  }

  /** Schaduw opnieuw laten berekenen (na een wijziging in de stad). */
  schaduwVuil() { this.renderer.shadowMap.needsUpdate = true; }

  /** Schaduwkader en mist schalen mee met hoe ver je bent uitgezoomd. */
  volg(doel: THREE.Vector3, afstand: number) {
    // Schaduw alleen opnieuw als de camera merkbaar bewoog.
    if (doel.distanceTo(this.vorigDoel) > Math.max(1, afstand * 0.01) || Math.abs(afstand - this.vorigeAfstand) > afstand * 0.03) {
      this.vorigDoel.copy(doel); this.vorigeAfstand = afstand; this.renderer.shadowMap.needsUpdate = true;
    }
    const r = THREE.MathUtils.clamp(afstand * 1.1, 70, 900);
    const c = this.zon.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = r * 4 + 600;
    c.updateProjectionMatrix();
    // Texelgrid vastzetten tegen glinsteren bij bewegen.
    const texel = (2 * r) / this.k.schaduw;
    const d = doel.clone();
    d.x = Math.round(d.x / texel) * texel; d.z = Math.round(d.z / texel) * texel;
    this.zon.target.position.copy(d);
    this.zon.position.copy(d).addScaledVector(this.zonRichting, r * 2 + 300);
    this.zon.shadow.normalBias = 0.02 * r / 10;
    const f = this.scene.fog as THREE.Fog;
    f.near = Math.max(600, afstand * 3); f.far = Math.max(3500, afstand * 9);
    // Ver uitgezoomd worden schaduwpixels groot en ruist de AO: schaduw zachter, AO uitfaden.
    const ver = THREE.MathUtils.smoothstep(afstand, 450, 1300);
    this.zon.shadow.intensity = 1 - ver * 0.3;
    if (this.ao) {
      const ao = 1 - THREE.MathUtils.smoothstep(afstand, 380, 800);
      this.ao.enabled = ao > 0.02;
      this.ao.blendIntensity = 0.6 * ao;
      this.ao.updateGtaoMaterial({ radius: THREE.MathUtils.clamp(afstand * 0.012, 1.5, 8) });
    }
  }

  render() { this.composer.render(); }
}
