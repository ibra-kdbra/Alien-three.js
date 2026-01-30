import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { PhysicsWorld } from '../core/PhysicsWorld'
import { InputManager } from '../core/InputManager'
import { ModelLoader } from '../utils/ModelLoader'

export class Vehicle {
  mesh: THREE.Group
  chassisBody: CANNON.Body
  world: PhysicsWorld
  bodyModel: THREE.Object3D | null = null

  // Settings
  speed = 40
  turnSpeed = 2

  // State
  isOccupied: boolean = false

  constructor(world: PhysicsWorld, position: CANNON.Vec3) {
    this.world = world

    // Chassis
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1.5, 0.5, 2.5))
    this.chassisBody = new CANNON.Body({ mass: 150 })
    this.chassisBody.addShape(chassisShape)
    this.chassisBody.position.copy(position)
    this.chassisBody.angularDamping = 0.9 // Dampen rotation
    this.chassisBody.linearDamping = 0.5
    this.world.world.addBody(this.chassisBody)

    // Visuals
    this.mesh = new THREE.Group()

    // Body Mesh
    const bodyGeo = new THREE.BoxGeometry(3, 1, 5)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2 })
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    bodyMesh.castShadow = true
    this.mesh.add(bodyMesh)

    // Wheels (Visual only for hover)
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.5, 16)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333 })
    const positions = [
      [-1.5, -0.5, 2], [1.5, -0.5, 2],
      [-1.5, -0.5, -2], [1.5, -0.5, -2]
    ]
    positions.forEach(pos => {
      const w = new THREE.Mesh(wheelGeo, wheelMat)
      w.position.set(pos[0], pos[1], pos[2])
      w.rotation.z = Math.PI / 2
      this.mesh.add(w)
    })

    this.loadModel()
  }

  async loadModel() {
    const loader = new ModelLoader()
    const model = await loader.load('/models/vehicle.glb')
    if (model) {
      // Clear placeholders
      this.mesh.clear()
      this.bodyModel = model
      this.bodyModel.scale.set(1.5, 1.5, 1.5) // Adjust scale
      this.bodyModel.rotation.y = Math.PI // Fix orientation if needed
      this.mesh.add(this.bodyModel)
    }
  }

  update(dt: number, input?: InputManager) {
    // Sync visual
    this.mesh.position.set(
      this.chassisBody.position.x,
      this.chassisBody.position.y,
      this.chassisBody.position.z
    )
    this.mesh.quaternion.set(
      this.chassisBody.quaternion.x,
      this.chassisBody.quaternion.y,
      this.chassisBody.quaternion.z,
      this.chassisBody.quaternion.w
    )

    // Gravity
    const up = this.world.applyGravity(this.chassisBody) || new CANNON.Vec3(0, 1, 0)

    // Hover / Suspension Logic
    // Raycast down from center (simplified)
    // Actually, we need to keep it "upright" relative to surface.
    // Apply a torque to align with Up vector (stabilizer)

    const bodyUp = new CANNON.Vec3(0, 1, 0)
    this.chassisBody.quaternion.vmult(bodyUp, bodyUp)

    // Torque to align bodyUp to up
    const axis = bodyUp.cross(up)
    const dot = Math.min(Math.max(bodyUp.dot(up), -1), 1)
    const angle = Math.acos(dot) // Angle between 0 and PI

    if (angle > 0.01) {
        // Apply torque to correct
        const correctionForce = 200 * angle
        this.chassisBody.angularVelocity.x += axis.x * correctionForce * dt
        this.chassisBody.angularVelocity.y += axis.y * correctionForce * dt
        this.chassisBody.angularVelocity.z += axis.z * correctionForce * dt
    }

    // Suspension force (Keep at height)
    // Ideally use raycast. For now, we rely on collision with ground?
    // If we want it to drive, we need it to touch ground or hover.
    // Let's use "Hover" force if close to planet.

    // Driving
    if (this.isOccupied && input) {
        const forward = new CANNON.Vec3(0, 0, -1)
        this.chassisBody.quaternion.vmult(forward, forward)

        const right = new CANNON.Vec3(1, 0, 0)
        this.chassisBody.quaternion.vmult(right, right)

        if (input.forward) {
             const force = forward.scale(this.speed * 50)
             this.chassisBody.applyForce(force, this.chassisBody.position)
        }
        if (input.backward) {
             const force = forward.scale(-this.speed * 50)
             this.chassisBody.applyForce(force, this.chassisBody.position)
        }

        if (input.left) {
             this.chassisBody.angularVelocity.x += up.x * this.turnSpeed * dt
             this.chassisBody.angularVelocity.y += up.y * this.turnSpeed * dt
             this.chassisBody.angularVelocity.z += up.z * this.turnSpeed * dt
        }
        if (input.right) {
             this.chassisBody.angularVelocity.x -= up.x * this.turnSpeed * dt
             this.chassisBody.angularVelocity.y -= up.y * this.turnSpeed * dt
             this.chassisBody.angularVelocity.z -= up.z * this.turnSpeed * dt
        }
    }
  }
}
