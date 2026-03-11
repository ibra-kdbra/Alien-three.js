import { queries } from "../World";
import * as THREE from "three";

export function updatePhysicsSystem() {
  // Loop over every entity that has both a 3D object and a physics rigidBody
  for (const entity of queries.physics) {
    // 1. Apply Spherical Gravity if it's dynamic
    if (entity.rigidBody.isDynamic()) {
      let nearestPlanet = null;
      let minDistance = Infinity;

      for (const planet of queries.planets) {
        const dist = entity.object3d.position.distanceTo(
          planet.object3d.position,
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestPlanet = planet;
        }
      }

      if (nearestPlanet) {
        // Calculate gravity direction toward the planet center
        const gravityDir = new THREE.Vector3()
          .copy(nearestPlanet.object3d.position)
          .sub(entity.object3d.position)
          .normalize();

        // Apply a force (simulating 9.81 m/s^2)
        const gravityForce = gravityDir.multiplyScalar(
          9.81 * entity.rigidBody.mass(),
        );
        entity.rigidBody.addForce(gravityForce, true);
      }
    }

    // 2. Sync Transforms
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
