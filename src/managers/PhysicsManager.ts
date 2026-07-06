import RAPIER from "@dimforge/rapier3d-compat";

/**
 * Owns the Rapier world. Stepping is driven exclusively by the Engine's
 * fixed-timestep loop — one call to stepOnce() per simulation tick — so the
 * simulation is deterministic and framerate-independent.
 */
export class PhysicsManager {
  public world!: RAPIER.World;
  private isInitialized = false;

  public readonly fixedTimestep = 1 / 60;

  public async init() {
    await RAPIER.init();

    // Zero global gravity (spherical gravity is applied by the character
    // controller and any future dynamic-body gravity system).
    const gravity = { x: 0.0, y: 0.0, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this.world.timestep = this.fixedTimestep;

    this.isInitialized = true;
    console.log("Rapier3D Physics Initialized");
  }

  /** Advance the simulation by exactly one fixed timestep. */
  public stepOnce() {
    if (!this.isInitialized) return;
    this.world.step();
  }
}

export const physicsManager = new PhysicsManager();
