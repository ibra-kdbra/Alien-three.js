import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { assetManager } from "../../managers/AssetManager";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createNoise3D } from "simplex-noise";

import triplanarVertexShader from "../../shaders/triplanar.vertex.glsl?raw";
import triplanarFragmentShader from "../../shaders/triplanar.fragment.glsl?raw";

const noise3D = createNoise3D();

/**
 * Returns the terrain height at a given (x, z) coordinate.
 * Exported so beacons/hazards can place themselves on the terrain.
 */
export function getTerrainHeight(x: number, z: number): number {
  const f = 0.008;
  const n1 = noise3D(x * f, 0, z * f);
  const n2 = noise3D(x * f * 3, 0, z * f * 3) * 0.3;
  const n3 = noise3D(x * f * 6, 0, z * f * 6) * 0.1;
  return (n1 + n2 + n3) * 12.0;
}

export function createEnvironment(size: number) {
  // 1. Create Terrain with rolling hills
  const detail = 150; // Higher resolution for smoother terrain
  let geometry = new THREE.PlaneGeometry(size, size, detail, detail);
  geometry.rotateX(-Math.PI / 2); // Lay flat on X/Z plane
  geometry = mergeVertices(geometry) as THREE.PlaneGeometry;

  const posAttr = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const vertices = [];
  const colors: number[] = [];

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);

    const height = getTerrainHeight(vertex.x, vertex.z);
    posAttr.setY(i, height);
    vertices.push(vertex.x, height, vertex.z);

    // Height-based vertex coloring for visual variation
    const normalizedHeight = (height + 12) / 24; // Normalize to 0-1 range
    const lowColor = new THREE.Color(0x553322);   // Dark valleys
    const midColor = new THREE.Color(0x885544);   // Mid terrain
    const highColor = new THREE.Color(0xaa7755);  // Bright peaks

    const terrainColor = normalizedHeight < 0.5
      ? lowColor.clone().lerp(midColor, normalizedHeight * 2)
      : midColor.clone().lerp(highColor, (normalizedHeight - 0.5) * 2);

    colors.push(terrainColor.r, terrainColor.g, terrainColor.b);
  }

  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  geometry.computeVertexNormals();

  // 2. Setup PBR Triplanar Material
  const diffuseMap = assetManager.textures["terrain_diffuse"];
  const normalMap = assetManager.textures["terrain_normal"];
  const roughnessMap = assetManager.textures["terrain_roughness"];

  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib["common"],
    THREE.UniformsLib["lights"],
    {
      uDiffuseMap: { value: diffuseMap },
      uNormalMap: { value: normalMap },
      uRoughnessMap: { value: roughnessMap },
      uScale: { value: 0.3 },
      uColor: { value: new THREE.Color(0x885544) },
    },
  ]);

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: triplanarVertexShader,
    fragmentShader: triplanarFragmentShader,
    lights: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  renderer.scene.add(mesh);

  // 3. Add distant mountain ring for visual framing
  createMountainRing(size);

  // 4. Rapier Trimesh Physics for the floor
  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  const indices = new Uint32Array(geometry.getIndex()!.array);
  const floatVertices = new Float32Array(vertices);
  const colliderDesc = RAPIER.ColliderDesc.trimesh(floatVertices, indices);
  physicsManager.world.createCollider(colliderDesc, rigidBody);

  return world.add({
    name: "Ground",
    object3d: mesh,
    rigidBody,
  });
}

/**
 * Creates a ring of mountains at the edge of the map to visually close the world.
 */
function createMountainRing(mapSize: number) {
  const mountainCount = 40;
  const ringRadius = mapSize * 0.48;

  for (let i = 0; i < mountainCount; i++) {
    const angle = (i / mountainCount) * Math.PI * 2;
    const x = Math.cos(angle) * ringRadius + (Math.random() - 0.5) * 30;
    const z = Math.sin(angle) * ringRadius + (Math.random() - 0.5) * 30;
    const y = getTerrainHeight(x, z);

    const height = 15 + Math.random() * 25;
    const radius = 8 + Math.random() * 12;

    const geo = new THREE.ConeGeometry(radius, height, 6 + Math.floor(Math.random() * 3), 1);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.06, 0.3, 0.15 + Math.random() * 0.1),
      roughness: 1.0,
      metalness: 0.0,
      flatShading: true,
    });

    const mountain = new THREE.Mesh(geo, mat);
    mountain.position.set(x, y + height * 0.3, z);
    mountain.rotation.y = Math.random() * Math.PI;
    mountain.castShadow = true;
    mountain.receiveShadow = true;

    renderer.scene.add(mountain);
  }
}
