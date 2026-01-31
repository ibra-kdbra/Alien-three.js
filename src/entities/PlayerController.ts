import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { InputManager } from '../core/InputManager'
import { PhysicsWorld } from '../core/PhysicsWorld'
import { ModelLoader } from '../utils/ModelLoader'
import { Vehicle } from './Vehicle'
import { OrbitCamera } from '../core/OrbitCamera'

export class PlayerController {
  mesh: THREE.Group
  visuals: THREE.Group
  body: CANNON.Body
  camera: THREE.PerspectiveCamera
  orbitCamera: OrbitCamera
  input: InputManager
  physicsWorld: PhysicsWorld

  // States
  isAlien: boolean = false
  wasDisguisePressed: boolean = false
  currentVehicle: Vehicle | null = null
  wasInteractPressed: boolean = false

  // Models
  humanModel: THREE.Object3D
  alienModel: THREE.Object3D
  flashlight: THREE.SpotLight

  // Constants
  readonly humanSpeed = 10
  readonly alienSpeed = 25
  readonly humanJump = 8
  readonly alienJump = 15

  constructor(scene: THREE.Scene, world: PhysicsWorld, camera: THREE.PerspectiveCamera, input: InputManager) {
    this.physicsWorld = world
    this.camera = camera
    this.input = input
    this.orbitCamera = new OrbitCamera(camera, input)

    this.mesh = new THREE.Group()
    scene.add(this.mesh)

    // Physics
    const radius = 0.5
    this.body = new CANNON.Body({
      mass: 60, // Human mass
      shape: new CANNON.Sphere(radius),
      fixedRotation: true,
      material: world.defaultMaterial
    })
    this.body.position.set(0, 505, 0) // Start slightly above planet
    this.body.linearDamping = 0.9 // High damping for walking
    world.world.addBody(this.body)

    // Visuals Setup
    this.visuals = new THREE.Group()
    this.mesh.add(this.visuals)

    this.humanModel = this.createHumanPlaceholder()
    this.alienModel = this.createAlienPlaceholder()

    this.visuals.add(this.humanModel)
    this.visuals.add(this.alienModel)
    this.alienModel.visible = false

    // Flashlight
    this.flashlight = new THREE.SpotLight(0xffffff, 5, 50, Math.PI / 4, 0.5, 1)
    this.flashlight.position.set(0, 1, 0)
    this.flashlight.target.position.set(0, 1, -5)
    this.mesh.add(this.flashlight)
    this.mesh.add(this.flashlight.target)

    this.loadModels()
  }

