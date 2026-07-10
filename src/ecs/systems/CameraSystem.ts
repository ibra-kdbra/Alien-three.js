import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { queries } from "../World";
import { inputManager } from "../../managers/InputManager";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { events } from "../../utils/EventBus";
import { cameraSettings, saveCameraSettings, CAMERA_LIMITS } from "../../core/CameraSettings";

/**
 * Third-person spherical camera rig, v2.
 *
 * Runs in the render phase on the player's interpolated position. The rig
 * group keeps its "up" aligned to the planet normal and a pivot applies
 * yaw/pitch. What changed from v1:
 *
 *  - Look input is velocity-smoothed (configurable 0..1), with sensitivity
 *    and invert-Y from the persisted camera settings.
 *  - Two modes: EXPLORE (boom length from settings) and FOCUS (tight
 *    over-the-shoulder). The old Orbit mode — forced 12m boom whose collision
 *    ray hammered the terrain — is gone.
 *  - Collision is a sphere-cast (25cm ball) instead of a ray, so the lens
 *    never clips geometry and small terrain bumps no longer cause pops.
 *  - The look target leads into the movement direction for anticipation.
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
const _lead = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 };

const HEAD_HEIGHT = 1.8;
const BASE_SENSITIVITY = 0.0022;

// Focus mode: close over-the-shoulder framing.
const FOCUS_DIST = 2.7;
const FOCUS_SHOULDER = 0.5;
const FOCUS_FOV_DELTA = -6;

// Sphere-cast lens radius — keeps a real margin between camera and geometry.
const LENS_RADIUS = 0.25;
const _lensBall = new RAPIER.Ball(LENS_RADIUS);

// --- Feel state ---
// Collision distance is asymmetric: snap in fast so geometry never clips the
// view, ease back out slowly so regaining line-of-sight doesn't "pop".
let smoothedCamDist: number | null = null;
const COLLIDE_IN_RATE = 18;
const COLLIDE_OUT_RATE = 3.5;

// Velocity-smoothed mouse look.
let lookVelYaw = 0;
let lookVelPitch = 0;

// Shoulder offset eases in/out on mode switches.
let smoothedShoulder = 0;

// Landing shake: a decaying wobble kicked by the impact speed.
let shakeAmp = 0;
let shakeTime = 0;
events.on("player:land", (impactSpeed) => {
  shakeAmp = Math.min(0.35, 0.04 + impactSpeed * 0.018);
});

const _velV = new THREE.Vector3();
const _horiz = new THREE.Vector3();

export function updateCameraSystem(delta: number) {
  const player = queries.player.first;
  if (!player) return;

  const { playerControl, object3d, rigidBody } = player;
  if (!object3d) return;

  // --- Lazy init ---
  if (playerControl.yaw === undefined) playerControl.yaw = 0;
  if (playerControl.pitch === undefined) playerControl.pitch = -0.2;
  if (!playerControl.cameraMode) playerControl.cameraMode = "Explore";

  if (!cameraRig || !cameraPivot) {
    cameraRig = new THREE.Group();
    cameraPivot = new THREE.Group();
    renderer.scene.add(cameraRig);
    cameraRig.add(cameraPivot);
    cameraPivot.add(renderer.camera);
    renderer.camera.position.set(0, HEAD_HEIGHT, cameraSettings.distance);
    modeDisplay = document.getElementById("camera-mode-display");
    if (modeDisplay) modeDisplay.textContent = "CAM: EXPLORE";
  }

  // --- Mode toggle (V) ---
  if (inputManager.consumePressed("camera_mode")) {
    playerControl.cameraMode = playerControl.cameraMode === "Explore" ? "Focus" : "Explore";
    if (modeDisplay) modeDisplay.textContent = `CAM: ${playerControl.cameraMode.toUpperCase()}`;
  }

  // --- Mouse look: velocity smoothing ---
  // Deltas are converted to angular velocity, damped toward the target, then
  // integrated — smoothing 0 is 1:1 raw, 1 is a heavy cinematic lag.
  const sens = BASE_SENSITIVITY * cameraSettings.sensitivity;
  const invert = cameraSettings.invertY ? -1 : 1;
  const dt = Math.max(delta, 1e-4);
  const targetVelYaw = (-inputManager.mouseDelta.x * sens) / dt;
  const targetVelPitch = (-inputManager.mouseDelta.y * sens * invert) / dt;

  if (cameraSettings.smoothing < 0.02) {
    lookVelYaw = targetVelYaw;
    lookVelPitch = targetVelPitch;
  } else {
    const rate = THREE.MathUtils.lerp(45, 9, cameraSettings.smoothing);
    const k = 1 - Math.exp(-rate * dt);
    lookVelYaw += (targetVelYaw - lookVelYaw) * k;
    lookVelPitch += (targetVelPitch - lookVelPitch) * k;
  }

  playerControl.yaw += lookVelYaw * dt;
  playerControl.pitch = THREE.MathUtils.clamp(
    playerControl.pitch + lookVelPitch * dt,
    -1.25,
    1.15,
  );

  // --- Scroll zoom (persists as the Explore boom length) ---
  if (inputManager.scrollDelta !== 0) {
    cameraSettings.distance = THREE.MathUtils.clamp(
      cameraSettings.distance + inputManager.scrollDelta * 0.005,
      CAMERA_LIMITS.distance.min,
      CAMERA_LIMITS.distance.max,
    );
    saveCameraSettings();
  }

  // --- Mode parameters ---
  const isFocus = playerControl.cameraMode === "Focus";
  const targetCamDist = isFocus ? FOCUS_DIST : cameraSettings.distance;
  let camFov = cameraSettings.fov + (isFocus ? FOCUS_FOV_DELTA : 0);
  smoothedShoulder = THREE.MathUtils.lerp(
    smoothedShoulder,
    isFocus ? FOCUS_SHOULDER : 0,
    1 - Math.exp(-8 * delta),
  );

  // --- Speed FOV kick: sprinting and jetpacking widen the lens for a sense
  // of velocity; walking stays at the base FOV.
  _velV.set(playerControl.velocity.x, playerControl.velocity.y, playerControl.velocity.z);
  _normal.copy(object3d.position).normalize();
  const vertSpeed = _velV.dot(_normal);
  _horiz.copy(_velV).addScaledVector(_normal, -vertSpeed);
  const speedKick = THREE.MathUtils.clamp((_horiz.length() - 7.0) / 5.0, 0, 1) * 6.0;
  const jetKick = playerControl.isJetpacking ? 4.0 : 0;
  camFov += speedKick + jetKick;

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

  // --- Camera collision: sphere-cast the boom, pull in on hits ---
  _camLocal.set(smoothedShoulder, HEAD_HEIGHT, targetCamDist);
  _camWorld.copy(_camLocal).applyMatrix4(cameraPivot.matrixWorld);
  _rayOrigin.copy(playerPos).addScaledVector(_normal, HEAD_HEIGHT);
  _rayDir.copy(_camWorld).sub(_rayOrigin);
  const rayLen = _rayDir.length();

  let desiredDist = targetCamDist;
  if (rayLen > 0.001 && physicsManager.world) {
    _rayDir.divideScalar(rayLen);
    const hit = physicsManager.world.castShape(
      _rayOrigin,
      IDENTITY_ROT,
      _rayDir,
      _lensBall,
      0,
      rayLen,
      true,
      undefined,
      undefined,
      undefined,
      rigidBody,
    );
    if (hit) {
      desiredDist = Math.max(0.8, (hit.time_of_impact / rayLen) * targetCamDist);
    }
  }

  if (smoothedCamDist === null) smoothedCamDist = desiredDist;
  const collideRate = desiredDist < smoothedCamDist ? COLLIDE_IN_RATE : COLLIDE_OUT_RATE;
  smoothedCamDist = THREE.MathUtils.lerp(
    smoothedCamDist,
    desiredDist,
    1 - Math.exp(-collideRate * delta),
  );

  // --- Landing shake (decays exponentially; can be disabled in settings) ---
  let shakeX = 0;
  let shakeY = 0;
  if (shakeAmp > 0.002) {
    shakeTime += delta;
    shakeAmp *= Math.exp(-6 * delta);
    if (cameraSettings.shake) {
      shakeX = Math.sin(shakeTime * 45) * shakeAmp;
      shakeY = Math.cos(shakeTime * 38) * shakeAmp * 0.7;
    }
  }

  renderer.camera.position.set(smoothedShoulder + shakeX, HEAD_HEIGHT + shakeY, smoothedCamDist);

  // --- Look target: head position, leading into the movement direction ---
  _lookAt.set(smoothedShoulder + shakeX * 0.5, HEAD_HEIGHT + shakeY * 0.5, 0);
  cameraPivot.localToWorld(_lookAt);
  _lead.copy(_horiz);
  const leadLen = Math.min(_lead.length() * 0.06, 0.6);
  if (leadLen > 0.001) _lookAt.addScaledVector(_lead.normalize(), leadLen);
  renderer.camera.lookAt(_lookAt);
}
