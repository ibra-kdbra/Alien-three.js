import * as THREE from "three";
import atmosphereVertex from "../shaders/atmosphere.vertex.glsl?raw";
import atmosphereFragment from "../shaders/atmosphere.fragment.glsl?raw";
import triplanarVertex from "../shaders/triplanar.vertex.glsl?raw";
import triplanarFragment from "../shaders/triplanar.fragment.glsl?raw";

export class Planet {
  mesh: THREE.Mesh;
  atmosphereMesh: THREE.Mesh;
  radius: number;

  constructor(radius: number, color: number, position: THREE.Vector3) {
    this.radius = radius;

    // Visuals
    const geometry = new THREE.SphereGeometry(radius, 128, 128); // Higher res for better cracks

    const material = new THREE.ShaderMaterial({
      vertexShader: triplanarVertex,
      fragmentShader: triplanarFragment,
      uniforms: {
        color1: { value: new THREE.Color(color) },
        color2: { value: new THREE.Color(color).addScalar(0.2) },
        scale: { value: 0.05 },
      },
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Atmosphere
    const atmosphereGeo = new THREE.SphereGeometry(radius * 1.1, 64, 64);
    const atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      uniforms: {
        glowColor: { value: new THREE.Color(color).addScalar(0.2) },
        coefficient: { value: 0.1 },
        power: { value: 2.0 },
      },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    this.atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    this.atmosphereMesh.position.copy(position);
  }
}
