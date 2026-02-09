import * as THREE from 'three'
import { atmosphereVertex, atmosphereFragment } from '../shaders/Atmosphere'
import { createPlanetTexture } from '../utils/TextureGenerator'

export class Planet {
  mesh: THREE.Mesh
  atmosphereMesh: THREE.Mesh
  radius: number

  constructor(radius: number, color: number, position: THREE.Vector3) {
    this.radius = radius

    // Visuals
    const geometry = new THREE.SphereGeometry(radius, 64, 64) // Reduced segments for performance
    const material = new THREE.MeshStandardMaterial({
      map: createPlanetTexture(color, new THREE.Color(color).addScalar(0.2).getHex()),
      roughness: 0.8,
      metalness: 0.2,
      bumpScale: 2.0
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.copy(position)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true

    // Atmosphere
    const atmosphereGeo = new THREE.SphereGeometry(radius * 1.1, 64, 64)
    const atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      uniforms: {
        glowColor: { value: new THREE.Color(color).addScalar(0.2) },
        coefficient: { value: 0.1 },
        power: { value: 2.0 }
      },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending
    })
    this.atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat)
    this.atmosphereMesh.position.copy(position)
  }
}
