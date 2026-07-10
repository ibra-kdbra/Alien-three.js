import * as THREE from "three";
import { queries } from "../World";
import { renderer } from "../../core/Renderer";
import { getMissionTarget } from "../../managers/MissionManager";

/**
 * Screen-space waypoint markers (DOM overlay).
 *
 * ONE marker for the current mission objective (cache → current relay node →
 * dropship), plus small hint markers for Meridian data pads within earshot.
 * A single target keeps the screen readable and makes each act's goal
 * unambiguous. Markers clamp to the screen edge with a direction arrow when
 * the target is off-screen or behind the camera — on a spherical planet
 * targets are usually over the horizon, so this is the player's primary
 * navigation tool.
 */

interface Marker {
  root: HTMLElement;
  icon: HTMLElement;
  label: HTMLElement;
  distLabel: HTMLElement;
}

let container: HTMLElement | null = null;
const markers = new Map<string, Marker>();

const _world = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _camSpace = new THREE.Vector3();

function getMarker(key: string, label: string, className: string): Marker {
  let marker = markers.get(key);
  if (marker) return marker;

  const root = document.createElement("div");
  root.className = `waypoint ${className}`;

  const icon = document.createElement("div");
  icon.className = "waypoint-icon";
  icon.textContent = "◆";
  root.appendChild(icon);

  const name = document.createElement("div");
  name.className = "waypoint-label";
  name.textContent = label;
  root.appendChild(name);

  const distLabel = document.createElement("div");
  distLabel.className = "waypoint-dist";
  root.appendChild(distLabel);

  container!.appendChild(root);
  marker = { root, icon, label: name, distLabel };
  markers.set(key, marker);
  return marker;
}

function placeMarker(marker: Marker, target: THREE.Vector3, playerPos: THREE.Vector3) {
  const camera = renderer.camera;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const margin = 48;
  // Clamped markers stay below the objective panel at top-center
  const topMargin = 120;

  // Is the target in front of the camera?
  _camSpace.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const behind = _camSpace.z > 0;

  _proj.copy(target).project(camera);
  let x = (_proj.x * 0.5 + 0.5) * w;
  let y = (-_proj.y * 0.5 + 0.5) * h;

  let offScreen = behind || x < margin || x > w - margin || y < topMargin || y > h - margin;

  if (offScreen) {
    // Direction from screen center; when behind, mirror so the arrow points the right way
    let dx = x - w / 2;
    let dy = y - h / 2;
    if (behind) {
      dx = -dx;
      dy = -dy;
    }
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const scale = Math.min((w / 2 - margin) / Math.abs(dx || 1e-6), (h / 2 - margin) / Math.abs(dy || 1e-6));
    x = w / 2 + dx * Math.min(scale, (w + h) / len);
    y = h / 2 + dy * Math.min(scale, (w + h) / len);
    x = THREE.MathUtils.clamp(x, margin, w - margin);
    y = THREE.MathUtils.clamp(y, topMargin, h - margin);

    const angle = Math.atan2(dy, dx);
    marker.icon.textContent = "➤";
    marker.icon.style.transform = `rotate(${angle}rad)`;
  } else {
    marker.icon.textContent = "◆";
    marker.icon.style.transform = "";
  }

  marker.root.style.display = "flex";
  marker.root.style.left = `${x}px`;
  marker.root.style.top = `${y}px`;
  marker.distLabel.textContent = `${Math.round(playerPos.distanceTo(target))}m`;
}

const DATA_HINT_RADIUS = 70;
const _touched = new Set<string>();

export function updateWaypointSystem() {
  const player = queries.player.first;
  if (!player?.object3d) return;

  if (!container) {
    container = document.getElementById("waypoints");
    if (!container) return;
  }

  const playerPos = player.object3d.position;
  renderer.camera.updateMatrixWorld();
  _touched.clear();

  // The single mission objective marker
  const target = getMissionTarget();
  if (target) {
    const marker = getMarker("target", target.label, target.className);
    marker.root.className = `waypoint ${target.className}`;
    marker.label.textContent = target.label;
    // Anchor a few meters above the target along the surface normal so the
    // marker peeks over terrain instead of burying itself in it
    _world.copy(target.position);
    _world.addScaledVector(_world.clone().normalize(), target.className === "waypoint-extract" ? 6 : 4);
    placeMarker(marker, _world, playerPos);
    _touched.add("target");
  }

  // Hint markers for nearby uncollected data pads (optional lore)
  for (const entity of queries.pickups) {
    const { pickup, object3d } = entity;
    if (pickup?.kind !== "datapad" || pickup.collected || !object3d) continue;
    if (playerPos.distanceTo(object3d.position) > DATA_HINT_RADIUS) continue;

    const key = entity.name ?? "datapad";
    const marker = getMarker(key, "DATA", "waypoint-data");
    _world.copy(object3d.position);
    _world.addScaledVector(_world.clone().normalize(), 2);
    placeMarker(marker, _world, playerPos);
    _touched.add(key);
  }

  // Hide any marker not placed this frame (collected pads, act changes)
  for (const [key, marker] of markers) {
    if (!_touched.has(key)) marker.root.style.display = "none";
  }
}
