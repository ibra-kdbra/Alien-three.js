import * as THREE from "three";
import { queries } from "../World";
import { events } from "../../utils/EventBus";
import { renderer } from "../../core/Renderer";
import { missionState } from "../../managers/MissionManager";
import { spawnWave, aliveCreatureCount } from "./CreatureSystem";
import { audioManager } from "../../managers/AudioManager";

let totalBeacons = 3;
let collectedCount = 0;
let signalStrength = 0;

// Non-objective relays idle at a fraction of full brightness; the current
// target burns at full so the horizon always tells you where to go next.
const IDLE_DIM = 0.22;

// Arena escalation: storm-spawn per relay boot, in mission order.
const WAVE_SIZES = [3, 5, 8];

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
    const isCurrent = ud.index === missionState.currentBeaconIndex;
    const dim = isCurrent ? 1.0 : IDLE_DIM;

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
      ud.light.intensity = (6 + Math.sin(t * 3.0) * 4) * dim;
    }

    // Beam opacity pulsing
    if (ud.beam) {
      ud.beam.material.opacity = (0.2 + Math.sin(t * 1.5) * 0.08) * dim;
    }
    if (ud.beamCore) {
      ud.beamCore.material.opacity = (0.32 + Math.sin(t * 1.5) * 0.1) * dim;
    }

    // --- Arena flow (only the current objective node powers on) ---
    // Walking up to the node starts its boot sequence, which vents a wave of
    // storm-spawn; the node comes online when the wave is dead. Without the
    // cutter (rushing past the cache) the node boots unopposed — you skipped
    // the fight and the oxygen that comes with it.
    const dist = playerPos.distanceTo(object3d.position);

    if (isCurrent && !beacon.booting && dist < 3.5) {
      const waveSize = WAVE_SIZES[Math.min(collectedCount, WAVE_SIZES.length - 1)];
      if (player.playerControl?.hasCutter) {
        beacon.booting = true;
        spawnWave(waveSize, object3d.position);
        events.emit(
          "log:message",
          "NODE BOOT SEQUENCE STARTED — HOLD THE AREA",
          "warn",
        );
        audioManager.playLowOxygenWarning();
        continue;
      }
      // No weapon: instant activation (grace path)
      beacon.booting = true;
    }

    if (beacon.booting && aliveCreatureCount() === 0) {
      // Collect the beacon
      beacon.collected = true;
      collectedCount++;
      signalStrength = Math.min(100, signalStrength + beacon.signalBoost);

      // Drop the sky beams immediately — scaling a 300m additive beam up 4x
      // during the collect animation would white out the whole screen.
      if (ud.beam) ud.beam.visible = false;
      if (ud.beamCore) ud.beamCore.visible = false;

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
        `RELAY NODE ${collectedCount}/${totalBeacons} ONLINE — Signal +${Math.round(beacon.signalBoost)}%`,
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
      // Act progression (and the eventual mission:complete) is owned by the
      // MissionManager, which listens for beacon:collected.
    }
  }
}

export function resetBeaconSystem() {
  collectedCount = 0;
  signalStrength = 0;
}
