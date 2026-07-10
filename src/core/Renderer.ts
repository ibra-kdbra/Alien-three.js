import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import chromaticFragmentShader from "../shaders/chromatic.fragment.glsl?raw";
import { queries } from "../ecs/World";

export type QualityPreset = "low" | "medium" | "high";

export class Renderer {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public composer: EffectComposer;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a0a12");

    // Atmospheric fog — alien planet haze (reduced density for massive scale)
    this.scene.fog = new THREE.FogExp2(0x1a0e2e, 0.0005);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      5000,
    );
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    const appElement = document.querySelector("#app");
    if (!appElement) {
      throw new Error("Could not find #app element.");
    }

    // Create the canvas element
    const canvas = document.createElement("canvas");
    appElement.appendChild(canvas);

    // No MSAA: every frame goes through the EffectComposer's render targets,
    // so the canvas multisample buffer costs memory/fill and is never seen —
    // FXAA in the composer chain does the edge smoothing instead.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // 1.5 cap: at DPR 2 the composer runs 4 full-screen passes over 4x the
    // pixels — the single biggest fill-rate cost on high-DPI screens.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    // Enable shadow maps
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Tone mapping for HDR-like visuals
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Post-Processing Pipeline
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Bloom — downscaled to 1/4 resolution for low-end graphics efficiency
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4),
      0.55, // strength
      0.3,  // radius
      0.8,  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // FXAA — smooth edges
    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    fxaaPass.material.uniforms["resolution"].value.x =
      1 / (window.innerWidth * pixelRatio);
    fxaaPass.material.uniforms["resolution"].value.y =
      1 / (window.innerHeight * pixelRatio);
    this.fxaaPass = fxaaPass;
    this.composer.addPass(fxaaPass);

    // Chromatic Aberration — warning effect on low oxygen
    const chromaticShader = {
      uniforms: {
        tDiffuse: { value: null },
        offset: { value: 0.0 },
        uWarningIntensity: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: chromaticFragmentShader,
    };
    this.chromaticPass = new ShaderPass(chromaticShader);
    this.composer.addPass(this.chromaticPass);

    // Output pass (color space)
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    window.addEventListener("resize", this.onResize.bind(this));

    // Restore the player's saved quality tier (auto-detect only runs when
    // nothing is stored — see main.ts)
    try {
      const stored = localStorage.getItem("astra.quality") as QualityPreset | null;
      if (stored === "low" || stored === "medium" || stored === "high") {
        // Defer: the sun light doesn't exist yet during construction
        setTimeout(() => this.setQuality(stored), 0);
      }
    } catch {
      /* private browsing */
    }
  }

  private bloomPass: UnrealBloomPass;
  private fxaaPass: ShaderPass;
  private chromaticPass: ShaderPass;
  public performanceMode = false; // true when quality === "low" (legacy flag)
  public quality: QualityPreset = "high";
  private elapsed = 0;

  /**
   * Quality tiers — each step trades the most expensive remaining feature:
   *   high:   DPR ≤1.5, bloom, chromatic, 2048² soft shadows
   *   medium: DPR ≤1.25, bloom, chromatic, 1024² shadows
   *   low:    DPR ≤1.0, FXAA only, no shadows
   */
  public setQuality(preset: QualityPreset) {
    this.quality = preset;
    this.performanceMode = preset === "low";
    const low = preset === "low";

    // Pixel ratio (the single biggest fill-rate lever)
    const dprCap = preset === "high" ? 1.5 : preset === "medium" ? 1.25 : 1.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.onResize();

    // Post chain
    if (this.bloomPass) this.bloomPass.enabled = !low;
    if (this.chromaticPass) this.chromaticPass.enabled = !low;
    if (this.fxaaPass) this.fxaaPass.enabled = true; // cheap, always worth it

    // Shadows
    this.renderer.shadowMap.enabled = !low;
    const sunLight = this.scene.getObjectByName("SunLight");
    if (sunLight instanceof THREE.DirectionalLight) {
      sunLight.castShadow = !low;
      const size = preset === "high" ? 2048 : 1024;
      if (sunLight.shadow.mapSize.x !== size) {
        sunLight.shadow.mapSize.set(size, size);
        sunLight.shadow.map?.dispose();
        sunLight.shadow.map = null;
      }
    }
    try {
      localStorage.setItem("astra.quality", preset);
    } catch {
      /* private browsing */
    }
    console.log(`Quality: ${preset.toUpperCase()}`);
  }

  /** Legacy toggle kept for the HUD button pathway. */
  public setPerformanceMode(enabled: boolean) {
    this.setQuality(enabled ? "low" : "high");
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    const pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms["resolution"].value.x =
      1 / (window.innerWidth * pixelRatio);
    this.fxaaPass.material.uniforms["resolution"].value.y =
      1 / (window.innerHeight * pixelRatio);
  }

  public render(delta?: number) {
    if (delta) {
      this.elapsed += delta;
    }

    // Dynamic Chromatic Aberration based on Player Suit Oxygen
    if (this.chromaticPass) {
      this.chromaticPass.uniforms["uTime"].value = this.elapsed;
      
      const playerEntity = queries.player.entities[0];
      if (playerEntity && playerEntity.playerControl) {
        const oxygenPercent = playerEntity.playerControl.oxygen / playerEntity.playerControl.maxOxygen;
        if (oxygenPercent < 0.3) {
          // Warning threshold: Pulse offset as a rhythmic warning heartbeat
          const intensity = 1.0 - (oxygenPercent / 0.3); // 0 at 30%, 1 at 0%
          const pulse = 0.5 + Math.sin(this.elapsed * 10.0) * 0.5; // fast warning pulse
          this.chromaticPass.uniforms["offset"].value = intensity * 0.006 * pulse;
          this.chromaticPass.uniforms["uWarningIntensity"].value = intensity;
        } else {
          this.chromaticPass.uniforms["offset"].value = 0.0;
          this.chromaticPass.uniforms["uWarningIntensity"].value = 0.0;
        }
      } else {
        this.chromaticPass.uniforms["offset"].value = 0.0;
        this.chromaticPass.uniforms["uWarningIntensity"].value = 0.0;
      }
    }

    this.composer.render();
  }
}

export const renderer = new Renderer();
