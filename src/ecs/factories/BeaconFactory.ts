import * as THREE from "three";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import RAPIER from "@dimforge/rapier3d-compat";

/**
 * Places beacons on the terrain at positions that avoid the center (player spawn).
 * Each beacon is a glowing pillar of light with a pulsing effect.
 */
export function createBeacons(mapSize: number, terrainHeightFn: (x: number, z: number) => number) {
  const beaconPositions = [
    { x: mapSize * 0.3, z: mapSize * 0.15 },
    { x: -mapSize * 0.25, z: -mapSize * 0.3 },
    { x: mapSize * 0.1, z: -mapSize * 0.35 },
  ];

  beaconPositions.forEach((pos, index) => {
    const y = terrainHeightFn(pos.x, pos.z) + 0.5;
    createBeacon({ x: pos.x, y, z: pos.z }, index);
  });
}

function createBeacon(
  position: { x: number; y: number; z: number },
  index: number,
) {
  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z);

  // Crystal geometry — double pyramid
  const crystalGeo = new THREE.OctahedronGeometry(0.6, 0);
  crystalGeo.scale(1, 2.5, 1);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x00ffcc,
    emissive: 0x00ffcc,
    emissiveIntensity: 2.0,
    metalness: 0.8,
    roughness: 0.1,
    transparent: true,
    opacity: 0.9,
  });
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  crystal.position.y = 1.5;
  crystal.castShadow = true;
  group.add(crystal);

  // Inner glow core
  const coreGeo = new THREE.SphereGeometry(0.3, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 1.5;
  group.add(core);

  // Base ring
  const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    transparent: true,
    opacity: 0.5,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);

  // Outer ring (slower rotation)
  const outerRingGeo = new THREE.TorusGeometry(1.8, 0.04, 8, 48);
  const outerRing = new THREE.Mesh(outerRingGeo, ringMat.clone());
  outerRing.material.opacity = 0.3;
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.05;
  group.add(outerRing);

  // Point light — beacon glow
  const light = new THREE.PointLight(0x00ffcc, 8, 25);
  light.position.y = 2.0;
  light.castShadow = false;
  group.add(light);

  // Vertical light beam
  const beamGeo = new THREE.CylinderGeometry(0.05, 0.3, 15, 8, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 9;
  group.add(beam);

  renderer.scene.add(group);

  // Store references for animation
  group.userData = {
    crystal,
    core,
    ring,
    outerRing,
    light,
    beam,
    crystalMat,
    index,
  };

  // Physics sensor (for proximity detection)
  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    position.x,
    position.y,
    position.z,
  );
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  return world.add({
    name: `Beacon_${index}`,
    isBeacon: true,
    object3d: group,
    rigidBody,
    beacon: {
      collected: false,
      signalBoost: 33.34,
      pulsePhase: index * (Math.PI * 2) / 3, // Offset each beacon's pulse
    },
  });
}
