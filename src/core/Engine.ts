import * as THREE from "three";
import { Time } from "../utils/Time";
import { renderer } from "./Renderer";
import { physicsManager } from "../managers/PhysicsManager";
import { updatePhysicsSystem } from "../ecs/systems/PhysicsSystem";
import { updatePlayerControlSystem } from "../ecs/systems/PlayerControlSystem";
import { inputManager } from "../managers/InputManager";

export class Engine {
  private time: Time;
  private isRunning: boolean = false;

  constructor() {
    this.time = new Time();
  }

  public async init() {
    await physicsManager.init();
    this.start();
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.time.current = performance.now();
    this.loop();
  }

  public stop() {
    this.isRunning = false;
  }

  private loop = () => {
    if (!this.isRunning) return;

    // Update time
    this.time.update();

    // 1. Inputs & Logic
    updatePlayerControlSystem(this.time.delta);

    // 2. Physics Step
    physicsManager.step();

    // 3. Sync Physics back to Three.js Transforms
    updatePhysicsSystem();

    // 4. Update LODs based on new camera position
    renderer.scene.traverse((object) => {
      if (object instanceof THREE.LOD) {
        object.update(renderer.camera);
      }
    });

    // 5. Render
    renderer.render();

    // 6. Reset ephemeral state
    inputManager.resetMouseDelta();

    requestAnimationFrame(this.loop);
  };
}

export const engine = new Engine();
