import * as THREE from "three";
import { physicsManager } from "./PhysicsManager";
import { renderer } from "../core/Renderer";

export class DebugManager {
  private lineSegments: THREE.LineSegments;
  private enabled: boolean = true; // Set to false to disable debug view

  constructor() {
    // Create the Three.js object to hold physics debug lines
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
    });
    const geometry = new THREE.BufferGeometry();
    this.lineSegments = new THREE.LineSegments(geometry, material);
    this.lineSegments.frustumCulled = false; // Always render debug lines

    renderer.scene.add(this.lineSegments);
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
  }
}

export const debugManager = new DebugManager();
