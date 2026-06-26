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
  
  // Multi-octave simplex noise for organic craters and hills adjusted for massive scale
  const f = 0.006;
  const n1 = noise3D(samplePos.x * f, samplePos.y * f, samplePos.z * f);
  const n2 = noise3D(samplePos.x * f * 2.5, samplePos.y * f * 2.5, samplePos.z * f * 2.5) * 0.4;
  const displacement = (n1 + n2) * 60.0; // 60 units of majestic mountain height
  
  return baseRadius + displacement;
}

export function createPlanet(
  position: { x: number; y: number; z: number },
  radius: number,
) {
  // 1. Create Procedural Mountain Geometry (Unified detail for visual & physics sync)
  const detail = 32;
  let geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry = mergeVertices(geometry) as THREE.IcosahedronGeometry;

  const posAttr = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.copy(vertex).normalize();

    // Use shared height function to deform geometry
    const height = getPlanetHeight(vertex, radius);
    vertex.copy(normal).multiplyScalar(height);
    
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
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
    shader.uniforms.uScale = { value: radius * 0.2 }; // Dynamic tiling based on planet radius (high density)

    // Inject varying declarations in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vCustomWorldPosition;
       varying vec3 vCustomWorldNormal;
       varying float vCustomRelativeHeight;`
    );

    // Calculate world normal in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       vCustomWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
    );

    // Calculate world position in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vCustomWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
       vCustomRelativeHeight = length(position) - 800.0;`
    );

    // Inject varying/uniform declarations in fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vCustomWorldPosition;
       varying vec3 vCustomWorldNormal;
       varying float vCustomRelativeHeight;
       uniform sampler2D uDiffuseMap;
       uniform float uScale;`
    );

    // Replace standard map sampling in fragment shader with triplanar diffuse + height color grading
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      // Calculate blending weights for triplanar mapping
      vec3 blending = abs(normalize(vCustomWorldNormal));
      blending = pow(blending, vec3(4.0));
      blending /= (blending.x + blending.y + blending.z);

      // Triplanar UVs
      vec2 xUV = vCustomWorldPosition.zy * uScale;
      vec2 yUV = vCustomWorldPosition.xz * uScale;
      vec2 zUV = vCustomWorldPosition.xy * uScale;

      // Sample textures
      vec4 texX = texture2D(uDiffuseMap, xUV);
      vec4 texY = texture2D(uDiffuseMap, yUV);
      vec4 texZ = texture2D(uDiffuseMap, zUV);

      vec4 triplanarDiffuse = texX * blending.x + texY * blending.y + texZ * blending.z;

      // Color grade based on height displacement for 800 radius
      float h = clamp((vCustomRelativeHeight + 15.0) / 75.0, 0.0, 1.0); 
      
      // Slope calculation
      float slope = 1.0 - max(0.0, dot(vCustomWorldNormal, normalize(vCustomWorldPosition)));
      
      vec3 valleyColor = vec3(0.25, 0.15, 0.18);
      vec3 flatColor   = vec3(0.55, 0.28, 0.18);
      vec3 peakColor   = vec3(0.85, 0.55, 0.35);
      vec3 cliffColor  = vec3(0.2, 0.18, 0.16); // Dark rocky cliffs
      
      vec3 heightGradColor = mix(valleyColor, flatColor, smoothstep(0.0, 0.4, h));
      heightGradColor = mix(heightGradColor, peakColor, smoothstep(0.6, 1.0, h));

      // Blend cliff color on steep slopes
      vec3 finalBaseColor = mix(heightGradColor, cliffColor, smoothstep(0.05, 0.35, slope));

      diffuseColor.rgb = finalBaseColor * triplanarDiffuse.rgb;
      `
    );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // 3. Atmosphere (Volumetric planetary rim for massive scale)
  const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.05, 64, 64);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x55bbff) }, // Slightly deeper sky blue
      coefficient: { value: 0.85 }, // Softer edge
      power: { value: 4.0 }, // Thicker volumetric haze
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

  // 4. Rapier Trimesh Physics (Using the exact same detail to guarantee collision alignment)
  const physicsDetail = detail;
  let physicsGeometry = new THREE.IcosahedronGeometry(radius, physicsDetail);
  physicsGeometry = mergeVertices(physicsGeometry) as THREE.IcosahedronGeometry;

  const physPosAttr = physicsGeometry.getAttribute("position");
  const physVertices = [];
  const tempVertex = new THREE.Vector3();
  const tempNormal = new THREE.Vector3();

  for (let i = 0; i < physPosAttr.count; i++) {
    tempVertex.fromBufferAttribute(physPosAttr, i);
    tempNormal.copy(tempVertex).normalize();

    // Use same shared height function to deform physics geometry
    const height = getPlanetHeight(tempVertex, radius);
    tempVertex.copy(tempNormal).multiplyScalar(height);
    physVertices.push(tempVertex.x, tempVertex.y, tempVertex.z);
  }

  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    position.x,
    position.y,
    position.z,
  );
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  const indices = new Uint32Array(physicsGeometry.getIndex()!.array);
  const floatVertices = new Float32Array(physVertices);
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
