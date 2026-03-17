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

export function createEnvironment(size: number) {
  // 1. Create Flat Terrain with gentle hills
  const detail = 100;
  let geometry = new THREE.PlaneGeometry(size, size, detail, detail);
  geometry.rotateX(-Math.PI / 2); // Lay flat on X/Z plane
  geometry = mergeVertices(geometry) as THREE.PlaneGeometry;

  const noise3D = createNoise3D();
  const posAttr = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const vertices = [];

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);

    // Multi-octave noise for gentle hills
    const f = 0.01;
    const n1 = noise3D(vertex.x * f, 0, vertex.z * f);
    const n2 = noise3D(vertex.x * f * 3, 0, vertex.z * f * 3) * 0.3;
    const height = (n1 + n2) * 8.0;

    posAttr.setY(i, height);
    vertices.push(vertex.x, height, vertex.z);
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
      uScale: { value: 0.4 }, // Increased for higher detail
      uColor: { value: new THREE.Color(0x885544) }, // Martian reddish tint
    },
  ]);

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: triplanarVertexShader,
    fragmentShader: triplanarFragmentShader,
    lights: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  renderer.scene.add(mesh);

  // 3. Rapier Trimesh Physics for the floor
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