  createHumanPlaceholder() {
    const group = new THREE.Group()
    const geo = new THREE.CapsuleGeometry(0.4, 1, 4, 8)
    const mat = new THREE.MeshStandardMaterial({ color: 0xffaa00 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = 0.5
    mesh.castShadow = true
    group.add(mesh)
    return group
  }

  createAlienPlaceholder() {
    const group = new THREE.Group()
    const geo = new THREE.IcosahedronGeometry(0.6, 1)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.5,
      wireframe: true
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = 0.6
    mesh.castShadow = true
    group.add(mesh)
    return group
  }

  async loadModels() {
    const loader = new ModelLoader()

    const human = await loader.load('/models/human.glb')
    if (human) {
      this.visuals.remove(this.humanModel)
      this.humanModel = human
      this.humanModel.scale.set(0.5, 0.5, 0.5)
      this.visuals.add(this.humanModel)
      this.updateVisualVisibility()
    }

    const alien = await loader.load('/models/alien.glb')
    if (alien) {
      this.visuals.remove(this.alienModel)
      this.alienModel = alien
      this.alienModel.scale.set(0.5, 0.5, 0.5)
      this.visuals.add(this.alienModel)
      this.updateVisualVisibility()
    }
  }

  updateVisualVisibility() {
    this.humanModel.visible = !this.isAlien
    this.alienModel.visible = this.isAlien
  }

  update(dt: number) {
    // 1. Handle Disguise Toggle
    if (this.input.disguise) {
      if (!this.wasDisguisePressed) {
        this.toggleDisguise()
        this.wasDisguisePressed = true
      }
    } else {
      this.wasDisguisePressed = false
    }

    // Vehicle Mode
    if (this.currentVehicle) {
        this.currentVehicle.update(dt, this.input)

        // Sync player position to vehicle visual
        const seatOffset = new THREE.Vector3(0, 0.5, 0)
        seatOffset.applyQuaternion(this.currentVehicle.mesh.quaternion)
        const seatPos = this.currentVehicle.mesh.position.clone().add(seatOffset)

        this.mesh.position.copy(seatPos)
        this.mesh.quaternion.copy(this.currentVehicle.mesh.quaternion)

        // Update Camera
        const vUp = new CANNON.Vec3(0, 1, 0)
        this.currentVehicle.chassisBody.quaternion.vmult(vUp, vUp) // Vehicle Local Up
        // Actually, for camera we prefer Planet Up usually, unless we want to roll with vehicle (nausea).
        // Let's use Planet Up for stable camera.
        const planetUp = this.physicsWorld.applyGravity(this.currentVehicle.chassisBody) || new CANNON.Vec3(0,1,0)
        const planetUpVec = new THREE.Vector3(planetUp.x, planetUp.y, planetUp.z)

        this.orbitCamera.targetDistance = 12
        this.orbitCamera.update(dt, this.currentVehicle.mesh.position, planetUpVec)

        return
    }

    // 2. Character Movement
    const speed = this.isAlien ? this.alienSpeed : this.humanSpeed

    // Get Gravity Up
    const up = this.physicsWorld.applyGravity(this.body) || new CANNON.Vec3(0, 1, 0)
    const upVec = new THREE.Vector3(up.x, up.y, up.z)

    // Camera-relative movement
    // Get Camera Forward project on Plane
    const camDir = new THREE.Vector3()
    this.camera.getWorldDirection(camDir)

    // Project camDir onto plane defined by upVec
    // v_proj = v - (v . n) * n
    const forward = camDir.clone().sub(upVec.clone().multiplyScalar(camDir.dot(upVec))).normalize()
    const right = new THREE.Vector3().crossVectors(forward, upVec).normalize()

    const moveInput = new THREE.Vector3(0, 0, 0)
    if (this.input.forward) moveInput.add(forward)
    if (this.input.backward) moveInput.sub(forward)
    if (this.input.right) moveInput.add(right)
    if (this.input.left) moveInput.sub(right)

    if (moveInput.lengthSq() > 0) moveInput.normalize()

    // Apply Velocity
    // We use "Instant" velocity change for responsiveness, but keep vertical velocity (gravity/jump)
    const currentVel = this.body.velocity
    const vVel = up.scale(currentVel.dot(up)) // Vertical component

    const targetVel = moveInput.clone().multiplyScalar(speed)
    const hVel = new CANNON.Vec3(targetVel.x, targetVel.y, targetVel.z)

    const finalVel = vVel.vadd(hVel)
    this.body.velocity.set(finalVel.x, finalVel.y, finalVel.z)

    // Jump
    if (this.input.jump) {
        // Raycast Check
        const rayStart = this.body.position
        const rayEnd = rayStart.vsub(up.scale(1.2)) // 0.5 radius + 0.7 margin
        const result = new CANNON.RaycastResult()
        const hit = this.physicsWorld.world.raycastClosest(rayStart, rayEnd, {
            skipBackfaces: true,
            collisionFilterGroup: 1
        }, result)

        if (hit) {
            const jumpForce = this.isAlien ? this.alienJump : this.humanJump
            this.body.velocity.vadd(up.scale(jumpForce), this.body.velocity)
        }
    }

    // 3. Sync Visuals
    this.mesh.position.copy(this.body.position as any)

    // Rotation: Face movement direction OR Camera direction?
    // RPG style: Face movement direction.
    if (moveInput.lengthSq() > 0.1) {
        // Look at currentPos + moveInput
        const lookTarget = this.mesh.position.clone().add(moveInput)
        this.mesh.up.copy(upVec)
        this.mesh.lookAt(lookTarget)
    } else {
        // Align to up
        this.mesh.up.copy(upVec)
    }

    // 4. Update Camera
    this.orbitCamera.targetDistance = 6
    this.orbitCamera.update(dt, this.mesh.position, upVec)
  }

  drive(vehicle: Vehicle) {
      this.currentVehicle = vehicle
      this.currentVehicle.isOccupied = true
      this.physicsWorld.world.removeBody(this.body)
      this.mesh.visible = true
  }

  dismount() {
      if (!this.currentVehicle) return
      this.currentVehicle.isOccupied = false

      const seatOffset = new THREE.Vector3(3, 2, 0)
      seatOffset.applyQuaternion(this.currentVehicle.mesh.quaternion)
      const dismountPos = this.currentVehicle.mesh.position.clone().add(seatOffset)

      this.body.position.set(dismountPos.x, dismountPos.y, dismountPos.z)
      this.body.velocity.set(0, 0, 0)
      this.physicsWorld.world.addBody(this.body)

      this.currentVehicle = null
  }

  toggleDisguise() {
    this.isAlien = !this.isAlien
    this.updateVisualVisibility()
  }
}
