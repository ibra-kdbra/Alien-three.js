import * as THREE from 'three'

export function createStarfield(count: number = 2000): THREE.Points {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)

  for (let i = 0; i < count * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 500 // Spread across 500 units
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.5,
    sizeAttenuation: true
  })

  return new THREE.Points(geometry, material)
}

export function createTree(height: number = 2): THREE.Group {
  const group = new THREE.Group()

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, height, 8)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 })
  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.position.y = height / 2
  trunk.castShadow = true
  group.add(trunk)

  // Leaves
  const leavesGeo = new THREE.ConeGeometry(1.5, height * 1.5, 8)
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x228B22 })
  const leaves = new THREE.Mesh(leavesGeo, leavesMat)
  leaves.position.y = height + height / 2
  leaves.castShadow = true
  group.add(leaves)

  return group
}
