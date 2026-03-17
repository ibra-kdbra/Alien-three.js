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
import atmosphereVertexShader from "../../shaders/atmosphere.vertex.glsl?raw";
import atmosphereFragmentShader from "../../shaders/atmosphere.fragment.glsl?raw";

export function createPlanet(
  position: { x: number; y: number; z: number },
  radius: number,
) {
  // 1. Create Procedural Mountain Geometry
  const detail = 50;
  let geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry = mergeVertices(geometry) as THREE.IcosahedronGeometry;

  const noise3D = createNoise3D();
  const posAttr = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const vertices = [];

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    normal.copy(vertex).normalize();

    // Multi-octave noise for realistic terrain
    const f = 0.04;
    const n1 = noise3D(vertex.x * f, vertex.y * f, vertex.z * f);
    const n2 =
      noise3D(vertex.x * f * 2, vertex.y * f * 2, vertex.z * f * 2) * 0.5;
    const displacement = (n1 + n2) * 5.0; // 5 units of mountain height

    vertex.addScaledVector(normal, displacement);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    vertices.push(vertex.x, vertex.y, vertex.z);
  }
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
      uScale: { value: 0.5 }, // Increased tiling for fine terrain detail
      uColor: { value: new THREE.Color(0x885544) }, // Reddish Martian Soil
    },
  ]);

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: triplanarVertexShader,
    fragmentShader: triplanarFragmentShader,
    lights: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);

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
