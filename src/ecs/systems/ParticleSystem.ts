import * as THREE from "three";
import { renderer } from "../../core/Renderer";
import { queries } from "../World";

/**
 * Particle system managing ambient dust motes and jetpack thruster trails.
 */

// Ambient floating dust motes
let ambientDust: THREE.Points | null = null;
let dustPositions: Float32Array;
let dustVelocities: Float32Array;
let dustAlphas: Float32Array;
const DUST_COUNT = 300;
const DUST_SPREAD = 40;

// Backpack jetpack thrusters
let jetpackParticles: THREE.Points | null = null;
let jetpackPositions: Float32Array;
let jetpackVelocities: Float32Array;
let jetpackLifetimes: Float32Array;
const JETPACK_COUNT = 200;
let jetpackIndex = 0;

export function initParticleSystem() {
  // 1. Ambient floating dust setup
  const dustGeometry = new THREE.BufferGeometry();
  dustPositions = new Float32Array(DUST_COUNT * 3);
  dustVelocities = new Float32Array(DUST_COUNT * 3);
  dustAlphas = new Float32Array(DUST_COUNT);

  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * DUST_SPREAD;
    dustPositions[i * 3 + 1] = Math.random() * 15;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * DUST_SPREAD;

    dustVelocities[i * 3] = (Math.random() - 0.5) * 0.3;
    dustVelocities[i * 3 + 1] = Math.random() * 0.15 + 0.05;
    dustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;

    dustAlphas[i] = Math.random();
  }

  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("alpha", new THREE.BufferAttribute(dustAlphas, 1));

  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xccddff) },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      uniform float uTime;
      void main() {
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, 3.0 * (200.0 / -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float fade = smoothstep(0.5, 0.0, dist);
        gl_FragColor = vec4(uColor, vAlpha * fade * 0.4);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  ambientDust = new THREE.Points(dustGeometry, dustMaterial);
  ambientDust.frustumCulled = false;
  renderer.scene.add(ambientDust);

  // 2. Jetpack thruster trail setup
  const jetpackGeometry = new THREE.BufferGeometry();
  jetpackPositions = new Float32Array(JETPACK_COUNT * 3);
  jetpackVelocities = new Float32Array(JETPACK_COUNT * 3);
  jetpackLifetimes = new Float32Array(JETPACK_COUNT);

  for (let i = 0; i < JETPACK_COUNT; i++) {
    jetpackPositions[i * 3] = 0;
    jetpackPositions[i * 3 + 1] = 0;
    jetpackPositions[i * 3 + 2] = 0;
    jetpackLifetimes[i] = 0; // Starts dead
  }

  jetpackGeometry.setAttribute("position", new THREE.BufferAttribute(jetpackPositions, 3));
  jetpackGeometry.setAttribute("lifetime", new THREE.BufferAttribute(jetpackLifetimes, 1));

  const jetpackMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uStartColor: { value: new THREE.Color(0x00ffcc) }, // Bright cyan engine glow
      uEndColor: { value: new THREE.Color(0xff4411) },   // Warm orange/red smoke
    },
    vertexShader: `
      attribute float lifetime;
      varying float vLifetime;
      void main() {
        vLifetime = lifetime;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // Particles shrink as they decay
        gl_PointSize = max(1.0, (15.0 * lifetime) * (180.0 / -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uStartColor;
      uniform vec3 uEndColor;
      varying float vLifetime;
      void main() {
        if (vLifetime <= 0.0) discard;
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float fade = smoothstep(0.5, 0.0, dist);
        
        // Color transition based on lifetime
        vec3 color = mix(uEndColor, uStartColor, vLifetime);
        gl_FragColor = vec4(color, vLifetime * fade * 0.8);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  jetpackParticles = new THREE.Points(jetpackGeometry, jetpackMaterial);
  jetpackParticles.frustumCulled = false;
  renderer.scene.add(jetpackParticles);
}

export function updateParticleSystem(delta: number, elapsed: number) {
  // --- 1. Update Ambient Dust ---
  if (ambientDust) {
    let playerPos = new THREE.Vector3(0, 5, 0);
    if (queries.player.entities.length > 0) {
      playerPos = queries.player.entities[0].object3d.position.clone();
    }

    const posAttr = ambientDust.geometry.getAttribute("position") as THREE.BufferAttribute;
    const alphaAttr = ambientDust.geometry.getAttribute("alpha") as THREE.BufferAttribute;

    for (let i = 0; i < DUST_COUNT; i++) {
      dustPositions[i * 3] += dustVelocities[i * 3] * delta;
      dustPositions[i * 3 + 1] += dustVelocities[i * 3 + 1] * delta;
      dustPositions[i * 3 + 2] += dustVelocities[i * 3 + 2] * delta;

      const dx = dustPositions[i * 3] - playerPos.x;
      const dy = dustPositions[i * 3 + 1] - playerPos.y;
      const dz = dustPositions[i * 3 + 2] - playerPos.z;

      if (Math.abs(dx) > DUST_SPREAD / 2) {
        dustPositions[i * 3] = playerPos.x + (Math.random() - 0.5) * DUST_SPREAD;
        dustPositions[i * 3 + 1] = playerPos.y + Math.random() * 15;
        dustPositions[i * 3 + 2] = playerPos.z + (Math.random() - 0.5) * DUST_SPREAD;
      }
      if (Math.abs(dz) > DUST_SPREAD / 2) {
        dustPositions[i * 3] = playerPos.x + (Math.random() - 0.5) * DUST_SPREAD;
        dustPositions[i * 3 + 2] = playerPos.z + (Math.random() - 0.5) * DUST_SPREAD;
      }
      if (dy > 15) {
        dustPositions[i * 3 + 1] = playerPos.y + Math.random() * 2;
      }

      dustAlphas[i] = 0.3 + Math.sin(elapsed * 2 + i * 0.5) * 0.3;
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    (ambientDust.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
  }

  // --- 2. Update Jetpack Thrusters ---
  if (jetpackParticles) {
    const jetPosAttr = jetpackParticles.geometry.getAttribute("position") as THREE.BufferAttribute;
    const jetLifeAttr = jetpackParticles.geometry.getAttribute("lifetime") as THREE.BufferAttribute;

    // Age and move existing particles
    for (let i = 0; i < JETPACK_COUNT; i++) {
      if (jetpackLifetimes[i] > 0) {
        jetpackLifetimes[i] -= 2.2 * delta; // Decay lifetime
        if (jetpackLifetimes[i] < 0) jetpackLifetimes[i] = 0;

        jetpackPositions[i * 3] += jetpackVelocities[i * 3] * delta;
        jetpackPositions[i * 3 + 1] += jetpackVelocities[i * 3 + 1] * delta;
        jetpackPositions[i * 3 + 2] += jetpackVelocities[i * 3 + 2] * delta;
      }
    }

    // Spawn new particles if player is currently jetpacking
    const playerEntity = queries.player.entities[0];
    if (playerEntity && playerEntity.playerControl?.isJetpacking) {
      const playerObj = playerEntity.object3d;
      const normal = playerObj.position.clone().normalize();
      // Kinematic bodies report zero linvel — use the controller's velocity
      const velocity = playerEntity.playerControl.velocity;
      const velVec = new THREE.Vector3(velocity.x, velocity.y, velocity.z);

      // Locate dual backpack nozzles in world space
      const leftNozzle = new THREE.Vector3(-0.08, 0.4, -0.06).applyMatrix4(playerObj.matrixWorld);
      const rightNozzle = new THREE.Vector3(0.08, 0.4, -0.06).applyMatrix4(playerObj.matrixWorld);

      for (let t = 0; t < 2; t++) {
        const pos = t === 0 ? leftNozzle : rightNozzle;
        const idx = jetpackIndex;
        jetpackIndex = (jetpackIndex + 1) % JETPACK_COUNT;

        jetpackPositions[idx * 3] = pos.x;
        jetpackPositions[idx * 3 + 1] = pos.y;
        jetpackPositions[idx * 3 + 2] = pos.z;

        // Propel exhaust opposite to local surface normal (towards planet center) with some random spread
        const exhaustDir = normal.clone().negate();
        const spread = new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5
        );
        const pVelocity = exhaustDir.multiplyScalar(6.5).add(spread).add(velVec);

        jetpackVelocities[idx * 3] = pVelocity.x;
        jetpackVelocities[idx * 3 + 1] = pVelocity.y;
        jetpackVelocities[idx * 3 + 2] = pVelocity.z;

        jetpackLifetimes[idx] = 1.0;
      }
    }

    jetPosAttr.needsUpdate = true;
    jetLifeAttr.needsUpdate = true;
  }
}
