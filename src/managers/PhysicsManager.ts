import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsManager {
  public world!: RAPIER.World;
  private isInitialized = false;

  public async init() {
    await RAPIER.init();

    // Use standard downward gravity for the flat map
    const gravity = { x: 0.0, y: -30.0, z: 0.0 };
    this.world = new RAPIER.World(gravity);

    this.isInitialized = true;
    console.log("Rapier3D Physics Initialized");
  }

  public step() {
    if (!this.isInitialized) return;
    this.world.step();
  }
}

export const physicsManager = new PhysicsManager();
