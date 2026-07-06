import * as THREE from "three";
import { queries } from "../World";
import { inputManager } from "../../managers/InputManager";
import { renderer } from "../../core/Renderer";
import { events } from "../../utils/EventBus";
import { audioManager } from "../../managers/AudioManager";
import { gameState } from "../../core/GameState";

/**
 * Spherical-gravity kinematic character controller.
 *
 * Runs at a fixed 60Hz inside the simulation loop — never with a render
 * delta — so movement speed, jump arcs and jetpack thrust are identical on
 * every machine. Velocity is tracked in world space and parallel-transported
 * as the local "up" rotates around the planet, which prevents the curvature
 * of the surface from bleeding into vertical speed.
 */

// --- Tuning ---------------------------------------------------------------
const GRAVITY = 18.0; // m/s² toward planet center
const TERMINAL_SPEED = 45.0; // max fall speed
const JUMP_SPEED = 7.5; // initial jump velocity along the normal
const JUMP_BUFFER_TIME = 0.15; // press jump slightly before landing → still jumps
const COYOTE_TIME = 0.12; // jump slightly after walking off a ledge → still jumps
const GROUND_ACCEL_RATE = 12.0; // exponential approach rate toward target velocity
const AIR_ACCEL_RATE = 2.2; // reduced control while airborne
const GROUND_STICK_SPEED = 2.5; // constant downward bias to hug slopes
const JETPACK_TARGET_RISE = 5.5; // sustained climb speed
const JETPACK_RESPONSE = 5.0; // how quickly thrust ramps in
const JETPACK_DRAIN = 38.0; // fuel per second while thrusting
const JETPACK_REGEN = 30.0; // fuel per second while grounded
const JETPACK_MIN_ENGAGE = 10.0; // don't sputter on an empty tank

// --- Single-player controller state ----------------------------------------
let jumpBufferTimer = 0;
let coyoteTimer = 0;
let wasJetpacking = false;
const lastNormal = new THREE.Vector3();
let hasLastNormal = false;
const lastHeading = new THREE.Quaternion();
let hasHeading = false;
const targetOrientation = new THREE.Quaternion();

// --- Scratch objects (no per-tick allocations) ------------------------------
const _pos = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _horizontal = new THREE.Vector3();
const _targetVel = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _upright = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _basisRight = new THREE.Vector3();
const _basisFwd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Diagnostics for the headless smoke test / debug overlay. */
export const charDiag = {
  ticks: 0,
  desired: { x: 0, y: 0, z: 0 },
  moved: { x: 0, y: 0, z: 0 },
  vertical: 0,
  grounded: false,
  camForward: { x: 0, y: 0, z: 0 },
};

/**
 * Called once per render frame (before the fixed steps) so short key taps
 * are never lost between simulation ticks.
 */
export function pollCharacterInput() {
  if (inputManager.consumePressed("jump")) {
    jumpBufferTimer = JUMP_BUFFER_TIME;
  }
}

