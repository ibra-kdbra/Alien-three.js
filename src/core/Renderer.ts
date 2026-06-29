import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import chromaticFragmentShader from "../shaders/chromatic.fragment.glsl?raw";
import { queries } from "../ecs/World";

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

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Enable shadow maps
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Tone mapping for HDR-like visuals
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;

    // Post-Processing Pipeline
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Bloom — downscaled to 1/4 resolution for low-end graphics efficiency
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4),
      0.5,  // strength
      0.2,  // radius
      0.85, // threshold
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
  }

  private bloomPass: UnrealBloomPass;
  private fxaaPass: ShaderPass;
  private chromaticPass: ShaderPass;
  public performanceMode = false;
  private elapsed = 0;

  public setPerformanceMode(enabled: boolean) {
    this.performanceMode = enabled;

    // Toggle post-processing passes
    if (this.bloomPass) this.bloomPass.enabled = !enabled;
    if (this.fxaaPass) this.fxaaPass.enabled = !enabled;

    // Toggle renderer shadow map
    this.renderer.shadowMap.enabled = !enabled;

    // Toggle shadow casting on scene lights and meshes
    const sunLight = this.scene.getObjectByName("SunLight");
    if (sunLight && sunLight instanceof THREE.DirectionalLight) {
      sunLight.castShadow = !enabled;
    }

    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Rocks and other meshes don't cast or receive shadows in performance mode
        child.castShadow = !enabled;
        child.receiveShadow = !enabled;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => (m.needsUpdate = true));
          } else {
            child.material.needsUpdate = true;
          }
        }
      }
    });

    console.log(`Performance Mode: ${enabled ? "ON" : "OFF"}`);
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
