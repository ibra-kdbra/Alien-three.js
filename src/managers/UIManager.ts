import { events } from "../utils/EventBus";
import { inputManager } from "./InputManager";

export class UIManager {
  private loadingScreen = document.getElementById(
    "loading-screen",
  ) as HTMLElement;
  private loadingBar = document.getElementById("loading-bar") as HTMLElement;
  private hud = document.getElementById("hud") as HTMLElement;

  // HUD Elements
  private oxygenBar = document.getElementById("oxygen-bar") as HTMLElement;
  private modeIndicator = document.getElementById(
    "mode-indicator",
  ) as HTMLElement;

  constructor() {
    this.initListeners();
  }

  private initListeners() {
    // 1. Loading Screen Logic
    events.on("assets:progress", (progress: number) => {
      if (this.loadingBar) {
        this.loadingBar.style.width = `${progress * 100}%`;
      }
    });

    events.on("assets:loaded", () => {
      this.hideLoadingScreen();
      this.showHUD();
    });

    // 2. HUD Game Logic
    events.on("player:health:changed", (current: number, max: number) => {
      // Re-use oxygen bar for health/suit for now
      if (this.oxygenBar) {
        const percent = Math.max(0, (current / max) * 100);
        this.oxygenBar.style.width = `${percent}%`;

        if (percent < 25) {
          this.oxygenBar.style.backgroundColor = "red";
          this.modeIndicator.textContent = "CRITICAL";
          this.modeIndicator.className = "value warn";
        } else {
          this.oxygenBar.style.backgroundColor = "var(--astra-cyan)";
          this.modeIndicator.textContent = "NOMINAL";
          this.modeIndicator.className = "value nominal";
        }
      }
    });

    // 3. Pointer Lock UI
    document.addEventListener("pointerlockchange", () => {
      if (inputManager.pointerLocked) {
        this.hud.classList.remove("paused");
      } else {
        this.hud.classList.add("paused");
      }
    });
  }

  public hideLoadingScreen() {
    if (this.loadingScreen) {
      this.loadingScreen.style.opacity = "0";
      setTimeout(() => {
        this.loadingScreen.style.display = "none";
      }, 500);
    }
  }

  public showHUD() {
    if (this.hud) {
      this.hud.style.opacity = "1";
    }
  }
}

export const uiManager = new UIManager();
