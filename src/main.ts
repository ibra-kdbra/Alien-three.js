import { engine } from "./core/Engine";
import { createPlayer } from "./ecs/factories/PlayerFactory";
import { createEnvironment } from "./ecs/factories/EnvironmentFactory";
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

// Professional world building: Scatter rock formations across the flat map
function createWorldClutter(size: number) {
  const count = 400;
  const geometry = new THREE.DodecahedronGeometry(1.5, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 1.0,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);

  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    // Random position on the flat grid
    const x = (Math.random() - 0.5) * size;
    const z = (Math.random() - 0.5) * size;

    // We need the terrain height here to place rocks correctly.
    // For now, let's assume y=0 or use a simple estimate.
    const y = 0;

    const pos = new THREE.Vector3(x, y, z);
    dummy.position.copy(pos);

    // Random rotation
    dummy.rotation.set(0, Math.random() * Math.PI, 0);

    // Random scale
    dummy.scale.setScalar(0.5 + Math.random() * 3.0);

    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    // Physical Collider for each rock
    const rockRadius = dummy.scale.x * 1.2;
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const rockBody = physicsManager.world.createRigidBody(rigidBodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(rockRadius);
    physicsManager.world.createCollider(colliderDesc, rockBody);
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  renderer.scene.add(mesh);
}

async function bootstrap() {
  // Initialize Managers
  uiManager;
  debugManager;

  // Initialize Core Engine & Physics
  await engine.init();

  // Load Assets
  await assetManager.loadAllAssets();

  // Add some global light
  const ambientLight = new THREE.AmbientLight(0x404040, 0.8); // Softer ambient
  renderer.scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffee, 3.0);
  sunLight.position.set(100, 50, 50);
  renderer.scene.add(sunLight);

  // Generate Procedural Skybox
  const skyboxGeo = new THREE.SphereGeometry(900, 32, 32);
  const skyboxMat = new THREE.ShaderMaterial({
    vertexShader: skyboxVertexShader,
    fragmentShader: skyboxFragmentShader,
    side: THREE.BackSide,
  });
  const skybox = new THREE.Mesh(skyboxGeo, skyboxMat);
  renderer.scene.add(skybox);

  // Create world entities
  const mapSize = 500;
  createEnvironment(mapSize);

  // Scatter rocks across the map
  createWorldClutter(mapSize);

  // Spawn player high above the flat terrain so it drops naturally onto any procedural hills
  createPlayer({ x: 0, y: 50, z: 0 });

  console.log("Game initialized successfully!");
}

bootstrap().catch(console.error);
