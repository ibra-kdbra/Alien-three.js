import * as THREE from 'three'
import { InputManager } from './InputManager'

export class OrbitCamera {
    camera: THREE.PerspectiveCamera
    input: InputManager

    // State
    currentDistance: number = 10
    targetDistance: number = 10

    // Spherical coordinates (Local to surface normal)
    // Theta: Azimuth (Horizontal)
    // Phi: Polar (Vertical, 0 = Up, PI/2 = Horizon)
    currentTheta: number = 0
    currentPhi: number = Math.PI / 3

    minPhi: number = 0.1 // Prevent looking straight up (Gimbal lock risk)
    maxPhi: number = Math.PI / 2 - 0.1 // Prevent going below ground

    sensitivity: number = 0.002
    zoomSpeed: number = 2.0

    constructor(camera: THREE.PerspectiveCamera, input: InputManager) {
        this.camera = camera
        this.input = input

        // Scroll listener for zoom
        window.addEventListener('wheel', (e) => {
            this.targetDistance += Math.sign(e.deltaY) * 2
            this.targetDistance = Math.max(4, Math.min(30, this.targetDistance))
        })
    }

    update(dt: number, targetPos: THREE.Vector3, upVec: THREE.Vector3) {
        // 1. Process Input
        if (this.input.isLocked) {
            // Mouse X controls Theta (Yaw)
            this.currentTheta -= this.input.mouseDelta.x * this.sensitivity

            // Mouse Y controls Phi (Pitch)
            this.currentPhi += this.input.mouseDelta.y * this.sensitivity

            // Clamp Phi
            this.currentPhi = Math.max(this.minPhi, Math.min(this.maxPhi, this.currentPhi))
        }

        // 2. Smooth Zoom
        // Simple lerp
        this.currentDistance += (this.targetDistance - this.currentDistance) * 5 * dt

        // 3. Compute Camera Position
        // We calculate the position in a "Local" frame where Y is Up.
        // Then we transform it to World frame aligning Local Y to Planet Normal.

        // Local Spherical to Cartesian (Y-up convention)
        // x = r * sin(phi) * sin(theta)
        // y = r * cos(phi)
        // z = r * sin(phi) * cos(theta)
        const sinPhi = Math.sin(this.currentPhi)
        const cosPhi = Math.cos(this.currentPhi)
        const sinTheta = Math.sin(this.currentTheta)
        const cosTheta = Math.cos(this.currentTheta)

        const localOffset = new THREE.Vector3(
            this.currentDistance * sinPhi * sinTheta,
            this.currentDistance * cosPhi,
            this.currentDistance * sinPhi * cosTheta
        )

        // Create rotation to align (0,1,0) with upVec
        const defaultUp = new THREE.Vector3(0, 1, 0)
        const qSurface = new THREE.Quaternion().setFromUnitVectors(defaultUp, upVec)

        // Apply rotation
        localOffset.applyQuaternion(qSurface)

        // Final Pos
        const finalPos = targetPos.clone().add(localOffset)

        // 4. Update Camera Transform
        this.camera.position.copy(finalPos)
        this.camera.up.copy(upVec)
        this.camera.lookAt(targetPos)

        // Note: lookAt() calculates the rotation matrix.
        // We strictly set .up before calling it to ensure the camera roll is correct relative to planet.
    }
}
