import { events } from "../utils/EventBus";
import { inputManager } from "./InputManager";
import { audioManager } from "./AudioManager";
import {
  cameraSettings,
  saveCameraSettings,
  resetCameraSettings,
  CAMERA_LIMITS,
  type CameraSettingsData,
} from "../core/CameraSettings";

/**
 * In-game camera settings panel, toggled with C (Esc also closes).
 * Built entirely in code so index.html stays lean; sliders write straight
 * into the shared cameraSettings object, which CameraSystem reads every
 * frame — changes apply live while the panel is open.
 */
class SettingsMenu {
  private root: HTMLDivElement;
  private open = false;
  private gameStarted = false;
  private refreshers: Array<() => void> = [];

  constructor() {
    this.root = this.buildDom();
    document.body.appendChild(this.root);

    events.on("game:start", () => {
      this.gameStarted = true;
    });

    window.addEventListener("keydown", (e) => {
      if (!this.gameStarted) return;
      if (e.code === "KeyC") this.toggle();
      else if (e.code === "Escape" && this.open) this.close();
    });
  }

  public toggle() {
    this.open ? this.close() : this.show();
  }

  private show() {
    this.open = true;
    this.root.style.display = "flex";
    this.refreshers.forEach((r) => r());
    document.exitPointerLock();
    audioManager.playUIClick();
  }

  private close() {
    this.open = false;
    this.root.style.display = "none";
    inputManager.lockPointer();
    audioManager.playUIClick();
  }

  // --- DOM construction -----------------------------------------------------

  private buildDom(): HTMLDivElement {
    const root = document.createElement("div");
    root.id = "settings-menu";
    root.style.display = "none";

    const panel = document.createElement("div");
    panel.className = "settings-panel";

    const title = document.createElement("h2");
    title.textContent = "CAMERA SETTINGS";
    panel.appendChild(title);

    panel.appendChild(
      this.slider("SENSITIVITY", "sensitivity", CAMERA_LIMITS.sensitivity, (v) => v.toFixed(2)),
    );
    panel.appendChild(this.checkbox("INVERT Y-AXIS", "invertY"));
    panel.appendChild(this.slider("FIELD OF VIEW", "fov", CAMERA_LIMITS.fov, (v) => `${v}°`));
    panel.appendChild(
      this.slider("CAMERA DISTANCE", "distance", CAMERA_LIMITS.distance, (v) => `${v.toFixed(2)}m`),
    );
    panel.appendChild(
      this.slider("LOOK SMOOTHING", "smoothing", CAMERA_LIMITS.smoothing, (v) =>
        `${Math.round(v * 100)}%`,
      ),
    );
    panel.appendChild(this.checkbox("SCREEN SHAKE", "shake"));

    const buttons = document.createElement("div");
    buttons.className = "settings-buttons";

    const reset = document.createElement("button");
    reset.className = "btn-hud";
    reset.textContent = "RESET DEFAULTS";
    reset.addEventListener("click", () => {
      resetCameraSettings();
      this.refreshers.forEach((r) => r());
      audioManager.playUIClick();
    });
    buttons.appendChild(reset);

    const close = document.createElement("button");
    close.className = "btn-hud";
    close.textContent = "CLOSE  [C]";
    close.addEventListener("click", () => this.close());
    buttons.appendChild(close);

    panel.appendChild(buttons);
    root.appendChild(panel);
    return root;
  }

  private slider(
    label: string,
    key: { [K in keyof CameraSettingsData]: CameraSettingsData[K] extends number ? K : never }[keyof CameraSettingsData],
    limits: { min: number; max: number; step: number },
    format: (v: number) => string,
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "settings-row";

    const name = document.createElement("label");
    name.textContent = label;
    row.appendChild(name);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.step = String(limits.step);

    const value = document.createElement("span");
    value.className = "settings-value";

    const refresh = () => {
      input.value = String(cameraSettings[key]);
      value.textContent = format(cameraSettings[key]);
    };
    this.refreshers.push(refresh);
    refresh();

    input.addEventListener("input", () => {
      cameraSettings[key] = parseFloat(input.value);
      value.textContent = format(cameraSettings[key]);
      saveCameraSettings();
    });

    row.appendChild(input);
    row.appendChild(value);
    return row;
  }

  private checkbox(
    label: string,
    key: { [K in keyof CameraSettingsData]: CameraSettingsData[K] extends boolean ? K : never }[keyof CameraSettingsData],
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "settings-row";

    const name = document.createElement("label");
    name.textContent = label;
    row.appendChild(name);

    const input = document.createElement("input");
    input.type = "checkbox";

    const refresh = () => {
      input.checked = cameraSettings[key];
    };
    this.refreshers.push(refresh);
    refresh();

    input.addEventListener("change", () => {
      cameraSettings[key] = input.checked;
      saveCameraSettings();
      audioManager.playUIClick();
    });

    row.appendChild(input);
    return row;
  }
}

export const settingsMenu = new SettingsMenu();
