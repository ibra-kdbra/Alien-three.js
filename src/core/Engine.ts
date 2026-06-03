import * as THREE from "three";
import { Time } from "../utils/Time";
import { renderer } from "./Renderer";
import { physicsManager } from "../managers/PhysicsManager";
import { updatePhysicsSystem } from "../ecs/systems/PhysicsSystem";
import { updatePlayerControlSystem } from "../ecs/systems/PlayerControlSystem";
import { updateBeaconSystem } from "../ecs/systems/BeaconSystem";
import { updateOxygenSystem } from "../ecs/systems/OxygenSystem";
import { updateHazardVisuals } from "../ecs/factories/HazardFactory";
import { updateParticleSystem } from "../ecs/systems/ParticleSystem";
import { updateDropshipSystem } from "../ecs/systems/DropshipSystem";
import { inputManager } from "../managers/InputManager";
import { debugManager } from "../managers/DebugManager";

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
    const delta = this.time.delta;
    const elapsed = this.time.elapsed;

    // 1. Inputs & Player Logic
    updatePlayerControlSystem(delta);

    // 2. Gameplay Systems
    updateBeaconSystem(delta, elapsed);
    updateOxygenSystem(delta);
    updateDropshipSystem(delta, elapsed);

    // 3. Physics Step (fixed timestep)
    physicsManager.step(delta);

    // 4. Sync Physics back to Three.js Transforms
    updatePhysicsSystem();

    // 5. Visual Systems
    updateHazardVisuals(delta, elapsed);
    updateParticleSystem(delta, elapsed);

    // Debug Update
    debugManager.update();

    // 6. Update LODs based on new camera position
    renderer.scene.traverse((object) => {
      if (object instanceof THREE.LOD) {
        object.update(renderer.camera);
      }
    });

    // 7. Render
    renderer.render(delta);

    // 8. Reset ephemeral state
    inputManager.resetMouseDelta();

    requestAnimationFrame(this.loop);
  };
}

export const engine = new Engine();
