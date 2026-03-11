// Simple Input Action mapping
export type InputAction =
  | "move_forward"
  | "move_backward"
  | "move_left"
  | "move_right"
  | "jump"
  | "action";

export class InputManager {
  private keys: Record<string, boolean> = {};

  // Map actions to specific keys
  private keyMap: Record<string, InputAction> = {
    KeyW: "move_forward",
    KeyS: "move_backward",
    KeyA: "move_left",
    KeyD: "move_right",
    Space: "jump",
    KeyE: "action",
  };

  constructor() {
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));

    // Mouse setup
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onMouseMove);

    // Auto lock on canvas click
    document.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).tagName.toLowerCase() === "canvas") {
        this.lockPointer();
      }
    });
  }

  private onKeyDown(event: KeyboardEvent) {
    this.keys[event.code] = true;
  }

  private onKeyUp(event: KeyboardEvent) {
    this.keys[event.code] = false;
  }

  // Mouse handling
  public pointerLocked: boolean = false;
  public mouseDelta = { x: 0, y: 0 };

  public lockPointer() {
    document.body.requestPointerLock();
  }

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === document.body;
  };

  private onMouseMove = (event: MouseEvent) => {
    if (this.pointerLocked) {
      this.mouseDelta.x = event.movementX || 0;
      this.mouseDelta.y = event.movementY || 0;
    }
  };

  public resetMouseDelta() {
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  }

  // Returns 0 or 1 for now (could be extended for analog sticks)
  public getAction(action: InputAction): number {
    for (const [key, mappedAction] of Object.entries(this.keyMap)) {
      if (mappedAction === action && this.keys[key]) {
        return 1.0;
      }
    }
    return 0.0;
  }

  // Returns a normalized direction vector (x, y)
  public getDirection(): { x: number; z: number } {
    const forward =
      this.getAction("move_forward") - this.getAction("move_backward");
    const right = this.getAction("move_right") - this.getAction("move_left");

    // Normalize to prevent faster diagonal movement
    const length = Math.sqrt(forward * forward + right * right);
    if (length > 0) {
      return { x: right / length, z: -forward / length }; // -z is forward in Three.js
    }
    return { x: 0, z: 0 };
  }
}

export const inputManager = new InputManager();
