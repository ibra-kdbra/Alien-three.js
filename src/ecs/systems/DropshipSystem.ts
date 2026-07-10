import * as THREE from "three";
import { queries } from "../World";
import { events } from "../../utils/EventBus";
import { gameState } from "../../core/GameState";

/**
 * Dropship extraction: once every relay node is online the pad powers up,
 * and reaching it boards the player and launches the ship — an actual
 * liftoff the camera watches, not a hard cut to a menu.
 */

const LAUNCH_DURATION = 14; // seconds of visible ascent before the ship winks out

export function updateDropshipSystem(delta: number, elapsed: number) {
  if (queries.dropships.entities.length === 0 || queries.player.entities.length === 0) return;

  const dropshipEntity = queries.dropships.entities[0];
  const { dropship, object3d } = dropshipEntity;
  if (!dropship || !object3d) return;

  // Launch sequence keeps playing after the phase flips to "won"
  if (dropship.activated) {
    animateLaunch(object3d, delta, elapsed);
    return;
  }

  // No extraction after a game over — the storm doesn't give refunds.
  if (!gameState.isPlaying) return;

  const playerEntity = queries.player.entities[0];
  const playerPos = playerEntity.object3d.position;

  // Count active beacons
  const beacons = queries.beacons.entities;
  const totalBeacons = beacons.length;
  const collectedBeacons = beacons.filter((b) => b.beacon?.collected).length;

  // Activate extraction if all beacons have been located
  if (totalBeacons > 0 && collectedBeacons >= totalBeacons) {
    if (!dropship.extractionActive) {
      dropship.extractionActive = true;
      events.emit("log:message", "EXTRACTION PAD ACTIVATED — RETURN TO DROPSHIP", "warn");
    }

    // 1. Animate engine flare thrusters
    const shipGroup = object3d.children.find((child) => child instanceof THREE.Group);
    if (shipGroup) {
      const ud = shipGroup.userData;
      if (ud) {
        const pulse = 8.0 + Math.sin(elapsed * 12.0) * 4.0;
        if (ud.leftLight) ud.leftLight.intensity = pulse;
        if (ud.rightLight) ud.rightLight.intensity = pulse;

        if (ud.leftNozzle && (ud.leftNozzle.material as THREE.MeshBasicMaterial).color) {
          (ud.leftNozzle.material as THREE.MeshBasicMaterial).color.setHex(0x00ffcc);
        }
        if (ud.rightNozzle && (ud.rightNozzle.material as THREE.MeshBasicMaterial).color) {
          (ud.rightNozzle.material as THREE.MeshBasicMaterial).color.setHex(0x00ffcc);
        }
      }
    }

    // 2. Check distance for extraction
    const landingPadPos = new THREE.Vector3(
      dropship.landingPadPos.x,
      dropship.landingPadPos.y,
      dropship.landingPadPos.z
    );

    const dist = playerPos.distanceTo(landingPadPos);
    if (dist < 7.5) {
      dropship.activated = true;
      // Board the player: the camera stays put and watches the ship leave
      playerEntity.object3d.visible = false;
      events.emit("mission:complete");
      events.emit("log:message", "EXTRACTION COMPLETE — DEPARTING ORBIT", "success");
    }
  }
}

function animateLaunch(padGroup: THREE.Object3D, delta: number, elapsed: number) {
  const shipGroup = padGroup.children.find((child) => child instanceof THREE.Group) as
    | THREE.Group
    | undefined;
  if (!shipGroup) return;

  const ud = shipGroup.userData;
  const t = (ud.launchT = (ud.launchT ?? 0) + delta);
  if (t > LAUNCH_DURATION) {
    shipGroup.visible = false;
    return;
  }

  // Slow, heavy rise that keeps accelerating — 2m at 2s, ~100m at 10s
  shipGroup.position.y = 0.25 + 0.5 * t * t;

  // Gentle sway and a slight nose-up as it climbs
  shipGroup.rotation.z = Math.sin(t * 1.7) * 0.02;
  shipGroup.rotation.x = -Math.min(0.18, t * 0.02);

  // Engines at full burn, flickering
  const burn = 20 + Math.sin(elapsed * 30.0) * 6.0;
  if (ud.leftLight) ud.leftLight.intensity = burn;
  if (ud.rightLight) ud.rightLight.intensity = burn;
}
