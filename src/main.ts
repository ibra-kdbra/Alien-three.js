import { engine } from "./core/Engine";
import { createPlayer } from "./ecs/factories/PlayerFactory";
import { createPlanet, getPlanetHeight } from "./ecs/factories/PlanetFactory";
import { createBeacons, BEACON_DIRECTIONS } from "./ecs/factories/BeaconFactory";
import { createHazards } from "./ecs/factories/HazardFactory";
import { createLandingZone } from "./ecs/factories/DropshipFactory";
import { initParticleSystem } from "./ecs/systems/ParticleSystem";
import * as THREE from "three";
import { renderer } from "./core/Renderer";
import { createSun } from "./core/Sun";
import { uiManager } from "./managers/UIManager";
import { assetManager } from "./managers/AssetManager";
import { physicsManager } from "./managers/PhysicsManager";
import { debugManager } from "./managers/DebugManager";
import RAPIER from "@dimforge/rapier3d-compat";

// Global Error Overlay for debugging black screens
window.addEventListener('error', (e) => {
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;top:0;left:0;background:red;color:white;z-index:9999;padding:20px;font-family:monospace;white-space:pre-wrap;width:100%;height:100%;overflow:auto;';
  errDiv.innerHTML = `<h1>Fatal Error</h1><p>${e.message}</p><pre>${e.error?.stack || ''}</pre>`;
  document.body.appendChild(errDiv);
});
window.addEventListener('unhandledrejection', (e) => {
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;top:0;left:0;background:darkred;color:white;z-index:9999;padding:20px;font-family:monospace;white-space:pre-wrap;width:100%;height:100%;overflow:auto;';
  errDiv.innerHTML = `<h1>Unhandled Promise Rejection</h1><p>${e.reason}</p><pre>${e.reason?.stack || ''}</pre>`;
  document.body.appendChild(errDiv);
});

import "./styles/style.css";

import skyboxVertexShader from "./shaders/skybox.vertex.glsl?raw";
import skyboxFragmentShader from "./shaders/skybox.fragment.glsl?raw";

// A 200m-radius planet: ~1.25km around the equator. Big enough to feel like
// a world, small enough that every beacon is a purposeful 1–3 minute traverse
// against the oxygen clock.
const PLANET_RADIUS = 200;

/**
 * Scatter rock formations across the spherical surface.
 * Keeps the landing zone and beacon sites clear.
 */
function createWorldClutter(planetRadius: number) {
  const count = 160;

  const geometries = [
    new THREE.DodecahedronGeometry(1.0, 0),
    new THREE.OctahedronGeometry(1.2, 0),
    new THREE.TetrahedronGeometry(1.4, 0),
  ];

  const material = new THREE.MeshStandardMaterial({
    color: 0x554433,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  });

  const rocksPerType = Math.floor(count / geometries.length);
  const dummy = new THREE.Object3D();
  const pole = new THREE.Vector3(0, 1, 0);

  const isClearOf = (dir: THREE.Vector3) => {
    if (dir.dot(pole) > 0.95) return false; // landing zone
    for (const beaconDir of BEACON_DIRECTIONS) {
      if (dir.dot(beaconDir) > 0.997) return false; // ~15m around each beacon
    }
    return true;
  };

  geometries.forEach((geo) => {
    const mesh = new THREE.InstancedMesh(geo, material, rocksPerType);

    for (let i = 0; i < rocksPerType; i++) {
      let dir;
      do {
        dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
      } while (!isClearOf(dir));

      const height = getPlanetHeight(dir, planetRadius);
      const pos = dir.clone().multiplyScalar(height);

      dummy.position.set(pos.x, pos.y, pos.z);

      const uprightQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      dummy.quaternion.copy(uprightQuat);

      dummy.rotateY(Math.random() * Math.PI * 2);
      dummy.rotateX((Math.random() - 0.5) * 0.3);
      dummy.rotateZ((Math.random() - 0.5) * 0.3);

      const scale = 0.4 + Math.random() * 1.8;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Physical collider for each rock
      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(uprightQuat);
      const rockBody = physicsManager.world.createRigidBody(rigidBodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.ball(scale * 0.75);
      physicsManager.world.createCollider(colliderDesc, rockBody);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    renderer.scene.add(mesh);
  });
}

async function bootstrap() {
  // Initialize Managers
  uiManager;
  debugManager;

  // Initialize Core Engine & Physics
  await engine.init();

  // Load Assets
  await assetManager.loadAllAssets();

  // --- Lighting Setup ---

  // Hemisphere light for natural ambient bounce
  const hemiLight = new THREE.HemisphereLight(
    0x8899bb, // Sky color (cool blue)
    0x443322, // Ground color (warm brown)
    0.6,
  );
  renderer.scene.add(hemiLight);

  // Ambient fill
  const ambientLight = new THREE.AmbientLight(0x222233, 0.4);
  renderer.scene.add(ambientLight);

  // Sun with a player-following shadow frustum
  createSun(renderer.scene);

  // Opposite fill light (weaker, cool-toned)
  const fillLight = new THREE.DirectionalLight(0x6688cc, 0.5);
  fillLight.position.set(-50, 30, -30);
  renderer.scene.add(fillLight);

  // Atmospheric haze tuned to the planet scale
  renderer.scene.fog = new THREE.FogExp2(0x1a0e2e, 0.0035);

  // Generate Procedural Skybox
  const skyboxGeo = new THREE.SphereGeometry(4000, 48, 48);
  const skyboxMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: skyboxVertexShader,
    fragmentShader: skyboxFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skybox = new THREE.Mesh(skyboxGeo, skyboxMat);
  skybox.name = "Skybox";
  renderer.scene.add(skybox);

  // --- World Generation (Spherical Planet) ---
  createPlanet({ x: 0, y: 0, z: 0 }, PLANET_RADIUS);
  createLandingZone(PLANET_RADIUS);
  createWorldClutter(PLANET_RADIUS);

  // Gameplay entities
  createBeacons(PLANET_RADIUS, getPlanetHeight);
  createHazards(PLANET_RADIUS, getPlanetHeight);

  // Initialize particles
  initParticleSystem();

  // Spawn player on the landing pad next to the dropship. Height is derived
  // from the pad surface (which sits at pole height − 0.05), not the noise
  // field under the spawn point, so the capsule always drops cleanly onto it.
  const poleHeight = getPlanetHeight(new THREE.Vector3(0, 1, 0), PLANET_RADIUS);
  const spawnDir = new THREE.Vector3(0.02, 1.0, 0.0).normalize();
  const spawnPos = spawnDir.clone().multiplyScalar(poleHeight + 1.5);
  createPlayer({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });

  console.log("ASTRA: LOST SIGNAL — Game initialized");

  // Debug/testing handle (harmless in production; used by the smoke test)
  const { queries } = await import("./ecs/World");
  const { gameState } = await import("./core/GameState");
  const { charDiag } = await import("./ecs/systems/CharacterSystem");
  (window as any).__astra = {
    getDiag: () => JSON.parse(JSON.stringify(charDiag)),
    getPlayerState() {
      const player = queries.player.first;
      if (!player) return null;
      const p = player.object3d.position;
      return {
        phase: gameState.phase,
        position: { x: p.x, y: p.y, z: p.z },
        radialDistance: p.length(),
        grounded: player.playerControl.grounded,
        oxygen: player.playerControl.oxygen,
        fuel: player.playerControl.jetpackFuel,
        velocity: { ...player.playerControl.velocity },
      };
    },
  };
}

bootstrap().catch(console.error);
