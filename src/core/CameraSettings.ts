/**
 * Player-tunable camera settings, persisted to localStorage and edited live
 * through the in-game settings panel (C key). CameraSystem reads this object
 * every frame, so slider changes apply instantly.
 */

export interface CameraSettingsData {
  /** Mouse look multiplier (1.0 = default feel). */
  sensitivity: number;
  invertY: boolean;
  /** Base field of view in degrees (speed/jetpack kicks add on top). */
  fov: number;
  /** Explore-mode camera boom length in meters. */
  distance: number;
  /** 0 = raw 1:1 mouse, 1 = heavily damped cinematic look. */
  smoothing: number;
  /** Landing/impact screen shake. */
  shake: boolean;
}

export const CAMERA_DEFAULTS: CameraSettingsData = {
  sensitivity: 1.0,
  invertY: false,
  fov: 72,
  distance: 5.5,
  smoothing: 0.35,
  shake: true,
};

export const CAMERA_LIMITS = {
  sensitivity: { min: 0.2, max: 3.0, step: 0.05 },
  fov: { min: 60, max: 95, step: 1 },
  distance: { min: 3.0, max: 9.0, step: 0.25 },
  smoothing: { min: 0, max: 1, step: 0.05 },
} as const;

const STORAGE_KEY = "astra.camera.v1";

function load(): CameraSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...CAMERA_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Corrupt/blocked storage falls back to defaults.
  }
  return { ...CAMERA_DEFAULTS };
}

export const cameraSettings: CameraSettingsData = load();

export function saveCameraSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cameraSettings));
  } catch {
    // Storage may be unavailable (private mode); settings stay session-only.
  }
}

export function resetCameraSettings() {
  Object.assign(cameraSettings, CAMERA_DEFAULTS);
  saveCameraSettings();
}
