import { engine } from "./core/Engine";
import { createPlayer } from "./ecs/factories/PlayerFactory";
import { createPlanet, getPlanetHeight } from "./ecs/factories/PlanetFactory";
import { createBeacons, BEACON_DIRECTIONS } from "./ecs/factories/BeaconFactory";
import { createHazards } from "./ecs/factories/HazardFactory";
import { createLandingZone } from "./ecs/factories/DropshipFactory";
import { createPickups, createDataPads } from "./ecs/factories/PickupFactory";
import { createSupplyCache } from "./ecs/factories/CacheFactory";
import { missionManager, missionState } from "./managers/MissionManager";
import { initParticleSystem } from "./ecs/systems/ParticleSystem";
import * as THREE from "three";
import { renderer } from "./core/Renderer";
import { createSun } from "./core/Sun";
import { uiManager } from "./managers/UIManager";
import { settingsMenu } from "./managers/SettingsMenu";
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
    color: 0x8a6a52,
    roughness: 0.9,
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

  // Emissive crystal clusters — night-side landmarks and pure eye candy.
  // Visual only: no colliders, players walk straight through.
  const crystalGeo = new THREE.ConeGeometry(0.22, 1.4, 5);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x8844cc,
    emissive: 0xaa55ff,
    emissiveIntensity: 1.3,
    roughness: 0.2,
    metalness: 0.1,
    flatShading: true,
  });

  const clusterCount = 22;
  const crystalsPerCluster = 5;
  const crystalMesh = new THREE.InstancedMesh(
    crystalGeo,
    crystalMat,
    clusterCount * crystalsPerCluster,
  );

  let ci = 0;
  for (let c = 0; c < clusterCount; c++) {
    let dir;
    do {
      dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
    } while (!isClearOf(dir));

    const clusterUpright = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir,
    );

    for (let k = 0; k < crystalsPerCluster; k++) {
      // Jitter each shard around the cluster center along the surface
      const jitter = dir
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.012,
            (Math.random() - 0.5) * 0.012,
            (Math.random() - 0.5) * 0.012,
          ),
        )
        .normalize();
      const height = getPlanetHeight(jitter, planetRadius);
      const pos = jitter.clone().multiplyScalar(height + 0.2);

      dummy.position.copy(pos);
      dummy.quaternion.copy(clusterUpright);
      dummy.rotateX((Math.random() - 0.5) * 0.9);
      dummy.rotateZ((Math.random() - 0.5) * 0.9);
      dummy.scale.set(
        0.7 + Math.random() * 0.6,
        0.6 + Math.random() * 1.3,
        0.7 + Math.random() * 0.6,
      );
      dummy.updateMatrix();
      crystalMesh.setMatrixAt(ci++, dummy.matrix);
    }
  }
  crystalMesh.castShadow = true;
  renderer.scene.add(crystalMesh);
}

