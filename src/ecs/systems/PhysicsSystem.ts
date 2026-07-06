import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { queries } from "../World";

/**
 * Transform sync with render interpolation.
 *
 * The simulation runs at a fixed 60Hz while rendering runs at the display
 * refresh rate. After every physics step we snapshot each moving body's
 * transform; at render time we blend between the previous and current
 * snapshot so motion is smooth at any framerate.
 */

interface TransformSnapshot {
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currRot: THREE.Quaternion;
}

const snapshots = new Map<object, TransformSnapshot>();

/** Called once per fixed tick, immediately after the physics step. */
export function capturePhysicsSnapshot() {
  for (const entity of queries.physics) {
    // Static geometry (planet, rocks, beacon bases) never moves — skip it.
    if (entity.rigidBody.bodyType() === RAPIER.RigidBodyType.Fixed) continue;

    const t = entity.rigidBody.translation();
    const r = entity.rigidBody.rotation();

    let snap = snapshots.get(entity);
    if (!snap) {
      snap = {
        prevPos: new THREE.Vector3(t.x, t.y, t.z),
        currPos: new THREE.Vector3(t.x, t.y, t.z),
        prevRot: new THREE.Quaternion(r.x, r.y, r.z, r.w),
        currRot: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      };
      snapshots.set(entity, snap);
    } else {
      snap.prevPos.copy(snap.currPos);
      snap.prevRot.copy(snap.currRot);
      snap.currPos.set(t.x, t.y, t.z);
      snap.currRot.set(r.x, r.y, r.z, r.w);
    }
  }
}

/** Called once per render frame with the interpolation factor [0..1]. */
export function updatePhysicsSystem(alpha: number) {
  for (const entity of queries.physics) {
    const snap = snapshots.get(entity);
    if (!snap) {
      // Fixed bodies (or bodies not yet stepped): set transform directly once.
      const position = entity.rigidBody.translation();
      entity.object3d.position.set(position.x, position.y, position.z);
      if (!entity.isPlayer) {
        const rotation = entity.rigidBody.rotation();
        entity.object3d.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      }
      continue;
    }

    entity.object3d.position.lerpVectors(snap.prevPos, snap.currPos, alpha);

    // The player's visual rotation is smoothed separately by the character
    // system (it faces the move direction, not the physics body).
    if (!entity.isPlayer) {
      entity.object3d.quaternion.slerpQuaternions(snap.prevRot, snap.currRot, alpha);
    }
  }
}

/** Interpolated player world position for cameras/HUD (falls back to raw). */
export function getInterpolatedPosition(entity: { object3d?: THREE.Object3D }): THREE.Vector3 | null {
  return entity.object3d ? entity.object3d.position : null;
}
