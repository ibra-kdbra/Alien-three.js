import * as THREE from "three";
import { queries } from "../World";
import { inputManager } from "../../managers/InputManager";
import { renderer } from "../../core/Renderer";
import { events } from "../../utils/EventBus";
import { audioManager } from "../../managers/AudioManager";
import { gameState } from "../../core/GameState";

/**
 * Sonar scanner (F): expanding wireframe ping that highlights beacons in
 * range. Pure visual/feedback system — runs in the render phase.
 */

let scannerMesh: THREE.Mesh | null = null;
let scannerScale = 0.1;
let scannerActive = false;
let scannerCooldown = 0;
const SCANNER_MAX_RADIUS = 80;
const SCANNER_SPEED = 45.0;

export function updateScannerSystem(delta: number) {
  const player = queries.player.first;
  if (!player || !player.object3d) return;
  const playerPos = player.object3d.position;

  if (scannerCooldown > 0) scannerCooldown -= delta;

  if (
    gameState.isPlaying &&
    inputManager.consumePressed("scanner") &&
    scannerCooldown <= 0 &&
    !scannerActive
  ) {
    scannerActive = true;
    scannerScale = 0.1;
    scannerCooldown = 3.0;

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
    scannerMesh.position.copy(playerPos);
    scannerMesh.scale.setScalar(0.1);
    renderer.scene.add(scannerMesh);
    events.emit("log:message", "RADAR PING SENT — SCANNING FOR BEACONS", "info");
    audioManager.playScannerPing();
  }

  if (scannerActive && scannerMesh) {
    scannerScale += SCANNER_SPEED * delta;
    scannerMesh.position.copy(playerPos);
    scannerMesh.scale.setScalar(scannerScale);

    const op = 0.25 * (1.0 - scannerScale / SCANNER_MAX_RADIUS);
    (scannerMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.0, op);

    for (const beacon of queries.beacons) {
      if (beacon.beacon?.collected) continue;
      const dist = playerPos.distanceTo(beacon.object3d.position);
      if (dist <= scannerScale && !(beacon as any)._pingedThisScan) {
        (beacon as any)._pingedThisScan = true;
        events.emit("log:message", `RADAR: BEACON DETECTED — RANGE: ${Math.round(dist)}m`, "info");

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
