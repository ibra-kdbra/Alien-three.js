import * as THREE from 'three'

export function createNoiseTexture(colorA: number, colorB: number): THREE.Texture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Fill background
  ctx.fillStyle = `#${new THREE.Color(colorA).getHexString()}`
  ctx.fillRect(0, 0, size, size)

  // Noise
  for (let i = 0; i < 50000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const w = Math.random() * 3
    const h = Math.random() * 3
    const alpha = Math.random() * 0.2

    ctx.fillStyle = `#${new THREE.Color(colorB).getHexString()}`
    ctx.globalAlpha = alpha
    ctx.fillRect(x, y, w, h)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(10, 10) // Tile it
  return texture
}