async function bootstrap() {
  // Initialize Managers
  uiManager;
  settingsMenu;
  missionManager;
  debugManager;

  // Initialize Core Engine & Physics
  await engine.init();

  // Load Assets
  await assetManager.loadAllAssets();

  // --- Lighting Setup ---

  // Hemisphere light for natural ambient bounce — strong enough that the
  // shadow side of objects still reads as shape, never as a black cutout.
  const hemiLight = new THREE.HemisphereLight(
    0x9d8bd6, // Sky color (nebula violet)
    0x5a3a28, // Ground color (warm rust bounce)
    0.7,
  );
  renderer.scene.add(hemiLight);

  // Ambient fill
  const ambientLight = new THREE.AmbientLight(0x353050, 0.45);
  renderer.scene.add(ambientLight);

  // Sun with a player-following shadow frustum
  createSun(renderer.scene);

  // Opposite fill light (weaker, cool-toned)
  const fillLight = new THREE.DirectionalLight(0x7799dd, 0.4);
  fillLight.position.set(-50, -20, -30);
  renderer.scene.add(fillLight);

  // Atmospheric haze — dusty mauve matched to the sky horizon so terrain
  // dissolves into the sky instead of into gray soup.
  renderer.scene.fog = new THREE.FogExp2(0x38203e, 0.004);

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
  createPickups(PLANET_RADIUS);
  createSupplyCache(PLANET_RADIUS);
  createDataPads(PLANET_RADIUS);

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

  // Auto quality: if the player never chose a tier, measure real frame cost
  // after the intro settles and step down until the machine keeps up.
  const { events } = await import("./utils/EventBus");
  let storedQuality: string | null = null;
  try {
    storedQuality = localStorage.getItem("astra.quality");
  } catch {
    /* private browsing */
  }
  if (!storedQuality) {
    events.on("game:start", () => {
      // Measure REAL frames per second (frame-counter deltas) — main-thread
      // frameMs misses GPU-bound stalls, which is exactly what weak
      // integrated GPUs produce.
      const stepDown = (to: "medium" | "low") => {
        renderer.setQuality(to);
        events.emit("log:message", `RENDER QUALITY AUTO-SET: ${to.toUpperCase()}`, "info");
      };
      const fpsOver = (seconds: number): Promise<number> =>
        new Promise((resolve) => {
          const f0 = engine.frames;
          window.setTimeout(() => resolve((engine.frames - f0) / seconds), seconds * 1000);
        });
      window.setTimeout(async () => {
        if (document.hidden) return; // backgrounded tabs throttle rAF
        const fps1 = await fpsOver(5);
        if (fps1 >= 40 || document.hidden) return;
        stepDown("medium");
        const fps2 = await fpsOver(5);
        if (fps2 < 40 && !document.hidden) stepDown("low");
      }, 9000); // let the intro descent finish first
    });
  }

  // Debug/testing handle (harmless in production; used by the smoke test)
  const { queries } = await import("./ecs/World");
  const { gameState } = await import("./core/GameState");
  const { charDiag } = await import("./ecs/systems/CharacterSystem");
  (window as any).__astra = {
    getDiag: () => JSON.parse(JSON.stringify(charDiag)),
    getMission: () => ({ ...missionState, stats: missionManager.getStats() }),
    // Test-only: fast-forward the Act III countdown.
    setEvacRemaining(seconds: number) {
      missionState.evacRemaining = seconds;
    },
    async skipIntro() {
      const { skipIntro } = await import("./ecs/systems/CameraSystem");
      skipIntro();
    },
    // Test-only: arena state + a legit way to resolve a wave in scripts.
    async getCombat() {
      const { aliveCreatureCount } = await import("./ecs/systems/CreatureSystem");
      const { queries: q } = await import("./ecs/World");
      const { weaponDebug } = await import("./ecs/systems/WeaponSystem");
      const positions = q.creatures.entities
        .filter((c) => c.creature.state !== "dying")
        .map((c) => {
          const p = c.object3d.position;
          return { x: p.x, y: p.y, z: p.z, state: c.creature.state, hp: c.creature.hp };
        });
      return { alive: aliveCreatureCount(), positions, weapon: weaponDebug() };
    },
    async killWave() {
      const { damageCreature } = await import("./ecs/systems/CreatureSystem");
      const { queries: q } = await import("./ecs/World");
      for (const c of [...q.creatures.entities]) damageCreature(c, 9999);
    },
    // Test-only: dropship altitude above its pad (verifies the launch anim).
    getShipY() {
      const d = queries.dropships.first;
      const ship = d?.object3d?.children.find((c) => c instanceof THREE.Group);
      return ship ? ship.position.y : null;
    },
    // Test-only: steer the camera so scripted runs can walk toward targets.
    addYaw(rad: number) {
      const p = queries.player.first;
      if (p?.playerControl) p.playerControl.yaw = (p.playerControl.yaw ?? 0) + rad;
    },
    // Test-only: aim the camera ray (which passes through the player's head)
    // at a world point — steers yaw AND pitch. Returns the residual angle
    // before the correction; call until it reports ~0.
    aimAt(x: number, y: number, z: number) {
      const player = queries.player.first;
      if (!player?.playerControl || !player.object3d) return null;
      const pc = player.playerControl;
      const p = player.object3d.position;
      const n = p.clone().normalize();
      const camPos = new THREE.Vector3();
      renderer.camera.getWorldPosition(camPos);
      const target = new THREE.Vector3(x, y, z);

      // Yaw: rotate the tangent-plane forward onto the target bearing
      const dT = target.clone().sub(p).projectOnPlane(n);
      const f = new THREE.Vector3();
      renderer.camera.getWorldDirection(f);
      let yawErr = 0;
      if (dT.lengthSq() > 1e-6) {
        dT.normalize();
        const fT = f.clone().projectOnPlane(n).normalize();
        yawErr = Math.atan2(fT.clone().cross(dT).dot(n), fT.dot(dT));
        pc.yaw = (pc.yaw ?? 0) + yawErr;
      }

      // Pitch: match the beam's elevation to the target's elevation as seen
      // from the camera (elevations measured against the planet normal)
      const dFull = target.clone().sub(camPos).normalize();
      const elTarget = Math.asin(THREE.MathUtils.clamp(dFull.dot(n), -1, 1));
      const elBeam = Math.asin(THREE.MathUtils.clamp(f.dot(n), -1, 1));
      const pitchErr = elTarget - elBeam;
      pc.pitch = THREE.MathUtils.clamp((pc.pitch ?? 0) + pitchErr, -1.25, 1.15);

      return Math.max(Math.abs(yawErr), Math.abs(pitchErr));
    },
    getBeaconPos(index: number) {
      for (const b of queries.beacons) {
        if (b.object3d?.userData.index === index) {
          const p = b.object3d.position;
          return { x: p.x, y: p.y, z: p.z };
        }
      }
      return null;
    },
    getDropshipPos() {
      const p = queries.dropships.first?.object3d?.position;
      return p ? { x: p.x, y: p.y, z: p.z } : null;
    },
    getPerf: () => ({
      frameMs: engine.frameMs,
      frameMsMax: engine.frameMsMax,
      frames: engine.frames,
      drawCalls: renderer.renderer.info.render.calls,
      triangles: renderer.renderer.info.render.triangles,
    }),
    // Test-only: drop the player onto the surface point in direction (x,y,z).
    teleport(x: number, y: number, z: number) {
      const player = queries.player.first;
      if (!player) return;
      const dir = new THREE.Vector3(x, y, z).normalize();
      const h = getPlanetHeight(dir, PLANET_RADIUS);
      const pos = dir.multiplyScalar(h + 1.5);
      player.rigidBody.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
      player.playerControl.velocity = { x: 0, y: 0, z: 0 };
    },
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
