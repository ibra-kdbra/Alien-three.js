import * as THREE from "three";

/**
 * Sun rig with a player-following shadow frustum.
 *
 * A single static shadow camera can't cover a whole planet at useful
 * resolution, so the light (and its ~50m ortho frustum) tracks the player:
 * shadows stay crisp wherever you are on the sphere.
 */

const SUN_DIRECTION = new THREE.Vector3(0.8, 0.55, 0.35).normalize();
const SUN_DISTANCE = 180;

let sunLight: THREE.DirectionalLight | null = null;

const _sunPos = new THREE.Vector3();

export function createSun(scene: THREE.Scene): THREE.DirectionalLight {
  sunLight = new THREE.DirectionalLight(0xffeedd, 3.5);
  sunLight.name = "SunLight";
  sunLight.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = SUN_DISTANCE * 2.5;
  sunLight.shadow.camera.left = -50;
  sunLight.shadow.camera.right = 50;
  sunLight.shadow.camera.top = 50;
  sunLight.shadow.camera.bottom = -50;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.05;

  scene.add(sunLight);
  scene.add(sunLight.target);
  return sunLight;
}

/** Keep the shadow frustum centered on the player. Call once per frame. */
export function updateSun(playerPos: THREE.Vector3) {
  if (!sunLight) return;
  _sunPos.copy(playerPos).addScaledVector(SUN_DIRECTION, SUN_DISTANCE);
  sunLight.position.copy(_sunPos);
  sunLight.target.position.copy(playerPos);
  sunLight.target.updateMatrixWorld();
}
