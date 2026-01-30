export class InputManager {
  keys: { [key: string]: boolean } = {}

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true
    })

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false
    })
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
