import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { RapierPhysicsWorld } from '../core/RapierPhysicsWorld'

export class Beacon {
  mesh: THREE.Group
  body: RAPIER.RigidBody
  isCollected: boolean = false

  constructor(world: RapierPhysicsWorld, position: THREE.Vector3) {
    this.mesh = new THREE.Group()

    // Visuals: A tall antenna with a pulsing light
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.2, 5, 8)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.y = 2.5
    this.mesh.add(pole)

    const lightGeo = new THREE.SphereGeometry(0.3, 16, 16)
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 5 })
    const light = new THREE.Mesh(lightGeo, lightMat)
    light.position.y = 5
    this.mesh.add(light)

    this.mesh.position.copy(position)

    // Physics: Static sensor
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    this.body = world.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 2.5, 0.5).setSensor(true)
    world.world.createCollider(colliderDesc, this.body)
  }

  update(dt: number) {
    // Pulse light
    const light = this.mesh.children[1] as THREE.Mesh
    const mat = light.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 2 + Math.sin(Date.now() * 0.005) * 2
  }
}
