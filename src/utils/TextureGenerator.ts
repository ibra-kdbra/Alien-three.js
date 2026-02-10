import * as THREE from 'three'

export function createPlanetTexture(color1: number, color2: number): THREE.CanvasTexture {
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // 1. Base Layer (Solid)
    ctx.fillStyle = new THREE.Color(color1).getStyle()
    ctx.fillRect(0, 0, size, size)

    // 2. Noise Layer (Micro-detail)
    const imgData = ctx.getImageData(0, 0, size, size)
    for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 40
        imgData.data[i] += noise
        imgData.data[i+1] += noise
        imgData.data[i+2] += noise
    }
    ctx.putImageData(imgData, 0, 0)

    // 3. Biome Layer (Variations)
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * size
        const y = Math.random() * size
        const r = 50 + Math.random() * 200
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, new THREE.Color(color2).getStyle())
        grad.addColorStop(1, 'transparent')
        
        ctx.fillStyle = grad
        ctx.globalAlpha = 0.3
        ctx.fillRect(0, 0, size, size)
    }

    // 4. Craters/Impacts Layer
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * size
        const y = Math.random() * size
        const r = 2 + Math.random() * 10
        
        // Dark rim
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        
        // Light inner
        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        ctx.beginPath()
        ctx.arc(x - r*0.2, y - r*0.2, r*0.8, 0, Math.PI * 2)
        ctx.fill()
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    return tex
}
