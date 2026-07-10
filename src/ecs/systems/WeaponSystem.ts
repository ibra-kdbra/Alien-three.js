import * as THREE from "three";
import { queries } from "../World";
import { renderer } from "../../core/Renderer";
import { inputManager } from "../../managers/InputManager";
import { audioManager } from "../../managers/AudioManager";
import { gameState } from "../../core/GameState";
import { events } from "../../utils/EventBus";
import { damageCreature } from "./CreatureSystem";

/**
 * The arc cutter — Vasquez's mining tool, salvaged at the supply cache.
 * Hitscan beam with a heat budget instead of ammo: fire in bursts, vent,
 * fire again. Overheating locks the trigger, so rhythm beats spam.
 */

const FIRE_INTERVAL = 0.18; // ~5.5 shots/s held
const DAMAGE = 34; // 3 hits per storm-spawn
const RANGE = 60;
// Aim assist cone: the beam forgives more with distance (~4°), because the
// targets are small, fast, and the ground is never flat. Doom rule: hitting
// should feel generous, missing should feel like your fault.
const HIT_RADIUS_BASE = 0.9;
const HIT_RADIUS_PER_M = 0.07;
const HIT_RADIUS_MAX = 2.4;
const HEAT_PER_SHOT = 12;
const COOL_RATE = 30; // per second while not firing
const OVERHEAT_LOCK_UNTIL = 35; // vent down to this before refire

let heat = 0;
let overheated = false;
let fireCooldown = 0;
let beamLife = 0;

let beamMesh: THREE.Mesh | null = null;
let beamMat: THREE.MeshBasicMaterial | null = null;

let heatRow: HTMLElement | null = null;
let heatBar: HTMLElement | null = null;
let hudTick = 0;

const _origin = new THREE.Vector3();
const _dirV = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _target = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function ensureBeam() {
  if (beamMesh) return;
  const geo = new THREE.CylinderGeometry(0.03, 0.05, 1, 6, 1, true);
  beamMat = new THREE.MeshBasicMaterial({
    color: 0x88ffee,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  beamMesh = new THREE.Mesh(geo, beamMat);
  beamMesh.visible = false;
  renderer.scene.add(beamMesh);
}

function ensureHUD() {
  if (heatRow) return;
  const vitals = document.getElementById("panel-vitals");
  if (!vitals) return;
  heatRow = document.createElement("div");
  heatRow.className = "stat-row";
  heatRow.innerHTML =
    `<span class="label">CUTTER</span>` +
    `<div class="bar-container"><div class="bar cutter-bar" style="width:0%"></div></div>`;
  vitals.appendChild(heatRow);
  heatBar = heatRow.querySelector(".cutter-bar");
}

function fire(playerUpDir: THREE.Vector3) {
  renderer.camera.getWorldPosition(_origin);
  renderer.camera.getWorldDirection(_dirV);

  // Nearest creature along the beam
  let best: (typeof queries.creatures.entities)[number] | null = null;
  let bestT = Infinity;
  for (const entity of queries.creatures) {
    if (entity.creature.state === "dying") continue;
    _toTarget.copy(entity.object3d.position).addScaledVector(playerUpDir, 0.4).sub(_origin);
    const t = _toTarget.dot(_dirV);
    if (t < 0.5 || t > RANGE) continue;
    const perpSq = _toTarget.lengthSq() - t * t;
    const allowed = Math.min(HIT_RADIUS_BASE + t * HIT_RADIUS_PER_M, HIT_RADIUS_MAX);
    if (perpSq < allowed * allowed && t < bestT) {
      best = entity;
      bestT = t;
    }
  }

  if (best) {
    _hitPoint.copy(_origin).addScaledVector(_dirV, bestT);
    damageCreature(best, DAMAGE);
  } else {
    _hitPoint.copy(_origin).addScaledVector(_dirV, RANGE);
  }

  // Beam from the cutter's emitter tip (fallback: over-the-shoulder offset)
  ensureBeam();
  const rig = queries.player.first?.object3d?.userData.rig;
  if (rig?.cutterTip) {
    rig.cutterTip.getWorldPosition(_muzzle);
  } else {
    _muzzle.set(0.4, -0.3, -0.6).applyMatrix4(renderer.camera.matrixWorld);
  }
  _mid.copy(_muzzle).add(_hitPoint).multiplyScalar(0.5);
  const len = _muzzle.distanceTo(_hitPoint);
  _target.copy(_hitPoint).sub(_muzzle).normalize();
  beamMesh!.position.copy(_mid);
  beamMesh!.quaternion.setFromUnitVectors(UP, _target);
  beamMesh!.scale.set(1, len, 1);
  beamMesh!.visible = true;
  beamLife = 1;

  audioManager.playArcFire();

  heat += HEAT_PER_SHOT;
  if (heat >= 100) {
    heat = 100;
    overheated = true;
    events.emit("log:message", "CUTTER OVERHEAT — VENTING", "warn");
  }
}

/** Fixed tick: trigger, heat, hitscan. */
export function updateWeaponSystem(dt: number) {
  const player = queries.player.first;
  if (!player?.playerControl?.hasCutter) return;
  ensureHUD();

  fireCooldown = Math.max(0, fireCooldown - dt);

  const wantsFire =
    gameState.isPlaying && inputManager.getAction("fire") > 0 && !overheated;

  if (wantsFire && fireCooldown <= 0) {
    const upDir = player.object3d.position.clone().normalize();
    fire(upDir);
    fireCooldown = FIRE_INTERVAL;
  } else if (!wantsFire || overheated) {
    heat = Math.max(0, heat - COOL_RATE * dt);
    if (overheated && heat <= OVERHEAT_LOCK_UNTIL) overheated = false;
  }

  // Throttled HUD
  if (++hudTick % 6 === 0 && heatBar) {
    heatBar.style.width = `${heat}%`;
    heatBar.style.background = overheated
      ? "linear-gradient(90deg, #ff2233, #ff6644)"
      : heat > 70
        ? "linear-gradient(90deg, #ffaa44, #ff8833)"
        : "linear-gradient(90deg, #88ffee, #44ddcc)";
  }
}

/** Test/debug snapshot of the heat state. */
export function weaponDebug() {
  return {
    heat,
    overheated,
    fire: inputManager.getAction("fire"),
    locked: inputManager.pointerLocked,
    playing: gameState.isPlaying,
    hasCutter: !!queries.player.first?.playerControl?.hasCutter,
  };
}

/** Render tick: beam flash decay. */
export function updateWeaponVisuals(delta: number) {
  if (!beamMesh || !beamMat) return;
  if (beamLife > 0) {
    beamLife = Math.max(0, beamLife - delta / 0.09);
    beamMat.opacity = beamLife * 0.9;
    if (beamLife <= 0) beamMesh.visible = false;
  }
}
