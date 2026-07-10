import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
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

/**
 * Terrain v2 — a sculpted place instead of uniform fractal noise.
 *
 * The surface is composed of purposeful regions:
 *  - PLAINS   — gentle dune swells covering most of the planet. Near-flat, so
 *               traversal is readable and the horizon shows real landmarks.
 *  - RANGES   — two ridged mountain arcs, masked by continent noise. These are
 *               the silhouettes you navigate by.
 *  - THE SCAR — a deep canyon basin carved around a fixed direction, with a
 *               raised rim. A destination, not decoration.
 *  - THE MESA — a flattened polar rise where the dropship landed.
 */

// Where the Scar basin is carved (unit direction from planet center).
export const SCAR_DIR = new THREE.Vector3(0.62, -0.15, 0.77).normalize();

// Mesh resolution: 20 * detail² triangles. 48 → ~46k triangles. The plains
// are smooth by design, so the density that 64 spent on noise bumps is free
// to give back; the same mesh doubles as the Rapier trimesh.
const MESH_DETAIL = 48;

// Maximum relative displacement (fraction of radius), used by shading.
const MAX_H = 0.09;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

interface TerrainSample {
  /** Relative height as a fraction of the base radius. */
  h: number;
  /** 0..1 mountain-range mask (continent band × ridge). */
  mount: number;
  /** 0..1 how deep inside the Scar basin this point is. */
  scar: number;
  /** 0..1 polar landing-mesa blend. */
  mesa: number;
}

/** All terrain layers for a unit direction. Single source of truth. */
function sampleTerrain(x: number, y: number, z: number): TerrainSample {
  // Plains: long-wavelength dune swells, ±0.9% of radius (±1.8m at R=200)
  const plains =
    noise3D(x * 2.0, y * 2.0, z * 2.0) * 0.6 +
    noise3D(x * 5.5, y * 5.5, z * 5.5) * 0.28 +
    noise3D(x * 14.0, y * 14.0, z * 14.0) * 0.12;
  let h = plains * 0.009;

  // Mountain arcs: sharp ridges confined to continent bands so they read as
  // two distinct ranges on the horizon instead of planet-wide roughness.
  const ridgeSample = noise3D(x * 3.0, y * 3.0, z * 3.0);
  const ridge = (1.0 - Math.abs(ridgeSample)) ** 2.4;
  const bandSample = noise3D(x * 1.15 + 7.1, y * 1.15 - 3.2, z * 1.15 + 1.8);
  const band = smoothstep(0.18, 0.75, bandSample);
  const mount = ridge * band;
  // Foothill lift makes ranges rise out of the plains instead of spiking up.
  h += mount * 0.075 + band * 0.012;

  // The Scar: a bowl carved around SCAR_DIR with a raised rim. Angular radius
  // ~12.6° (≈44m of surface), depth 4.5% of radius (9m), rim lift 1%.
  const scarDot = x * SCAR_DIR.x + y * SCAR_DIR.y + z * SCAR_DIR.z;
  const scar = smoothstep(0.976, 0.994, scarDot);
  const rim = smoothstep(0.968, 0.977, scarDot) * (1.0 - smoothstep(0.977, 0.986, scarDot));
  // The basin flattens whatever terrain it cuts through.
  h = h * (1.0 - scar * 0.85) - scar * 0.045 + rim * 0.01;

  // Polar mesa: blend everything toward a fixed gentle rise near the pole so
  // the landing pad sits on believable, flat ground.
  const mesa = smoothstep(0.985, 0.9965, y); // y == dot(dir, POLE) on unit sphere
  h = THREE.MathUtils.lerp(h, 0.008, mesa);

  return { h, mount, scar, mesa };
}

/**
 * Surface distance from the planet center in a given direction.
 * Sampled on the unit sphere so terrain shape is independent of radius;
 * shared by rendering, physics and entity placement so they always agree.
 */
export function getPlanetHeight(direction: THREE.Vector3, baseRadius: number): number {
  const len = direction.length();
  const s = sampleTerrain(direction.x / len, direction.y / len, direction.z / len);
  return baseRadius * (1 + s.h);
}

