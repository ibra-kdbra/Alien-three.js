import * as THREE from "three";
import { queries } from "../World";
import { inputManager } from "../../managers/InputManager";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import RAPIER from "@dimforge/rapier3d-compat";

export function updatePlayerControlSystem(delta: number) {
  for (const player of queries.player) {
    const { playerControl, rigidBody, collider, object3d, animation } = player;

    if (!collider || !rigidBody || !object3d) continue;

    // 1. Setup Basis (Standard Y-Up)
    const currentPos = rigidBody.translation();
    const playerPosVec = new THREE.Vector3(
      currentPos.x,
      currentPos.y,
      currentPos.z,
    );
    const upVector = new THREE.Vector3(0, 1, 0);

    // --- 2. Camera Mode & Input ---
    if (playerControl.yaw === undefined) playerControl.yaw = 0;
    if (playerControl.pitch === undefined) playerControl.pitch = 0;
    if (!playerControl.cameraMode) playerControl.cameraMode = "Follow";

    // Toggle Camera Mode (Key V)
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

    const isFreeLooking = inputManager.getAction("free_look") > 0;
    const mouseSensitivity = 0.003;
    playerControl.yaw -= inputManager.mouseDelta.x * mouseSensitivity;
    playerControl.pitch -= inputManager.mouseDelta.y * mouseSensitivity;
    playerControl.pitch = Math.max(
      -Math.PI / 2 + 0.2,
      Math.min(Math.PI / 2 - 0.2, playerControl.pitch),
    );

    let targetCamDist = 6.0;
    let camFov = 75;
    if (playerControl.cameraMode === "Action") {
      targetCamDist = 3.5;
      camFov = 60;
    }
    if (playerControl.cameraMode === "Orbit") {
      targetCamDist = 12.0;
    }

    renderer.camera.fov = THREE.MathUtils.lerp(
      renderer.camera.fov,
      camFov,
      5 * delta,
    );
    renderer.camera.updateProjectionMatrix();

    // Standard Trailing Camera calculation
    const camRotation = new THREE.Euler(
      playerControl.pitch,
      playerControl.yaw,
      0,
      "YXZ",
    );
    const camOffset = new THREE.Vector3(0, 0, targetCamDist).applyEuler(
      camRotation,
    );
    const heightVec = new THREE.Vector3(0, 1.6, 0);

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
        // Protection: minimum safe distance to avoid NaN when camera is exactly on player
        const safeDist = Math.max(0.5, (camHit as any).toi * 0.9);
        targetCamPos = playerPosVec
          .clone()
          .add(heightVec)
          .add(camRayDir.multiplyScalar(safeDist));
      }
    }

    // --- Black Screen / NaN Protection ---
    if (
      !isNaN(targetCamPos.x) &&
      !isNaN(targetCamPos.y) &&
      !isNaN(targetCamPos.z)
    ) {
      renderer.camera.position.lerp(targetCamPos, 15 * delta);

      const lookTarget = playerPosVec.clone().add(heightVec);
      if (!isNaN(lookTarget.x)) {
        renderer.camera.lookAt(lookTarget);
      }
    }

    // --- 3. Dynamic Movement Logic ---
    const input = inputManager.getDirection();
    const currentVelocity = rigidBody.linvel();

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

      // Wake up the physics body if it went to sleep while idle
      rigidBody.wakeUp();
    }

    // Horizontal Velocity Lerping (Direct Physics Velocity Manipulation)
    const targetHorizontalVel = moveDir
      .clone()
      .multiplyScalar(playerControl.speed);
    const currentHorizontalVel = new THREE.Vector3(
      currentVelocity.x,
      0,
      currentVelocity.z,
    );

    // Snappy acceleration and tight friction (damping) when letting go of keys
    const lerpSpeed = inputMagSq > 0 ? 10.0 : 20.0;
    currentHorizontalVel.lerp(targetHorizontalVel, lerpSpeed * delta);

    // Vertical Velocity (Gravity/Jump) - Let Rapier handle gravity!
    let newYVel = currentVelocity.y;

    // Ground Detection Raycast (Dynamic Bodies need an explicit ground check to jump)
    const groundRay = new RAPIER.Ray(
      { x: playerPosVec.x, y: playerPosVec.y + 0.1, z: playerPosVec.z }, // Start slightly above feet
      { x: 0, y: -1, z: 0 },
    );

    // Cast ray down up to 0.3 units (since ray starts 0.1 above bottom, this gives 0.2 tolerance)
    const groundHit = physicsManager.world.castRay(
      groundRay,
      0.3,
      true,
      undefined,
      undefined,
      undefined,
      rigidBody,
    );

    // Grounded if hit something AND not moving upwards rapidly
    playerControl.grounded = groundHit !== null && newYVel < 1.0;

    // Handle Jump
    if (inputManager.getAction("jump") > 0 && playerControl.grounded) {
      newYVel = playerControl.jumpForce;
      playerControl.grounded = false;
      rigidBody.wakeUp();
    }

    // Apply the final velocity back to the Dynamic rigid body
    // We explicitly overwrite X and Z, but we use the physics engine's simulated Y velocity (unless jumping).
    // This perfectly prevents floating and lets the character naturally slide down slopes.
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

    // Smoothly turn visual mesh to face movement direction
    object3d.quaternion.slerp(targetQuaternion, 15 * delta);

    // --- 5. Animation ---
    if (animation) {
      const horizontalSpeed = currentHorizontalVel.length();
      let nextAction = "Idle";

      // We check vertical velocity to determine if we are falling/jumping
      if (!playerControl.grounded && Math.abs(newYVel) > 1.0) {
        nextAction = "Jump";
      } else if (horizontalSpeed > 0.5) {
        nextAction =
          horizontalSpeed > playerControl.speed * 0.6 ? "Running" : "Walking";
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

      // Match animation speed to actual physical movement speed to eliminate sliding
      animation.mixer.timeScale =
        nextAction === "Idle" ? 1.0 : Math.max(0.5, horizontalSpeed / 5.0);
      animation.mixer.update(delta);
    }
  }
}
