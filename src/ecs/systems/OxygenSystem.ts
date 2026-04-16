import { queries } from "../World";
import { events } from "../../utils/EventBus";

const BASE_DRAIN_RATE = 0.35;      // ~2% per minute at baseline
const SPRINT_DRAIN_RATE = 1.5;     // ~8% per minute while sprinting
const HAZARD_BONUS_DRAIN = 5.0;    // Stacks on top of base when in hazard zone

let gameOver = false;

export function updateOxygenSystem(delta: number) {
  if (gameOver) return;

  for (const player of queries.player) {
    const { playerControl, object3d } = player;
    if (!playerControl) continue;

    const playerPos = object3d.position;

    // Base drain
    let drainRate = BASE_DRAIN_RATE;

    // Sprint drain
    if (playerControl.isSprinting) {
      drainRate = SPRINT_DRAIN_RATE;
    }

    // Hazard proximity drain
    for (const hazard of queries.hazards) {
      if (!hazard.hazard || !hazard.object3d) continue;
      const dist = playerPos.distanceTo(hazard.object3d.position);
      if (dist < hazard.hazard.radius) {
        // Stronger drain the closer you are
        const proximity = 1.0 - dist / hazard.hazard.radius;
        drainRate += HAZARD_BONUS_DRAIN * proximity;
      }
    }

    // Beacon (Refuel Station) proximity refill
    let isRefueling = false;
    for (const beacon of queries.beacons) {
      if (!beacon.beacon || !beacon.object3d) continue;
      // Define a refuel radius (e.g., 5 units)
      const dist = playerPos.distanceTo(beacon.object3d.position);
      if (dist < 4.0) {
        isRefueling = true;
        break; // Only need one beacon to refuel
      }
    }

    if (isRefueling) {
        // Rapid refill while inside refuel station
        playerControl.oxygen = Math.min(
            playerControl.maxOxygen,
            playerControl.oxygen + 30.0 * delta,
        );
    } else {
        // Apply drain
        playerControl.oxygen = Math.max(
          0,
          playerControl.oxygen - drainRate * delta,
        );
    }

    // Emit update
    events.emit(
      "player:oxygen:changed",
      playerControl.oxygen,
      playerControl.maxOxygen,
    );

    // Low oxygen warnings
    if (playerControl.oxygen <= 25 && playerControl.oxygen > 24.5) {
      events.emit("log:message", "⚠ O₂ CRITICAL — LOCATE BEACON", "danger");
    }
    if (playerControl.oxygen <= 10 && playerControl.oxygen > 9.5) {
      events.emit("log:message", "⚠ O₂ DEPLETING — IMMINENT FAILURE", "danger");
    }

    // Game over
    if (playerControl.oxygen <= 0) {
      gameOver = true;
      events.emit("game:over", "OXYGEN DEPLETED");
      events.emit("log:message", "SUIT FAILURE — OXYGEN DEPLETED", "danger");
    }
  }
}

export function resetOxygenSystem() {
  gameOver = false;
}