// --- Biome palette (vertex colors) -----------------------------------------
// Painted per-vertex instead of triplanar photo textures: art-directed color
// zones, zero texture fetches, and banding broken by a cheap fragment grain.
// Albedos are deliberately dark (~0.1–0.25): total scene illumination is
// ~1.9x, so anything brighter tone-maps to washed-out beige. These values
// land the lit ground at a saturated mid-tone.
const COL_PLAINS = new THREE.Color(0.25, 0.14, 0.13); // dusty mauve-rose
const COL_PLAINS_DARK = new THREE.Color(0.15, 0.09, 0.11); // mottled patches
const COL_ROCK = new THREE.Color(0.14, 0.095, 0.09); // range rock
const COL_PEAK = new THREE.Color(0.44, 0.36, 0.31); // pale ash caps
const COL_CLIFF = new THREE.Color(0.1, 0.075, 0.075); // steep faces
const COL_SCAR = new THREE.Color(0.1, 0.085, 0.16); // basin slate-violet
const COL_SCAR_FLOOR = new THREE.Color(0.07, 0.1, 0.12); // cold canyon floor
const COL_MESA = new THREE.Color(0.19, 0.14, 0.125); // landing mesa

export function createPlanet(
  position: { x: number; y: number; z: number },
  radius: number,
) {
  // 1. Procedural terrain geometry (single source of truth for visuals AND physics)
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, MESH_DETAIL);
  geometry = mergeVertices(geometry);

  const posAttr = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const dir = new THREE.Vector3();

  // Keep each vertex's terrain sample for the paint pass below.
  const samples: TerrainSample[] = new Array(posAttr.count);

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    dir.copy(vertex).normalize();
    const s = sampleTerrain(dir.x, dir.y, dir.z);
    samples[i] = s;
    vertex.copy(dir).multiplyScalar(radius * (1 + s.h));
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();

  // 2. Paint pass: biome color from height, slope and region masks.
  const normalAttr = geometry.getAttribute("normal");
  const colors = new Float32Array(posAttr.count * 3);
  const nrm = new THREE.Vector3();
  const col = new THREE.Color();
  const mottleNoise = (d: THREE.Vector3) =>
    noise3D(d.x * 4.3 + 11.7, d.y * 4.3 - 5.1, d.z * 4.3 + 2.9);

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    nrm.fromBufferAttribute(normalAttr, i);
    dir.copy(vertex).normalize();
    const s = samples[i];

    const slope = 1.0 - Math.max(0, nrm.dot(dir));
    const hNorm = THREE.MathUtils.clamp(s.h / MAX_H, -1, 1);

    // Plains base with large mottled patches so flat ground isn't one flat color
    const mottle = smoothstep(-0.2, 0.6, mottleNoise(dir));
    col.copy(COL_PLAINS).lerp(COL_PLAINS_DARK, mottle * 0.55);

    // Mountain rock takes over where ranges rise, snow caps above ~60% height
    col.lerp(COL_ROCK, smoothstep(0.1, 0.5, s.mount));
    col.lerp(COL_PEAK, smoothstep(0.55, 0.85, hNorm));

    // Steep faces read as bare cliff regardless of biome
    col.lerp(COL_CLIFF, smoothstep(0.18, 0.5, slope));

    // Scar basin: cold slate walls, darker floor at full depth
    col.lerp(COL_SCAR, s.scar * 0.9);
    col.lerp(COL_SCAR_FLOOR, smoothstep(0.75, 1.0, s.scar));

    // Landing mesa: clean, uniform ground around the pad
    col.lerp(COL_MESA, s.mesa * 0.8);

    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // 3. Material: vertex colors + a two-scale hash grain in the fragment shader
  // so the surface has texture at walking distance without any texture memory.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       varying vec3 vGrainPos;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vGrainPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       varying vec3 vGrainPos;
       float astraHash(vec3 p) {
         return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
       }`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       // Two grain scales: ~35cm speckle underfoot, ~1m patching at range.
       // Kept subtle — at higher amplitude the cells read as blocky artifacts
       // on steep faces.
       float g1 = astraHash(floor(vGrainPos * 3.0));
       float g2 = astraHash(floor(vGrainPos * 1.1) + 31.0);
       diffuseColor.rgb *= 0.95 + 0.06 * g1 + 0.03 * g2;`,
    );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.receiveShadow = true;
  // The planet never casts: feeding 46k triangles into the shadow map every
  // frame bought almost nothing visually (the sun frustum is a 50m box around
  // the player) and cost a full extra planet render.
  mesh.castShadow = false;

  // 4. Atmosphere shell. The player walks *inside* this shell, so the fresnel
  // coefficient stays low — at 0.85 it washed the whole screen in haze.
  const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.1, 48, 32);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x55bbff) },
      coefficient: { value: 0.55 },
      power: { value: 5.0 },
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

  // 5. Physics trimesh — built from the exact render geometry, so what you
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
