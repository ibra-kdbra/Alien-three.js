import { events } from "../utils/EventBus";

export type GamePhase = "boot" | "playing" | "gameover" | "won";

/**
 * Central game state machine. Systems consult this to know whether
 * gameplay simulation (input, oxygen drain, objectives) should run.
 */
class GameState {
  public phase: GamePhase = "boot";

  constructor() {
    events.on("game:start", () => {
      if (this.phase === "boot") this.phase = "playing";
    });
    events.on("game:over", () => {
      if (this.phase === "playing") this.phase = "gameover";
    });
    events.on("mission:complete", () => {
      if (this.phase === "playing") this.phase = "won";
    });
  }

  public get isPlaying(): boolean {
    return this.phase === "playing";
  }
}

export const gameState = new GameState();
