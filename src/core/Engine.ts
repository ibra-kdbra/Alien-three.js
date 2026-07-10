import * as THREE from "three";
import { Time } from "../utils/Time";
import { renderer } from "./Renderer";
import { physicsManager } from "../managers/PhysicsManager";
import { capturePhysicsSnapshot, updatePhysicsSystem } from "../ecs/systems/PhysicsSystem";
import {
  pollCharacterInput,
  updateCharacterSystem,
  updateCharacterVisuals,
} from "../ecs/systems/CharacterSystem";
import { updateCameraSystem } from "../ecs/systems/CameraSystem";
import { updateScannerSystem } from "../ecs/systems/ScannerSystem";
import { updateWaypointSystem } from "../ecs/systems/WaypointSystem";
import { updateBeaconSystem } from "../ecs/systems/BeaconSystem";
import { updateOxygenSystem } from "../ecs/systems/OxygenSystem";
import { updatePickupSystem, updatePickupVisuals } from "../ecs/systems/PickupSystem";
import { updateHazardVisuals } from "../ecs/factories/HazardFactory";
import { updateParticleSystem } from "../ecs/systems/ParticleSystem";
import { updateDropshipSystem } from "../ecs/systems/DropshipSystem";
import { updateMissionSystem } from "../managers/MissionManager";
import { inputManager } from "../managers/InputManager";
import { debugManager } from "../managers/DebugManager";
import { updateSun } from "./Sun";
import { queries } from "../ecs/World";

/**
 * Main loop: fixed-timestep simulation with render interpolation.
 *
 *   render frame ─┬─ poll edge-triggered input
 *                 ├─ 0..N fixed ticks (character → gameplay → physics step → snapshot)
 *                 └─ render update (interpolate transforms → camera → visuals → draw)
 *
 * Gameplay and physics always advance in exact 1/60s increments, so the game
 * plays identically at 30, 60 or 240 FPS; the render pass blends between the
 * last two physics states so motion still looks perfectly smooth.
 */
export class Engine {
  private time: Time;
  private isRunning: boolean = false;

  private static readonly FIXED_DT = 1 / 60;
  private static readonly MAX_ACCUMULATED = 0.25; // avoid spiral-of-death after tab stalls
  private accumulator = 0;
  private fixedElapsed = 0;

  private skybox: THREE.Mesh | null = null;

  // Rolling frame-time stats for the perf probe (window.__astra.getPerf()).
  public frameMs = 0;
  public frameMsMax = 0;
  private frameMsWindow = 0;
  private frameCount = 0;

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

  private fixedUpdate(dt: number) {
    this.fixedElapsed += dt;

    // 1. Character movement (kinematic controller, spherical gravity)
    updateCharacterSystem(dt);

    // 2. Gameplay systems
    updateBeaconSystem(dt, this.fixedElapsed);
    updateOxygenSystem(dt);
    updatePickupSystem();
    updateDropshipSystem(dt, this.fixedElapsed);
    updateMissionSystem(dt);

    // 3. Physics step + transform snapshot for render interpolation
    physicsManager.stepOnce();
    capturePhysicsSnapshot();
  }

  private renderUpdate(delta: number, alpha: number, elapsed: number) {
    // 1. Blend physics transforms into the scene graph
    updatePhysicsSystem(alpha);

    // 2. Camera rig (uses the interpolated player position)
    updateCameraSystem(delta);

    // 3. Visual-only systems
    updateCharacterVisuals(delta);
    updateScannerSystem(delta);
    updateWaypointSystem();
    updateHazardVisuals(delta, elapsed);
    updatePickupVisuals(delta, elapsed);
    updateParticleSystem(delta, elapsed);

    // 4. Player-following sun shadows
    const player = queries.player.first;
    if (player?.object3d) updateSun(player.object3d.position);

    // 5. Skybox time uniform
    if (!this.skybox) {
      const found = renderer.scene.getObjectByName("Skybox");
      if (found instanceof THREE.Mesh) this.skybox = found;
    }
    if (this.skybox && this.skybox.material instanceof THREE.ShaderMaterial) {
      this.skybox.material.uniforms.uTime.value = elapsed;
    }

    debugManager.update();
    renderer.render(delta);
  }

  private loop = () => {
    if (!this.isRunning) return;

    const frameStart = performance.now();
    this.time.update();
    const delta = this.time.delta;
    const elapsed = this.time.elapsed;

    // Edge-triggered input is sampled per render frame so taps between
    // physics ticks are never dropped.
    pollCharacterInput();

    this.accumulator = Math.min(this.accumulator + delta, Engine.MAX_ACCUMULATED);
    while (this.accumulator >= Engine.FIXED_DT) {
      this.fixedUpdate(Engine.FIXED_DT);
      this.accumulator -= Engine.FIXED_DT;
    }

    const alpha = this.accumulator / Engine.FIXED_DT;
    this.renderUpdate(delta, alpha, elapsed);

    inputManager.resetMouseDelta();

    // Average main-thread cost over 30-frame windows (CPU + submitted GPU work;
    // actual GPU time is not observable from JS, but this tracks regressions).
    const cost = performance.now() - frameStart;
    this.frameMsWindow += cost;
    this.frameMsMax = Math.max(this.frameMsMax, cost);
    if (++this.frameCount >= 30) {
      this.frameMs = this.frameMsWindow / this.frameCount;
      this.frameMsWindow = 0;
      this.frameCount = 0;
      this.frameMsMax = cost;
    }

    requestAnimationFrame(this.loop);
  };
}

export const engine = new Engine();
