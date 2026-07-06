import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { queries } from "../World";
import { inputManager } from "../../managers/InputManager";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";

/**
 * Third-person spherical camera rig.
 *
 * Runs in the render phase using the player's interpolated position, so the
 * camera is glassy-smooth at any refresh rate. The rig group keeps its "up"
 * aligned to the planet normal (smoothed) and a pivot applies yaw/pitch;
 * a physics raycast pulls the camera in when terrain blocks the view.
 */

let cameraRig: THREE.Group | null = null;
let cameraPivot: THREE.Group | null = null;
let modeDisplay: HTMLElement | null = null;

const _normal = new THREE.Vector3();
const _rigUp = new THREE.Vector3();
const _alignQuat = new THREE.Quaternion();
const _camLocal = new THREE.Vector3();
const _camWorld = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const HEAD_HEIGHT = 1.8;

export function updateCameraSystem(delta: number) {
  const player = queries.player.first;
  if (!player) return;

  const { playerControl, object3d, rigidBody } = player;
  if (!object3d) return;

  // --- Lazy init ---
  if (playerControl.yaw === undefined) playerControl.yaw = 0;
  if (playerControl.pitch === undefined) playerControl.pitch = -0.2;
  if (!playerControl.cameraMode) playerControl.cameraMode = "Follow";
  if (playerControl.cameraDistance === undefined) playerControl.cameraDistance = 6.0;

  if (!cameraRig || !cameraPivot) {
    cameraRig = new THREE.Group();
    cameraPivot = new THREE.Group();
    renderer.scene.add(cameraRig);
    cameraRig.add(cameraPivot);
    cameraPivot.add(renderer.camera);
    renderer.camera.position.set(0, HEAD_HEIGHT, playerControl.cameraDistance);
    modeDisplay = document.getElementById("camera-mode-display");
  }

  // --- Mode toggle (V) ---
  if (inputManager.consumePressed("camera_mode")) {
    if (playerControl.cameraMode === "Follow") playerControl.cameraMode = "Action";
    else if (playerControl.cameraMode === "Action") playerControl.cameraMode = "Orbit";
    else playerControl.cameraMode = "Follow";
    if (modeDisplay) modeDisplay.textContent = `CAM: ${playerControl.cameraMode.toUpperCase()}`;
  }

  // --- Mouse look ---
  const mouseSensitivity = 0.002;
  playerControl.yaw -= inputManager.mouseDelta.x * mouseSensitivity;
  playerControl.pitch -= inputManager.mouseDelta.y * mouseSensitivity;
  playerControl.pitch = THREE.MathUtils.clamp(playerControl.pitch, -Math.PI / 2 + 0.1, Math.PI / 3);

  // --- Scroll zoom ---
  if (inputManager.scrollDelta !== 0) {
    playerControl.cameraDistance = THREE.MathUtils.clamp(
      playerControl.cameraDistance + inputManager.scrollDelta * 0.01,
      2.0,
      20.0,
    );
  }

  // --- Mode parameters ---
  let targetCamDist = playerControl.cameraDistance;
  let camFov = 75;
  if (playerControl.cameraMode === "Action") {
    targetCamDist = Math.min(playerControl.cameraDistance, 3.5);
    camFov = 60;
  } else if (playerControl.cameraMode === "Orbit") {
    targetCamDist = Math.max(playerControl.cameraDistance, 12.0);
  }

  renderer.camera.fov = THREE.MathUtils.lerp(renderer.camera.fov, camFov, 1 - Math.exp(-5 * delta));
  renderer.camera.updateProjectionMatrix();

  // --- Rig placement: follow interpolated player position ---
  const playerPos = object3d.position;
  _normal.copy(playerPos).normalize();
  cameraRig.position.copy(playerPos);

  // Smoothly align rig up with the planet normal (prevents pole flips)
  _rigUp.copy(UP).applyQuaternion(cameraRig.quaternion);
  _alignQuat.setFromUnitVectors(_rigUp, _normal);
  cameraRig.quaternion.premultiply(_alignQuat);

  cameraPivot.rotation.set(playerControl.pitch, playerControl.yaw, 0, "YXZ");
  cameraRig.updateMatrixWorld(true);

  // --- Camera collision: pull in when terrain/rocks block the view ---
  _camLocal.set(0, HEAD_HEIGHT, targetCamDist);
  _camWorld.copy(_camLocal).applyMatrix4(cameraPivot.matrixWorld);
  _rayOrigin.copy(playerPos).addScaledVector(_normal, HEAD_HEIGHT);
  _rayDir.copy(_camWorld).sub(_rayOrigin);
  const rayLen = _rayDir.length();

  let finalCamDist = targetCamDist;
  if (rayLen > 0.001 && physicsManager.world) {
    _rayDir.divideScalar(rayLen);
    const ray = new RAPIER.Ray(
      { x: _rayOrigin.x, y: _rayOrigin.y, z: _rayOrigin.z },
      { x: _rayDir.x, y: _rayDir.y, z: _rayDir.z },
    );
    const hit = physicsManager.world.castRay(ray, rayLen, true, undefined, undefined, undefined, rigidBody);
    if (hit) {
      finalCamDist = Math.max(1.0, hit.timeOfImpact * 0.9);
    }
  }

  renderer.camera.position.set(0, HEAD_HEIGHT, finalCamDist);

  _lookAt.set(0, HEAD_HEIGHT, 0);
  cameraPivot.localToWorld(_lookAt);
  renderer.camera.lookAt(_lookAt);
}
