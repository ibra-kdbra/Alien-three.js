import * as THREE from "three";
import { world } from "../World";
import { renderer } from "../../core/Renderer";
import { physicsManager } from "../../managers/PhysicsManager";
import { getPlanetHeight } from "./PlanetFactory";
import { hullTexture, deckTexture } from "../../utils/ProceduralTexture";
import RAPIER from "@dimforge/rapier3d-compat";

/**
 * Creates the Sci-Fi Landing Pad and the procedurally constructed Dropship at the North Pole.
 */
export function createLandingZone(planetRadius: number) {
  const spawnDir = new THREE.Vector3(0, 1, 0); // North Pole
  const height = getPlanetHeight(spawnDir, planetRadius);
  // Sink the pad slightly so its edge beds into the terrain undulation
  const position = spawnDir.clone().multiplyScalar(height - 0.3);

  const padGroup = new THREE.Group();
  padGroup.position.copy(position);

  // 1. Landing Pad Cylinder Mesh — deck plating on top, plain rim sides
  const padGeo = new THREE.CylinderGeometry(8.0, 8.5, 0.5, 32);
  const deck = deckTexture();
  const padTopMat = new THREE.MeshStandardMaterial({
    map: deck.map,
    bumpMap: deck.bump,
    bumpScale: 0.02,
    roughness: 0.7,
    metalness: 0.45,
  });
  const padSideMat = new THREE.MeshStandardMaterial({
    color: 0x39404a,
    roughness: 0.75,
    metalness: 0.5,
  });
  const padMesh = new THREE.Mesh(padGeo, [padSideMat, padTopMat, padSideMat]);
  padMesh.receiveShadow = true;
  padMesh.castShadow = true;
  padGroup.add(padMesh);

  // Neon glowing ring around the pad
  const ringGeo = new THREE.TorusGeometry(7.8, 0.08, 8, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    transparent: true,
    opacity: 0.6,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.26;
  padGroup.add(ring);

  // Landing lights around the pad rim — emissive only (no PointLights), so
  // the pad reads from any distance/side without lighting cost.
  const lampGeo = new THREE.SphereGeometry(0.14, 8, 8);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffcc55 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(Math.cos(angle) * 7.4, 0.32, Math.sin(angle) * 7.4);
    padGroup.add(lamp);
  }

  // 2. Procedural Dropship Model Group
  const shipGroup = new THREE.Group();
  shipGroup.position.y = 0.25; // Sits on top of the landing pad

  // Cabin — riveted hull plating
  const hull = hullTexture();
  const cabinGeo = new THREE.BoxGeometry(3.0, 2.0, 5.0);
  const cabinMat = new THREE.MeshStandardMaterial({
    map: hull.map,
    bumpMap: hull.bump,
    bumpScale: 0.015,
    roughness: 0.45,
    metalness: 0.7,
  });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.y = 1.0;
  cabin.castShadow = true;
  shipGroup.add(cabin);

  // Blue cockpit glass visor
  const visorGeo = new THREE.BoxGeometry(2.4, 0.8, 1.2);
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    emissive: 0x0055aa,
    roughness: 0.1,
    metalness: 0.9,
  });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.2, 2.0);
  visor.castShadow = true;
  shipGroup.add(visor);

  // Left & Right Wings — same plating, darker tint
  const wingGeo = new THREE.BoxGeometry(1.2, 0.6, 3.5);
  const wingMat = new THREE.MeshStandardMaterial({
    map: hull.map,
    bumpMap: hull.bump,
    bumpScale: 0.015,
    color: 0x9aa3b2,
    roughness: 0.5,
    metalness: 0.7,
  });
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.position.set(-2.0, 0.8, -0.5);
  leftWing.castShadow = true;
  shipGroup.add(leftWing);

  const rightWing = leftWing.clone();
  rightWing.position.x = 2.0;
  shipGroup.add(rightWing);

  // Left & Right Engine Boosters
  const engGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.2, 16);
  const engMat = new THREE.MeshStandardMaterial({
    color: 0x3d4652,
    roughness: 0.55,
    metalness: 0.85,
  });
  const leftEng = new THREE.Mesh(engGeo, engMat);
  leftEng.rotation.x = -Math.PI / 2;
  leftEng.position.set(-2.0, 0.8, -1.8);
  leftEng.castShadow = true;
  shipGroup.add(leftEng);

  const rightEng = leftEng.clone();
  rightEng.position.x = 2.0;
  shipGroup.add(rightEng);

  // Rocket Nozzles
  const nozzleGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.4, 16);
  const nozzleMat = new THREE.MeshBasicMaterial({
    color: 0x0f3b4c, // Dim blue at start (off)
  });
  const leftNozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
  leftNozzle.rotation.x = -Math.PI / 2;
  leftNozzle.position.set(-2.0, 0.8, -3.0);
  shipGroup.add(leftNozzle);

  const rightNozzle = leftNozzle.clone();
  rightNozzle.position.x = 2.0;
  shipGroup.add(rightNozzle);

  // Glowing Point Lights for engine exhaust (initially off)
  const leftLight = new THREE.PointLight(0x00ffcc, 0, 10);
  leftLight.position.set(-2.0, 0.8, -3.5);
  shipGroup.add(leftLight);

  const rightLight = leftLight.clone();
  rightLight.position.x = 2.0;
  shipGroup.add(rightLight);

  padGroup.add(shipGroup);
  renderer.scene.add(padGroup);

  // Store references in userData for animation / activation checks
  shipGroup.userData = {
    leftNozzle,
    rightNozzle,
    leftLight,
    rightLight,
  };

  // 3. Fixed physical collider for the landing pad
  const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    position.x,
    position.y,
    position.z,
  );
  const rigidBody = physicsManager.world.createRigidBody(rigidBodyDesc);

  const padIndices = new Uint32Array(padMesh.geometry.getIndex()!.array);
  const padVertices = new Float32Array(padMesh.geometry.getAttribute("position").array);
  const colliderDesc = RAPIER.ColliderDesc.trimesh(padVertices, padIndices);
  physicsManager.world.createCollider(colliderDesc, rigidBody);

  // Solid hull for the ship itself — without these the player wades straight
  // through the cabin. (Static; by the time the launch animation moves the
  // visual ship, the player has boarded and the run is over.)
  const shipY = 0.25; // shipGroup offset above the pad
  physicsManager.world.createCollider(
    RAPIER.ColliderDesc.cuboid(1.5, 1.0, 2.5).setTranslation(0, shipY + 1.0, 0),
    rigidBody,
  );
  physicsManager.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.6, 0.35, 1.9).setTranslation(-2.0, shipY + 0.8, -0.9),
    rigidBody,
  );
  physicsManager.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.6, 0.35, 1.9).setTranslation(2.0, shipY + 0.8, -0.9),
    rigidBody,
  );

  return world.add({
    name: "Dropship",
    isDropship: true,
    object3d: padGroup,
    rigidBody,
    dropship: {
      activated: false,
      extractionActive: false,
      landingPadPos: { x: position.x, y: position.y, z: position.z },
    },
  });
}
