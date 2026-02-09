import * as THREE from 'three'
import { EffectComposer, RenderPass, UnrealBloomPass } from 'three-stdlib'

export class SceneManager {
  public scene: THREE.Scene
  public camera: THREE.PerspectiveCamera
  public renderer: THREE.WebGLRenderer
  public composer: EffectComposer

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x050510)
    this.scene.fog = new THREE.FogExp2(0x110520, 0.002)

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ReinhardToneMapping
    document.querySelector('#app')!.appendChild(this.renderer.domElement)

    // Post Processing
    this.composer = new EffectComposer(this.renderer)
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, 0.4, 0.85
    )
    bloomPass.threshold = 0.5
    bloomPass.strength = 0.4
    bloomPass.radius = 0.5
    this.composer.addPass(bloomPass)

    window.addEventListener('resize', () => this.onWindowResize())
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.composer.setSize(window.innerWidth, window.innerHeight)
  }

  public render() {
    this.composer.render()
  }

  public addLighting() {
    // Highly concentrated "Space" lighting
    const hemiLight = new THREE.HemisphereLight(0x00ffff, 0x000000, 0.1) // Dim ambient
    this.scene.add(hemiLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
    dirLight.position.set(1500, 2500, 1500)
    dirLight.castShadow = true
    
    // Tighten shadow camera for better resolution
    dirLight.shadow.camera.top = 1000
    dirLight.shadow.camera.bottom = -1000
    dirLight.shadow.camera.left = -1000
    dirLight.shadow.camera.right = 1000
    dirLight.shadow.camera.near = 100
    dirLight.shadow.camera.far = 8000
    dirLight.shadow.mapSize.width = 4096
    dirLight.shadow.mapSize.height = 4096
    dirLight.shadow.bias = -0.0001
    dirLight.shadow.radius = 2
    
    this.scene.add(dirLight)

    // Add a subtle point light on the player's position (handled in Game loop usually, 
    // but we can add a fixed one or a flashlight)
  }
}
