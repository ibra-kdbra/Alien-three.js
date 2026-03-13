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
  // We use Kinematic Position Based for the Character Controller
  const rigidBodyDesc =
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      position.x,
      position.y,
      position.z,
    );

  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  // Use a capsule collider for characters
  const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.25);
  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  // Create the Character Controller
  const offset = 0.1;
  const characterController =
    physicsManager.world.createCharacterController(offset);
  characterController.enableAutostep(0.5, 0.2, true); // Allow stepping over small obstacles
  characterController.enableSnapToGround(0.3); // Keep stuck to the ground when walking down slopes

  // 3. Register Entity in ECS
  const entity = world.add({
    name: "Player",
    isPlayer: true,
    object3d: mesh,
    rigidBody,
    collider,
    characterController,
    playerControl: {
      speed: 10,
      jumpForce: 15,
      grounded: false,
      velocity: { x: 0, y: 0, z: 0 }, // Internal momentum tracker for the KCC
    },
    health: { current: 100, max: 100 },
  });

  return entity;
}
