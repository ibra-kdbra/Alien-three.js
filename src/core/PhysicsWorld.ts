import * as CANNON from 'cannon-es'
import * as THREE from 'three'

export class PhysicsWorld {
  world: CANNON.World
  planets: CANNON.Body[] = [] // Using Cannon bodies to represent planet physics presence

  constructor() {
    this.world = new CANNON.World()
    this.world.gravity.set(0, 0, 0) // Disable default gravity
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    // this.world.solver.iterations = 10
  }

  addPlanet(planetBody: CANNON.Body) {
    this.planets.push(planetBody)
    this.world.addBody(planetBody)
  }

  // Apply spherical gravity to a body
  applyGravity(body: CANNON.Body) {
    if (this.planets.length === 0) return

    let closestPlanet: CANNON.Body | null = null
    let minDistanceSq = Infinity

    // Find closest planet
    for (const planet of this.planets) {
      const distSq = body.position.vsub(planet.position).lengthSquared()
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq
        closestPlanet = planet
      }
    }

    if (closestPlanet) {
      const gravityForce = 9.82 * body.mass // F = ma
      const direction = closestPlanet.position.vsub(body.position)
      direction.normalize()

      const force = direction.scale(gravityForce)
      body.applyForce(force, body.position)

      // We return the up vector for this body relative to the planet,
      // which is useful for character alignment.
      // Up vector is opposite to gravity direction.
      return direction.scale(-1)
    }

    return new CANNON.Vec3(0, 1, 0)
  }

  step(dt: number) {
    const fixedTimeStep = 1 / 60
    const maxSubSteps = 3
    this.world.step(fixedTimeStep, dt, maxSubSteps)
  }
}

// Helper to align a Three.js object to the surface normal (up vector)
export function alignToSurface(obj: THREE.Object3D, up: CANNON.Vec3) {
  const upVec = new THREE.Vector3(up.x, up.y, up.z)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upVec)
  obj.quaternion.slerp(quaternion, 0.1) // Smooth rotation
}
