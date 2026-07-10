import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { createAstronaut } from "./AstronautFactory";

export function createPlayer(position: { x: number; y: number; z: number }) {
  // Container group — holds the mesh with its offset
  const container = new THREE.Group();

  // 1. Visual mesh: procedural astronaut with a pose rig.
  // Root is at the feet; the capsule (half-height 0.5 + radius 0.3) is
  // centered on the container, so the feet sit at -0.8.
  const { model: mesh, rig } = createAstronaut();
  mesh.position.y = -0.8;
  container.userData.rig = rig;

  // Soft cool key from the visor side + warm rim from behind, so the suit
  // reads in silhouette even on the planet's night side.
  const visorLight = new THREE.PointLight(0x44aaff, 1.2, 6);
  visorLight.position.set(0, 1.5, -0.5);
  visorLight.castShadow = false;
  mesh.add(visorLight);

  const backLight = new THREE.PointLight(0xffaa44, 0.6, 4);
  backLight.position.set(0, 1, 0.5);
  mesh.add(backLight);

  container.add(mesh);
  renderer.scene.add(container);

  // 2. Setup Kinematic Position-Based Rigidbody
  const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(position.x, position.y, position.z);

  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  // Capsule: half-height 0.5, radius 0.3
  const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3)
    .setFriction(0.1)
    .setRestitution(0.0);

  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  // 4. Setup Kinematic Character Controller (KCC)
  const characterController = physicsManager.world.createCharacterController(0.02);
  characterController.setSlideEnabled(true);
  characterController.enableAutostep(0.5, 0.2, true);
  characterController.enableSnapToGround(0.5);
  characterController.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(55));
  characterController.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(65));
  characterController.setApplyImpulsesToDynamicBodies(true);

  const spawnRadius = Math.sqrt(
    position.x * position.x + position.y * position.y + position.z * position.z,
  );

  return world.add({
    name: "Player",
    isPlayer: true,
    object3d: container,
    rigidBody,
    collider,
    characterController,
    spawnPoint: {
      x: position.x,
      y: position.y,
      z: position.z,
      safeRadius: spawnRadius * 0.55,
    },
    playerControl: {
      speed: 7.0,
      sprintSpeed: 12.0,
      jumpForce: 7.5,
      grounded: false,
      velocity: { x: 0, y: 0, z: 0 },
      oxygen: 100,
      maxOxygen: 100,
      jetpackFuel: 100,
      maxJetpackFuel: 100,
    },
    health: { current: 100, max: 100 },
  });
}
