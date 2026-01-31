import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { InputManager } from '../core/InputManager'
import { PhysicsWorld } from '../core/PhysicsWorld'
import { ModelLoader } from '../utils/ModelLoader'
import { Vehicle } from './Vehicle'

export class PlayerController {
  mesh: THREE.Group
  visuals: THREE.Group
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
  flashlight: THREE.SpotLight

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
      fixedRotation: true,
      material: world.defaultMaterial
    })
    this.body.position.set(0, 25, 0)
    this.body.linearDamping = 0.0 // No air resistance, we control velocity
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
    this.flashlight.target.position.set(0, 1, -5) // Points forward (-Z is forward for mesh)
    this.mesh.add(this.flashlight)
    this.mesh.add(this.flashlight.target)

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
      this.visuals.remove(this.humanModel)
      this.humanModel = human
      // Scale correction usually needed
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

    // Gravity Logic
    const up = this.physicsWorld.applyGravity(this.body) || new CANNON.Vec3(0, 1, 0)
    const upVec = new THREE.Vector3(up.x, up.y, up.z)

    // Camera Direction Project onto Surface
    const camDir = new THREE.Vector3()
    this.camera.getWorldDirection(camDir)
    const forward = camDir.clone().sub(upVec.clone().multiplyScalar(camDir.dot(upVec))).normalize()
    const right = new THREE.Vector3().crossVectors(forward, upVec).normalize()

    // Input Vector
    const moveInput = new THREE.Vector3(0, 0, 0)
    if (this.input.forward) moveInput.add(forward)
    if (this.input.backward) moveInput.sub(forward)
    if (this.input.right) moveInput.add(right)
    if (this.input.left) moveInput.sub(right)

    // Velocity Control
    // Decompose velocity into Vertical (Gravity) and Horizontal (Movement)
    const currentVel = new THREE.Vector3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z)
    const vertVelVal = currentVel.dot(upVec)
    const vertVel = upVec.clone().multiplyScalar(vertVelVal)
    const horizVel = currentVel.clone().sub(vertVel)

    // Target Horizontal Velocity
    let targetHorizVel = new THREE.Vector3(0,0,0)
    if (moveInput.lengthSq() > 0) {
        targetHorizVel = moveInput.normalize().multiplyScalar(speed)
    }

    // Smoothly interpolate horizontal velocity (Tight control)
    horizVel.lerp(targetHorizVel, 0.2)

    // Recombine
    const newVel = horizVel.add(vertVel)
    this.body.velocity.set(newVel.x, newVel.y, newVel.z)

    // Jump (Raycast Ground Check)
    if (this.input.jump) {
        const rayStart = new CANNON.Vec3(this.body.position.x, this.body.position.y, this.body.position.z)
        const rayEnd = rayStart.vsub(up.scale(1.5)) // 1.5 units down
        const rayResult = new CANNON.RaycastResult()
        const hasGround = this.physicsWorld.world.raycastClosest(rayStart, rayEnd, {
            skipBackfaces: true,
            collisionFilterMask: 1, // Default group
            collisionFilterGroup: 1
        }, rayResult)

        if (hasGround) {
             const jumpForce = this.isAlien ? this.alienJump : this.humanJump
             // Override vertical velocity for instant crisp jump
             // Remove current vertical velocity first
             this.body.velocity.vsub(new CANNON.Vec3(vertVel.x, vertVel.y, vertVel.z), this.body.velocity)
             // Add jump
             this.body.velocity.vadd(up.scale(jumpForce), this.body.velocity)
        }
    }

    // 3. Sync Visuals
    this.mesh.position.copy(this.body.position as any)

    // Rotate Character to face movement
    if (moveInput.lengthSq() > 0.1) {
        // Easy way: Look at position + moveDir, then align up.
        const lookPos = this.mesh.position.clone().add(moveInput)
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
        this.visuals.visible = false
    } else {
        this.visuals.visible = true // Ensure visible in 3rd person
        this.camera.lookAt(targetPos)
        this.camera.up.copy(upVec)
    }
  }

  toggleDisguise() {
    this.isAlien = !this.isAlien
    this.updateVisualVisibility()
  }
}
