import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { assetManager } from "../../managers/AssetManager";

export function createPlayer(position: { x: number; y: number; z: number }) {
  // 1. Setup Visual Mesh
  const gltf = assetManager.models["robot"];
  const mesh = gltf.scene.clone();
  mesh.scale.set(0.3, 0.3, 0.3);

  // Offset the model so the feet are at the bottom of the capsule origin
  // We'll use a hardcoded capsule for stability:
  // Half-height: 0.5, Radius: 0.3 -> Bottom is at -0.8
  mesh.position.y = -0.8;

  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const light = new THREE.PointLight(0xffaa44, 5, 10);
  light.position.set(0, 2, 0);
  mesh.add(light);
  renderer.scene.add(mesh);

  // 2. Setup Animations
  const mixer = new THREE.AnimationMixer(mesh);
  const actions: Record<string, THREE.AnimationAction> = {};

  gltf.animations.forEach((clip) => {
    const action = mixer.clipAction(clip);
    actions[clip.name] = action;
  });

  // Start with Idle
  if (actions["Idle"]) actions["Idle"].play();

  // 2. Setup Dynamic Rigidbody
  // A dynamic body naturally falls, hits the ground, and slides along slopes
  // without needing complex raycast logic or a glitchy KCC.
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(position.x, position.y, position.z)
    .lockRotations(); // Keep the capsule perfectly upright

  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  // Use a hardcoded, professional-standard capsule size
  // height 0.5 is half-length of the cylinder part
  // radius 0.3 is the spherical cap radius
  const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3)
    .setFriction(0.0) // Zero friction prevents snagging on terrain edges
    .setRestitution(0.0); // Zero bounce

  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  return world.add({
    name: "Player",
    isPlayer: true,
    object3d: mesh,
    rigidBody,
    collider,
    playerControl: {
      speed: 12.0,
      jumpForce: 15.0,
      grounded: false,
      velocity: { x: 0, y: 0, z: 0 },
    },
    animation: {
      mixer,
      actions,
      currentAction: "Idle",
    },
    health: { current: 100, max: 100 },
  });
}
