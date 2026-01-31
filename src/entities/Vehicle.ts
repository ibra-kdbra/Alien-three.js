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
  speed = 100
  turnSpeed = 1.5
  hoverHeight = 1.5 // Target distance from ground
  stiffness = 150
  damping = 10

  // State
  isOccupied: boolean = false

  // Suspension points (Local space)
  suspensionPoints = [
      new CANNON.Vec3(1.2, -0.6, 2),
      new CANNON.Vec3(-1.2, -0.6, 2),
      new CANNON.Vec3(1.2, -0.6, -2),
      new CANNON.Vec3(-1.2, -0.6, -2)
  ]

  constructor(world: PhysicsWorld, position: CANNON.Vec3) {
    this.world = world

    // Chassis
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1.5, 0.5, 2.5))
    this.chassisBody = new CANNON.Body({ mass: 150 })
    this.chassisBody.addShape(chassisShape)
    this.chassisBody.position.copy(position)
    this.chassisBody.angularDamping = 0.5
    this.chassisBody.linearDamping = 0.1
    this.world.world.addBody(this.chassisBody)

    // Visuals
    this.mesh = new THREE.Group()

    // Body Mesh Placeholder
    const bodyGeo = new THREE.BoxGeometry(3, 1, 5)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff4400, metalness: 0.8, roughness: 0.2 })
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    bodyMesh.castShadow = true
    this.mesh.add(bodyMesh)

    // Thrusters visual
    const thrusterGeo = new THREE.CylinderGeometry(0.3, 0.1, 1)
    const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2 })
    this.suspensionPoints.forEach(p => {
        const t = new THREE.Mesh(thrusterGeo, thrusterMat)
        t.position.set(p.x, p.y - 0.5, p.z)
        this.mesh.add(t)
    })

    this.loadModel()
  }

  async loadModel() {
    const loader = new ModelLoader()
    const model = await loader.load('/models/vehicle.glb')
    if (model) {
      this.mesh.children[0].visible = false // Hide placeholder
      this.bodyModel = model
      this.bodyModel.scale.set(1.5, 1.5, 1.5)
      this.bodyModel.rotation.y = Math.PI
      this.mesh.add(this.bodyModel)
    }
  }

  update(_dt: number, input?: InputManager) {
    // 1. Sync Visuals
    this.mesh.position.copy(this.chassisBody.position as any)
    this.mesh.quaternion.copy(this.chassisBody.quaternion as any)

    // 2. Gravity & Up Vector
    // Note: PhysicsWorld applies gravity force to center of mass.
    // We get the Up vector (surface normal) from it.
    const up = this.world.applyGravity(this.chassisBody) || new CANNON.Vec3(0, 1, 0)

    // 3. Raycast Suspension
    const down = up.scale(-1)

    for (const point of this.suspensionPoints) {
        // Transform local point to world
        const worldPoint = new CANNON.Vec3()
        this.chassisBody.pointToWorldFrame(point, worldPoint)

        // Raycast down
        const rayStart = worldPoint
        const rayEnd = worldPoint.vadd(down.scale(this.hoverHeight + 1.0)) // Cast slightly further than target

        const result = new CANNON.RaycastResult()
        const hasHit = this.world.world.raycastClosest(rayStart, rayEnd, {
            collisionFilterGroup: 2, // Assume vehicle is group 2? Or Default 1.
            // We need to avoid hitting self.
            skipBackfaces: true
        }, result)

        // If we hit something that is NOT us
        if (hasHit && result.body !== this.chassisBody) {
            const distance = result.distance

            if (distance < this.hoverHeight) {
                // Compression
                const offset = this.hoverHeight - distance

                // Calculate velocity at this point
                // v_point = v_cm + w x r
                const r = worldPoint.vsub(this.chassisBody.position)
                const velAtPoint = this.chassisBody.velocity.vadd(this.chassisBody.angularVelocity.cross(r))

                // Project velocity onto Up vector
                const velProj = velAtPoint.dot(up)

                // Spring Force: F = k * x - d * v
                const forceMag = (this.stiffness * offset) - (this.damping * velProj)

                // Apply
                if (forceMag > 0) {
                    const force = up.scale(forceMag)
                    this.chassisBody.applyForce(force, worldPoint)
                }
            }
        }
    }

    // 4. Stabilization (Keep upright)
    // Small torque to align local Up with World Up
    const bodyUp = new CANNON.Vec3(0, 1, 0)
    this.chassisBody.quaternion.vmult(bodyUp, bodyUp)

    const alignment = bodyUp.dot(up)
    if (alignment < 0.9) { // If tilted
       const axis = bodyUp.cross(up)
       const correction = 500 * (1 - alignment)
       this.chassisBody.applyTorque(axis.scale(correction))
    }

    // 5. Driving Controls
    if (this.isOccupied && input) {
        // Forward/Back
        const forward = new CANNON.Vec3(0, 0, -1)
        this.chassisBody.quaternion.vmult(forward, forward)

        // Project forward onto plane perpendicular to up to ensure we move along ground
        // forward = forward - (forward . up) * up
        // Actually, just pushing "forward" locally is fine for a hovercraft.

        if (input.forward) {
             this.chassisBody.applyForce(forward.scale(this.speed * 10), this.chassisBody.position)
        }
        if (input.backward) {
             this.chassisBody.applyForce(forward.scale(-this.speed * 5), this.chassisBody.position)
        }

        // Turning (Torque around Up)
        if (input.left) {
             this.chassisBody.applyTorque(up.scale(this.turnSpeed * 400))
        }
        if (input.right) {
             this.chassisBody.applyTorque(up.scale(-this.turnSpeed * 400))
        }
    }
  }
}
