import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export class Renderer {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public composer: EffectComposer;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a0a12");

    // Atmospheric fog — alien planet haze
    this.scene.fog = new THREE.FogExp2(0x1a0e2e, 0.004);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
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

    // Bloom — tuned for subtle glow, not wash-out
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.6,  // strength
      0.3,  // radius
      0.7,  // threshold
    );
    this.composer.addPass(bloomPass);

    // Chromatic Aberration — subtle cinematic distortion
    const chromaticShader = {
      uniforms: {
        tDiffuse: { value: null },
        offset: { value: 0.0008 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float offset;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          float r = texture2D(tDiffuse, vUv + vec2(offset, 0.0)).r;
          float b = texture2D(tDiffuse, vUv - vec2(offset, 0.0)).b;
          gl_FragColor = vec4(r, color.g, b, color.a);
        }
      `,
    };
    const chromaticPass = new ShaderPass(chromaticShader);
    this.composer.addPass(chromaticPass);

    // Film grain — cinematic texture
    const filmGrainShader = {
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        intensity: { value: 0.04 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;
        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          float grain = rand(vUv + time) * intensity;
          color.rgb += grain - intensity * 0.5;
          gl_FragColor = color;
        }
      `,
    };
    this.filmGrainPass = new ShaderPass(filmGrainShader);
    this.composer.addPass(this.filmGrainPass);

    // FXAA — smooth edges
    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    fxaaPass.material.uniforms["resolution"].value.x =
      1 / (window.innerWidth * pixelRatio);
    fxaaPass.material.uniforms["resolution"].value.y =
      1 / (window.innerHeight * pixelRatio);
    this.fxaaPass = fxaaPass;
    this.composer.addPass(fxaaPass);

    // Output pass (color space)
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    window.addEventListener("resize", this.onResize.bind(this));
  }

  private filmGrainPass: ShaderPass;
  private fxaaPass: ShaderPass;
  private elapsed = 0;

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
      this.filmGrainPass.uniforms["time"].value = this.elapsed;
    }
    this.composer.render();
  }
}

export const renderer = new Renderer();
