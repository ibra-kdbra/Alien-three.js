import * as THREE from "three";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import RAPIER from "@dimforge/rapier3d-compat";

/**
 * Places beacons on the planet surface in 3 distinct 3D directions.
 * Each beacon is aligned to stand upright along the surface normal.
 */
export const BEACON_DIRECTIONS = [
  new THREE.Vector3(0.5, 0.4, 0.77).normalize(),
  new THREE.Vector3(-0.7, -0.3, -0.64).normalize(),
  new THREE.Vector3(0.2, -0.85, 0.49).normalize(),
];

export function createBeacons(
  planetRadius: number,
  getPlanetHeightFn: (dir: THREE.Vector3, radius: number) => number,
) {
  BEACON_DIRECTIONS.forEach((dir, index) => {
    const height = getPlanetHeightFn(dir, planetRadius);
    const pos = dir.clone().multiplyScalar(height);
    createBeacon({ x: pos.x, y: pos.y, z: pos.z }, dir, index);
  });
}

function createBeacon(
  position: { x: number; y: number; z: number },
  normal: THREE.Vector3,
  index: number,
) {
  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z);

  // Align beacon upright to the planet surface normal
  const uprightQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.quaternion.copy(uprightQuat);

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

  // Vertical light beam. 300m tall: the horizon on a 200m-radius planet is
  // only ~27m away at eye height, and a beacon half the planet away needs a
  // beam this tall to peek over the curvature and the mountain ranges.
  // This is the player's primary wayfinding tool.
  const beamGeo = new THREE.CylinderGeometry(1.0, 3.0, 300, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 150;
  group.add(beam);

  // Bright inner core beam so the column reads even against a lit sky
  const beamCoreGeo = new THREE.CylinderGeometry(0.25, 0.8, 300, 8, 1, true);
  const beamCoreMat = new THREE.MeshBasicMaterial({
    color: 0xaaffee,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const beamCore = new THREE.Mesh(beamCoreGeo, beamCoreMat);
  beamCore.position.y = 150;
  group.add(beamCore);

  renderer.scene.add(group);

  // Store references for animation
  group.userData = {
    crystal,
    core,
    ring,
    outerRing,
    light,
    beam,
    beamCore,
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

  // Sync physics rotation to align sensor with visual mesh
  rigidBody.setRotation(uprightQuat, true);

  // Ball collider sensor
  const colliderDesc = RAPIER.ColliderDesc.ball(3.5).setSensor(true);
  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  return world.add({
    name: `Beacon_${index}`,
    isBeacon: true,
    object3d: group,
    rigidBody,
    collider,
    beacon: {
      collected: false,
      signalBoost: 33.34,
      pulsePhase: index * (Math.PI * 2) / 3, // Offset each beacon's pulse
    },
  });
}
