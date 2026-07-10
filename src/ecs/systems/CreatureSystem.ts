import * as THREE from "three";
import { world, queries } from "../World";
import { renderer } from "../../core/Renderer";
import { events } from "../../utils/EventBus";
import { gameState } from "../../core/GameState";
import { audioManager } from "../../managers/AudioManager";
import { getPlanetHeight } from "../factories/PlanetFactory";
import { createO2Shard } from "../factories/PickupFactory";
import type { Entity } from "../components";

/**
 * Storm-spawn: crystalline creatures the planet vents when a relay node
 * boots. They don't claw — they get close and *breathe the O₂ out of your
 * suit*. Killing one shatters it into oxygen shards, so aggression sustains
 * the player while retreat starves them. That's the game's combat identity.
 *
 * No physics bodies: creatures are surface-locked and driven analytically
 * (direction-on-sphere + terrain height), which keeps a full wave cheaper
 * than a single ragdoll.
 */

const PLANET_RADIUS = 200;

// --- Tuning ---
const HP = 100;
const HUNT_SPEED = 5.2; // m/s along the surface (player walks 7, sprints 12)
const LUNGE_SPEED = 13.0;
const LUNGE_RANGE = 4.5; // start telegraph inside this range
const TELEGRAPH_TIME = 0.45; // wind-up — the player's dodge window
const LUNGE_TIME = 0.45;
const BURROW_TIME = 0.9; // rise-from-ground intro
const DIE_TIME = 0.45;
const DRAIN_RANGE = 1.7; // suit drain radius while hunting/lunging
const DRAIN_RATE = 7.0; // O₂ per second on contact
const MAX_ALIVE = 12;

// Deterministic spawn placement (combat stays reproducible run-to-run)
let seed = 4242;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Shared geometry/materials across all storm-spawn
let shardGeo: THREE.ConeGeometry | null = null;
let coreGeo: THREE.OctahedronGeometry | null = null;

const _dir = new THREE.Vector3();
const _playerDir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _upright = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _basisRight = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function buildBody(): THREE.Group {
  if (!shardGeo) shardGeo = new THREE.ConeGeometry(0.16, 0.85, 5);
  if (!coreGeo) coreGeo = new THREE.OctahedronGeometry(0.22, 0);

  const group = new THREE.Group();

  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x2b1b3d,
    emissive: 0x7733cc,
    emissiveIntensity: 0.9,
    roughness: 0.25,
    metalness: 0.2,
    flatShading: true,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xcc66ff,
    emissiveIntensity: 2.4,
    roughness: 0.1,
    transparent: true, // fades out in the death shatter
  });

  // A crown of leaning shards around a bright core — the planet's crystal
  // motif turned predatory.
  const shardCount = 6;
  for (let i = 0; i < shardCount; i++) {
    const s = new THREE.Mesh(shardGeo, shardMat);
    const a = (i / shardCount) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.28, 0.34, Math.sin(a) * 0.28);
    s.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    s.castShadow = false;
    group.add(s);
  }
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 0.42;
  group.add(core);
  group.userData.core = core;
  group.userData.coreMat = coreMat;
  group.userData.shardMat = shardMat;

  return group;
}

function surfacePlace(group: THREE.Group, dir: THREE.Vector3, sink = 0) {
  const h = getPlanetHeight(dir, PLANET_RADIUS);
  group.position.copy(dir).multiplyScalar(h - sink);
}

export function aliveCreatureCount(): number {
  let n = 0;
  for (const c of queries.creatures) {
    if (c.creature.state !== "dying") n++;
  }
  return n;
}

/**
 * Vent a wave of storm-spawn from the ground around a world position,
 * scattered 8–16m out so they converge instead of dog-piling.
 */
