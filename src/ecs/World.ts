import { World } from "miniplex";
import { Entity } from "./components";

// Global ECS World instance
export const world = new World<Entity>();

// Useful queries we'll use often
export const queries = {
  // Entities that have both a Three.js object and a Rapier rigidbody
  physics: world.with("object3d", "rigidBody"),

  // The player entity
  player: world.with("isPlayer", "object3d", "rigidBody", "playerControl"),

  // Planets
  planets: world.with("isPlanet", "object3d"),
};
