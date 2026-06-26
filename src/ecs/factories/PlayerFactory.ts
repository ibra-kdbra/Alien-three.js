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
  const gltf = assetManager.models["human"] || assetManager.models["robot"];
  const mesh = gltf.scene.clone();
  
  if (gltf === assetManager.models["human"]) {
    // Human (CesiumMan) model needs a different scale and rotation
    mesh.scale.set(1.5, 1.5, 1.5);
    mesh.position.y = -0.8;
    // Rotate to face forward in Three.js (CesiumMan faces +Z or -Z, let's check. Typically faces +Z, we rotate 180 degrees to face forward (-Z))
    mesh.rotation.y = Math.PI;
  } else {
    mesh.scale.set(0.3, 0.3, 0.3);
    mesh.position.y = -0.8;
  }

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

  // Start with Idle or first available animation
  let defaultActionName = "Idle";
  if (actions["Idle"]) {
    actions["Idle"].play();
  } else if (gltf.animations.length > 0) {
    defaultActionName = gltf.animations[0].name;
    actions[defaultActionName].play();
  }

  // 3. Setup Kinematic Position-Based Rigidbody
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
  characterController.enableAutostep(0.4, 0.2, true);
  characterController.enableSnapToGround(0.3);
  characterController.setMaxSlopeClimbAngle(Math.PI / 3); // 60 degrees

  return world.add({
    name: "Player",
    isPlayer: true,
    object3d: container,
    rigidBody,
    collider,
    characterController,
    playerControl: {
      speed: 8.0,
      sprintSpeed: 14.0,
      jumpForce: 5.8,
      grounded: false,
      velocity: { x: 0, y: 0, z: 0 },
      oxygen: 1000000,
      maxOxygen: 1000000,
      cameraDistance: 6.0,
    },
    animation: {
      mixer,
      actions,
      currentAction: defaultActionName,
    },
    health: { current: 100, max: 100 },
  });
}
