import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { assetManager } from "../../managers/AssetManager";

export function createPlayer(position: { x: number; y: number; z: number }) {
  // 1. Get the Model from AssetManager
  const gltf = assetManager.models["robot"];

  // Clone the scene so we can spawn multiple if we ever want to
  const mesh = gltf.scene.clone();
  mesh.position.set(position.x, position.y, position.z);

  // The robot model might be too big or small, scale it down
  mesh.scale.set(0.3, 0.3, 0.3);

  // Enable shadows on the model
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Add a local light so we can always see the player on the dark side of the moon
  const light = new THREE.PointLight(0xffaa44, 2, 10);
  light.position.set(0, 2, 0);
  mesh.add(light);

  renderer.scene.add(mesh);

  // 2. Create Rapier Physics Body
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(position.x, position.y, position.z)
    // Lock rotations so the capsule doesn't fall over like a ragdoll.
    // We will handle visual rotation via the mesh in PlayerControlSystem.
    .lockRotations()
    .setCcdEnabled(true); // Continuous Collision Detection prevents passing through the floor

  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  // Use a capsule collider for characters, fits better than a box
  // The robot at scale 0.3 is roughly ~1.5 units tall.
  // Half-height of 0.5 + radius of 0.25 = 1.0 total height (approx)
  const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.25);
  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  // 3. Register Entity in ECS
  const entity = world.add({
    name: "Player",
    isPlayer: true,
    object3d: mesh,
    rigidBody,
    collider,
    playerControl: { speed: 5, jumpForce: 5, grounded: false },
    health: { current: 100, max: 100 },
  });

  return entity;
}
