import { events } from "../utils/EventBus";
import { inputManager } from "./InputManager";
import { audioManager } from "./AudioManager";
import { renderer } from "../core/Renderer";

export class UIManager {
  private startScreen = document.getElementById("start-screen") as HTMLElement;
  private loadingScreen = document.getElementById("loading-screen") as HTMLElement;
  private loadingBar = document.getElementById("loading-bar") as HTMLElement;
  private loadingText = document.getElementById("loading-text") as HTMLElement;
  private hud = document.getElementById("hud") as HTMLElement;
  private gameOverScreen = document.getElementById("game-over-screen") as HTMLElement;
  private gameOverReason = document.getElementById("game-over-reason") as HTMLElement;
  private missionCompleteScreen = document.getElementById("mission-complete-screen") as HTMLElement;

  // HUD Elements
  private oxygenBar = document.getElementById("oxygen-bar") as HTMLElement;
  private oxygenText = document.getElementById("oxygen-text") as HTMLElement;
  private signalBar = document.getElementById("signal-bar") as HTMLElement;
  private signalText = document.getElementById("signal-text") as HTMLElement;
  private fuelBar = document.getElementById("fuel-bar") as HTMLElement;
  private fuelText = document.getElementById("fuel-text") as HTMLElement;
  private modeIndicator = document.getElementById("mode-indicator") as HTMLElement;
  private missionLog = document.getElementById("mission-log") as HTMLElement;
  private sprintIndicator = document.getElementById("sprint-indicator") as HTMLElement;
  private vitalsPanel = document.getElementById("panel-vitals") as HTMLElement;
  private btnPerfToggle = document.getElementById("btn-perf-toggle") as HTMLButtonElement;

  private gameStarted = false;
  private isGameOver = false;

  // Loading text rotation
  private loadingMessages = [
    "CALIBRATING SENSORS...",
    "SCANNING TERRAIN...",
    "ESTABLISHING UPLINK...",
    "LOADING TEXTURES...",
    "INITIALIZING PHYSICS...",
    "DEPLOYING BEACONS...",
  ];
  private loadingMsgIndex = 0;

  constructor() {
    this.initListeners();
    this.initStartScreen();
    this.startLoadingTextRotation();
  }

  private assetsLoaded = false;

