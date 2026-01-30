export class InputManager {
  keys: { [key: string]: boolean } = {}
  private keyDownHandler: (e: KeyboardEvent) => void
  private keyUpHandler: (e: KeyboardEvent) => void

  constructor() {
    this.keyDownHandler = (e: KeyboardEvent) => {
      this.keys[e.code] = true
    }

    this.keyUpHandler = (e: KeyboardEvent) => {
      this.keys[e.code] = false
    }

    window.addEventListener('keydown', this.keyDownHandler)
    window.addEventListener('keyup', this.keyUpHandler)
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyDownHandler)
    window.removeEventListener('keyup', this.keyUpHandler)
    this.keys = {}
  }
  isKeyDown(code: string): boolean {
    return !!this.keys[code]
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
