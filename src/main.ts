import { engine } from "./core/Engine";
import { createPlayer } from "./ecs/factories/PlayerFactory";
import { createPlanet } from "./ecs/factories/PlanetFactory";
import * as THREE from "three";
import { renderer } from "./core/Renderer";
import { uiManager } from "./managers/UIManager";
import { assetManager } from "./managers/AssetManager";
import "./styles/style.css";

async function bootstrap() {
  // Touch uiManager to initialize it
  uiManager;

  // Initialize Core Engine & Physics
  await engine.init();

  // Load Assets
  await assetManager.loadAllAssets();

  // Add some global light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  renderer.scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2);
  sunLight.position.set(100, 50, 50);
  renderer.scene.add(sunLight);

  // Create world entities
  const planetRadius = 50;
  createPlanet({ x: 0, y: 0, z: 0 }, planetRadius);
  createPlayer({ x: 0, y: planetRadius + 10, z: 0 }); // Spawn above the planet

  console.log("Game initialized successfully!");
}

bootstrap().catch(console.error);