  private initStartScreen() {
    const startGame = () => {
      if (!this.gameStarted) {
        this.gameStarted = true;
        events.emit("game:start");
        this.startScreen.style.opacity = "0";
        
        // Initialize Audio Context on first user interaction
        audioManager.init();
        audioManager.startAmbientDrone();

        setTimeout(() => {
          this.startScreen.style.display = "none";
          
          if (this.assetsLoaded) {
            this.hideLoadingScreen();
            this.showHUD();
            this.playInitialLogs();
          } else {
            // Show loading screen
            if (this.loadingScreen) {
              this.loadingScreen.style.display = "flex";
              this.loadingScreen.style.opacity = "1";
            }
          }
          
          // Lock pointer to start the game
          inputManager.lockPointer();
        }, 600);
      }
    };

    // Listen for click on start screen to begin
    if (this.startScreen) {
      this.startScreen.addEventListener("click", startGame);
    }
    
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.startScreen.style.display !== "none") {
        startGame();
      }
    });
  }

  private playInitialLogs() {
    setTimeout(() => {
      events.emit("log:message", "SUIT SYSTEMS ONLINE", "info");
    }, 500);
    setTimeout(() => {
      events.emit("log:message", "3 BEACONS DETECTED — LOCATE AND ACTIVATE", "warn");
    }, 1500);
  }

  private startLoadingTextRotation() {
    setInterval(() => {
      if (this.loadingText && this.loadingScreen?.style.display !== "none") {
        this.loadingMsgIndex = (this.loadingMsgIndex + 1) % this.loadingMessages.length;
        this.loadingText.textContent = this.loadingMessages[this.loadingMsgIndex];
      }
    }, 1200);
  }

  private initListeners() {
    // 1. Loading Screen Logic
    events.on("assets:progress", (progress: number) => {
      if (this.loadingBar) {
        this.loadingBar.style.width = `${progress * 100}%`;
      }
    });

    events.on("assets:loaded", () => {
      this.assetsLoaded = true;
      if (this.gameStarted) {
        this.hideLoadingScreen();
        this.showHUD();
        this.playInitialLogs();
      }
    });

    // 2. Oxygen updates
    events.on("player:oxygen:changed", (current: number, max: number) => {
      if (this.oxygenBar) {
        const percent = Math.max(0, (current / max) * 100);
        this.oxygenBar.style.width = `${percent}%`;

        // Update text
        if (this.oxygenText) {
          this.oxygenText.textContent = `${Math.round(percent)}%`;
        }

        // Color transitions based on oxygen level
        if (percent < 15) {
          this.oxygenBar.style.background =
            "linear-gradient(90deg, #ff2233, #ff4455)";
          this.oxygenBar.style.boxShadow = "0 0 12px rgba(255, 51, 68, 0.6)";
          this.modeIndicator.textContent = "CRITICAL";
          this.modeIndicator.className = "value critical";
          this.vitalsPanel?.classList.add("hud-warning");
        } else if (percent < 30) {
          this.oxygenBar.style.background =
            "linear-gradient(90deg, #ff8833, #ffaa44)";
          this.oxygenBar.style.boxShadow = "0 0 8px rgba(255, 170, 68, 0.4)";
          this.modeIndicator.textContent = "WARNING";
          this.modeIndicator.className = "value warn";
          this.vitalsPanel?.classList.remove("hud-warning");
        } else {
          this.oxygenBar.style.background =
            "linear-gradient(90deg, #00ffcc, #00ddaa)";
          this.oxygenBar.style.boxShadow =
            "0 0 8px rgba(0, 255, 204, 0.15)";
          this.modeIndicator.textContent = "NOMINAL";
          this.modeIndicator.className = "value nominal";
          this.vitalsPanel?.classList.remove("hud-warning");
        }
      }
    });

    // 2b. Jetpack fuel updates
    events.on("player:fuel:changed", (current: number, max: number) => {
      if (this.fuelBar) {
        const percent = Math.max(0, (current / max) * 100);
        this.fuelBar.style.width = `${percent}%`;
        if (this.fuelText) {
          this.fuelText.textContent = `${Math.round(percent)}%`;
        }
      }
    });

    // 3. Signal strength
    events.on("signal:strength:changed", (strength: number) => {
      if (this.signalBar) {
        this.signalBar.style.width = `${Math.min(100, strength)}%`;
      }
      if (this.signalText) {
        this.signalText.textContent = `${Math.round(Math.min(100, strength))}%`;
      }
    });

    // 4. Beacon collected
    events.on("beacon:collected", (_collected: number, _total: number) => {
      // Update the initial beacon line in the log
      const beaconMsgs = this.missionLog?.querySelectorAll(".beacon-count");
      beaconMsgs?.forEach((el) => el.remove());
    });

    // 5. Log messages
    events.on("log:message", (text: string, type: "info" | "warn" | "success" | "danger") => {
      this.addLogMessage(text, type);
    });

    // 6. Game over
    events.on("game:over", (reason: string) => {
      if (this.isGameOver) return;
      this.isGameOver = true;

      setTimeout(() => {
        if (this.gameOverScreen) {
          this.gameOverScreen.style.display = "flex";
          if (this.gameOverReason) {
            this.gameOverReason.textContent = reason;
          }
        }

        // Click to reload
        this.gameOverScreen?.addEventListener("click", () => {
          window.location.reload();
        });

        // Release pointer
        document.exitPointerLock();
      }, 1500);
    });

    // 7. Mission complete
    events.on("mission:complete", () => {
      setTimeout(() => {
        if (this.missionCompleteScreen) {
          this.missionCompleteScreen.style.display = "flex";
        }
        document.exitPointerLock();
      }, 2000);
    });

    // 8. Pointer Lock UI
    document.addEventListener("pointerlockchange", () => {
      if (inputManager.pointerLocked) {
        this.hud?.classList.remove("paused");
      } else if (this.gameStarted) {
        this.hud?.classList.add("paused");
      }
    });

    // 9. Sprint indicator
    let sprintActive = false;
    const checkSprint = () => {
      const nowSprinting = inputManager.getAction("sprint") > 0;
      if (nowSprinting !== sprintActive) {
        sprintActive = nowSprinting;
        if (this.sprintIndicator) {
          this.sprintIndicator.style.opacity = nowSprinting ? "1" : "0";
        }
      }
      requestAnimationFrame(checkSprint);
    };
    checkSprint();

    // 10. Performance Mode Toggle
    if (this.btnPerfToggle) {
      this.btnPerfToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        
        const nextMode = !renderer.performanceMode;
        renderer.setPerformanceMode(nextMode);
        
        if (nextMode) {
          this.btnPerfToggle.textContent = "PERFORMANCE MODE: ON";
          this.btnPerfToggle.style.color = "#ff8833";
          this.btnPerfToggle.style.border = "1px solid rgba(255, 136, 51, 0.4)";
          this.btnPerfToggle.style.background = "rgba(255, 136, 51, 0.06)";
        } else {
          this.btnPerfToggle.textContent = "PERFORMANCE MODE: OFF";
          this.btnPerfToggle.style.color = "var(--astra-cyan)";
          this.btnPerfToggle.style.border = "1px solid var(--astra-cyan-dim)";
          this.btnPerfToggle.style.background = "rgba(0, 255, 204, 0.06)";
        }
        
        audioManager.playUIClick();
      });
    }
  }

  private addLogMessage(text: string, type: string) {
    if (!this.missionLog) return;

    const msg = document.createElement("div");
    msg.className = `msg ${type}`;
    msg.textContent = text;
    this.missionLog.appendChild(msg);

    // Scroll to bottom
    this.missionLog.scrollTop = this.missionLog.scrollHeight;

    // Limit messages
    while (this.missionLog.children.length > 12) {
      this.missionLog.removeChild(this.missionLog.firstChild!);
    }

    // Auto-fade old messages
    setTimeout(() => {
      msg.style.opacity = "0.4";
    }, 8000);
  }

  public hideLoadingScreen() {
    if (this.loadingScreen) {
      this.loadingScreen.style.opacity = "0";
      setTimeout(() => {
        this.loadingScreen.style.display = "none";
      }, 800);
    }
  }

  public showHUD() {
    if (this.hud) {
      this.hud.style.opacity = "1";
    }
  }
}

export const uiManager = new UIManager();
