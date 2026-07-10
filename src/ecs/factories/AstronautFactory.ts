import * as THREE from "three";
import { suitTexture } from "../../utils/ProceduralTexture";

/**
 * Procedural astronaut built from primitives, with a lightweight pose rig
 * driven directly from simulation state (no AnimationMixer, no clips).
 *
 * Conventions: the model faces -Z (visor side), backpack on +Z, and the root
 * origin is at the feet. The character controller places the container at the
 * capsule center, so the root sits at y = -0.8 inside it.
 */

export interface AstronautState {
  horizontalSpeed: number;
  verticalSpeed: number;
  grounded: boolean;
  isSprinting: boolean;
  isJetpacking: boolean;
  hasCutter: boolean;
  isAiming: boolean;
}

export interface AstronautRig {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  visorMat: THREE.MeshStandardMaterial;
  thrustLight: THREE.PointLight;
  nozzleL: THREE.Object3D;
  nozzleR: THREE.Object3D;
  cutter: THREE.Group;
  cutterTip: THREE.Object3D;
  walkPhase: number;
  idlePhase: number;
  lastStepSign: number;
}

const HIP_HEIGHT = 0.85;

export function createAstronaut(): { model: THREE.Group; rig: AstronautRig } {
  const suit = suitTexture();
  const suitMat = new THREE.MeshStandardMaterial({
    map: suit.map, // quilted off-white EVA fabric
    bumpMap: suit.bump,
    bumpScale: 0.006,
    roughness: 0.75,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xd96a1e, // hi-vis orange trim
    roughness: 0.6,
    metalness: 0.1,
  });
  const gearMat = new THREE.MeshStandardMaterial({
    color: 0x3d434d, // dark hardware: backpack, joints, boots
    roughness: 0.5,
    metalness: 0.55,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0c1a22,
    emissive: 0x2288cc,
    emissiveIntensity: 0.9,
    roughness: 0.05,
    metalness: 0.9,
  });

  const root = new THREE.Group();
  root.name = "Astronaut";

  // --- Legs (pivot at the hips so they swing) ---
  const legGeo = new THREE.CapsuleGeometry(0.105, 0.5, 4, 8);
  const bootGeo = new THREE.BoxGeometry(0.16, 0.12, 0.26);

  const makeLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(0.14 * side, HIP_HEIGHT, 0);

    const limb = new THREE.Mesh(legGeo, suitMat);
    limb.position.y = -0.4;
    limb.castShadow = true;
    leg.add(limb);

    const kneePad = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      accentMat,
    );
    kneePad.position.set(0, -0.42, -0.03);
    leg.add(kneePad);

    const boot = new THREE.Mesh(bootGeo, gearMat);
    boot.position.set(0, -0.79, -0.04);
    boot.castShadow = true;
    leg.add(boot);

    root.add(leg);
    return leg;
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // --- Torso (pivot at the hips so it leans/bobs) ---
  const torso = new THREE.Group();
  torso.position.y = HIP_HEIGHT;
  root.add(torso);

  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.3, 4, 12), suitMat);
  chest.position.y = 0.28;
  chest.scale.set(1.0, 1.0, 0.82);
  chest.castShadow = true;
  torso.add(chest);

  // Chest control panel with indicator lights
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.05), gearMat);
  panel.position.set(0, 0.32, -0.21);
  torso.add(panel);
  const lightGeo = new THREE.BoxGeometry(0.035, 0.035, 0.01);
  const lampColors = [0x00ff88, 0xffaa00, 0x44aaff];
  lampColors.forEach((c, i) => {
    const lamp = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: c }));
    lamp.position.set(-0.055 + i * 0.055, 0.33, -0.24);
    torso.add(lamp);
  });

  // Waist / utility belt
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.23, 0.1, 12),
    accentMat,
  );
  belt.position.y = 0.05;
  torso.add(belt);

  // --- Backpack + jetpack nozzles (on +Z, the back) ---
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.2), gearMat);
  pack.position.set(0, 0.3, 0.28);
  pack.castShadow = true;
  torso.add(pack);

  const tankGeo = new THREE.CapsuleGeometry(0.06, 0.3, 4, 8);
  const tankL = new THREE.Mesh(tankGeo, suitMat);
  tankL.position.set(-0.1, 0.32, 0.4);
  torso.add(tankL);
  const tankR = tankL.clone();
  tankR.position.x = 0.1;
  torso.add(tankR);

  const nozzleGeo = new THREE.CylinderGeometry(0.035, 0.055, 0.09, 8);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x222630,
    emissive: 0xff6622,
    emissiveIntensity: 0.0,
    roughness: 0.4,
    metalness: 0.7,
  });
  const nozzleL = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzleL.position.set(-0.1, 0.03, 0.32);
  torso.add(nozzleL);
  const nozzleR = nozzleL.clone();
  nozzleR.position.x = 0.1;
  torso.add(nozzleR);

  const thrustLight = new THREE.PointLight(0xff7733, 0, 5);
  thrustLight.position.set(0, -0.1, 0.35);
  torso.add(thrustLight);

  // --- Arms (pivot at the shoulders) ---
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.42, 4, 8);
  const makeArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(0.3 * side, 0.44, 0);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), accentMat);
    arm.add(shoulder);

    const limb = new THREE.Mesh(armGeo, suitMat);
    limb.position.y = -0.3;
    limb.castShadow = true;
    arm.add(limb);

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), gearMat);
    glove.position.y = -0.56;
    arm.add(glove);

    arm.rotation.z = -0.1 * side; // rest slightly away from the body
    torso.add(arm);
    return arm;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // --- Arc cutter (hidden until salvaged at the cache) ---
  // Built along the arm's -Y axis so raising the arm points it forward.
  const cutter = new THREE.Group();
  cutter.position.set(0, -0.6, 0);
  const cutterBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.22, 0.09),
    gearMat,
  );
  cutterBody.position.y = -0.06;
  cutter.add(cutterBody);
  const cutterGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.09, 0.06),
    accentMat,
  );
  cutterGrip.position.set(0, 0.02, 0.05);
  cutter.add(cutterGrip);
  const cutterEmitter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 0.14, 8),
    gearMat,
  );
  cutterEmitter.position.y = -0.22;
  cutter.add(cutterEmitter);
  const cutterTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x88ffee }),
  );
  cutterTip.position.y = -0.3;
  cutter.add(cutterTip);
  cutter.visible = false;
  rightArm.add(cutter);

  // --- Head (pivot at the neck) ---
  const head = new THREE.Group();
  head.position.y = 0.58;
  torso.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 16), suitMat);
  helmet.position.y = 0.08;
  helmet.castShadow = true;
  head.add(helmet);

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), visorMat);
  visor.position.set(0, 0.09, -0.07);
  visor.scale.set(1.0, 0.8, 0.75);
  head.add(visor);

  // Helmet lamp
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.04, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xfff2cc }),
  );
  lamp.position.set(0.13, 0.16, -0.1);
  head.add(lamp);

  const rig: AstronautRig = {
    root,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    visorMat,
    thrustLight,
    nozzleL,
    nozzleR,
    cutter,
    cutterTip,
    walkPhase: 0,
    idlePhase: 0,
    lastStepSign: 0,
  };

  return { model: root, rig };
}

