import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface Kwaliteit { schaduw: number; ao: boolean; pixelRatio: number }

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

  constructor(canvas: HTMLCanvasElement, readonly k: Kwaliteit) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
    this.renderer.setPixelRatio(k.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    const hoogte = THREE.MathUtils.degToRad(38), azimut = THREE.MathUtils.degToRad(215);
    this.zonRichting.setFromSphericalCoords(1, Math.PI / 2 - hoogte, azimut);
    u.sunPosition.value.copy(this.zonRichting);
    this.zon = new THREE.DirectionalLight(0xfff1dc, 3.1);
    this.zon.castShadow = true;
    this.zon.shadow.mapSize.set(k.schaduw, k.schaduw);
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

    // Nabewerking: MSAA-renderdoel, ambient occlusion, lichte gloed, tonemapping.
    const doel = new THREE.WebGLRenderTarget(innerWidth * k.pixelRatio, innerHeight * k.pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, doel);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (k.ao) {
      this.ao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.blendIntensity = 0.6;
      // Doorzichtige lagen (zones, water, voorbeelden) tellen niet mee voor ambient occlusion.
      const ao = this.ao as unknown as { overrideVisibility: () => void };
      const orig = ao.overrideVisibility.bind(ao);
      ao.overrideVisibility = () => { orig(); this.scene.traverse(o => { if (o.userData.geenAO) o.visible = false; }); };
      this.ao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1.5, thickness: 2, scale: 1, samples: 16 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      this.composer.addPass(this.ao);
    }
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.4, 0.92));
    this.composer.addPass(new OutputPass());

    addEventListener('resize', () => this.pasAan());
  }

  pasAan() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer.setSize(innerWidth, innerHeight);
  }

  /** Schaduwkader en mist schalen mee met hoe ver je bent uitgezoomd. */
  volg(doel: THREE.Vector3, afstand: number) {
    const r = THREE.MathUtils.clamp(afstand * 1.1, 70, 1100);
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
    if (this.ao) this.ao.updateGtaoMaterial({ radius: THREE.MathUtils.clamp(afstand * 0.012, 1.5, 12) });
  }

  render() { this.composer.render(); }
}
