import { engine } from "./core/Engine";
import { createPlayer } from "./ecs/factories/PlayerFactory";
import { createPlanet, getPlanetHeight } from "./ecs/factories/PlanetFactory";
import { createBeacons } from "./ecs/factories/BeaconFactory";
import { createHazards } from "./ecs/factories/HazardFactory";
import { createLandingZone } from "./ecs/factories/DropshipFactory";
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
 * Scatter rock formations across the spherical surface.
 * Uses varied shapes and proper normal-aligned terrain placement.
 */
function createWorldClutter(planetRadius: number) {
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
      // Pick a random direction on the sphere
      let dir;
      do {
        dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        // Keep the spawn area clear (spawn is at North Pole direction (0, 1, 0))
      } while (dir.dot(new THREE.Vector3(0, 1, 0)) > 0.95);

      const height = getPlanetHeight(dir, planetRadius);
      const pos = dir.clone().multiplyScalar(height);

      // Align the rock to stand upright along the normal
      dummy.position.set(pos.x, pos.y, pos.z);
      
      const uprightQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      dummy.quaternion.copy(uprightQuat);
      
      // Add random local spin
      dummy.rotateY(Math.random() * Math.PI * 2);
      dummy.rotateX((Math.random() - 0.5) * 0.3);
      dummy.rotateZ((Math.random() - 0.5) * 0.3);

      const scale = 0.4 + Math.random() * 2.5;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Physical collider for each rock
      const rockRadius = scale * 0.8;
      
      // Rapier collider description aligned to normal
      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(uprightQuat);
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
  sunLight.name = "SunLight";
  sunLight.position.set(80, 60, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
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
  const planetRadius = 120;
  createPlanet({ x: 0, y: 0, z: 0 }, planetRadius);
  createLandingZone(planetRadius);
  createWorldClutter(planetRadius);

  // Gameplay entities
  createBeacons(planetRadius, getPlanetHeight);
  createHazards(planetRadius, getPlanetHeight);

  // Initialize particles
  initParticleSystem();

  // Spawn player on terrain surface near the dropship on the landing pad
  const spawnDir = new THREE.Vector3(0.03, 1.0, 0.0).normalize();
  const spawnDist = getPlanetHeight(spawnDir, planetRadius) + 1.2;
  const spawnPos = spawnDir.clone().multiplyScalar(spawnDist);
  createPlayer({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });

  console.log("ASTRA: LOST SIGNAL — Game initialized");
}

bootstrap().catch(console.error);
