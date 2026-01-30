import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { InputManager } from '../core/InputManager'
import { PhysicsWorld } from '../core/PhysicsWorld'
import { ModelLoader } from '../utils/ModelLoader'
import { Vehicle } from './Vehicle'

export class PlayerController {
  mesh: THREE.Group
  body: CANNON.Body
  camera: THREE.Camera
  input: InputManager
  physicsWorld: PhysicsWorld

  // States
  isAlien: boolean = false
  isFirstPerson: boolean = false
  wasDisguisePressed: boolean = false
  wasViewPressed: boolean = false
  currentVehicle: Vehicle | null = null
  wasInteractPressed: boolean = false

  // Models
  humanModel: THREE.Object3D
  alienModel: THREE.Object3D

  // Constants
  readonly humanSpeed = 10
  readonly alienSpeed = 25
  readonly humanJump = 5
  readonly alienJump = 12

  constructor(scene: THREE.Scene, world: PhysicsWorld, camera: THREE.Camera, input: InputManager) {
    this.physicsWorld = world
    this.camera = camera
    this.input = input
    this.mesh = new THREE.Group()
    scene.add(this.mesh)

    // Physics
    const radius = 0.5
    this.body = new CANNON.Body({
      mass: 5,
      shape: new CANNON.Sphere(radius),
      fixedRotation: true // We handle rotation manually
    })
    this.body.position.set(0, 25, 0)
    this.body.linearDamping = 0.9 // Friction-ish
    world.world.addBody(this.body)

    // Visuals Setup
    this.humanModel = this.createHumanPlaceholder()
    this.alienModel = this.createAlienPlaceholder()

    this.mesh.add(this.humanModel)
    this.mesh.add(this.alienModel)
    this.alienModel.visible = false

    // Load actual models if available
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
      this.mesh.remove(this.humanModel)
      this.humanModel = human
      // Scale correction usually needed
      this.humanModel.scale.set(0.5, 0.5, 0.5)
      this.mesh.add(this.humanModel)
      this.updateVisualVisibility()
    }

    const alien = await loader.load('/models/alien.glb')
    if (alien) {
      this.mesh.remove(this.alienModel)
      this.alienModel = alien
      this.alienModel.scale.set(0.5, 0.5, 0.5)
      this.mesh.add(this.alienModel)
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

    // View Toggle
    if (this.input.toggleView) {
      if (!this.wasViewPressed) {
        this.isFirstPerson = !this.isFirstPerson
        this.wasViewPressed = true
      }
    } else {
      this.wasViewPressed = false
    }

    // Vehicle Mode
    if (this.currentVehicle) {
        this.currentVehicle.update(dt, this.input)

        // Sync player position to vehicle
        const seatOffset = new THREE.Vector3(0, 1, 0)
        seatOffset.applyQuaternion(this.currentVehicle.mesh.quaternion)
        const seatPos = this.currentVehicle.mesh.position.clone().add(seatOffset)

        this.mesh.position.copy(seatPos)
        this.mesh.quaternion.copy(this.currentVehicle.mesh.quaternion)

        // Disable physics sync for player body (handled by drive())

        // Camera Follow Vehicle
        const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(this.currentVehicle.mesh.quaternion)
        this.updateCamera(upVec, this.currentVehicle.mesh.position)

        return
    }

    // 2. Movement
    const speed = this.isAlien ? this.alienSpeed : this.humanSpeed

    // Get camera forward direction but projected onto the planet surface
    // First, we need the "Up" vector (surface normal)
    // We can get it from the physics world gravity calculation or calculate it again.
    // For now, let's approximate by position relative to closest planet.
    // Actually, PhysicsWorld.applyGravity returns the up vector!

    const up = this.physicsWorld.applyGravity(this.body) || new CANNON.Vec3(0, 1, 0)
    const upVec = new THREE.Vector3(up.x, up.y, up.z)

    // Camera Direction
    const camDir = new THREE.Vector3()
    this.camera.getWorldDirection(camDir)

    // Project camDir onto tangent plane
    // forward = camDir - (camDir . up) * up
    const forward = camDir.clone().sub(upVec.clone().multiplyScalar(camDir.dot(upVec))).normalize()
    const right = new THREE.Vector3().crossVectors(forward, upVec).normalize()

    const moveDir = new THREE.Vector3(0, 0, 0)
    if (this.input.forward) moveDir.add(forward)
    if (this.input.backward) moveDir.sub(forward)
    if (this.input.right) moveDir.add(right)
    if (this.input.left) moveDir.sub(right)

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(speed)
      this.body.velocity.x += moveDir.x * dt * 5 // Acceleration
      this.body.velocity.y += moveDir.y * dt * 5
      this.body.velocity.z += moveDir.z * dt * 5
    }

