import { engine } from "./core/Engine";
import { createPlayer } from "./ecs/factories/PlayerFactory";
import { createEnvironment, getTerrainHeight } from "./ecs/factories/EnvironmentFactory";
import { createBeacons } from "./ecs/factories/BeaconFactory";
import { createHazards } from "./ecs/factories/HazardFactory";
import { initParticleSystem } from "./ecs/systems/ParticleSystem";
import * as THREE from "three";
import { renderer } from "./core/Renderer";
import { uiManager } from "./managers/UIManager";
import { assetManager } from "./managers/AssetManager";
import { physicsManager } from "./managers/PhysicsManager";
import { debugManager } from "./managers/DebugManager";
import RAPIER from "@dimforge/rapier3d-compat";
import "./styles/style.css";

import skyboxVertexShader from "./shaders/skybox.vertex.glsl?raw";
import skyboxFragmentShader from "./shaders/skybox.fragment.glsl?raw";

/**
 * Scatter rock formations across the terrain.
 * Uses varied shapes and proper terrain placement.
 */
function createWorldClutter(size: number) {
  const count = 200;

  // Multiple rock shapes for variety
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

  // Create instanced meshes for each shape type
  const rocksPerType = Math.floor(count / geometries.length);
  const dummy = new THREE.Object3D();

  geometries.forEach((geo) => {
    const mesh = new THREE.InstancedMesh(geo, material, rocksPerType);

    for (let i = 0; i < rocksPerType; i++) {
      // Distribute across the map, biased away from center (player spawn)
      let x, z;
      do {
        x = (Math.random() - 0.5) * size * 0.85;
        z = (Math.random() - 0.5) * size * 0.85;
      } while (Math.abs(x) < 15 && Math.abs(z) < 15); // Keep spawn area clear

      const y = getTerrainHeight(x, z);

      dummy.position.set(x, y - 0.3, z);
      dummy.rotation.set(
        Math.random() * Math.PI * 0.3,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 0.3,
      );

      const scale = 0.4 + Math.random() * 2.5;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Physical collider for each rock
      const rockRadius = scale * 0.8;
      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
      const rockBody = physicsManager.world.createRigidBody(rigidBodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.ball(rockRadius);
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

  // Sun — directional light with shadows
  const sunLight = new THREE.DirectionalLight(0xffeedd, 2.5);
  sunLight.position.set(80, 60, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 300;
  sunLight.shadow.camera.left = -80;
  sunLight.shadow.camera.right = 80;
  sunLight.shadow.camera.top = 80;
  sunLight.shadow.camera.bottom = -80;
  sunLight.shadow.bias = -0.001;
  sunLight.shadow.normalBias = 0.02;
  renderer.scene.add(sunLight);

  // Opposite fill light (weaker, cool-toned)
  const fillLight = new THREE.DirectionalLight(0x6688cc, 0.5);
  fillLight.position.set(-50, 30, -30);
  renderer.scene.add(fillLight);

  // Generate Procedural Skybox
  const skyboxGeo = new THREE.SphereGeometry(1500, 48, 48);
  const skyboxMat = new THREE.ShaderMaterial({
    vertexShader: skyboxVertexShader,
    fragmentShader: skyboxFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skybox = new THREE.Mesh(skyboxGeo, skyboxMat);
  renderer.scene.add(skybox);

  // --- World Generation ---
  const mapSize = 500;
  createEnvironment(mapSize);
  createWorldClutter(mapSize);

  // Gameplay entities
  createBeacons(mapSize, getTerrainHeight);
  createHazards(mapSize, getTerrainHeight);

  // Initialize particles
  initParticleSystem();

  // Spawn player on terrain surface
  const spawnY = getTerrainHeight(0, 0) + 3;
  createPlayer({ x: 0, y: spawnY, z: 0 });

  console.log("ASTRA: LOST SIGNAL — Game initialized");
}

bootstrap().catch(console.error);
