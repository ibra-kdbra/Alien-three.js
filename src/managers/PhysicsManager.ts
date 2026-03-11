import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsManager {
  public world!: RAPIER.World;
  private isInitialized = false;

  public async init() {
    // @ts-ignore - The types say 0 args, but the runtime library throws a warning if you don't pass an object
    await RAPIER.init({});

    // Global gravity is zero because we manually apply spherical gravity in PhysicsSystem
    const gravity = { x: 0.0, y: 0.0, z: 0.0 };
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
