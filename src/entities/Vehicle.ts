import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { RapierPhysicsWorld } from '../core/RapierPhysicsWorld'
import { InputManager } from '../core/InputManager'
import { ResourceManager } from '../core/ResourceManager'

export class Vehicle {
  mesh: THREE.Group
  body: RAPIER.RigidBody
  world: RapierPhysicsWorld
  bodyModel: THREE.Object3D | null = null

  // Settings
  speed = 1500
  turnSpeed = 10.0
  hoverHeight = 2.5
  stiffness = 300
  damping = 30

  // State
  isOccupied: boolean = false

  // Suspension points (Local space)
  suspensionPoints = [
    new THREE.Vector3(1.5, -0.5, 2.0),
    new THREE.Vector3(-1.5, -0.5, 2.0),
    new THREE.Vector3(1.5, -0.5, -2.0),
    new THREE.Vector3(-1.5, -0.5, -2.0)
  ]

  constructor(world: RapierPhysicsWorld, position: THREE.Vector3) {
    this.world = world

    // Chassis
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setAngularDamping(2.0)
      .setLinearDamping(0.5)
    
    this.body = world.world.createRigidBody(bodyDesc)
    
    const colliderDesc = RAPIER.ColliderDesc.cuboid(1.5, 0.5, 2.5)
    world.world.createCollider(colliderDesc, this.body)

    // Visuals
    this.mesh = new THREE.Group()

    // Body Mesh Placeholder
    const bodyGeo = new THREE.BoxGeometry(3, 1, 5)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4444ff, metalness: 0.8, roughness: 0.2 })
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    bodyMesh.castShadow = true
    this.mesh.add(bodyMesh)

    // Thrusters visual
    const thrusterGeo = new THREE.CylinderGeometry(0.3, 0.1, 0.5)
    const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2 })
    this.suspensionPoints.forEach(p => {
      const t = new THREE.Mesh(thrusterGeo, thrusterMat)
      t.position.set(p.x, p.y - 0.2, p.z)
      this.mesh.add(t)
    })

    this.loadModel()
  }

  async loadModel() {
    const loader = ResourceManager.getInstance()
    try {
      const model = await loader.loadModel('/models/vehicle.glb')
      this.mesh.children[0].visible = false // Hide placeholder
      this.bodyModel = model
      this.bodyModel.scale.set(1.5, 1.5, 1.5)
      this.bodyModel.rotation.y = Math.PI
      this.mesh.add(this.bodyModel)
    } catch (e) {
      console.warn('Failed to load vehicle model')
    }
  }

  update(dt: number, input?: InputManager) {
    // 1. Sync Visuals
    const translation = this.body.translation()
    const rotation = this.body.rotation()
    this.mesh.position.set(translation.x, translation.y, translation.z)
    this.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)

    // 2. Gravity & Up Vector
    const upVec = this.world.applySphericalGravity(this.body, dt)

    // 3. Raycast Suspension (Hover Logic)
    const down = upVec.clone().negate()
    this.suspensionPoints.forEach(p => {
        // Transform local point to world
        const worldPoint = p.clone().applyQuaternion(this.mesh.quaternion).add(this.mesh.position)
        
        // Raycast down from point
        const ray = new RAPIER.Ray(
            { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
            { x: down.x, y: down.y, z: down.z }
        )
        
        // Cast ray against world (excluding self)
        const hit = this.world.world.castRay(ray, this.hoverHeight * 2, true, undefined, undefined, this.body.collider(0))
        
        if (hit) {
            const distance = (hit as any).toi || (hit as any).time
            const offset = this.hoverHeight - distance
            
            if (offset > 0) {
                // Spring Force
                const velAtPoint = this.body.velocityAtPoint({ x: worldPoint.x, y: worldPoint.y, z: worldPoint.z })
                const velProj = new THREE.Vector3(velAtPoint.x, velAtPoint.y, velAtPoint.z).dot(upVec)
                
                const forceMag = (this.stiffness * offset) - (this.damping * velProj)
                if (forceMag > 0) {
                    const force = upVec.clone().multiplyScalar(forceMag * dt)
                    this.body.applyImpulseAtPoint(
                        { x: force.x, y: force.y, z: force.z },
                        { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
                        true
                    )
                }
            }
        }
    })

    // 4. Stabilization
    const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.mesh.quaternion)
    const alignment = bodyUp.dot(upVec)
    if (alignment < 0.99) {
      const axis = new THREE.Vector3().crossVectors(bodyUp, upVec)
      this.body.applyTorqueImpulse({ x: axis.x * 20, y: axis.y * 20, z: axis.z * 20 }, true)
    }

    // 4. Driving Controls
    if (this.isOccupied && input) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion)
      
      if (input.forward) {
        const force = forward.multiplyScalar(this.speed * dt)
        this.body.applyImpulse({ x: force.x, y: force.y, z: force.z }, true)
      }
      if (input.backward) {
        const force = forward.multiplyScalar(-this.speed * 0.5 * dt)
        this.body.applyImpulse({ x: force.x, y: force.y, z: force.z }, true)
      }

      if (input.left) {
        const torque = upVec.clone().multiplyScalar(this.turnSpeed)
        this.body.applyTorqueImpulse({ x: torque.x, y: torque.y, z: torque.z }, true)
      }
      if (input.right) {
        const torque = upVec.clone().multiplyScalar(-this.turnSpeed)
        this.body.applyTorqueImpulse({ x: torque.x, y: torque.y, z: torque.z }, true)
      }
    }
  }
}
