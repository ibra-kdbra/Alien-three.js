import * as THREE from "three";
import { queries } from "../World";
import { inputManager } from "../../managers/InputManager";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { events } from "../../utils/EventBus";
import { audioManager } from "../../managers/AudioManager";
import RAPIER from "@dimforge/rapier3d-compat";



// Spherical camera rig groups
let cameraRig: THREE.Group | null = null;
let cameraPivot: THREE.Group | null = null;

// Sonar scanner state
let scannerMesh: THREE.Mesh | null = null;
let scannerScale = 0.1;
let scannerActive = false;
let scannerCooldown = 0;
const SCANNER_MAX_RADIUS = 80;

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

    // --- Camera Rig Setup & Alignment ---
    if (!cameraRig || !cameraPivot) {
      cameraRig = new THREE.Group();
      cameraPivot = new THREE.Group();
      renderer.scene.add(cameraRig);
      cameraRig.add(cameraPivot);
      cameraPivot.add(renderer.camera);
      
      // Position camera inside the pivot locally
      renderer.camera.position.set(0, 1.8, targetCamDist);
    }

    // Outward normal vector from the center of the planet
    const normal = playerPosVec.clone().normalize();

    // Position rig at player position
    cameraRig.position.copy(playerPosVec);

    // Smoothly align camera rig UP with planet normal to prevent camera flipping at poles
    const rigUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraRig.quaternion);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(rigUp, normal);
    cameraRig.quaternion.premultiply(alignQuat);

    // Apply mouse look yaw and pitch locally on the pivot
    cameraPivot.rotation.set(playerControl.pitch, playerControl.yaw, 0, "YXZ");

    // Camera Collision (Raycast)
    const targetCamLocalPos = new THREE.Vector3(0, 1.8, targetCamDist);
    const targetCamWorldPos = targetCamLocalPos.clone().applyMatrix4(cameraPivot.matrixWorld);
    const camRayOrigin = playerPosVec.clone().addScaledVector(normal, 1.8);
    const camRayDir = targetCamWorldPos.clone().sub(camRayOrigin).normalize();
    
    let finalCamDist = targetCamDist;
    if (camRayDir.lengthSq() > 0.001) {
      const camRay = new RAPIER.Ray(
        { x: camRayOrigin.x, y: camRayOrigin.y, z: camRayOrigin.z },
        { x: camRayDir.x, y: camRayDir.y, z: camRayDir.z }
      );
      const camHit = physicsManager.world.castRay(
        camRay,
        targetCamDist,
        true,
        undefined,
        undefined,
        undefined,
        rigidBody
      );
      if (camHit) {
        finalCamDist = Math.max(1.0, (camHit as any).toi * 0.85);
      }
    }
    
    // Set final local position and camera look-at
    renderer.camera.position.set(0, 1.8, finalCamDist);
    renderer.camera.lookAt(new THREE.Vector3(0, 1.8, 0));

    // --- 3. Movement Logic (Physics Based - Spherical) ---
    const input = inputManager.getDirection();
    const isSprinting = inputManager.getAction("sprint") > 0 && playerControl.oxygen > 0;
    playerControl.isSprinting = isSprinting;

    // Ground Detection — spherical raycast pointing down towards center of planet
    const downDir = normal.clone().negate();
    const groundRay = new RAPIER.Ray(
      { x: playerPosVec.x, y: playerPosVec.y, z: playerPosVec.z },
      { x: downDir.x, y: downDir.y, z: downDir.z },
    );

    const groundHit = physicsManager.world.castRay(
      groundRay,
      1.1, // Ray length for slope tolerance
      true,
      undefined,
      undefined,
      undefined,
      rigidBody,
    );

    // Grounded if ray hit within threshold
    const groundThreshold = 0.95;
    playerControl.grounded =
      groundHit !== null &&
      (groundHit as any).toi <= groundThreshold;

    // Camera local orientations (tangent to surface)
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(renderer.camera.quaternion);
    
    // Project camera forward onto the horizontal plane (perpendicular to normal)
    let forward = camForward.clone().projectOnPlane(normal).normalize();
    if (forward.lengthSq() < 0.001) {
      // Fallback direction if looking straight down/up at poles
      forward.copy(new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRig.quaternion)).projectOnPlane(normal).normalize();
    }
    
    // Calculate right direction
    const right = new THREE.Vector3().crossVectors(forward, normal).normalize();

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

    const currentVelocity = rigidBody.linvel();
    const velVec = new THREE.Vector3(currentVelocity.x, currentVelocity.y, currentVelocity.z);

    // Decompose current velocity into vertical (along normal) and horizontal (along tangent plane)
    let verticalSpeed = velVec.dot(normal);
    const horizontalVelocity = velVec.clone().projectOnPlane(normal);

    // Apply manual spherical gravity when not grounded
    const gravityStrength = 3.5;
    if (!playerControl.grounded) {
      verticalSpeed -= gravityStrength * delta;
    } else {
      // Keep verticalSpeed clamped to 0 or positive to prevent sinking
      verticalSpeed = Math.max(0.0, verticalSpeed);
    }

    // Jump
    const jumpCooldown = (player as any)._jumpCooldown || 0;
    if (jumpCooldown > 0) {
        (player as any)._jumpCooldown -= delta;
    }

    if (inputManager.getAction("jump") > 0 && playerControl.grounded && jumpCooldown <= 0) {
      // Jump along normal vector
      verticalSpeed = playerControl.jumpForce;
      playerControl.grounded = false;
      rigidBody.wakeUp();
      events.emit("player:jump");
      (player as any)._jumpCooldown = 0.4; // Prevent rapid jumping
      playerControl.isJetpacking = false;
    }
    // Jetpack — hold Space while airborne, uses oxygen
    else if (
      inputManager.getAction("jump") > 0 &&
      !playerControl.grounded &&
      playerControl.oxygen > 0
    ) {
      // Smooth vertical thrust along normal vector in low gravity
      const targetJetpackY = 4.5;
      verticalSpeed = THREE.MathUtils.lerp(verticalSpeed, targetJetpackY, 6.0 * delta);

      playerControl.oxygen = Math.max(
        0,
        playerControl.oxygen - 12 * delta,
      );
      events.emit(
        "player:oxygen:changed",
        playerControl.oxygen,
        playerControl.maxOxygen,
      );
      playerControl.isJetpacking = true;
    } else {
      playerControl.isJetpacking = false;
    }

    // Sync Audio
    audioManager.setJetpackActive(playerControl.isJetpacking);

    // Smooth movement along tangent plane
    const targetHorizontalVel = moveDir.clone().multiplyScalar(currentSpeed);
    const accel = playerControl.grounded ? 15.0 : 4.0;
    const newHorizontalVel = horizontalVelocity.clone().lerp(targetHorizontalVel, accel * delta);

    // Recombine horizontal and vertical velocity components
    const finalVelocity = newHorizontalVel.clone().addScaledVector(normal, verticalSpeed);

    // Apply linear velocity
    rigidBody.setLinvel({ x: finalVelocity.x, y: finalVelocity.y, z: finalVelocity.z }, true);

    // --- 4. Visual Orientation ---
    const targetQuaternion = new THREE.Quaternion();
    
    // Player upright normal rotation
    const uprightQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

    if (inputMagSq > 0 && !isFreeLooking) {
      // Face the moveDir (which is already projected tangent to the normal)
      const localUp = normal;
      const localForward = moveDir.clone().normalize();
      const localRight = new THREE.Vector3().crossVectors(localUp, localForward).normalize();
      
      const m = new THREE.Matrix4().makeBasis(localRight, localUp, localForward);
      targetQuaternion.setFromRotationMatrix(m);

      if (!object3d.userData.lastHeading)
        object3d.userData.lastHeading = targetQuaternion.clone();
      else object3d.userData.lastHeading.copy(targetQuaternion);
    } else if (object3d.userData.lastHeading) {
      // If standing still, align the last heading to the current normal vector
      const lastForward = new THREE.Vector3(0, 0, 1).applyQuaternion(object3d.userData.lastHeading);
      const localUp = normal;
      const localForward = lastForward.projectOnPlane(normal).normalize();
      if (localForward.lengthSq() > 0.001) {
        const localRight = new THREE.Vector3().crossVectors(localUp, localForward).normalize();
        const m = new THREE.Matrix4().makeBasis(localRight, localUp, localForward);
        targetQuaternion.setFromRotationMatrix(m);
        object3d.userData.lastHeading.copy(targetQuaternion);
      } else {
        targetQuaternion.copy(uprightQuat);
      }
    } else {
      targetQuaternion.copy(uprightQuat);
    }

    // Smooth visual turn
    object3d.quaternion.slerp(targetQuaternion, Math.min(15 * delta, 1));

    // --- 5. Animation ---
    if (animation) {
      const horizontalSpeed = Math.sqrt(
        currentVelocity.x * currentVelocity.x +
        currentVelocity.z * currentVelocity.z
      );
      let nextAction = "Idle";

      if (!playerControl.grounded && Math.abs(currentVelocity.y) > 1.5) {
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

    // --- Sonar Scanner Updates ---
    if (scannerCooldown > 0) {
      scannerCooldown -= delta;
    }

    if (inputManager.getAction("scanner") > 0 && scannerCooldown <= 0 && !scannerActive) {
      scannerActive = true;
      scannerScale = 0.1;
      scannerCooldown = 3.0; // 3 seconds radar cooldown

      if (!scannerMesh) {
        const geo = new THREE.SphereGeometry(1, 32, 16);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x00ffcc,
          wireframe: true,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
        });
        scannerMesh = new THREE.Mesh(geo, mat);
      }
      scannerMesh.position.copy(playerPosVec);
      scannerMesh.scale.setScalar(0.1);
      renderer.scene.add(scannerMesh);
      events.emit("log:message", "RADAR PING SENT — SCANNING FOR BEACONS", "info");
      audioManager.playScannerPing();
    }

    if (scannerActive && scannerMesh) {
      scannerScale += 45.0 * delta; // Expands at 45 meters per second
      scannerMesh.position.copy(playerPosVec);
      scannerMesh.scale.setScalar(scannerScale);

      const op = 0.25 * (1.0 - scannerScale / SCANNER_MAX_RADIUS);
      (scannerMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.0, op);

      // Check distance to beacons
      for (const beacon of queries.beacons) {
        const dist = playerPosVec.distanceTo(beacon.object3d.position);
        if (dist <= scannerScale && !(beacon as any)._pingedThisScan) {
          (beacon as any)._pingedThisScan = true;
          events.emit(
            "log:message",
            `RADAR: BEACON DETECTED — RANGE: ${Math.round(dist)}m`,
            "info"
          );

          // Visual highlight flash
          const ud = beacon.object3d.userData;
          if (ud && ud.light && ud.crystalMat) {
            const origLightInt = ud.light.intensity;
            const origEmInt = ud.crystalMat.emissiveIntensity;
            
            ud.light.intensity = 24.0;
            ud.crystalMat.emissiveIntensity = 8.0;

            setTimeout(() => {
              if (ud.light) ud.light.intensity = origLightInt;
              if (ud.crystalMat) ud.crystalMat.emissiveIntensity = origEmInt;
            }, 1500);
          }
        }
      }

      if (scannerScale >= SCANNER_MAX_RADIUS) {
        scannerActive = false;
        renderer.scene.remove(scannerMesh);
        for (const beacon of queries.beacons) {
          delete (beacon as any)._pingedThisScan;
        }
      }
    }
  }
}
