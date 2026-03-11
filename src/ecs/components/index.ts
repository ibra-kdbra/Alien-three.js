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

  // Tag components (booleans)
  isPlayer?: boolean;
  isVehicle?: boolean;
  isPlanet?: boolean;

  // Data components
  health?: { current: number; max: number };
  playerControl?: {
    speed: number;
    jumpForce: number;
    grounded: boolean;
    yaw?: number;
    pitch?: number;
  };
};
