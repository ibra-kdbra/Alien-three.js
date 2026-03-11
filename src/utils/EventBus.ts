import EventEmitter from "eventemitter3";

// Define the events that can be emitted across the game
export interface GameEvents {
  "assets:progress": (progress: number) => void;
  "assets:loaded": () => void;

  // Example Gameplay Events
  "player:jump": () => void;
  "player:health:changed": (current: number, max: number) => void;
  "entity:destroyed": (entityId: number) => void;
}

class EventBus extends EventEmitter<GameEvents> {}

// Singleton instance
export const events = new EventBus();