export function spawnWave(count: number, around: THREE.Vector3) {
  const capacity = Math.max(0, MAX_ALIVE - aliveCreatureCount());
  const n = Math.min(count, capacity);
  if (n <= 0) return;

  const center = around.clone().normalize();
  // A tangent pair for scattering around the center direction
  _axis.set(0, 1, 0);
  if (Math.abs(center.dot(_axis)) > 0.9) _axis.set(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(center, _axis).normalize();
  const t2 = new THREE.Vector3().crossVectors(center, t1).normalize();

  for (let i = 0; i < n; i++) {
    const angle = rand() * Math.PI * 2;
    const arc = (8 + rand() * 8) / PLANET_RADIUS; // 8–16m of arc
    const dir = center
      .clone()
      .multiplyScalar(Math.cos(arc))
      .addScaledVector(t1, Math.sin(arc) * Math.cos(angle))
      .addScaledVector(t2, Math.sin(arc) * Math.sin(angle))
      .normalize();

    const group = buildBody();
    surfacePlace(group, dir, 0.9); // start sunk into the ground
    group.quaternion.setFromUnitVectors(UP, dir);
    renderer.scene.add(group);

    world.add({
      name: `StormSpawn`,
      isCreature: true,
      object3d: group,
      creature: {
        hp: HP,
        maxHp: HP,
        state: "burrow",
        stateTime: 0,
        speed: HUNT_SPEED * (0.9 + rand() * 0.25),
        phase: rand() * Math.PI * 2,
        hitFlash: 0,
      },
    });
  }

  audioManager.playCreatureAlert();
  events.emit("log:message", "⚠ STORM-SPAWN VENTING FROM THE GROUND", "danger");
}

/** Damage from the arc cutter. Returns true if this hit killed it. */
export function damageCreature(entity: Entity, amount: number): boolean {
  const c = entity.creature;
  if (!c || c.state === "dying") return false;
  c.hp -= amount;
  c.hitFlash = 0.12;
  if (c.hp <= 0) {
    c.state = "dying";
    c.stateTime = 0;
    events.emit("creature:killed");
    audioManager.playCreatureDeath();
    return true;
  }
  return false;
}

/** Remove every living creature (used on game over / mission complete). */
export function clearCreatures() {
  for (const entity of [...queries.creatures.entities]) {
    if (entity.object3d) renderer.scene.remove(entity.object3d);
    world.remove(entity);
  }
}

/** Fixed-tick: AI, movement, contact drain. */
export function updateCreatureSystem(dt: number, elapsed: number) {
  if (queries.creatures.entities.length === 0) return;

  const player = queries.player.first;
  if (!player?.object3d || !player.playerControl) return;
  const playerPos = player.object3d.position;
  _playerDir.copy(playerPos).normalize();

  const playing = gameState.isPlaying;

  for (const entity of [...queries.creatures.entities]) {
    const { creature: c, object3d: group } = entity;
    c.stateTime += dt;
    c.hitFlash = Math.max(0, c.hitFlash - dt);

    const ud = group.userData;
    // Damage flash + core pulse
    if (ud.coreMat) {
      ud.coreMat.emissiveIntensity =
        c.hitFlash > 0 ? 6.0 : 2.0 + Math.sin(elapsed * 6 + c.phase) * 0.6;
    }
    if (ud.shardMat) {
      ud.shardMat.emissive.setHex(c.hitFlash > 0 ? 0xffffff : 0x7733cc);
    }

    _dir.copy(group.position).normalize();
    const distToPlayer = group.position.distanceTo(playerPos);

    switch (c.state) {
      case "burrow": {
        // Rise out of the ground
        const p = Math.min(1, c.stateTime / BURROW_TIME);
        surfacePlace(group as THREE.Group, _dir, 0.9 * (1 - p));
        if (p >= 1) {
          c.state = "hunt";
          c.stateTime = 0;
        }
        break;
      }

      case "hunt": {
        if (!playing) break;
        // Rotate this creature's direction vector toward the player's along
        // the great circle — surface-locked pursuit.
        const arcStep = (c.speed * dt) / PLANET_RADIUS;
        const totalAngle = _dir.angleTo(_playerDir);
        if (totalAngle > 1e-4) {
          _axis.crossVectors(_dir, _playerDir).normalize();
          _quat.setFromAxisAngle(_axis, Math.min(arcStep, totalAngle));
          _dir.applyQuaternion(_quat);
        }
        surfacePlace(group as THREE.Group, _dir);
        // Skitter bob
        group.position.addScaledVector(_dir, Math.abs(Math.sin(elapsed * 9 + c.phase)) * 0.16);

        if (distToPlayer < LUNGE_RANGE) {
          c.state = "telegraph";
          c.stateTime = 0;
        }
        break;
      }

      case "telegraph": {
        // Wind up: crouch and flare. This is the dodge window.
        if (c.stateTime >= TELEGRAPH_TIME) {
          c.state = "lunge";
          c.stateTime = 0;
          const lunge = playerPos.clone().sub(group.position).normalize();
          c.lungeDir = { x: lunge.x, y: lunge.y, z: lunge.z };
        }
        break;
      }

      case "lunge": {
        if (c.lungeDir) {
          group.position.addScaledVector(
            _fwd.set(c.lungeDir.x, c.lungeDir.y, c.lungeDir.z),
            LUNGE_SPEED * dt,
          );
          // Keep clamped to the surface
          _dir.copy(group.position).normalize();
          surfacePlace(group as THREE.Group, _dir);
        }
        if (c.stateTime >= LUNGE_TIME) {
          c.state = "hunt";
          c.stateTime = 0;
        }
        break;
      }

      case "dying": {
        // Shatter: fly apart and shrink
        const p = Math.min(1, c.stateTime / DIE_TIME);
        group.scale.setScalar(1 + p * 1.6);
        group.children.forEach((child, i) => {
          child.position.y += dt * (1.5 + (i % 3));
          child.rotation.x += dt * 6;
        });
        if (ud.coreMat) ud.coreMat.opacity = 1 - p;
        if (p >= 1) {
          // Death pays out: an O₂ shard where it fell
          createO2Shard(group.position.clone());
          renderer.scene.remove(group);
          world.remove(entity);
          continue;
        }
        break;
      }
    }

    // Face the player (hunt/telegraph) or the lunge direction
    if (c.state === "hunt" || c.state === "telegraph") {
      _upright.setFromUnitVectors(UP, _dir);
      _fwd.copy(playerPos).sub(group.position).projectOnPlane(_dir);
      if (_fwd.lengthSq() > 1e-4) {
        _fwd.normalize();
        _basisRight.crossVectors(_dir, _fwd).normalize();
        _matrix.makeBasis(_basisRight, _dir, _fwd.negate());
        _quat.setFromRotationMatrix(_matrix);
        group.quaternion.slerp(_quat, 1 - Math.exp(-10 * dt));
      }
      // Telegraph crouch
      if (c.state === "telegraph") {
        const s = 1 - 0.25 * Math.sin((c.stateTime / TELEGRAPH_TIME) * Math.PI);
        group.scale.set(1.15, s, 1.15);
      } else {
        group.scale.setScalar(1);
      }
    }

    // Contact drain: the storm-spawn breathes your O₂ out of the suit
    if (
      playing &&
      (c.state === "hunt" || c.state === "lunge" || c.state === "telegraph") &&
      distToPlayer < DRAIN_RANGE
    ) {
      const pc = player.playerControl;
      pc.oxygen = Math.max(0, pc.oxygen - DRAIN_RATE * dt);
      events.emit("player:oxygen:changed", pc.oxygen, pc.maxOxygen);
      if (pc.oxygen <= 0) {
        events.emit("game:over", "SUIT BREACHED BY STORM-SPAWN");
        events.emit("log:message", "SUIT FAILURE — O₂ VENTED", "danger");
      }
    }
  }
}
