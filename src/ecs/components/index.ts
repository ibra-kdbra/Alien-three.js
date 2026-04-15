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
    cameraMode?: "Follow" | "Orbit" | "Action";
    oxygen: number;
    maxOxygen: number;
    isSprinting?: boolean;
    jetpackFuel?: number;
    cameraDistance?: number;
  };

  // Beacon data
  beacon?: {
    collected: boolean;
    signalBoost: number;
    pulsePhase: number;
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
