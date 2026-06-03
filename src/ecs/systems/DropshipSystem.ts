import * as THREE from "three";
import { queries } from "../World";
import { events } from "../../utils/EventBus";

/**
 * System managing dropship engine animations and player extraction zones.
 */
export function updateDropshipSystem(_delta: number, elapsed: number) {
  if (queries.dropships.entities.length === 0 || queries.player.entities.length === 0) return;

  const dropshipEntity = queries.dropships.entities[0];
  const { dropship, object3d } = dropshipEntity;
  if (!dropship || !object3d || dropship.activated) return;

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
    const shipGroup = object3d.children.find(child => child instanceof THREE.Group);
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
      events.emit("mission:complete");
      events.emit("log:message", "EXTRACTION COMPLETE — DEPARTING ORBIT", "success");
    }
  }
}
