import './style.css'
import * as THREE from 'three'
import { PhysicsWorld } from './core/PhysicsWorld'
import { InputManager } from './core/InputManager'
import { Planet } from './entities/Planet'
import { PlayerController } from './entities/PlayerController'
import { Vehicle } from './entities/Vehicle'
import { createStarfield, createTree } from './world/Environment'
import * as CANNON from 'cannon-es'
import { EffectComposer, RenderPass, UnrealBloomPass } from 'three-stdlib'

// Setup
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050510)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
// Camera position will be handled by PlayerController

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.querySelector('#app')!.appendChild(renderer.domElement)

// Post Processing (Bloom)
const composer = new EffectComposer(renderer)
const renderPass = new RenderPass(scene, camera)
composer.addPass(renderPass)

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85)
bloomPass.threshold = 0.2
bloomPass.strength = 1.2
bloomPass.radius = 0.5
composer.addPass(bloomPass)

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.5)
scene.add(ambientLight)

const sunLight = new THREE.PointLight(0xffffff, 2, 500)
sunLight.position.set(50, 100, 50)
sunLight.castShadow = true
scene.add(sunLight)

// Systems
const physicsWorld = new PhysicsWorld()
const inputManager = new InputManager()

// Planets
const planets: Planet[] = []
const p1 = new Planet(20, 0x2E8B57, new THREE.Vector3(0, 0, 0))
const p2 = new Planet(15, 0xCD5C5C, new THREE.Vector3(60, 20, 0))
const p3 = new Planet(12, 0xADD8E6, new THREE.Vector3(-50, -10, 30))
planets.push(p1, p2, p3)

planets.forEach(p => {
  scene.add(p.mesh)
  physicsWorld.addPlanet(p.body)
})

// Starfield
scene.add(createStarfield(3000))

// Trees
for (let i = 0; i < 20; i++) {
  const tree = createTree()
  const u = Math.random()
  const v = Math.random()
  const theta = 2 * Math.PI * u
  const phi = Math.acos(2 * v - 1)
  const x = p1.radius * Math.sin(phi) * Math.cos(theta)
  const y = p1.radius * Math.sin(phi) * Math.sin(theta)
  const z = p1.radius * Math.cos(phi)
  const pos = new THREE.Vector3(x, y, z).add(p1.mesh.position)
  tree.position.copy(pos)

  const up = pos.clone().sub(p1.mesh.position).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
  tree.quaternion.copy(q)
  scene.add(tree)

  // Tree Physics
  const shape = new CANNON.Box(new CANNON.Vec3(0.5, 2, 0.5))
  const body = new CANNON.Body({ mass: 0 })
  body.addShape(shape, new CANNON.Vec3(0, 2, 0))
  body.position.set(pos.x, pos.y, pos.z)
  body.quaternion.set(q.x, q.y, q.z, q.w)
  physicsWorld.world.addBody(body)
}

// Player
const player = new PlayerController(scene, physicsWorld, camera, inputManager)
// Position player on P1 surface top
player.body.position.set(0, 25, 0)

// Vehicle
const vehiclePos = new CANNON.Vec3(5, 25, 0) // Near player
const vehicle = new Vehicle(physicsWorld, vehiclePos)
scene.add(vehicle.mesh)

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
        if (player.mesh.position.distanceTo(vehicle.mesh.position) < 5) {
          player.drive(vehicle)
        }
      }
      wasInteractPressed = true
    }
  } else {
    wasInteractPressed = false
  }

  // Physics & Updates
  physicsWorld.step(dt)

  player.update(dt)

  // Update vehicle if not driven (Player updates it when driven)
  if (!player.currentVehicle) {
    vehicle.update(dt)
  }

  // UI Update
  const uiText = document.getElementById('instructions')!
  uiText.innerHTML = `
    <b>Controls:</b> WASD to Move, Space to Jump, Q to Disguise, E to Vehicle, V to Camera<br>
    <b>Mode:</b> ${player.isAlien ? '<span style="color:#0f0">ALIEN</span>' : '<span style="color:#fa0">HUMAN</span>'}<br>
    <b>Status:</b> ${player.currentVehicle ? 'Driving' : 'Walking'}
  `

  composer.render()
}
animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
})
