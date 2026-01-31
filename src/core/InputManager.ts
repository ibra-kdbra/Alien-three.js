export class InputManager {
  keys: { [key: string]: boolean } = {}
  mouseDelta: { x: number, y: number } = { x: 0, y: 0 }
  isLocked: boolean = false

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true
    })

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false
    })

    document.addEventListener('mousemove', (e) => {
      if (this.isLocked) {
        this.mouseDelta.x += e.movementX
        this.mouseDelta.y += e.movementY
      }
    })

    document.addEventListener('pointerlockchange', () => {
        this.isLocked = document.pointerLockElement === document.body
    })

    // Auto-lock on click (optional, can be handled by main game logic, but convenient here)
    document.body.addEventListener('click', () => {
        if (!this.isLocked) {
            document.body.requestPointerLock()
        }
    })
  }

  isKeyDown(code: string): boolean {
    return !!this.keys[code]
  }

  // Must be called at end of frame
  resetMouse() {
      this.mouseDelta.x = 0
      this.mouseDelta.y = 0
  }

  // Helper for common keys
  get forward(): boolean { return this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp') }
  get backward(): boolean { return this.isKeyDown('KeyS') || this.isKeyDown('ArrowDown') }
  get left(): boolean { return this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft') }
  get right(): boolean { return this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight') }
  get jump(): boolean { return this.isKeyDown('Space') }
  get sprint(): boolean { return this.isKeyDown('ShiftLeft') }
  get interact(): boolean { return this.isKeyDown('KeyE') }
  get disguise(): boolean { return this.isKeyDown('KeyQ') }
  get toggleView(): boolean { return this.isKeyDown('KeyV') }
}
