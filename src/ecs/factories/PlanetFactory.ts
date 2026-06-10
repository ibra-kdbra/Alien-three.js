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

const noise3D = createNoise3D();

/**
 * Calculates the exact surface distance from the center of the planet in a given 3D direction.
 * Reuses the same noise seed to ensure perfect synchronization between mesh, physics, and gameplay.
 */
export function getPlanetHeight(direction: THREE.Vector3, baseRadius = 120): number {
  const normDir = direction.clone().normalize();
  const samplePos = normDir.clone().multiplyScalar(baseRadius);
  
  // Multi-octave simplex noise for organic craters and hills
  const f = 0.04;
  const n1 = noise3D(samplePos.x * f, samplePos.y * f, samplePos.z * f);
  const n2 = noise3D(samplePos.x * f * 2, samplePos.y * f * 2, samplePos.z * f * 2) * 0.5;
  const displacement = (n1 + n2) * 5.0; // 5 units of mountain height
  
  return baseRadius + displacement;
}

export function createPlanet(
  position: { x: number; y: number; z: number },
  radius: number,
) {
  // 1. Create Procedural Mountain Geometry
  const detail = 50;
  let geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry = mergeVertices(geometry) as THREE.IcosahedronGeometry;

  const posAttr = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const vertices = [];

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.copy(vertex).normalize();

    // Use shared height function to deform geometry
    const height = getPlanetHeight(vertex, radius);
    vertex.copy(normal).multiplyScalar(height);
    
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    vertices.push(vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();

  // 2. Setup PBR Triplanar Material using MeshStandardMaterial + onBeforeCompile
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

  material.onBeforeCompile = (shader) => {
    // Add uniforms
    shader.uniforms.uDiffuseMap = { value: diffuseMap };
    shader.uniforms.uNormalMap = { value: normalMap };
    shader.uniforms.uRoughnessMap = { value: roughnessMap };
    shader.uniforms.uScale = { value: 0.5 }; // Increased tiling for spherical detail

    // Inject varying declarations in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPosition;
       varying vec3 vWorldNormal;`
    );

    // Calculate world normal in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
    );

    // Calculate world position in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;`
    );

    // Inject varying/uniform declarations in fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPosition;
       varying vec3 vWorldNormal;
       uniform sampler2D uDiffuseMap;
       uniform sampler2D uNormalMap;
       uniform sampler2D uRoughnessMap;
       uniform float uScale;`
    );

    // Replace standard map sampling in fragment shader with triplanar diffuse
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec3 blending = abs(normalize(vWorldNormal));
      blending = pow(blending, vec3(4.0));
      blending /= (blending.x + blending.y + blending.z);

      vec2 xUV = vWorldPosition.zy * uScale;
      vec2 yUV = vWorldPosition.xz * uScale;
      vec2 zUV = vWorldPosition.xy * uScale;

      vec4 texX = texture2D(uDiffuseMap, xUV);
      vec4 texY = texture2D(uDiffuseMap, yUV);
      vec4 texZ = texture2D(uDiffuseMap, zUV);

      vec4 triplanarDiffuse = texX * blending.x + texY * blending.y + texZ * blending.z;
      diffuseColor *= triplanarDiffuse;
      `
    );

    // Replace normal map sampling in fragment shader with triplanar normal mapping
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      vec4 normX = texture2D(uNormalMap, xUV);
      vec4 normY = texture2D(uNormalMap, yUV);
      vec4 normZ = texture2D(uNormalMap, zUV);

      vec3 blendedNormalTex = (normX.xyz * blending.x + normY.xyz * blending.y + normZ.xyz * blending.z) * 2.0 - 1.0;
      normal = normalize(normal + blendedNormalTex * 0.45);
      `
    );

    // Replace roughness map sampling in fragment shader with triplanar roughness mapping
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      float roughnessFactor = roughness;
      vec4 roughX = texture2D(uRoughnessMap, xUV);
      vec4 roughY = texture2D(uRoughnessMap, yUV);
      vec4 roughZ = texture2D(uRoughnessMap, zUV);
      float triplanarRoughness = (roughX.r * blending.x + roughY.r * blending.y + roughZ.r * blending.z);
      roughnessFactor *= triplanarRoughness;
      `
    );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // 3. Atmosphere (Thin realistic planetary rim)
  const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.05, 64, 64);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x66ccff) },
      coefficient: { value: 0.9 },
      power: { value: 6.0 },
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

  // 4. Rapier Trimesh Physics
  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    position.x,
    position.y,
    position.z,
  );
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  const indices = new Uint32Array(geometry.getIndex()!.array);
  const floatVertices = new Float32Array(vertices);
  const colliderDesc = RAPIER.ColliderDesc.trimesh(floatVertices, indices);
  const collider = physicsManager.world.createCollider(colliderDesc, rigidBody);

  return world.add({
    name: "Planet",
    isPlanet: true,
    object3d: mesh,
    rigidBody,
    collider,
  });
}
