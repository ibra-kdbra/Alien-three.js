import * as THREE from "three";
import { renderer } from "../../core/Renderer";
import { queries } from "../World";

/**
 * Simple GPU particle system using THREE.Points.
 * Manages ambient dust motes floating in the air around the player.
 */

let ambientDust: THREE.Points | null = null;
let dustPositions: Float32Array;
let dustVelocities: Float32Array;
let dustAlphas: Float32Array;
const DUST_COUNT = 300;
const DUST_SPREAD = 40;

export function initParticleSystem() {
  // Ambient floating dust motes
  const geometry = new THREE.BufferGeometry();
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

  geometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  geometry.setAttribute("alpha", new THREE.BufferAttribute(dustAlphas, 1));

  const material = new THREE.ShaderMaterial({
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

  ambientDust = new THREE.Points(geometry, material);
  ambientDust.frustumCulled = false;
  renderer.scene.add(ambientDust);
}

export function updateParticleSystem(delta: number, elapsed: number) {
  if (!ambientDust) return;

  // Get player position to center dust around them
  let playerPos = new THREE.Vector3(0, 5, 0);
  if (queries.player.entities.length > 0) {
    playerPos = queries.player.entities[0].object3d.position.clone();
  }

  const posAttr = ambientDust.geometry.getAttribute("position") as THREE.BufferAttribute;
  const alphaAttr = ambientDust.geometry.getAttribute("alpha") as THREE.BufferAttribute;

  for (let i = 0; i < DUST_COUNT; i++) {
    // Move particles
    dustPositions[i * 3] += dustVelocities[i * 3] * delta;
    dustPositions[i * 3 + 1] += dustVelocities[i * 3 + 1] * delta;
    dustPositions[i * 3 + 2] += dustVelocities[i * 3 + 2] * delta;

    // Wrap around player position
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

    // Shimmer alpha
    dustAlphas[i] = 0.3 + Math.sin(elapsed * 2 + i * 0.5) * 0.3;
  }

  posAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;

  // Update time uniform
  (ambientDust.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
}
