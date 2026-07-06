import * as THREE from "three";
import { queries } from "../World";
import { renderer } from "../../core/Renderer";

/**
 * Screen-space waypoint markers (DOM overlay).
 *
 * Every uncollected beacon gets a marker with live distance; once all beacons
 * are found the extraction pad gets one instead. Markers clamp to the screen
 * edge with a direction arrow when the target is off-screen or behind the
 * camera — on a spherical planet targets are usually over the horizon, so
 * this is the player's primary navigation tool.
 */

interface Marker {
  root: HTMLElement;
  icon: HTMLElement;
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
  marker = { root, icon, distLabel };
  markers.set(key, marker);
  return marker;
}

function hideMarker(key: string) {
  const marker = markers.get(key);
  if (marker) marker.root.style.display = "none";
}

function placeMarker(marker: Marker, target: THREE.Vector3, playerPos: THREE.Vector3) {
  const camera = renderer.camera;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const margin = 48;

  // Is the target in front of the camera?
  _camSpace.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const behind = _camSpace.z > 0;

  _proj.copy(target).project(camera);
  let x = (_proj.x * 0.5 + 0.5) * w;
  let y = (-_proj.y * 0.5 + 0.5) * h;

  let offScreen = behind || x < margin || x > w - margin || y < margin || y > h - margin;

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
    y = THREE.MathUtils.clamp(y, margin, h - margin);

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

export function updateWaypointSystem() {
  const player = queries.player.first;
  if (!player?.object3d) return;

  if (!container) {
    container = document.getElementById("waypoints");
    if (!container) return;
  }

  const playerPos = player.object3d.position;
  renderer.camera.updateMatrixWorld();

  let remaining = 0;
  for (const beaconEntity of queries.beacons) {
    const key = beaconEntity.name ?? "beacon";
    if (beaconEntity.beacon.collected) {
      hideMarker(key);
      continue;
    }
    remaining++;
    // Anchor the marker a few meters above the beacon along the surface normal
    _world.copy(beaconEntity.object3d.position);
    _world.addScaledVector(_world.clone().normalize(), 4);
    const marker = getMarker(key, "BEACON", "waypoint-beacon");
    placeMarker(marker, _world, playerPos);
  }

  // Extraction marker once all beacons are collected
  const dropshipEntity = queries.dropships.first;
  if (dropshipEntity && remaining === 0 && !dropshipEntity.dropship.activated) {
    _world.copy(dropshipEntity.object3d.position);
    _world.addScaledVector(_world.clone().normalize(), 6);
    const marker = getMarker("dropship", "EXTRACT", "waypoint-extract");
    placeMarker(marker, _world, playerPos);
  } else {
    hideMarker("dropship");
  }
}
