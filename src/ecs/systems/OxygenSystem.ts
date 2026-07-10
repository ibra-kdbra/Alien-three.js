import { queries } from "../World";
import { events } from "../../utils/EventBus";
import { audioManager } from "../../managers/AudioManager";
import { gameState } from "../../core/GameState";

let wasRefueling = false; // edge-detect zone entry for the HUD message

const BASE_DRAIN_RATE = 0.35;      // ~100 O₂ ≈ 4.75 minutes at baseline
const SPRINT_DRAIN_RATE = 1.5;     // sprinting burns ~4x oxygen
const HAZARD_BONUS_DRAIN = 5.0;    // stacks on top of base when in a hazard zone
const REFUEL_RATE = 30.0;          // per second inside a refuel zone
const DROPSHIP_REFUEL_RADIUS = 10.0;
const BEACON_REFUEL_RADIUS = 4.0;

export function updateOxygenSystem(delta: number) {
  // Oxygen only ticks during active play — not on the start screen,
  // not after death, not after extraction.
  if (!gameState.isPlaying) return;

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

    // Refuel zones: uncollected beacons and the dropship pad
    let isRefueling = false;
    for (const beacon of queries.beacons) {
      if (!beacon.beacon || !beacon.object3d || beacon.beacon.collected) continue;
      if (playerPos.distanceTo(beacon.object3d.position) < BEACON_REFUEL_RADIUS) {
        isRefueling = true;
        break;
      }
    }
    if (!isRefueling) {
      const dropship = queries.dropships.first;
      if (
        dropship?.object3d &&
        playerPos.distanceTo(dropship.object3d.position) < DROPSHIP_REFUEL_RADIUS
      ) {
        isRefueling = true;
      }
    }

    // Announce the refuel zone so pads and nodes read as purposeful places
    if (isRefueling && !wasRefueling && playerControl.oxygen < playerControl.maxOxygen - 1) {
      events.emit("log:message", "O₂ REPLENISHING — SUPPLY UPLINK ACTIVE", "info");
    }
    wasRefueling = isRefueling;

    if (isRefueling) {
      playerControl.oxygen = Math.min(
        playerControl.maxOxygen,
        playerControl.oxygen + REFUEL_RATE * delta,
      );
    } else {
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
      audioManager.playLowOxygenWarning();
    }
    if (playerControl.oxygen <= 10 && playerControl.oxygen > 9.5) {
      events.emit("log:message", "⚠ O₂ DEPLETING — IMMINENT FAILURE", "danger");
      audioManager.playLowOxygenWarning();
    }

    // Game over — gameState flips to "gameover" via this event, which
    // stops this system from ticking again.
    if (playerControl.oxygen <= 0) {
      events.emit("game:over", "OXYGEN DEPLETED");
      events.emit("log:message", "SUIT FAILURE — OXYGEN DEPLETED", "danger");
    }
  }
}