    // Jump
    if (this.input.jump) {
        // Check if grounded (simple raycast or just proximity)
        // For simplicity, just add force if velocity along normal is low
        const velDotUp = this.body.velocity.dot(up)
        if (Math.abs(velDotUp) < 0.1) {
            const jumpStrength = this.isAlien ? this.alienJump : this.humanJump
            this.body.velocity.x += up.x * jumpStrength
            this.body.velocity.y += up.y * jumpStrength
            this.body.velocity.z += up.z * jumpStrength
        }
    }

    // 3. Sync Visuals
    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    )

    // Rotate Character to face movement
    if (moveDir.lengthSq() > 0.1) {
        // Easy way: Look at position + moveDir, then align up.
        const lookPos = this.mesh.position.clone().add(moveDir)
        this.mesh.lookAt(lookPos)
        // Now correct the up vector? lookAt usually messes it up if up is not (0,1,0).
        this.mesh.up.copy(upVec)
        this.mesh.lookAt(lookPos)
    } else {
        // Just align to surface
        this.mesh.up.copy(upVec)
        // Keep facing previous direction?
        // this.mesh.lookAt(this.mesh.position.clone().add(this.mesh.getWorldDirection(new THREE.Vector3())))
    }

    // 4. Update Camera Position
    this.updateCamera(upVec, this.mesh.position)
  }

  drive(vehicle: Vehicle) {
      this.currentVehicle = vehicle
      this.currentVehicle.isOccupied = true
      // Disable player body
      this.physicsWorld.world.removeBody(this.body)
      this.mesh.visible = true // Or false if inside closed car. True for hoverbike.
  }

  dismount() {
      if (!this.currentVehicle) return
      this.currentVehicle.isOccupied = false

      // Restore player body
      const seatOffset = new THREE.Vector3(2, 0, 0) // Dismount to side
      seatOffset.applyQuaternion(this.currentVehicle.mesh.quaternion)
      const dismountPos = this.currentVehicle.mesh.position.clone().add(seatOffset)

      this.body.position.set(dismountPos.x, dismountPos.y, dismountPos.z)
      this.body.velocity.set(0, 0, 0)
      this.physicsWorld.world.addBody(this.body)

      this.currentVehicle = null
  }

  updateCamera(upVec: THREE.Vector3, targetPos: THREE.Vector3) {
    // Offset relative to player
    const offsetDistance = this.isFirstPerson ? 0.5 : (this.currentVehicle ? 10 : 5)
    const offsetHeight = this.isFirstPerson ? 0.5 : (this.currentVehicle ? 4 : 2)

    // Standard "Behind" follow
    const back = new THREE.Vector3(0, 0, 1) // Local back
    // If in vehicle, use vehicle orientation. If player, use player mesh orientation
    const orientation = this.currentVehicle ? this.currentVehicle.mesh.quaternion : this.mesh.quaternion
    back.applyQuaternion(orientation).normalize() // Vector pointing behind

    // But wait, mesh.lookAt logic flips Z?
    // Usually +Z is out of screen (back), -Z is forward.
    // Let's assume Forward is -Z. Back is +Z.

    // Actually, in update() we did mesh.lookAt(lookPos).
    // So Mesh Forward is -Z.

    const camPos = targetPos.clone()
        .add(upVec.clone().multiplyScalar(offsetHeight))
        .add(back.multiplyScalar(offsetDistance))

    this.camera.position.lerp(camPos, 0.1)

    if (this.isFirstPerson && !this.currentVehicle) {
        // First Person: Camera at head position, looking forward
        const headPos = targetPos.clone().add(upVec.clone().multiplyScalar(0.8))
        this.camera.position.lerp(headPos, 0.2)

        // Look direction: The direction the mesh is facing
        const forward = new THREE.Vector3(0, 0, -1)
        forward.applyQuaternion(this.mesh.quaternion)
        const lookTarget = headPos.clone().add(forward)

        this.camera.lookAt(lookTarget)
        this.camera.up.copy(upVec)

        // Hide mesh in first person so we don't clip through face
        this.mesh.visible = false
    } else {
        this.mesh.visible = true // Ensure visible in 3rd person
        this.camera.lookAt(targetPos)
        this.camera.up.copy(upVec)
    }
  }

  toggleDisguise() {
    this.isAlien = !this.isAlien
    this.updateVisualVisibility()
  }
}
