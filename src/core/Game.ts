import * as THREE from 'three'
import Stats from 'stats.js'
import { SceneManager } from './SceneManager'
import { ResourceManager } from './ResourceManager'
import { RapierPhysicsWorld } from './RapierPhysicsWorld'
import { InputManager } from './InputManager'
import { PlayerController } from '../entities/PlayerController'
import { Vehicle } from '../entities/Vehicle'
import { Planet } from '../entities/Planet'
import { Beacon } from '../entities/Beacon'
import { EnvironmentSystem } from '../world/EnvironmentSystem'
import { skyboxVertex, skyboxFragment } from '../shaders/Skybox'

export class Game {
  private sceneManager: SceneManager
  private physicsWorld!: RapierPhysicsWorld
  private inputManager: InputManager
  private resourceManager: ResourceManager
  private stats: Stats
  private clock: THREE.Clock
  private isDebug: boolean = false

  private player?: PlayerController
  private vehicle?: Vehicle
  private planets: Planet[] = []
  private beacons: Beacon[] = []
  private environmentSystem!: EnvironmentSystem

  constructor() {
    this.sceneManager = new SceneManager()
    this.inputManager = new InputManager()
    this.resourceManager = ResourceManager.getInstance()
    this.stats = new Stats()
    this.stats.dom.style.display = 'none' // Hidden by default
    this.clock = new THREE.Clock()

    document.body.appendChild(this.stats.dom)
  }

  public async init() {
    const loadingScreen = document.getElementById('loading-screen')
    const loadingBar = document.getElementById('loading-bar')
    const loadingText = document.getElementById('loading-text')

    const updateProgress = (progress: number, text: string) => {
      if (loadingBar) loadingBar.style.width = `${progress * 100}%`
      if (loadingText) loadingText.textContent = text
    }

    updateProgress(0.1, 'INITIALIZING RAPIER...')
    this.physicsWorld = await RapierPhysicsWorld.create()
    
    updateProgress(0.3, 'GENERATING BIOMES...')
    this.environmentSystem = new EnvironmentSystem(this.sceneManager.scene, this.physicsWorld)
    this.sceneManager.addLighting()
    
    updateProgress(0.5, 'CALIBRATING PLANETARY GRAVITY...')
    const p1 = new Planet(500, 0x2E8B57, new THREE.Vector3(0, 0, 0))
    this.planets.push(p1)
    this.sceneManager.scene.add(p1.mesh)
    this.sceneManager.scene.add(p1.atmosphereMesh)
    this.physicsWorld.addPlanet(p1.radius, p1.mesh.position)

    this.addSkybox()
    this.addEnvironment()
    this.addBeacons()

    // Player
    this.player = new PlayerController(
      this.sceneManager.scene,
      this.physicsWorld,
      this.sceneManager.camera,
      this.inputManager
    )

    // Vehicle
    const vehiclePos = new THREE.Vector3(10, 505, 0)
    this.vehicle = new Vehicle(this.physicsWorld, vehiclePos)
    this.sceneManager.scene.add(this.vehicle.mesh)

    updateProgress(1.0, 'SYSTEMS NOMINAL')
    setTimeout(() => {
      if (loadingScreen) loadingScreen.style.opacity = '0'
      setTimeout(() => loadingScreen?.remove(), 1000)
    }, 500)

    this.animate()
  }

  private animate() {
    requestAnimationFrame(() => this.animate())
    this.stats.begin()

    const dt = Math.min(this.clock.getDelta(), 0.1)

    this.update(dt)
    this.render()

    this.stats.end()
  }

  private update(dt: number) {
    this.physicsWorld.step()
    
    if (this.player) {
      this.handleDebugToggle()
      this.handleInteractions()
      this.player.update(dt)
    }

    if (this.vehicle && (!this.player || !this.player.currentVehicle)) {
      this.vehicle.update(dt)
    }

    this.updateUI()
    this.inputManager.update()
  }

  private addEnvironment() {
    this.planets.forEach(p => {
      this.environmentSystem.populatePlanet(p, 800)
    })
  }

  private updateUI() {
    if (!this.player) return

    const modeEl = document.getElementById('mode-indicator')
    const vehicleEl = document.getElementById('vehicle-indicator')

    if (modeEl) {
      const mode = 'ASTRONAUT'
      if (modeEl.textContent !== mode) {
        modeEl.textContent = mode
        modeEl.className = `value human`
      }
    }

    if (vehicleEl) {
      const status = this.player.currentVehicle ? 'ACTIVE' : 'NONE'
      if (vehicleEl.textContent !== status) {
        vehicleEl.textContent = status
      }
    }
  }

  private addSkybox() {
    const geo = new THREE.SphereGeometry(15000, 32, 32)
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyboxVertex,
      fragmentShader: skyboxFragment,
      side: THREE.BackSide
    })
    const skybox = new THREE.Mesh(geo, mat)
    this.sceneManager.scene.add(skybox)
  }

  private addBeacons() {
    const p1 = this.planets[0]
    for (let i = 0; i < 3; i++) {
        // Random spherical position
        const u = Math.random()
        const v = Math.random()
        const theta = 2 * Math.PI * u
        const phi = Math.acos(2 * v - 1)
        const x = p1.radius * Math.sin(phi) * Math.cos(theta)
        const y = p1.radius * Math.sin(phi) * Math.sin(theta)
        const z = p1.radius * Math.cos(phi)
        const pos = new THREE.Vector3(x, y, z).add(p1.mesh.position)
        
        const beacon = new Beacon(this.physicsWorld, pos)
        
        // Align to planet
        const up = pos.clone().sub(p1.mesh.position).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
        beacon.mesh.quaternion.copy(q)
        
        this.beacons.push(beacon)
        this.sceneManager.scene.add(beacon.mesh)
    }
  }

  private handleDebugToggle() {
    if (this.inputManager.isKeyPressed('KeyB')) {
      this.isDebug = !this.isDebug
      this.stats.dom.style.display = this.isDebug ? 'block' : 'none'
    }
  }

  private handleInteractions() {
    if (!this.player) return

    // 1. Vehicle Interaction
    if (this.inputManager.isKeyPressed('KeyE')) {
      if (this.player.currentVehicle) {
        this.player.dismount()
      } else if (this.vehicle) {
        if (this.player.mesh.position.distanceTo(this.vehicle.mesh.position) < 8) {
          this.player.drive(this.vehicle)
        }
      }
    }

    // 2. Beacon Collection
    this.beacons.forEach(beacon => {
        if (!beacon.isCollected && this.player!.mesh.position.distanceTo(beacon.mesh.position) < 5) {
            beacon.isCollected = true
            beacon.mesh.visible = false
            // Update log
            const log = document.getElementById('mission-log')
            if (log) {
                const collected = this.beacons.filter(b => b.isCollected).length
                log.innerHTML = `<div class="msg info">BEACON ${collected}/3 SECURED</div>`
                if (collected === 3) {
                    log.innerHTML += `<div class="msg success">SIGNAL LOCKED. RESCUE INBOUND.</div>`
                }
            }
        }
    })
  }

  private render() {
    this.sceneManager.render()
  }
}
