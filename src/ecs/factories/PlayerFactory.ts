import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { assetManager } from "../../managers/AssetManager";

export function createPlayer(position: { x: number; y: number; z: number }) {
  // Container group — holds the mesh with its offset
  const container = new THREE.Group();

  // 1. Setup Visual Mesh
  const gltf = assetManager.models["robot"];
  const mesh = gltf.scene.clone();
  mesh.scale.set(0.3, 0.3, 0.3);

  // Offset the model so the feet are at the bottom of the capsule origin
  // Capsule: Half-height 0.5, Radius 0.3 → Bottom is at -0.8
  mesh.position.y = -0.8;

  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Helmet visor glow light
  const visorLight = new THREE.PointLight(0x44aaff, 3, 8);
  visorLight.position.set(0, 1.5, 0.3);
  visorLight.castShadow = false;
  mesh.add(visorLight);

  // Subtle warm backlight for depth
  const backLight = new THREE.PointLight(0xffaa44, 2, 6);
  backLight.position.set(0, 1, -0.5);
  mesh.add(backLight);

  container.add(mesh);
  renderer.scene.add(container);

  // 2. Setup Animations
  const mixer = new THREE.AnimationMixer(mesh);
  const actions: Record<string, THREE.AnimationAction> = {};

  gltf.animations.forEach((clip) => {
    const action = mixer.clipAction(clip);
    actions[clip.name] = action;
  });

  // Start with Idle
  if (actions["Idle"]) actions["Idle"].play();

  // 3. Setup Dynamic Rigidbody
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(position.x, position.y, position.z)
    .lockRotations() // Keep the capsule perfectly upright
    .setLinearDamping(0.5) // Prevent infinite sliding
    .setAngularDamping(1.0);

  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  // Capsule: half-height 0.5, radius 0.3
  const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3)
    .setFriction(0.1) // Tiny friction to prevent snagging on terrain edges
    .setRestitution(0.0); // Zero bounce

  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  return world.add({
    name: "Player",
    isPlayer: true,
    object3d: container,
    rigidBody,
    collider,
    playerControl: {
      speed: 8.0,
      sprintSpeed: 14.0,
      jumpForce: 5.8,
      grounded: false,
      velocity: { x: 0, y: 0, z: 0 },
      oxygen: 100,
      maxOxygen: 100,
      cameraDistance: 6.0,
    },
    animation: {
      mixer,
      actions,
      currentAction: "Idle",
    },
    health: { current: 100, max: 100 },
  });
}
