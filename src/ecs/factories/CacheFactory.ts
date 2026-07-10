import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { getPlanetHeight } from "./PlanetFactory";
import { CACHE_DIR } from "../../core/MissionData";
import { crateTexture } from "../../utils/ProceduralTexture";

/**
 * The Meridian supply cache — Act I's destination. A weathered crate a short
 * walk from the landing pad: close enough to teach navigation safely, far
 * enough that the player has to leave the pad's comfort zone once.
 */

/** World position of the cache, filled in by createSupplyCache(). */
export const cachePosition = new THREE.Vector3();

export function createSupplyCache(planetRadius: number) {
  const dir = CACHE_DIR.clone();
  const surfaceH = getPlanetHeight(dir, planetRadius);
  const pos = dir.clone().multiplyScalar(surfaceH + 0.4);
  cachePosition.copy(pos);

  const group = new THREE.Group();
  group.position.copy(pos);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  // Main crate hull — stenciled, hazard-striped Meridian shipping crate
  const crate = crateTexture();
  const hullMat = new THREE.MeshStandardMaterial({
    map: crate.map,
    bumpMap: crate.bump,
    bumpScale: 0.01,
    roughness: 0.55,
    metalness: 0.65,
  });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.0), hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Lid, slightly ajar — someone opened this in a hurry
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.12, 1.04), hullMat);
  lid.position.set(0.1, 0.46, 0);
  lid.rotation.z = 0.18;
  lid.castShadow = true;
  group.add(lid);

  // Emissive marker stripe — Meridian amber, visible from a distance at night
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xffaa44,
    emissive: 0xffaa44,
    emissiveIntensity: 2.2,
    roughness: 0.3,
  });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.1, 1.02), stripeMat);
  stripe.position.y = 0.12;
  group.add(stripe);

  // Bent locator antenna with a blinking tip
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.03, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x666e7a, roughness: 0.4, metalness: 0.8 }),
  );
  antenna.position.set(-0.6, 1.0, -0.35);
  antenna.rotation.z = 0.35;
  group.add(antenna);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffcc66 }),
  );
  tip.position.set(-0.85, 1.66, -0.35);
  group.add(tip);

  // A couple of spilled O₂ cells around the base (visual only)
  const cellGeo = new THREE.CapsuleGeometry(0.1, 0.28, 4, 8);
  const cellMat = new THREE.MeshStandardMaterial({
    color: 0xd8dee4,
    roughness: 0.35,
    metalness: 0.6,
  });
  const cellA = new THREE.Mesh(cellGeo, cellMat);
  cellA.position.set(0.95, -0.25, 0.4);
  cellA.rotation.set(Math.PI / 2, 0, 0.6);
  group.add(cellA);
  const cellB = new THREE.Mesh(cellGeo, cellMat);
  cellB.position.set(-0.85, -0.25, 0.55);
  cellB.rotation.set(Math.PI / 2, 0, -1.1);
  group.add(cellB);

  renderer.scene.add(group);

  // Solid collider so the crate feels physical
  const bodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(pos.x, pos.y, pos.z)
    .setRotation(group.quaternion);
  const body = physicsManager.world.createRigidBody(bodyDesc);
  physicsManager.world.createCollider(RAPIER.ColliderDesc.cuboid(0.75, 0.4, 0.5), body);

  return group;
}
