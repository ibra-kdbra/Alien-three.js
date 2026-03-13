import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { assetManager } from "../../managers/AssetManager";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

import triplanarVertexShader from "../../shaders/triplanar.vertex.glsl?raw";
import triplanarFragmentShader from "../../shaders/triplanar.fragment.glsl?raw";
import atmosphereVertexShader from "../../shaders/atmosphere.vertex.glsl?raw";
import atmosphereFragmentShader from "../../shaders/atmosphere.fragment.glsl?raw";

import { createNoise3D } from "simplex-noise";

export function createPlanet(
  position: { x: number; y: number; z: number },
  radius: number,
) {
  // 1. Create Three.js Object
  // Use IcosahedronGeometry for even vertex distribution (perfect for spheres without pole pinching)
  const detail = 40; // High detail for mountains
  let geometry = new THREE.IcosahedronGeometry(radius, detail);

  // THREE.IcosahedronGeometry is non-indexed by default in recent Three.js versions.
  // Rapier's trimesh collider requires an indexed geometry. mergeVertices creates this index.
  geometry = mergeVertices(geometry) as THREE.IcosahedronGeometry;

  // Apply Procedural Noise to Geometry (Mountains and Craters)
  const noise3D = createNoise3D();
  const positionAttribute = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  // Create a parallel array to hold the heights for the physics collider
  const vertices = [];

  for (let i = 0; i < positionAttribute.count; i++) {
    vertex.fromBufferAttribute(positionAttribute, i);
    normal.copy(vertex).normalize();

    // Generate multi-octave noise
    const frequency = 0.05;
    const noiseVal1 = noise3D(
      vertex.x * frequency,
      vertex.y * frequency,
      vertex.z * frequency,
    );
    const noiseVal2 =
      noise3D(
        vertex.x * frequency * 2.5,
        vertex.y * frequency * 2.5,
        vertex.z * frequency * 2.5,
      ) * 0.5;
    const noiseVal = noiseVal1 + noiseVal2;

    // Apply amplitude
    const mountainHeight = 4.0;
    const displacement = noiseVal * mountainHeight;

    // Push vertex out/in along its normal
    vertex.addScaledVector(normal, displacement);

    // Write back to geometry
    positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);

    // Store for Rapier physics (we only need to store the unique, merged vertices)
    vertices.push(vertex.x, vertex.y, vertex.z);
  }

  // Recompute normals so lighting works correctly on the new mountains
  geometry.computeVertexNormals();

  const diffuseMap = assetManager.textures["terrain_diffuse"];
  const normalMap = assetManager.textures["terrain_normal"];
  const roughnessMap = assetManager.textures["terrain_roughness"];

  // Triplanar mapping removes the need for spherical UV wrapping, preventing pole stretching
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
      uScale: { value: 0.08 }, // Controls how large the texture appears
      uColor: { value: new THREE.Color(0x999999) },
    },
  ]);

  // Triplanar shader material
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: triplanarVertexShader,
    fragmentShader: triplanarFragmentShader,
    lights: true, // crucial for THREE.UniformsLib["lights"]
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);

  // Create an atmospheric glow sphere slightly larger than the planet
  const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.05, 64, 64);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x3388ff) },
      coefficient: { value: 0.8 },
      power: { value: 2.0 },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide, // Render on the back side for a halo effect
    transparent: true,
    depthWrite: false,
  });

  const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  mesh.add(atmosphereMesh);

  renderer.scene.add(mesh);

  // 2. Create Rapier Physics Body (Static)
  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    position.x,
    position.y,
    position.z,
  );
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  // Since we displaced the geometry into mountains, a simple ball collider won't work anymore.
  // We must use a Trimesh (a 1:1 map of our new mountain geometry) for accurate physical collisions.
  const indexArray = geometry.getIndex()?.array;
  if (!indexArray)
    throw new Error("Geometry has no index buffer even after mergeVertices!");

  const indices = new Uint32Array(indexArray);
  const floatVertices = new Float32Array(vertices);

  const colliderDesc = RAPIER.ColliderDesc.trimesh(floatVertices, indices);
  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  // 3. Register Entity in ECS
  const entity = world.add({
    name: "Planet",
    isPlanet: true,
    object3d: mesh,
    rigidBody,
    collider,
  });

  return entity;
}
