import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Planet } from "../entities/Planet";
import { RapierPhysicsWorld } from "../core/RapierPhysicsWorld";

export class EnvironmentSystem {
  private treeTrunkMesh!: THREE.InstancedMesh;
  private treeLeavesMesh!: THREE.InstancedMesh;
  private rockMesh!: THREE.InstancedMesh;
  private scene: THREE.Scene;
  private physicsWorld: RapierPhysicsWorld;

  constructor(scene: THREE.Scene, physicsWorld: RapierPhysicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.initInstancing();
  }

  private initInstancing() {
    // Crystal Spires (Jagged low-poly cylinders)
    const crystalGeo = new THREE.CylinderGeometry(0, 1.5, 1, 4); // Spiky pyramids
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa,
      emissive: 0x00ff66,
      emissiveIntensity: 2,
      transparent: true,
      opacity: 0.8,
      metalness: 1.0,
      roughness: 0.0,
    });
    this.treeTrunkMesh = new THREE.InstancedMesh(crystalGeo, crystalMat, 1000);
    this.treeTrunkMesh.castShadow = true;
    this.scene.add(this.treeTrunkMesh);

    // Extra Glow for Crystals (optional, using second instanced mesh)
    this.treeLeavesMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      crystalMat,
      1,
    ); // Dummy

    // Large Rocks (Boulders)
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 1.0,
      metalness: 0.0,
    });
    this.rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, 1000);
    this.rockMesh.castShadow = true;
    this.rockMesh.receiveShadow = true;
    this.scene.add(this.rockMesh);
  }

  public populatePlanet(planet: Planet, count: number) {
    const dummy = new THREE.Object3D();
    let treeCount = 0;
    let rockCount = 0;

    for (let i = 0; i < count; i++) {
      const isTree = Math.random() > 0.3;

      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const x = planet.radius * Math.sin(phi) * Math.cos(theta);
      const y = planet.radius * Math.sin(phi) * Math.sin(theta);
      const z = planet.radius * Math.cos(phi);
      const pos = new THREE.Vector3(x, y, z).add(planet.mesh.position);

      const up = pos.clone().sub(planet.mesh.position).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        up,
      );

      if (isTree && treeCount < 1000) {
        const height = 10 + Math.random() * 20;

        // Trunk Visuals
        dummy.position.copy(pos);
        dummy.quaternion.copy(q);
        dummy.scale.set(1, height, 1);
        dummy.updateMatrix();
        this.treeTrunkMesh.setMatrixAt(treeCount, dummy.matrix);

        // Leaves Visuals
        const leafPos = pos.clone().add(up.clone().multiplyScalar(height));
        dummy.position.copy(leafPos);
        dummy.scale.set(1, height, 1);
        dummy.updateMatrix();
        this.treeLeavesMesh.setMatrixAt(treeCount, dummy.matrix);

        // Physics: Static Body for Trunk
        const rbDesc = RAPIER.RigidBodyDesc.fixed()
          .setTranslation(pos.x, pos.y, pos.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        const rb = this.physicsWorld.world.createRigidBody(rbDesc);
        const clDesc = RAPIER.ColliderDesc.cylinder(height / 2, 0.5);
        // Center of cylinder is at rb position, so we need to offset it to match visual position
        // Visual trunk is from pos up to pos+height. Cylinder is centered.
        clDesc.setTranslation(0, height / 2, 0);
        this.physicsWorld.world.createCollider(clDesc, rb);

        treeCount++;
      } else if (!isTree && rockCount < 1000) {
        const scale = 2 + Math.random() * 5;

        // Rock Visuals
        dummy.position.copy(pos);
        dummy.quaternion.copy(q);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.rockMesh.setMatrixAt(rockCount, dummy.matrix);

        // Physics: Static Body for Rock
        const rbDesc = RAPIER.RigidBodyDesc.fixed()
          .setTranslation(pos.x, pos.y, pos.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        const rb = this.physicsWorld.world.createRigidBody(rbDesc);
        const clDesc = RAPIER.ColliderDesc.ball(scale);
        this.physicsWorld.world.createCollider(clDesc, rb);

        rockCount++;
      }
    }

    this.treeTrunkMesh.count = treeCount;
    this.treeLeavesMesh.count = treeCount;
    this.rockMesh.count = rockCount;

    this.treeTrunkMesh.instanceMatrix.needsUpdate = true;
    this.treeLeavesMesh.instanceMatrix.needsUpdate = true;
    this.rockMesh.instanceMatrix.needsUpdate = true;
  }
}
