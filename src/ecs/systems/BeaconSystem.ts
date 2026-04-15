import * as THREE from "three";
import { queries } from "../World";
import { events } from "../../utils/EventBus";
import { renderer } from "../../core/Renderer";

let totalBeacons = 3;
let collectedCount = 0;
let signalStrength = 0;

export function updateBeaconSystem(delta: number, elapsed: number) {
  if (queries.player.entities.length === 0) return;
  const player = queries.player.entities[0];
  const playerPos = player.object3d.position;

  for (const beaconEntity of queries.beacons) {
    const { beacon, object3d } = beaconEntity;
    if (!beacon || !object3d || beacon.collected) continue;

    const group = object3d as THREE.Group;
    const ud = group.userData;
    const t = elapsed + beacon.pulsePhase;

    // --- Animate beacon ---
    // Crystal bobbing and rotation
    if (ud.crystal) {
      ud.crystal.position.y = 1.5 + Math.sin(t * 2.0) * 0.3;
      ud.crystal.rotation.y += delta * 1.5;
    }

    // Core pulsing
    if (ud.core) {
      const pulse = 0.5 + Math.sin(t * 3.0) * 0.5;
      ud.core.scale.setScalar(0.8 + pulse * 0.4);
      ud.core.position.y = 1.5 + Math.sin(t * 2.0) * 0.3;
    }

    // Ring rotation
    if (ud.ring) {
      ud.ring.rotation.z += delta * 2.0;
    }
    if (ud.outerRing) {
      ud.outerRing.rotation.z -= delta * 0.8;
    }

    // Light intensity pulsing
    if (ud.light) {
      ud.light.intensity = 6 + Math.sin(t * 3.0) * 4;
    }

    // Beam opacity pulsing
    if (ud.beam) {
      ud.beam.material.opacity = 0.1 + Math.sin(t * 1.5) * 0.08;
    }

    // --- Proximity collection ---
    const dist = playerPos.distanceTo(object3d.position);

    if (dist < 3.5) {
      // Collect the beacon
      beacon.collected = true;
      collectedCount++;
      signalStrength = Math.min(100, signalStrength + beacon.signalBoost);

      // Collection effect — scale up and fade out
      const collectAnim = { progress: 0 };

      const animateCollection = () => {
        collectAnim.progress += 0.02;
        const p = collectAnim.progress;

        if (p < 1.0) {
          // Expand and fade
          const scale = 1.0 + p * 3.0;
          group.scale.setScalar(scale);

          group.traverse((child) => {
            if ((child as THREE.Mesh).material) {
              const mat = (child as THREE.Mesh).material as THREE.Material;
              if (mat.transparent !== undefined) {
                mat.opacity = Math.max(0, 1.0 - p);
              }
            }
          });

          requestAnimationFrame(animateCollection);
        } else {
          // Remove from scene
          renderer.scene.remove(group);
        }
      };
      animateCollection();

      // Emit events
      events.emit("beacon:collected", collectedCount, totalBeacons);
      events.emit("signal:strength:changed", signalStrength);
      events.emit(
        "log:message",
        `BEACON ${collectedCount}/${totalBeacons} ACQUIRED — Signal +${Math.round(beacon.signalBoost)}%`,
        "success",
      );

      // Restore some oxygen
      if (player.playerControl) {
        player.playerControl.oxygen = Math.min(
          player.playerControl.maxOxygen,
          player.playerControl.oxygen + 25,
        );
        events.emit(
          "player:oxygen:changed",
          player.playerControl.oxygen,
          player.playerControl.maxOxygen,
        );
        events.emit("log:message", "O₂ RESERVES +25%", "info");
      }

      // Check mission complete
      if (collectedCount >= totalBeacons) {
        events.emit("mission:complete");
        events.emit("log:message", "ALL BEACONS LOCATED — SIGNAL RESTORED", "success");
      }
    }
  }
}

export function resetBeaconSystem() {
  collectedCount = 0;
  signalStrength = 0;
}