/** One 60Hz simulation tick. */
export function updateCharacterSystem(dt: number) {
  const player = queries.player.first;
  if (!player) return;

  const { playerControl, rigidBody, collider, characterController: kcc } = player;
  if (!rigidBody || !collider || !kcc) return;

  const t = rigidBody.translation();
  _pos.set(t.x, t.y, t.z);

  // Safety net: NaN or fell through the planet → respawn.
  const spawn = player.spawnPoint;
  if (spawn && (!isFinite(_pos.lengthSq()) || _pos.length() < spawn.safeRadius)) {
    rigidBody.setNextKinematicTranslation({ x: spawn.x, y: spawn.y, z: spawn.z });
    playerControl.velocity.x = 0;
    playerControl.velocity.y = 0;
    playerControl.velocity.z = 0;
    hasLastNormal = false;
    return;
  }

  _normal.copy(_pos).normalize();

  // --- Timers ---
  jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);
  coyoteTimer = Math.max(0, coyoteTimer - dt);
  if (playerControl.grounded) coyoteTimer = COYOTE_TIME;

  // --- Velocity: restore and parallel-transport to the new tangent frame ---
  _vel.set(playerControl.velocity.x, playerControl.velocity.y, playerControl.velocity.z);
  if (hasLastNormal) {
    _quat.setFromUnitVectors(lastNormal, _normal);
    _vel.applyQuaternion(_quat);
  }
  lastNormal.copy(_normal);
  hasLastNormal = true;

  // --- Input (zeroed when not actively playing) ---
  const playing = gameState.isPlaying;
  const input = playing ? inputManager.getDirection() : { x: 0, z: 0 };
  const holdJump = playing && inputManager.getAction("jump") > 0;
  if (!playing) jumpBufferTimer = 0;

  // Camera-relative tangent basis
  renderer.camera.getWorldDirection(_camFwd);
  _forward.copy(_camFwd).projectOnPlane(_normal);
  if (_forward.lengthSq() < 0.001) {
    // Looking straight along the normal — fall back to camera up
    _forward.copy(renderer.camera.up).projectOnPlane(_normal);
  }
  _forward.normalize();
  _right.crossVectors(_forward, _normal).normalize();

  _moveDir.set(0, 0, 0);
  const hasInput = input.x !== 0 || input.z !== 0;
  if (hasInput) {
    _moveDir.addScaledVector(_right, input.x);
    _moveDir.addScaledVector(_forward, -input.z);
    _moveDir.normalize();
  }

  // --- Decompose velocity ---
  let vertical = _vel.dot(_normal);
  _horizontal.copy(_vel).addScaledVector(_normal, -vertical);

  const isSprinting = playing && inputManager.getAction("sprint") > 0 && hasInput && playerControl.oxygen > 0;
  playerControl.isSprinting = isSprinting;
  const targetSpeed = isSprinting ? playerControl.sprintSpeed : playerControl.speed;

  // Frame-rate-independent exponential acceleration toward the target velocity
  _targetVel.copy(_moveDir).multiplyScalar(targetSpeed);
  const accelRate = playerControl.grounded ? GROUND_ACCEL_RATE : AIR_ACCEL_RATE;
  _horizontal.lerp(_targetVel, 1 - Math.exp(-accelRate * dt));

  // --- Vertical: gravity, jump, jetpack ---
  let isJetpacking = false;
  const grounded = playerControl.grounded;

  if (grounded) {
    vertical = -GROUND_STICK_SPEED;
  } else {
    vertical -= GRAVITY * dt;
  }

  const fuel = playerControl.jetpackFuel ?? 0;

  if (jumpBufferTimer > 0 && (grounded || coyoteTimer > 0)) {
    vertical = JUMP_SPEED;
    jumpBufferTimer = 0;
    coyoteTimer = 0;
    playerControl.grounded = false;
    events.emit("player:jump");
  } else if (
    holdJump &&
    !grounded &&
    fuel > 0 &&
    (wasJetpacking || fuel >= JETPACK_MIN_ENGAGE) &&
    (wasJetpacking || vertical < JUMP_SPEED * 0.5)
  ) {
    // Jetpack: hold Space while airborne (engages past the jump's rise)
    isJetpacking = true;
    vertical = THREE.MathUtils.lerp(vertical, JETPACK_TARGET_RISE, 1 - Math.exp(-JETPACK_RESPONSE * dt));
    playerControl.jetpackFuel = Math.max(0, fuel - JETPACK_DRAIN * dt);
    events.emit("player:fuel:changed", playerControl.jetpackFuel, playerControl.maxJetpackFuel ?? 100);
  }

  // Fuel regenerates on the ground
  if (grounded && fuel < (playerControl.maxJetpackFuel ?? 100)) {
    playerControl.jetpackFuel = Math.min(playerControl.maxJetpackFuel ?? 100, fuel + JETPACK_REGEN * dt);
    events.emit("player:fuel:changed", playerControl.jetpackFuel, playerControl.maxJetpackFuel ?? 100);
  }

  wasJetpacking = isJetpacking;
  playerControl.isJetpacking = isJetpacking;
  audioManager.setJetpackActive(isJetpacking);

  vertical = THREE.MathUtils.clamp(vertical, -TERMINAL_SPEED, TERMINAL_SPEED);

  // --- Move through the kinematic character controller ---
  _vel.copy(_horizontal).addScaledVector(_normal, vertical);

  kcc.setUp({ x: _normal.x, y: _normal.y, z: _normal.z });
  if (vertical > 0.1) {
    kcc.disableSnapToGround();
  } else {
    kcc.enableSnapToGround(0.5);
  }

  kcc.computeColliderMovement(collider, {
    x: _vel.x * dt,
    y: _vel.y * dt,
    z: _vel.z * dt,
  });

  const moved = kcc.computedMovement();
  rigidBody.setNextKinematicTranslation({
    x: _pos.x + moved.x,
    y: _pos.y + moved.y,
    z: _pos.z + moved.z,
  });
  playerControl.grounded = kcc.computedGrounded();

  charDiag.ticks++;
  charDiag.desired = { x: _vel.x * dt, y: _vel.y * dt, z: _vel.z * dt };
  charDiag.moved = { x: moved.x, y: moved.y, z: moved.z };
  charDiag.vertical = vertical;
  charDiag.grounded = playerControl.grounded;
  charDiag.camForward = { x: _camFwd.x, y: _camFwd.y, z: _camFwd.z };

  // Keep the physics capsule upright along the surface normal
  _upright.setFromUnitVectors(UP, _normal);
  rigidBody.setNextKinematicRotation(_upright);

  // Store velocity: horizontal from what the KCC actually allowed (so we
  // don't accumulate speed while pushing into a wall), vertical from the sim.
  _vel.set(moved.x / dt, moved.y / dt, moved.z / dt);
  const actualVertical = _vel.dot(_normal);
  _horizontal.copy(_vel).addScaledVector(_normal, -actualVertical);
  if (playerControl.grounded) vertical = -GROUND_STICK_SPEED;

  playerControl.velocity.x = _horizontal.x + _normal.x * vertical;
  playerControl.velocity.y = _horizontal.y + _normal.y * vertical;
  playerControl.velocity.z = _horizontal.z + _normal.z * vertical;

  // --- Visual heading target (consumed at render time) ---
  if (hasInput) {
    // The mesh faces -Z internally, so the basis forward is the negated move direction
    _basisFwd.copy(_moveDir).negate();
    _basisRight.crossVectors(_normal, _basisFwd).normalize();
    _matrix.makeBasis(_basisRight, _normal, _basisFwd);
    targetOrientation.setFromRotationMatrix(_matrix);
    lastHeading.copy(targetOrientation);
    hasHeading = true;
  } else if (hasHeading) {
    // Standing still: keep the last heading but re-align it to the current normal
    _basisFwd.set(0, 0, 1).applyQuaternion(lastHeading).projectOnPlane(_normal);
    if (_basisFwd.lengthSq() > 0.001) {
      _basisFwd.normalize();
      _basisRight.crossVectors(_normal, _basisFwd).normalize();
      _matrix.makeBasis(_basisRight, _normal, _basisFwd);
      targetOrientation.setFromRotationMatrix(_matrix);
      lastHeading.copy(targetOrientation);
    } else {
      targetOrientation.copy(_upright);
    }
  } else {
    targetOrientation.copy(_upright);
  }
}

