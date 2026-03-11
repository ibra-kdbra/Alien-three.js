import * as THREE from "three";
import { queries } from "../World";
import { inputManager } from "../../managers/InputManager";
import { renderer } from "../../core/Renderer";

export function updatePlayerControlSystem(delta: number) {
  for (const player of queries.player) {
    const { playerControl, rigidBody, object3d } = player;

    // 1. Get Input
    const direction = inputManager.getDirection();
    const velocity = rigidBody.linvel();

    // --- Camera Rotation based on Mouse ---
    if (!playerControl.yaw) playerControl.yaw = 0;
    if (!playerControl.pitch) playerControl.pitch = 0;

    const mouseSensitivity = 0.002;
    playerControl.yaw -= inputManager.mouseDelta.x * mouseSensitivity;
    playerControl.pitch -= inputManager.mouseDelta.y * mouseSensitivity;

    // Clamp pitch to avoid flipping over
    playerControl.pitch = Math.max(
      -Math.PI / 2 + 0.1,
      Math.min(Math.PI / 2 - 0.1, playerControl.pitch),
    );

    // --- Find Nearest Planet for Spherical Gravity ---
    let nearestPlanet = null;
    let minDistance = Infinity;

    for (const planet of queries.planets) {
      const dist = object3d.position.distanceTo(planet.object3d.position);
      if (dist < minDistance) {
        minDistance = dist;
        nearestPlanet = planet;
      }
    }

    // Default "Up" is positive Y if no planet
    const upVector = new THREE.Vector3(0, 1, 0);
    if (nearestPlanet) {
      upVector
        .copy(object3d.position)
        .sub(nearestPlanet.object3d.position)
        .normalize();
    }

    // Calculate camera basis vectors
    const cosYaw = Math.cos(playerControl.yaw);
    const sinYaw = Math.sin(playerControl.yaw);

    // Create a local coordinate system where "Up" is away from the planet
    // and "Forward" depends on the camera yaw.
    const forwardVector = new THREE.Vector3(sinYaw, 0, cosYaw).normalize();
    forwardVector.projectOnPlane(upVector).normalize();

    const rightVector = new THREE.Vector3()
      .crossVectors(forwardVector, upVector)
      .normalize();

    // Map Input direction to World direction based on our local basis
    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(rightVector, direction.x);
    moveDir.addScaledVector(forwardVector, direction.z);

    // Target Velocity on the plane
    const targetVelocity = moveDir.multiplyScalar(playerControl.speed);

    // Current Velocity
    const currentVelocity = new THREE.Vector3(
      velocity.x,
      velocity.y,
      velocity.z,
    );

    // Project current velocity onto the upVector to get the vertical (falling) component
    const verticalSpeed = currentVelocity.dot(upVector);
    const verticalVelocity = upVector.clone().multiplyScalar(verticalSpeed);

    // --- Safe Kinematic-like Movement via Forces/Impulses ---

    // Check if grounded (if vertical speed towards planet is very small and we are near the planet)
    // Since planet radius is 50, and we spawn slightly above it:
    const distToCenter = nearestPlanet
      ? object3d.position.distanceTo(nearestPlanet.object3d.position)
      : 0;
    const isNearGround = distToCenter < 50 + 2.0; // Planet radius + capsule height tolerance

    // If we aren't falling fast and are near the ground, we are grounded
    playerControl.grounded = isNearGround && verticalSpeed > -0.5;

    // We apply movement as a continuous force (or impulse) rather than overwriting velocity.
    // Overwriting velocity in Rapier while locked to the ground causes immense friction/sticking issues.

    // Calculate a force vector instead of a strict target velocity
    // If in air, give less control
    const airControl = playerControl.grounded ? 1.0 : 0.2;
    const moveForce = targetVelocity.multiplyScalar(60 * delta * airControl); // Mass multiplier factor

    // Apply horizontal force
    if (moveForce.lengthSq() > 0.001) {
      rigidBody.wakeUp();
      rigidBody.applyImpulse(
        { x: moveForce.x, y: moveForce.y, z: moveForce.z },
        true,
      );
    }

    // Apply linear damping (friction) manually to horizontal plane so we stop when releasing keys
    if (playerControl.grounded && direction.x === 0 && direction.z === 0) {
      const horizontalVelocity = currentVelocity.clone().sub(verticalVelocity);
      // Reduce horizontal velocity (friction)
      horizontalVelocity.multiplyScalar(Math.pow(0.01, delta)); // Damping factor

      const newVel = new THREE.Vector3().addVectors(
        horizontalVelocity,
        verticalVelocity,
      );
      rigidBody.setLinvel({ x: newVel.x, y: newVel.y, z: newVel.z }, true);
    }

    // Jump Logic
    const jump = inputManager.getAction("jump");
    if (jump > 0 && playerControl.grounded) {
      rigidBody.wakeUp();
      const jumpImpulse = upVector
        .clone()
        .multiplyScalar(playerControl.jumpForce * 2); // Impulse needs more power than velocity
      rigidBody.applyImpulse(
        { x: jumpImpulse.x, y: jumpImpulse.y, z: jumpImpulse.z },
        true,
      );
      playerControl.grounded = false;
    }

    // --- Orbit camera implementation relative to "Up" ---
    const playerPos = object3d.position;
    const distance = 8; // distance from player
    const heightOffset = 2; // Look slightly above the player's origin

    const pitchAxis = rightVector.clone();
    const camOffset = forwardVector.clone().multiplyScalar(-distance);
    camOffset.applyAxisAngle(pitchAxis, playerControl.pitch);

    const heightVec = upVector.clone().multiplyScalar(heightOffset);
    const finalCamPos = playerPos.clone().add(camOffset).add(heightVec);

    renderer.camera.position.lerp(finalCamPos, 15 * delta);

    const targetLookAt = playerPos.clone().add(heightVec);
    renderer.camera.lookAt(targetLookAt);

    // Sync mesh rotation to gravity and camera yaw
    const targetQuaternion = new THREE.Quaternion();
    targetQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upVector);

    const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      playerControl.yaw + Math.PI,
    );

    targetQuaternion.multiply(yawQuaternion);
    object3d.quaternion.slerp(targetQuaternion, 10 * delta);
  }
}
