import * as THREE from "three";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { getPlanetHeight } from "./PlanetFactory";
import { BEACON_DIRECTIONS } from "./BeaconFactory";
import { DATA_PADS } from "../../core/MissionData";

/**
 * Oxygen canisters scattered across the planet. They turn every traverse into
 * a routing decision — detour for air, or push straight for the beacon? —
 * and make survival feel earned instead of just a timer.
 *
 * Seeded RNG: the same canister field generates every run, so routes learned
 * in one attempt stay valid in the next.
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PICKUP_COUNT = 26;
const OXYGEN_AMOUNT = 30;

export function createPickups(planetRadius: number) {
  const rand = mulberry32(777);
  const pole = new THREE.Vector3(0, 1, 0);

  // Shared geometry/material across all canisters
  const tankGeo = new THREE.CapsuleGeometry(0.16, 0.42, 4, 10);
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0xe8eef2,
    roughness: 0.35,
    metalness: 0.6,
  });
  const bandGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10);
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0x33ddff,
    emissive: 0x33ddff,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  });
  const capGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.1, 8);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x3d434d,
    roughness: 0.5,
    metalness: 0.6,
  });

  let placed = 0;
  while (placed < PICKUP_COUNT) {
    const dir = new THREE.Vector3(
      rand() - 0.5,
      rand() - 0.5,
      rand() - 0.5,
    ).normalize();

    // Keep clear of the landing zone (start with full O2 anyway) and don't
    // stack directly on beacon sites (those already refill).
    if (dir.dot(pole) > 0.9) continue;
    if (BEACON_DIRECTIONS.some((b) => dir.dot(b) > 0.995)) continue;

    const height = getPlanetHeight(dir, planetRadius);
    const pos = dir.clone().multiplyScalar(height + 0.45);

    const group = new THREE.Group();
    group.position.copy(pos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.castShadow = true;
    group.add(tank);

    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = 0.05;
    group.add(band);

    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.32;
    group.add(cap);

    renderer.scene.add(group);

    world.add({
      name: `O2Canister_${placed}`,
      isPickup: true,
      object3d: group,
      pickup: {
        amount: OXYGEN_AMOUNT,
        collected: false,
        bobPhase: rand() * Math.PI * 2,
        kind: "o2",
      },
    });

    placed++;
  }
}

const DATAPAD_OXYGEN = 10;

/**
 * Meridian crew data pads — optional lore drops at fixed landmarks. Each one
 * plays a transmission and tops up a little oxygen, so curiosity pays.
 */
export function createDataPads(planetRadius: number) {
  const slabGeo = new THREE.BoxGeometry(0.34, 0.05, 0.48);
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f38,
    roughness: 0.4,
    metalness: 0.7,
  });
  const screenGeo = new THREE.PlaneGeometry(0.26, 0.38);
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0xffaa44,
    emissive: 0xffaa44,
    emissiveIntensity: 1.8,
    side: THREE.DoubleSide,
  });

  DATA_PADS.forEach((pad, i) => {
    const dir = pad.dir.clone();
    const height = getPlanetHeight(dir, planetRadius);
    const pos = dir.clone().multiplyScalar(height + 0.5);

    const group = new THREE.Group();
    group.position.copy(pos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.rotation.x = -0.45; // tilted, like it was dropped
    slab.castShadow = true;
    group.add(slab);

    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.rotation.x = -Math.PI / 2;
    screen.position.y = 0.03;
    slab.add(screen);

    renderer.scene.add(group);

    world.add({
      name: `DataPad_${i}`,
      isPickup: true,
      object3d: group,
      pickup: {
        amount: DATAPAD_OXYGEN,
        collected: false,
        bobPhase: i * 1.3,
        kind: "datapad",
        loreIndex: i,
      },
    });
  });
}
