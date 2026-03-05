import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { InputManager } from "../core/InputManager";
import { RapierPhysicsWorld } from "../core/RapierPhysicsWorld";
import { ResourceManager } from "../core/ResourceManager";
import { Vehicle } from "./Vehicle";
import { OrbitCamera } from "../core/OrbitCamera";

export class PlayerController {
  mesh: THREE.Group;
  visuals: THREE.Group;
  body: RAPIER.RigidBody;
  camera: THREE.PerspectiveCamera;
  orbitCamera: OrbitCamera;
  input: InputManager;
  physicsWorld: RapierPhysicsWorld;

  // States
  currentVehicle: Vehicle | null = null;
  isGrounded: boolean = false;

  // Models
  astronautModel: THREE.Object3D;
  flashlight: THREE.SpotLight;

  // Constants
  readonly walkSpeed = 20;
  readonly runSpeed = 50;
  readonly jumpForce = 25;
  readonly airControl = 0.5;
  readonly maxVelocity = 15;

  constructor(
    scene: THREE.Scene,
    world: RapierPhysicsWorld,
    camera: THREE.PerspectiveCamera,
    input: InputManager,
  ) {
    this.physicsWorld = world;
    this.camera = camera;
    this.input = input;
    this.orbitCamera = new OrbitCamera(camera, input);

    this.mesh = new THREE.Group();
    scene.add(this.mesh);

    // Physics: Dynamic Body for natural feel
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 505, 0)
      .setLinearDamping(0.8)
      .setAngularDamping(1.0)
      .lockRotations(); // Lock rotation to handle manually