/**
 * Render-phase visuals: smooth mesh rotation toward the heading and drive
 * the animation state machine. Runs with the render delta for smoothness.
 */
export function updateCharacterVisuals(delta: number) {
  const player = queries.player.first;
  if (!player) return;

  const { playerControl, object3d, animation } = player;
  if (!object3d) return;

  object3d.quaternion.slerp(targetOrientation, 1 - Math.exp(-14 * delta));

  if (!animation) return;

  // Derive animation state from simulation velocity
  _vel.set(playerControl.velocity.x, playerControl.velocity.y, playerControl.velocity.z);
  _normal.copy(object3d.position).normalize();
  const verticalSpeed = _vel.dot(_normal);
  _horizontal.copy(_vel).addScaledVector(_normal, -verticalSpeed);
  const horizontalSpeed = _horizontal.length();

  let nextAction = "Idle";
  if (!playerControl.grounded && Math.abs(verticalSpeed) > 1.5) {
    nextAction = "Jump";
  } else if (horizontalSpeed > 0.5) {
    nextAction = playerControl.isSprinting && horizontalSpeed > 5.0 ? "Running" : "Walking";
  }

  if (animation.currentAction !== nextAction) {
    const prevAction = animation.actions[animation.currentAction!];
    const newAction = animation.actions[nextAction];
    if (newAction) {
      if (prevAction) prevAction.fadeOut(0.2);
      newAction.reset().fadeIn(0.2).play();
      animation.currentAction = nextAction;
    } else {
      // Single-clip models (e.g. CesiumMan): reuse the one loop for all motion
      const singleActionName = Object.keys(animation.actions)[0];
      if (singleActionName && animation.currentAction !== singleActionName) {
        const singleAction = animation.actions[singleActionName];
        if (singleAction) {
          if (prevAction) prevAction.fadeOut(0.2);
          singleAction.reset().fadeIn(0.2).play();
          animation.currentAction = singleActionName;
        }
      }
    }
  }

  if (animation.actions[nextAction] === undefined) {
    const singleActionName = Object.keys(animation.actions)[0];
    if (singleActionName) {
      const singleAction = animation.actions[singleActionName];
      if (singleAction) {
        if (horizontalSpeed < 0.2) {
          singleAction.paused = true;
        } else {
          singleAction.paused = false;
          animation.mixer.timeScale = Math.max(0.5, horizontalSpeed / 4.0);
        }
      }
    }
  } else {
    animation.mixer.timeScale = nextAction === "Idle" ? 1.0 : Math.max(0.5, horizontalSpeed / 5.0);
  }
  animation.mixer.update(delta);
}
