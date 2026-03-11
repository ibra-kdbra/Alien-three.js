import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { assetManager } from "../../managers/AssetManager";

export function createPlanet(
  position: { x: number; y: number; z: number },
  radius: number,
) {
  // 1. Create Three.js Object
  const geometry = new THREE.SphereGeometry(radius, 64, 64);

  const diffuseMap = assetManager.textures["terrain_diffuse"];
  const normalMap = assetManager.textures["terrain_normal"];

  // Scale the UVs so the texture repeats and doesn't stretch across the massive sphere
  diffuseMap.repeat.set(20, 10);
  normalMap.repeat.set(20, 10);

  const material = new THREE.MeshStandardMaterial({
    color: 0x999999, // Neutralize color to let texture show
    map: diffuseMap,
    normalMap: normalMap,
    wireframe: false,
    roughness: 0.9,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);

  renderer.scene.add(mesh);

  // 2. Create Rapier Physics Body (Static)
  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    position.x,
    position.y,
    position.z,
  );
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(radius);
  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  // 3. Register Entity in ECS
  const entity = world.add({
    name: "Planet",
    isPlanet: true,
    object3d: mesh,
    rigidBody,
    collider,
  });

  return entity;
}
