import * as THREE from "three";
import { physicsManager } from "./PhysicsManager";
import { renderer } from "../core/Renderer";

export class DebugManager {
  private lineSegments: THREE.LineSegments;
  private enabled: boolean = false; // Disabled by default in production

  constructor() {
    // Create the Three.js object to hold physics debug lines
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
    });
    const geometry = new THREE.BufferGeometry();
    this.lineSegments = new THREE.LineSegments(geometry, material);
    this.lineSegments.frustumCulled = false; // Always render debug lines
    this.lineSegments.visible = false;

    renderer.scene.add(this.lineSegments);

    // Toggle with F3
    window.addEventListener("keydown", (e) => {
      if (e.code === "F3") {
        e.preventDefault();
        this.setEnabled(!this.enabled);
      }
    });
  }

  public update() {
    if (!this.enabled || !physicsManager.world) return;

    // Get the debug rendering buffers from Rapier
    const { vertices, colors } = physicsManager.world.debugRender();

    // Update Three.js geometry with the new buffers
    this.lineSegments.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(vertices, 3),
    );
    this.lineSegments.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 4),
    );
  }

  public setEnabled(value: boolean) {
    this.enabled = value;
    this.lineSegments.visible = value;
    console.log(`Debug rendering: ${value ? "ON" : "OFF"}`);
  }
}

export const debugManager = new DebugManager();
