import { queries, world } from "../World";
import { events } from "../../utils/EventBus";
import { renderer } from "../../core/Renderer";

/**
 * Pickup collection (fixed tick) and idle animation (render tick).
 * Two kinds: oxygen canisters (survival) and Meridian data pads (lore,
 * routed to the MissionManager via datapad:collected).
 */

const COLLECT_RADIUS = 2.0;

/** Fixed-tick: proximity collection. */
export function updatePickupSystem() {
  const player = queries.player.first;
  if (!player) return;
  const playerPos = player.object3d.position;
  const pc = player.playerControl;

  for (const entity of queries.pickups) {
    const { pickup, object3d } = entity;
    if (pickup.collected) continue;

    if (playerPos.distanceTo(object3d.position) < COLLECT_RADIUS) {
      pickup.collected = true;

      pc.oxygen = Math.min(pc.maxOxygen, pc.oxygen + pickup.amount);
      events.emit("player:oxygen:changed", pc.oxygen, pc.maxOxygen);

      if (pickup.kind === "datapad") {
        events.emit("datapad:collected", pickup.loreIndex ?? 0);
        events.emit("log:message", "MERIDIAN DATA PAD RECOVERED", "success");
      } else {
        events.emit("pickup:collected", pickup.amount);
        events.emit("log:message", `O₂ +${pickup.amount}%`, "info");
      }

      renderer.scene.remove(object3d);
      world.remove(entity);
    }
  }
}

/** Render-tick: bob and spin so canisters catch the eye. */
export function updatePickupVisuals(delta: number, elapsed: number) {
  for (const entity of queries.pickups) {
    const { pickup, object3d } = entity;
    if (pickup.collected) continue;

    const t = elapsed * 1.8 + pickup.bobPhase;
    const bob = Math.sin(t) * 0.12;

    // Bob along the local up (the group is aligned to the surface normal)
    for (const child of object3d.children) {
      if (child.userData.baseY === undefined) child.userData.baseY = child.position.y;
      child.position.y = child.userData.baseY + bob;
    }
    object3d.rotateY(0.8 * delta);
  }
}