    this.body = world.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.4);
    world.world.createCollider(colliderDesc, this.body);

    // Visuals Setup
    this.visuals = new THREE.Group();
    this.mesh.add(this.visuals);

    this.astronautModel = this.createAstronautPlaceholder();
    this.visuals.add(this.astronautModel);

    // Flashlight
    this.flashlight = new THREE.SpotLight(
      0xffffff,
      10,
      100,
      Math.PI / 4,
      0.5,
      1,
    );
    this.flashlight.position.set(0, 1.5, 0);
    this.flashlight.target.position.set(0, 1.5, -5);
    this.mesh.add(this.flashlight);
    this.mesh.add(this.flashlight.target);

    this.loadModels();
  }

  createAstronautPlaceholder() {
    const group = new THREE.Group();

    // Body (Floating Capsule)
    const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.6, 16, 32);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.5,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0; // Float offset
    body.castShadow = true;
    group.add(body);

    // Eye Visor
    const visorGeo = new THREE.SphereGeometry(
      0.2,
      16,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.0,
      metalness: 1.0,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.1, 0.15);
    visor.rotation.x = Math.PI / 2;
    group.add(visor);

    // Blue Glow Ring
    const ringGeo = new THREE.TorusGeometry(0.31, 0.02, 16, 100);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 1.0;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    return group;
  }

  async loadModels() {
    const loader = ResourceManager.getInstance();
    try {
      const model = await loader.loadModel("/models/human.glb");
      this.visuals.remove(this.astronautModel);
      this.astronautModel = model;
      this.astronautModel.scale.set(0.6, 0.6, 0.6);
      this.visuals.add(this.astronautModel);
    } catch (e) {
      console.warn("Failed to load astronaut model, using placeholder.");
    }
  }

  update(dt: number) {
    // 0. Camera View Toggle
    if (this.input.isKeyPressed("KeyV")) {
      if (this.orbitCamera.targetDistance < 10) {
        this.orbitCamera.targetDistance = 15;
      } else if (this.orbitCamera.targetDistance < 20) {
        this.orbitCamera.targetDistance = 25;
      } else {
        this.orbitCamera.targetDistance = 6;
      }
    }

    if (this.currentVehicle) {
      this.updateInVehicle(dt);
      return;
    }

    // 1. Gravity & Ground Check
    const upVec = this.physicsWorld.applySphericalGravity(this.body, dt);
    this.checkGrounded(upVec);

    // 2. Movement Logic
    this.handleMovement(dt, upVec);

    // 3. Sync Visuals
    const translation = this.body.translation();
    this.mesh.position.set(translation.x, translation.y, translation.z);

    // 4. Update Camera
    this.orbitCamera.targetDistance = 8;
    this.orbitCamera.update(dt, this.mesh.position, upVec);
  }

  private checkGrounded(upVec: THREE.Vector3) {
    const rayStart = this.body.translation();
    const rayDir = upVec.clone().negate();
    const ray = new RAPIER.Ray(rayStart, {
      x: rayDir.x,
      y: rayDir.y,
      z: rayDir.z,
    });

    const hit = this.physicsWorld.world.castRay(
      ray,
      1.2,
      true,
      undefined,
      undefined,
      this.body.collider(0),
    );
    this.isGrounded = hit !== null;
  }

  private handleMovement(dt: number, upVec: THREE.Vector3) {
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    // Project camera directions onto tangent plane
    const forward = new THREE.Vector3()
      .crossVectors(upVec, new THREE.Vector3().crossVectors(camDir, upVec))
      .normalize();
    const right = new THREE.Vector3().crossVectors(forward, upVec).normalize();

    const moveDir = new THREE.Vector3(0, 0, 0);
    if (this.input.forward) moveDir.add(forward);
    if (this.input.backward) moveDir.sub(forward);
    if (this.input.right) moveDir.add(right);
    if (this.input.left) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();

      const isRunning = this.input.sprint;
      const currentSpeed = isRunning ? this.runSpeed : this.walkSpeed;

      // Use force instead of impulse for more stable dynamic movement
      const force = moveDir.multiplyScalar(
        currentSpeed * (this.isGrounded ? 50.0 : 10.0),
      );
      this.body.applyImpulse(
        { x: force.x * dt, y: force.y * dt, z: force.z * dt },
        true,
      );

      // Clamp Velocity (Horizontal only)
      const vel = this.body.linvel();
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      if (speed > this.maxVelocity) {
        const ratio = this.maxVelocity / speed;
        this.body.setLinvel(
          { x: vel.x * ratio, y: vel.y * ratio, z: vel.z * ratio },
          true,
        );
      }

      // Rotation
      const lookTarget = this.mesh.position.clone().add(moveDir);
      this.mesh.up.copy(upVec);
      this.mesh.lookAt(lookTarget);
    } else {
      this.mesh.up.copy(upVec);
    }

    // Jump
    if (this.input.jump && this.isGrounded) {
      const jumpImpulse = upVec.clone().multiplyScalar(this.jumpForce);
      this.body.applyImpulse(
        { x: jumpImpulse.x, y: jumpImpulse.y, z: jumpImpulse.z },
        true,
      );
      this.isGrounded = false;
    }
  }

  private updateInVehicle(dt: number) {
    if (!this.currentVehicle) return;

    this.currentVehicle.update(dt, this.input);

    const seatOffset = new THREE.Vector3(0, 0.5, 0);
    seatOffset.applyQuaternion(this.currentVehicle.mesh.quaternion);
    const seatPos = this.currentVehicle.mesh.position.clone().add(seatOffset);

    this.mesh.position.copy(seatPos);
    this.mesh.quaternion.copy(this.currentVehicle.mesh.quaternion);

    const upVec = this.physicsWorld.applySphericalGravity(
      this.currentVehicle.body,
      dt,
    );
    this.orbitCamera.targetDistance = 15;
    this.orbitCamera.update(dt, this.currentVehicle.mesh.position, upVec);
  }

  drive(vehicle: Vehicle) {
    this.currentVehicle = vehicle;
    this.currentVehicle.isOccupied = true;
    this.body.setEnabled(false);
    this.visuals.visible = false; // Hide astronaut while in vehicle (or place inside)
  }

  dismount() {
    if (!this.currentVehicle) return;
    this.currentVehicle.isOccupied = false;

    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(
      this.currentVehicle.mesh.quaternion,
    );
    const dismountPos = this.currentVehicle.mesh.position
      .clone()
      .add(upVec.multiplyScalar(3));

    this.body.setEnabled(true);
    this.body.setTranslation(
      { x: dismountPos.x, y: dismountPos.y, z: dismountPos.z },
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);

    this.visuals.visible = true;
    this.currentVehicle = null;
  }
}