// Damped approach toward a target angle, frame-rate independent.
function damp(current: number, target: number, rate: number, delta: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * delta));
}

/**
 * Drive the pose rig from simulation state. Call once per render frame.
 * Returns true on frames where a foot plants (for footstep SFX/dust).
 */
export function updateAstronautRig(
  rig: AstronautRig,
  state: AstronautState,
  delta: number,
): boolean {
  const { horizontalSpeed, verticalSpeed, grounded, isJetpacking } = state;
  rig.idlePhase += delta * 1.8;
  rig.cutter.visible = state.hasCutter;

  const moving = grounded && horizontalSpeed > 0.5;
  let footstep = false;

  // Pose targets
  let legSwingL = 0;
  let legSwingR = 0;
  let armSwingL = 0;
  let armSwingR = 0;
  let torsoLean = 0;
  let torsoBob = 0;
  let headTilt = 0;

  if (moving) {
    // Stride frequency scales with speed; amplitude eases toward a run pose
    rig.walkPhase += delta * (2.0 + horizontalSpeed * 1.35);
    const runFactor = THREE.MathUtils.clamp(horizontalSpeed / 12.0, 0.3, 1.0);
    const swing = 0.45 + runFactor * 0.35;

    const s = Math.sin(rig.walkPhase);
    legSwingL = s * swing;
    legSwingR = -s * swing;
    armSwingL = -s * swing * 0.75;
    armSwingR = s * swing * 0.75;
    torsoLean = -0.08 - runFactor * 0.14; // forward is -Z → negative X lean
    torsoBob = Math.abs(Math.cos(rig.walkPhase)) * 0.045 * runFactor;

    // A foot plants each time sin crosses zero (each half stride)
    const sign = Math.sign(s);
    if (sign !== 0 && rig.lastStepSign !== 0 && sign !== rig.lastStepSign) {
      footstep = true;
    }
    if (sign !== 0) rig.lastStepSign = sign;
  } else if (isJetpacking || (!grounded && verticalSpeed > 1.0)) {
    // Thrusting / rising: legs trail back, arms flare out
    legSwingL = 0.5;
    legSwingR = 0.35;
    armSwingL = 0.25;
    armSwingR = 0.25;
    torsoLean = -0.22;
    headTilt = 0.15;
  } else if (!grounded && verticalSpeed < -3.0) {
    // Falling: limbs spread, bracing
    legSwingL = -0.3;
    legSwingR = 0.25;
    armSwingL = -0.5;
    armSwingR = -0.5;
    torsoLean = 0.1;
    headTilt = -0.2;
  } else {
    // Idle: subtle breathing sway
    rig.walkPhase = 0;
    rig.lastStepSign = 0;
    const breathe = Math.sin(rig.idlePhase);
    torsoBob = breathe * 0.008;
    armSwingL = breathe * 0.03;
    armSwingR = breathe * 0.03;
    headTilt = Math.sin(rig.idlePhase * 0.6) * 0.05;
  }

  // Aiming overrides the right arm: raised, pointing where the camera looks
  if (state.isAiming && state.hasCutter) {
    armSwingR = 1.5;
  }

  // Damped application — poses blend instead of snapping
  const R = 12;
  const RArm = state.isAiming ? 22 : R; // aim snaps up fast
  rig.leftLeg.rotation.x = damp(rig.leftLeg.rotation.x, legSwingL, R, delta);
  rig.rightLeg.rotation.x = damp(rig.rightLeg.rotation.x, legSwingR, R, delta);
  rig.leftArm.rotation.x = damp(rig.leftArm.rotation.x, armSwingL, R, delta);
  rig.rightArm.rotation.x = damp(rig.rightArm.rotation.x, armSwingR, RArm, delta);
  rig.torso.rotation.x = damp(rig.torso.rotation.x, torsoLean, R, delta);
  rig.torso.position.y = damp(rig.torso.position.y, HIP_HEIGHT + torsoBob, R, delta);
  rig.head.rotation.x = damp(rig.head.rotation.x, headTilt, R, delta);

  // Jetpack glow: nozzles + light flare while thrusting
  const glowTarget = isJetpacking ? 1.0 : 0.0;
  rig.thrustLight.intensity = damp(rig.thrustLight.intensity, glowTarget * 5.0, 10, delta);
  const nozzleMat = (rig.nozzleL as THREE.Mesh).material as THREE.MeshStandardMaterial;
  nozzleMat.emissiveIntensity = damp(nozzleMat.emissiveIntensity, glowTarget * 3.0, 10, delta);

  return footstep;
}
