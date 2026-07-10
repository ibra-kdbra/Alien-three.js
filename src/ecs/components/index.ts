import * as THREE from "three";
import { Object3D } from "three";
import RAPIER from "@dimforge/rapier3d-compat";

// Define all possible components an entity can have
export type Entity = {
  // Identify the entity (optional, but good for debugging)
  name?: string;

  // The 3D Object representing the entity in the Three.js scene
  object3d?: Object3D;

  // The physics body representing the entity in Rapier
  rigidBody?: RAPIER.RigidBody;
  collider?: RAPIER.Collider;
  characterController?: RAPIER.KinematicCharacterController;

  // Tag components (booleans)
  isPlayer?: boolean;
  isVehicle?: boolean;
  isPlanet?: boolean;
  isBeacon?: boolean;
  isHazard?: boolean;
  isDropship?: boolean;
  isPickup?: boolean;
  isCreature?: boolean;

  dropship?: {
    activated: boolean;
    extractionActive: boolean;
    landingPadPos: { x: number; y: number; z: number };
  };

  // Data components
  health?: { current: number; max: number };
  playerControl?: {
    speed: number;
    sprintSpeed: number;
    jumpForce: number;
    grounded: boolean;
    yaw?: number;
    pitch?: number;
    velocity: { x: number; y: number; z: number }; // Used to store momentum for KCC
    cameraMode?: "Explore" | "Focus";
    oxygen: number;
    maxOxygen: number;
    isSprinting?: boolean;
    jetpackFuel?: number;
    maxJetpackFuel?: number;
    isJetpacking?: boolean;
    hasCutter?: boolean; // arc cutter salvaged at the supply cache
  };

  // Respawn anchor + kill-radius for fell-through-world recovery
  spawnPoint?: { x: number; y: number; z: number; safeRadius: number };

  // Beacon data
  beacon?: {
    collected: boolean;
    signalBoost: number;
    pulsePhase: number;
    booting?: boolean; // arena wave in progress; node comes online when it's cleared
  };

  // Collectible: oxygen canister or a Meridian crew data pad
  pickup?: {
    amount: number; // oxygen restored on collect
    collected: boolean;
    bobPhase: number;
    kind?: "o2" | "datapad";
    loreIndex?: number; // index into the data-pad lore table
  };

  // Storm-spawn: crystalline creatures that drain O₂ on contact
  creature?: {
    hp: number;
    maxHp: number;
    state: "burrow" | "hunt" | "telegraph" | "lunge" | "dying";
    stateTime: number; // seconds in the current state
    speed: number;
    phase: number; // animation phase offset
    lungeDir?: { x: number; y: number; z: number };
    hitFlash: number; // seconds of damage flash remaining
  };

  // Hazard data
  hazard?: {
    drainRate: number; // oxygen drain per second
    radius: number;
    pulsePhase: number;
  };

  // Animation components
  animation?: {
    mixer: THREE.AnimationMixer;
    actions: Record<string, THREE.AnimationAction>;
    currentAction?: string;
  };

  // Particle emitter
  particles?: {
    emitter: THREE.Points;
    velocities: Float32Array;
    lifetimes: Float32Array;
    maxLifetime: number;
    spawnRate: number;
    active: boolean;
  };
};
