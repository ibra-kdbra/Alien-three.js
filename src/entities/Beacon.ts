import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { RapierPhysicsWorld } from "../core/RapierPhysicsWorld";

export class Beacon {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  isCollected: boolean = false;

  constructor(world: RapierPhysicsWorld, position: THREE.Vector3) {
    this.mesh = new THREE.Group();

    // Visuals: Sci-Fi Crate
    const boxGeo = new THREE.BoxGeometry(2, 1, 4);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x2244aa,
      metalness: 0.8,
      roughness: 0.2,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 0.5;
    box.castShadow = true;
    this.mesh.add(box);

    // Glowing Panels
    const panelGeo = new THREE.PlaneGeometry(1.5, 0.5);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 5,
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 1.01, 0);
    panel.rotation.x = -Math.PI / 2;
    this.mesh.add(panel);

    this.mesh.position.copy(position);

    // Physics: Static sensor
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    this.body = world.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 2.5, 0.5).setSensor(
      true,
    );
    world.world.createCollider(colliderDesc, this.body);
  }

  update(dt: number) {
    // Pulse light
    const light = this.mesh.children[1] as THREE.Mesh;
    const mat = light.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 2 + Math.sin(Date.now() * 0.005) * 2;
  }
}
