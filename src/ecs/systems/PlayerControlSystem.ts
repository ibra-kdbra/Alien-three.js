import * as THREE from "three";
import { queries } from "../World";
import { inputManager } from "../../managers/InputManager";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { events } from "../../utils/EventBus";
import RAPIER from "@dimforge/rapier3d-compat";

// Smooth camera follow state
let smoothCamPos = new THREE.Vector3(0, 10, 15);
let smoothLookTarget = new THREE.Vector3();

export function updatePlayerControlSystem(delta: number) {
  for (const player of queries.player) {
    const { playerControl, rigidBody, collider, object3d, animation } = player;

    if (!collider || !rigidBody || !object3d) continue;

    // 1. Setup Basis
    const currentPos = rigidBody.translation();
    const playerPosVec = new THREE.Vector3(
      currentPos.x,
      currentPos.y,
      currentPos.z,
    );
    const upVector = new THREE.Vector3(0, 1, 0);

    // --- 2. Camera Mode & Input ---
    if (playerControl.yaw === undefined) playerControl.yaw = 0;
    if (playerControl.pitch === undefined) playerControl.pitch = -0.2;
    if (!playerControl.cameraMode) playerControl.cameraMode = "Follow";
    if (playerControl.cameraDistance === undefined)
      playerControl.cameraDistance = 6.0;

    // Toggle Camera Mode (Key V) — with debounce
    if (
      inputManager.getAction("camera_mode") > 0 &&
      !(player as any)._v_pressed
    ) {
      if (playerControl.cameraMode === "Follow")
        playerControl.cameraMode = "Action";
      else if (playerControl.cameraMode === "Action")
        playerControl.cameraMode = "Orbit";
      else playerControl.cameraMode = "Follow";
      (player as any)._v_pressed = true;
    } else if (inputManager.getAction("camera_mode") === 0) {
      (player as any)._v_pressed = false;
    }

    // Mouse look
    const isFreeLooking = inputManager.getAction("free_look") > 0;
    const mouseSensitivity = 0.002;
    playerControl.yaw -= inputManager.mouseDelta.x * mouseSensitivity;
    playerControl.pitch -= inputManager.mouseDelta.y * mouseSensitivity;
    playerControl.pitch = Math.max(
      -Math.PI / 2 + 0.1,
      Math.min(Math.PI / 3, playerControl.pitch),
    );

    // Scroll zoom
    if (inputManager.scrollDelta !== 0) {
      playerControl.cameraDistance = THREE.MathUtils.clamp(
        playerControl.cameraDistance + inputManager.scrollDelta * 0.01,
        2.0,
        20.0,
      );
    }

    // Camera distance & FOV based on mode
    let targetCamDist = playerControl.cameraDistance;
    let camFov = 75;
    if (playerControl.cameraMode === "Action") {
      targetCamDist = Math.min(playerControl.cameraDistance, 3.5);
      camFov = 60;
    }
    if (playerControl.cameraMode === "Orbit") {
      targetCamDist = Math.max(playerControl.cameraDistance, 12.0);
    }

    renderer.camera.fov = THREE.MathUtils.lerp(
      renderer.camera.fov,
      camFov,
      5 * delta,
    );
    renderer.camera.updateProjectionMatrix();

    // Camera orbit calculation
    const camRotation = new THREE.Euler(
      playerControl.pitch,
      playerControl.yaw,
      0,
      "YXZ",
    );
    const camOffset = new THREE.Vector3(0, 0, targetCamDist).applyEuler(
      camRotation,
    );
    const heightVec = new THREE.Vector3(0, 1.8, 0);

    let targetCamPos = playerPosVec.clone().add(heightVec).add(camOffset);

    // Camera Collision (Raycast)
    const camRayDir = camOffset.clone().normalize();
    if (camRayDir.lengthSq() > 0.001) {
      const camRay = new RAPIER.Ray(
        {
          x: playerPosVec.x,
          y: playerPosVec.y + heightVec.y,
          z: playerPosVec.z,
        },
        { x: camRayDir.x, y: camRayDir.y, z: camRayDir.z },
      );
      const camHit = physicsManager.world.castRay(
        camRay,
        targetCamDist,
        true,
        undefined,
        undefined,
        undefined,
        rigidBody,
      );
      if (camHit) {
        const safeDist = Math.max(1.0, (camHit as any).toi * 0.85);
        targetCamPos = playerPosVec
          .clone()
          .add(heightVec)
          .add(camRayDir.clone().multiplyScalar(safeDist));
      }
    }

    // --- Smooth Camera Follow ---
    if (
      !isNaN(targetCamPos.x) &&
      !isNaN(targetCamPos.y) &&
      !isNaN(targetCamPos.z)
    ) {
      const camLerp = 8 * delta;
      smoothCamPos.lerp(targetCamPos, Math.min(camLerp, 1));
      renderer.camera.position.copy(smoothCamPos);

      const lookTarget = playerPosVec.clone().add(heightVec);
      smoothLookTarget.lerp(lookTarget, Math.min(12 * delta, 1));
      if (!isNaN(smoothLookTarget.x)) {
        renderer.camera.lookAt(smoothLookTarget);
      }
    }

    // --- 3. Movement Logic ---
    const input = inputManager.getDirection();
    const currentVelocity = rigidBody.linvel();
    const isSprinting = inputManager.getAction("sprint") > 0 && playerControl.oxygen > 0;
    playerControl.isSprinting = isSprinting;

    // Calculate forward/right vectors based on camera yaw
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(0, playerControl.yaw, 0),
    );
    const right = new THREE.Vector3(1, 0, 0).applyEuler(
      new THREE.Euler(0, playerControl.yaw, 0),
    );

    const moveDir = new THREE.Vector3();
    const inputMagSq = input.x * input.x + input.z * input.z;
    if (inputMagSq > 0) {
      moveDir.addScaledVector(right, input.x);
      moveDir.addScaledVector(forward, -input.z);
      moveDir.normalize();
      rigidBody.wakeUp();
    }

    // Movement speed
    const currentSpeed = isSprinting
      ? playerControl.sprintSpeed
      : playerControl.speed;

    // Horizontal Velocity
    const targetHorizontalVel = moveDir
      .clone()
      .multiplyScalar(currentSpeed);
    const currentHorizontalVel = new THREE.Vector3(
      currentVelocity.x,
      0,
      currentVelocity.z,
    );

    // Snappy acceleration, tighter deceleration
    const lerpSpeed = inputMagSq > 0 ? 12.0 : 25.0;
    currentHorizontalVel.lerp(targetHorizontalVel, Math.min(lerpSpeed * delta, 1));

    // Vertical Velocity
    let newYVel = currentVelocity.y;

    // Ground Detection — more generous raycast
    const groundRay = new RAPIER.Ray(
      { x: playerPosVec.x, y: playerPosVec.y, z: playerPosVec.z },
      { x: 0, y: -1, z: 0 },
    );

    const groundHit = physicsManager.world.castRay(
      groundRay,
      1.0, // Longer ray for slope tolerance
      true,
      undefined,
      undefined,
      undefined,
      rigidBody,
    );

    // Grounded if ray hit within capsule half-height + tolerance
    const groundThreshold = 0.95; // capsule half-height(0.5) + radius(0.3) + tolerance(0.15)
    playerControl.grounded =
      groundHit !== null &&
      (groundHit as any).toi <= groundThreshold &&
      newYVel < 2.0;

    // Jump
    if (inputManager.getAction("jump") > 0 && playerControl.grounded) {
      newYVel = playerControl.jumpForce;
      playerControl.grounded = false;
      rigidBody.wakeUp();
      events.emit("player:jump");
    }
    // Jetpack — hold Space while airborne, uses oxygen
    else if (
      inputManager.getAction("jump") > 0 &&
      !playerControl.grounded &&
      playerControl.oxygen > 0
    ) {
      const jetpackThrust = 6.0;
      newYVel = Math.min(newYVel + jetpackThrust * delta, 8.0); // Cap upward speed
      playerControl.oxygen = Math.max(
        0,
        playerControl.oxygen - 15 * delta, // Heavy oxygen cost
      );
      events.emit(
        "player:oxygen:changed",
        playerControl.oxygen,
        playerControl.maxOxygen,
      );
    }

    // Apply final velocity
    rigidBody.setLinvel(
      {
        x: currentHorizontalVel.x,
        y: newYVel,
        z: currentHorizontalVel.z,
      },
      true,
    );

    // --- 4. Visual Orientation ---
    const targetQuaternion = new THREE.Quaternion();
    if (inputMagSq > 0 && !isFreeLooking) {
      const moveAngle = Math.atan2(moveDir.x, moveDir.z);
      targetQuaternion.setFromAxisAngle(upVector, moveAngle);

      if (!object3d.userData.lastHeading)
        object3d.userData.lastHeading = targetQuaternion.clone();
      else object3d.userData.lastHeading.copy(targetQuaternion);
    } else if (object3d.userData.lastHeading) {
      targetQuaternion.copy(object3d.userData.lastHeading);
    }

    // Smooth visual turn
    object3d.quaternion.slerp(targetQuaternion, Math.min(15 * delta, 1));

    // --- 5. Animation ---
    if (animation) {
      const horizontalSpeed = currentHorizontalVel.length();
      let nextAction = "Idle";

      if (!playerControl.grounded && Math.abs(newYVel) > 1.5) {
        nextAction = "Jump";
      } else if (horizontalSpeed > 0.5) {
        nextAction = isSprinting && horizontalSpeed > 5.0 ? "Running" : "Walking";
      }

      if (animation.currentAction !== nextAction) {
        const prevAction = animation.actions[animation.currentAction!];
        const newAction = animation.actions[nextAction];
        if (newAction) {
          if (prevAction) prevAction.fadeOut(0.2);
          newAction.reset().fadeIn(0.2).play();
          animation.currentAction = nextAction;
        }
      }

      // Match animation speed to physical movement speed
      animation.mixer.timeScale =
        nextAction === "Idle" ? 1.0 : Math.max(0.5, horizontalSpeed / 5.0);
      animation.mixer.update(delta);
    }
  }
}
