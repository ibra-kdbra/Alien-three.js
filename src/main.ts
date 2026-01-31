import './style.css'
import * as THREE from 'three'
import { PhysicsWorld } from './core/PhysicsWorld'
import { InputManager } from './core/InputManager'
import { Planet } from './entities/Planet'
import { PlayerController } from './entities/PlayerController'
import { Vehicle } from './entities/Vehicle'
import { createStarfield, createTree, createRock } from './world/Environment'
import { createCrashSite } from './world/StoryElements'
import { createNoiseTexture } from './utils/TextureGenerator'
import * as CANNON from 'cannon-es'
import { EffectComposer, RenderPass, UnrealBloomPass } from 'three-stdlib'

// Setup
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050510)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000)

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.querySelector('#app')!.appendChild(renderer.domElement)

// Post Processing (Bloom)
const composer = new EffectComposer(renderer)
const renderPass = new RenderPass(scene, camera)
composer.addPass(renderPass)

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85)
bloomPass.threshold = 0.1
bloomPass.strength = 1.5
bloomPass.radius = 0.8
composer.addPass(bloomPass)

// Fog
scene.fog = new THREE.FogExp2(0x110520, 0.002)

// Sun Flare
const texLoader = new THREE.TextureLoader()
const spriteMaterial = new THREE.SpriteMaterial({
    map: texLoader.load('https://threejs.org/examples/textures/lensflare/lensflare0.png'),
    color: 0xffaa00,
    blending: THREE.AdditiveBlending
});
const sprite = new THREE.Sprite(spriteMaterial);
sprite.scale.set(2000, 2000, 1)
sprite.position.set(1000, 2000, 500)
scene.add(sprite);

// Lighting
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
hemiLight.position.set(0, 1000, 0)
scene.add(hemiLight)

const dirLight = new THREE.DirectionalLight(0xffdfba, 2.5)
dirLight.position.set(1000, 2000, 500)
dirLight.castShadow = true
dirLight.shadow.camera.top = 1000
dirLight.shadow.camera.bottom = -1000
dirLight.shadow.camera.left = -1000
dirLight.shadow.camera.right = 1000
dirLight.shadow.camera.near = 0.1
dirLight.shadow.camera.far = 5000
dirLight.shadow.mapSize.width = 4096
dirLight.shadow.mapSize.height = 4096
scene.add(dirLight)

// Systems
const physicsWorld = new PhysicsWorld()
const inputManager = new InputManager()

// Planets
const planets: Planet[] = []
const p1 = new Planet(500, 0x2E8B57, new THREE.Vector3(0, 0, 0))
const p2 = new Planet(300, 0xCD5C5C, new THREE.Vector3(1200, 400, 0))
const p3 = new Planet(200, 0xADD8E6, new THREE.Vector3(-1000, -200, 600))
planets.push(p1, p2, p3)

const tex1 = createNoiseTexture(0x2E8B57, 0x3E9B67); (p1.mesh.material as THREE.MeshStandardMaterial).map = tex1
const tex2 = createNoiseTexture(0xCD5C5C, 0xDD6C6C); (p2.mesh.material as THREE.MeshStandardMaterial).map = tex2
const tex3 = createNoiseTexture(0xADD8E6, 0xBDD8F6); (p3.mesh.material as THREE.MeshStandardMaterial).map = tex3

planets.forEach(p => {
  scene.add(p.mesh)
  p.body.material = physicsWorld.defaultMaterial
  physicsWorld.addPlanet(p.body)
})

scene.add(createStarfield(3000))

// Environment
for (let i = 0; i < 800; i++) {
  const isTree = Math.random() > 0.3
  let obj: THREE.Object3D

  if (isTree) {
      const colors = [0x8A2BE2, 0x00CED1, 0xFF4500]
      const color = colors[Math.floor(Math.random() * colors.length)]
      obj = createTree(10 + Math.random() * 20, color)
  } else {
      obj = createRock(2 + Math.random() * 5)
  }

  const u = Math.random()
  const v = Math.random()
  const theta = 2 * Math.PI * u
  const phi = Math.acos(2 * v - 1)
  const x = p1.radius * Math.sin(phi) * Math.cos(theta)
  const y = p1.radius * Math.sin(phi) * Math.sin(theta)
  const z = p1.radius * Math.cos(phi)
  const pos = new THREE.Vector3(x, y, z).add(p1.mesh.position)
  obj.position.copy(pos)

  const up = pos.clone().sub(p1.mesh.position).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
  obj.quaternion.copy(q)
  scene.add(obj)

  // Physics
  if (isTree) {
    const shape = new CANNON.Box(new CANNON.Vec3(0.5, 2, 0.5))
    const body = new CANNON.Body({ mass: 0 })
    body.addShape(shape, new CANNON.Vec3(0, 2, 0))
    body.position.set(pos.x, pos.y, pos.z)
    body.quaternion.set(q.x, q.y, q.z, q.w)
    physicsWorld.world.addBody(body)
  } else {
    const shape = new CANNON.Box(new CANNON.Vec3(1, 1, 1))
    const body = new CANNON.Body({ mass: 0 })
    body.addShape(shape)
    body.position.set(pos.x, pos.y, pos.z)
    body.quaternion.set(q.x, q.y, q.z, q.w)
    physicsWorld.world.addBody(body)
  }
}

// Player
const player = new PlayerController(scene, physicsWorld, camera, inputManager)

// Vehicle
const vehiclePos = new CANNON.Vec3(10, 505, 0)
const vehicle = new Vehicle(physicsWorld, vehiclePos)
scene.add(vehicle.mesh)

createCrashSite(scene, p1, new THREE.Vector3(30, 500, 30))

// UI Cache
const uiMode = document.getElementById('mode-indicator')!
const uiVehicle = document.getElementById('vehicle-indicator')!

// Loop
const clock = new THREE.Clock()
let wasInteractPressed = false

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.1)

  // Interaction Logic
  if (inputManager.interact) {
    if (!wasInteractPressed) {
      if (player.currentVehicle) {
        player.dismount()
      } else {
        if (player.mesh.position.distanceTo(vehicle.mesh.position) < 8) {
          player.drive(vehicle)
        }
      }
      wasInteractPressed = true
    }
  } else {
    wasInteractPressed = false
  }

  physicsWorld.step(dt)
  player.update(dt)

  if (!player.currentVehicle) {
    vehicle.update(dt)
  }

  // UI Update
  if (player.isAlien) {
      if (uiMode.textContent !== 'ALIEN') {
          uiMode.textContent = 'ALIEN'
          uiMode.className = 'value alien'
      }
  } else {
      if (uiMode.textContent !== 'HUMAN') {
          uiMode.textContent = 'HUMAN'
          uiMode.className = 'value human'
      }
  }

  const vStatus = player.currentVehicle ? 'ACTIVE' : 'NONE'
  if (uiVehicle.textContent !== vStatus) {
      uiVehicle.textContent = vStatus
  }

  composer.render()

  inputManager.resetMouse()
}
animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
})
