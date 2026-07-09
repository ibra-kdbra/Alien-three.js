import EventEmitter from "eventemitter3";

// Define the events that can be emitted across the game
export interface GameEvents {
  "assets:progress": (progress: number) => void;
  "assets:loaded": () => void;

  // Gameplay Events
  "player:jump": () => void;
  "player:land": (impactSpeed: number) => void;
  "player:footstep": () => void;
  "pickup:collected": (amount: number) => void;
  "player:health:changed": (current: number, max: number) => void;
  "player:oxygen:changed": (current: number, max: number) => void;
  "player:fuel:changed": (current: number, max: number) => void;
  "player:sprint:start": () => void;
  "player:sprint:stop": () => void;
  "entity:destroyed": (entityId: number) => void;

  // Beacon Events
  "beacon:collected": (index: number, total: number) => void;
  "signal:strength:changed": (strength: number) => void;

  // Mission Events
  "mission:complete": () => void;
  "mission:failed": (reason: string) => void;

  // Game State
  "game:start": () => void;
  "game:started": () => void;
  "game:over": (reason: string) => void;
  "game:restart": () => void;

  // UI
  "log:message": (text: string, type: "info" | "warn" | "success" | "danger") => void;
}

class EventBus extends EventEmitter<GameEvents> {}

// Singleton instance
export const events = new EventBus();
