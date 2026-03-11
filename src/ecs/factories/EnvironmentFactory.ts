import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";

export function createFloor() {
  const width = 100;
  const height = 1;
  const depth = 100;

  // 1. Create Three.js Object
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, -height / 2, 0);

  renderer.scene.add(mesh);

  // 2. Create Rapier Physics Body (Static)
  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    0,
    -height / 2,
    0,
  );
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    width / 2,
    height / 2,
    depth / 2,
  );
  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  // 3. Register Entity in ECS
  const entity = world.add({
    name: "Floor",
    object3d: mesh,
    rigidBody,
    collider,
  });

  return entity;
}
