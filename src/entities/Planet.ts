import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export class Planet {
  mesh: THREE.Mesh
  body: CANNON.Body
  radius: number

  constructor(radius: number, color: number, position: THREE.Vector3) {
    this.radius = radius

    // Visuals
    const geometry = new THREE.SphereGeometry(radius, 128, 128)
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      metalness: 0.1
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.copy(position)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true

    // Physics
    this.body = new CANNON.Body({ mass: 0 }) // Static
    this.body.addShape(new CANNON.Sphere(radius))
    this.body.position.set(position.x, position.y, position.z)
    // We need to assign material in main? Or pass world here?
    // We'll assign it externally for now.
  }
}
