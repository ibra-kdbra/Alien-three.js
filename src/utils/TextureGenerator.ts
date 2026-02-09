import * as THREE from 'three'

export function createPlanetTexture(color1: number, color2: number): THREE.CanvasTexture {
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Base color
    ctx.fillStyle = new THREE.Color(color1).getStyle()
    ctx.fillRect(0, 0, size, size)

    // Add noise/craters
    for (let i = 0; i < 5000; i++) {
        const x = Math.random() * size
        const y = Math.random() * size
        const r = Math.random() * 5
        const alpha = Math.random() * 0.3
        
        ctx.fillStyle = `rgba(0,0,0,${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
    }

    // Add larger biomes/patches
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * size
        const y = Math.random() * size
        const r = 50 + Math.random() * 150
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, new THREE.Color(color2).getStyle())
        grad.addColorStop(1, 'transparent')
        
        ctx.fillStyle = grad
        ctx.globalAlpha = 0.4
        ctx.fillRect(0, 0, size, size)
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    return tex
}
