import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsManager {
  public world!: RAPIER.World;
  private isInitialized = false;

  // Fixed timestep for stable physics simulation
  private fixedTimestep = 1 / 60;
  private accumulator = 0;

  public async init() {
    await RAPIER.init();

    // Zero global gravity (spherical gravity calculated manually)
    const gravity = { x: 0.0, y: 0.0, z: 0.0 };
    this.world = new RAPIER.World(gravity);

    this.isInitialized = true;
    console.log("Rapier3D Physics Initialized");
  }

  public step(delta?: number) {
    if (!this.isInitialized) return;

    if (delta !== undefined) {
      // Accumulator-based fixed timestep for frame-rate independent physics
      this.accumulator += delta;
      while (this.accumulator >= this.fixedTimestep) {
        this.world.step();
        this.accumulator -= this.fixedTimestep;
      }
    } else {
      this.world.step();
    }
  }
}

export const physicsManager = new PhysicsManager();
