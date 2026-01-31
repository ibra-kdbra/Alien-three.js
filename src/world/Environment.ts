import * as THREE from 'three'

export function createStarfield(count: number = 2000): THREE.Points {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)

  for (let i = 0; i < count * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 20000 // Spread across 20000 units
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.5,
    sizeAttenuation: true
  })

  return new THREE.Points(geometry, material)
}

export function createTree(height: number = 10, color: number = 0x228B22): THREE.Group {
  const group = new THREE.Group()

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, height, 8)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x443322 })
  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.position.y = height / 2
  trunk.castShadow = true
  group.add(trunk)

  // Leaves
  const leavesGeo = new THREE.ConeGeometry(3, height * 1.5, 8)
  const leavesMat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.1 })
  const leaves = new THREE.Mesh(leavesGeo, leavesMat)
  leaves.position.y = height + height / 2
  leaves.castShadow = true
  group.add(leaves)

  return group
}
