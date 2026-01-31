import * as THREE from 'three'
import { Planet } from '../entities/Planet'

export function createCrashSite(scene: THREE.Scene, planet: Planet, offset: THREE.Vector3) {
  const group = new THREE.Group()

  // Wreckage Materials
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.7,
    metalness: 0.8
  })

  const charredMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 1.0
  })

  // Main Hull
  const hullGeo = new THREE.CylinderGeometry(5, 8, 20, 8)
  const hull = new THREE.Mesh(hullGeo, metalMat)
  hull.rotation.z = Math.PI / 3
  hull.castShadow = true
  group.add(hull)

  // Debris
  for(let i=0; i<10; i++) {
    const debrisGeo = new THREE.BoxGeometry(1 + Math.random(), 1 + Math.random(), 1 + Math.random())
    const debris = new THREE.Mesh(debrisGeo, Math.random() > 0.5 ? metalMat : charredMat)
    debris.position.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 20
    )
    debris.rotation.set(Math.random(), Math.random(), Math.random())
    debris.castShadow = true
    group.add(debris)
  }

  // Positioning on Planet
  // We place it at 'offset' relative to planet center, then align
  const pos = planet.mesh.position.clone().add(offset)
  group.position.copy(pos)

  // Align up
  const up = offset.clone().normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
  group.quaternion.copy(q)

  scene.add(group)

  // Add some text hint?
  // Maybe a floating sprite or just visual storytelling
}
