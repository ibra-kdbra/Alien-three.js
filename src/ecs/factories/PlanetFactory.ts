import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { assetManager } from "../../managers/AssetManager";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createNoise3D } from "simplex-noise";

import atmosphereVertexShader from "../../shaders/atmosphere.vertex.glsl?raw";
import atmosphereFragmentShader from "../../shaders/atmosphere.fragment.glsl?raw";

// Deterministic seed: the same planet generates on every load, so beacon
// routes, spawn safety and terrain tuning are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noise3D = createNoise3D(mulberry32(1337));

// Terrain shape: fraction of the planet radius the terrain can displace.
// Multi-octave amplitudes sum to ~1.47, so max displacement ≈ radius * 0.08.
const DISPLACEMENT_FRAC = 0.055;

// Mesh resolution: 20 * detail² triangles. 64 → ~82k triangles, facet edges
// of ~3.5m on a 200m-radius planet — smooth enough to walk on, cheap enough
// to use the very same mesh as the physics trimesh (perfect collision sync).
const MESH_DETAIL = 64;

/**
 * Surface distance from the planet center in a given direction.
 * Sampled on the unit sphere so terrain shape is independent of radius;
 * shared by rendering, physics and entity placement so they always agree.
 */
export function getPlanetHeight(direction: THREE.Vector3, baseRadius: number): number {
  const len = direction.length();
  const x = direction.x / len;
  const y = direction.y / len;
  const z = direction.z / len;

  // Octaves: continents → hills → surface detail
  const n1 = noise3D(x * 2.2, y * 2.2, z * 2.2);
  const n2 = noise3D(x * 6.5, y * 6.5, z * 6.5) * 0.35;
  const n3 = noise3D(x * 16.0, y * 16.0, z * 16.0) * 0.12;

  return baseRadius + (n1 + n2 + n3) * baseRadius * DISPLACEMENT_FRAC;
}

export function createPlanet(
  position: { x: number; y: number; z: number },
  radius: number,
) {
  // 1. Procedural terrain geometry (single source of truth for visuals AND physics)
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, MESH_DETAIL);
  geometry = mergeVertices(geometry);

  const posAttr = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.copy(vertex).normalize();
    const height = getPlanetHeight(vertex, radius);
    vertex.copy(normal).multiplyScalar(height);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();

  // 2. PBR triplanar material via MeshStandardMaterial + onBeforeCompile
  const diffuseMap = assetManager.textures["terrain_diffuse"];
  const normalMap = assetManager.textures["terrain_normal"];
  const roughnessMap = assetManager.textures["terrain_roughness"];

  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  const material = new THREE.MeshStandardMaterial({
    map: diffuseMap,
    normalMap: normalMap,
    roughnessMap: roughnessMap,
    color: new THREE.Color(0x885544), // Reddish Martian Soil
    roughness: 0.85,
    metalness: 0.05,
  });

  const maxDisplacement = radius * DISPLACEMENT_FRAC * 1.47;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDiffuseMap = { value: diffuseMap };
    shader.uniforms.uScale = { value: 0.25 }; // ~4m texture tiles in world space
    shader.uniforms.uPlanetRadius = { value: radius };
    shader.uniforms.uMaxDisp = { value: maxDisplacement };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uPlanetRadius;
       varying vec3 vCustomWorldPosition;
       varying vec3 vCustomWorldNormal;
       varying float vCustomRelativeHeight;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       vCustomWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vCustomWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
       vCustomRelativeHeight = length(position) - uPlanetRadius;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vCustomWorldPosition;
       varying vec3 vCustomWorldNormal;
       varying float vCustomRelativeHeight;
       uniform sampler2D uDiffuseMap;
       uniform float uScale;
       uniform float uMaxDisp;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      // Triplanar blending weights
      vec3 blending = abs(normalize(vCustomWorldNormal));
      blending = pow(blending, vec3(4.0));
      blending /= (blending.x + blending.y + blending.z);

      vec2 xUV = vCustomWorldPosition.zy * uScale;
      vec2 yUV = vCustomWorldPosition.xz * uScale;
      vec2 zUV = vCustomWorldPosition.xy * uScale;

      vec4 texX = texture2D(uDiffuseMap, xUV);
      vec4 texY = texture2D(uDiffuseMap, yUV);
      vec4 texZ = texture2D(uDiffuseMap, zUV);

      vec4 triplanarDiffuse = texX * blending.x + texY * blending.y + texZ * blending.z;

      // Height grading, normalized by the actual displacement range
      float h = clamp((vCustomRelativeHeight + uMaxDisp) / (2.0 * uMaxDisp), 0.0, 1.0);

      // Slope: deviation of the surface normal from the radial direction
      float slope = 1.0 - max(0.0, dot(vCustomWorldNormal, normalize(vCustomWorldPosition)));

      vec3 valleyColor = vec3(0.25, 0.15, 0.18);
      vec3 flatColor   = vec3(0.55, 0.28, 0.18);
      vec3 peakColor   = vec3(0.85, 0.55, 0.35);
      vec3 cliffColor  = vec3(0.2, 0.18, 0.16);

      vec3 heightGradColor = mix(valleyColor, flatColor, smoothstep(0.0, 0.4, h));
      heightGradColor = mix(heightGradColor, peakColor, smoothstep(0.6, 1.0, h));

      vec3 finalBaseColor = mix(heightGradColor, cliffColor, smoothstep(0.08, 0.4, slope));

      diffuseColor.rgb = finalBaseColor * triplanarDiffuse.rgb;
      `
    );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // 3. Atmosphere shell
  const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.08, 64, 64);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x55bbff) },
      coefficient: { value: 0.85 },
      power: { value: 4.0 },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  mesh.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial));

  renderer.scene.add(mesh);

  // 4. Physics trimesh — built from the exact render geometry, so what you
  // see is precisely what you collide with.
  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    position.x,
    position.y,
    position.z,
  );
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  const vertices = new Float32Array(posAttr.array);
  const indices = new Uint32Array(geometry.getIndex()!.array);
  const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  return world.add({
    name: "Planet",
    isPlanet: true,
    object3d: mesh,
    rigidBody,
    collider,
  });
}
