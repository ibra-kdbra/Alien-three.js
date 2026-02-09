import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

export class RapierPhysicsWorld {
  public world!: RAPIER.World
  private planets: RAPIER.RigidBody[] = []
  private eventQueue!: RAPIER.EventQueue

  constructor() {
    // Note: Rapier needs to be initialized before constructor if we use RAPIER.World directly
    // but we'll handle initialization in an async static method
  }

  public static async create() {
    // New RAPIER init syntax to avoid deprecation warning
    await RAPIER.init()
    const instance = new RapierPhysicsWorld()
    
    const gravity = new RAPIER.Vector3(0, 0, 0)
    instance.world = new RAPIER.World(gravity)
    instance.eventQueue = new RAPIER.EventQueue(true)
    return instance
  }

  public addPlanet(radius: number, position: THREE.Vector3) {
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    const rigidBody = this.world.createRigidBody(rigidBodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
    this.world.createCollider(colliderDesc, rigidBody)
    this.planets.push(rigidBody)
    return rigidBody
  }

  public applySphericalGravity(body: RAPIER.RigidBody, dt: number = 1 / 60) {
    if (this.planets.length === 0) return new THREE.Vector3(0, 1, 0)

    const pos = body.translation()
    const bodyPos = new THREE.Vector3(pos.x, pos.y, pos.z)

    let closestPlanetPos = new THREE.Vector3()
    let minDistanceSq = Infinity

    for (const planet of this.planets) {
      const pPos = planet.translation()
      const planetPos = new THREE.Vector3(pPos.x, pPos.y, pPos.z)
      const distSq = bodyPos.distanceToSquared(planetPos)

      if (distSq < minDistanceSq) {
        minDistanceSq = distSq
        closestPlanetPos.copy(planetPos)
      }
    }

    const direction = new THREE.Vector3().subVectors(closestPlanetPos, bodyPos).normalize()
    const gravityMagnitude = 20.0 * body.mass() // Increased gravity for better feel
    const force = direction.clone().multiplyScalar(gravityMagnitude)

    // Apply as impulse over time
    body.applyImpulse({ x: force.x * dt, y: force.y * dt, z: force.z * dt }, true)

    return direction.clone().negate() // Up vector
  }

  public step() {
    this.world.step(this.eventQueue)
  }
}
