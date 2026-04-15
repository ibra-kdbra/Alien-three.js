import { queries } from "../World";

export function updatePhysicsSystem() {
  // Loop over every entity that has both a 3D object and a physics rigidBody
  for (const entity of queries.physics) {
    // Sync Transforms: Rapier → Three.js
    const position = entity.rigidBody.translation();

    // Sync Three.js mesh with Rapier rigid body position
    entity.object3d.position.set(position.x, position.y, position.z);

    // Only sync rotation if it's not the player (PlayerControlSystem handles player visual rotation)
    if (!entity.isPlayer) {
      const rotation = entity.rigidBody.rotation();
      entity.object3d.quaternion.set(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
    }
  }
}
