import * as THREE from "three";
import { world, queries } from "../World";
import { renderer } from "../../core/Renderer";

/**
 * Creates toxic gas vents scattered across the planet surface in 5 distinct directions.
 * These are dangerous zones that drain player oxygen rapidly, aligned to the surface normal.
 */
export function createHazards(
  planetRadius: number,
  getPlanetHeightFn: (dir: THREE.Vector3, radius: number) => number,
) {
  const directions = [
    new THREE.Vector3(0.15, 0.8, 0.1).normalize(),
    new THREE.Vector3(-0.1, -0.7, -0.15).normalize(),
    new THREE.Vector3(-0.5, 0.2, 0.5).normalize(),
    new THREE.Vector3(0.5, -0.2, -0.5).normalize(),
    new THREE.Vector3(-0.32, 0.5, -0.8).normalize(),
  ];

  directions.forEach((dir, index) => {
    const height = getPlanetHeightFn(dir, planetRadius);
    const pos = dir.clone().multiplyScalar(height);
    createHazard({ x: pos.x, y: pos.y, z: pos.z }, dir, index);
  });
}

function createHazard(
  position: { x: number; y: number; z: number },
  normal: THREE.Vector3,
  index: number,
) {
  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z);

  // Align hazard upright to the planet surface normal
  const uprightQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.quaternion.copy(uprightQuat);

  const radius = 6 + Math.random() * 4;

  // Ground glow disc
  const discGeo = new THREE.CircleGeometry(radius, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0xaaff00,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  group.add(disc);

  // Inner warning ring
  const ringGeo = new THREE.TorusGeometry(radius * 0.6, 0.06, 8, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xccff00,
    transparent: true,
    opacity: 0.3,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);

  // Gas particle columns (simple rising cylinders)
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + Math.random();
    const dist = radius * 0.3 + Math.random() * radius * 0.4;
    const gasGeo = new THREE.CylinderGeometry(0.15, 0.4, 3 + Math.random() * 2, 6, 1, true);
    const gasMat = new THREE.MeshBasicMaterial({
      color: 0x99ff22,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const gas = new THREE.Mesh(gasGeo, gasMat);
    gas.position.set(
      Math.cos(angle) * dist,
      1.5 + Math.random(),
      Math.sin(angle) * dist,
    );
    group.add(gas);
  }

  // Eerie point light
  const light = new THREE.PointLight(0xaaff00, 4, radius * 2);
  light.position.y = 1.0;
  light.castShadow = false;
  group.add(light);

  // Store animation refs
  group.userData = { disc, ring, light, radius };

  renderer.scene.add(group);

  return world.add({
    name: `Hazard_${index}`,
    isHazard: true,
    object3d: group,
    hazard: {
      drainRate: 5.0,
      radius,
      pulsePhase: index * 1.2,
    },
  });
}

/**
 * Animate hazard zones (called from Engine loop)
 */
export function updateHazardVisuals(delta: number, elapsed: number) {
  for (const hazard of queries.hazards) {
    if (!hazard.object3d || !hazard.hazard) continue;
    const ud = hazard.object3d.userData;
    const t = elapsed + hazard.hazard.pulsePhase;

    // Pulse glow
    if (ud.light) {
      ud.light.intensity = 3 + Math.sin(t * 1.5) * 2;
    }

    // Disc opacity pulse
    if (ud.disc) {
      ud.disc.material.opacity = 0.08 + Math.sin(t * 2.0) * 0.06;
    }

    // Ring rotation
    if (ud.ring) {
      ud.ring.rotation.z += delta * 0.3;
    }
  }
}
