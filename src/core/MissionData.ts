import * as THREE from "three";

/**
 * All narrative and mission-structure content in one place.
 *
 * The story: three years ago the Meridian survey team went dark on this
 * planet. You are Relay Officer Vega — your dropship AURA lost its signal
 * array on descent, and the only way to call home is the Meridian's old
 * relay network. Each node you bring online plays back a piece of what
 * happened to them; the last one tells you why you need to leave.
 */

export interface ActCard {
  num: string;
  title: string;
  sub: string;
}

export const ACT_CARDS: ActCard[] = [
  { num: "ACT I", title: "SYSTEMS CHECK", sub: "The pad is stable. Nothing else is." },
  { num: "ACT II", title: "THE RELAY NETWORK", sub: "Three nodes. Three echoes of the Meridian crew." },
  { num: "ACT III", title: "EVACUATION", sub: "The sky is closing. Run." },
];

// Sequenced beacon order (indices into BEACON_DIRECTIONS): each leg is
// longer than the last — 230m, then 287m, then 353m of open ground.
export const BEACON_ORDER = [0, 2, 1];

/** Transmission played when each relay node (in BEACON_ORDER) comes online. */
export const BEACON_LOGS: { header: string; body: string }[] = [
  {
    header: "MERIDIAN LOG 114 — CARTOGRAPHER I. RENN",
    body: "“We mapped the ranges today. The dust here sings against the visor. Wind from the west every nineteen hours, regular as a heartbeat. It doesn't feel like weather. It feels like breathing.”",
  },
  {
    header: "MERIDIAN LOG 201 — DR. A. SOL",
    body: "“Renn hasn't reported in two cycles. The storms are getting closer together — eleven hours now. We found his rover at the rim of the canyon. Empty. His last waypoint points down, into the Scar.”",
  },
  {
    header: "MERIDIAN LOG 233 — CMDR. E. VASQUEZ",
    body: "“Last node. If anyone hears this: the cycle isn't nineteen hours anymore. It's NOW. We're going down into the Scar — the rock holds off the worst of it. If we don't come back up, the network stays dark. Whoever you are: bring it online. Then leave before the sky closes.”",
  },
];

/** Supply cache location & flavor (Act I objective). */
export const CACHE_DIR = new THREE.Vector3(0.14, 0.99, 0.04).normalize();
export const CACHE_LOG = {
  header: "SUPPLY CACHE — MERIDIAN MANIFEST",
  body: "O₂ cells, intact after three years. A note in grease pencil: “Whoever reads this — we staged oxygen at the relay nodes. Trust the network, not the open ground.” — Vasquez",
};

/** Data pads: optional lore scattered at landmarks. Small O₂ reward. */
export interface DataPad {
  dir: THREE.Vector3;
  header: string;
  body: string;
}

export const DATA_PADS: DataPad[] = [
  {
    // Plains, roughly on the Act II route to the first node
    dir: new THREE.Vector3(0.35, 0.62, 0.55).normalize(),
    header: "RENN — FIELD NOTE",
    body: "“The crystals cluster where the ground stays warm. Good landmarks after dark. Count them like streetlights.”",
  },
  {
    // Near a gas vent field
    dir: new THREE.Vector3(-0.52, 0.24, 0.5).normalize(),
    header: "DR. SOL — MEDICAL LOG",
    body: "“The vents burn the lungs even through filters. Green ground means walk AROUND, not through. I keep telling Renn this.”",
  },
  {
    // The Scar rim
    dir: new THREE.Vector3(0.66, -0.1, 0.75).normalize(),
    header: "RENN'S LAST WAYPOINT",
    body: "Coordinates only, pointing down into the basin. Scratched underneath, in different handwriting: “He said he heard it breathing.”",
  },
  {
    // The Scar floor
    dir: new THREE.Vector3(0.62, -0.15, 0.77).normalize(),
    header: "VASQUEZ — FINAL ENTRY",
    body: "“The storm passed over us like a tide. The Scar held. If you're standing here reading this, the network is yours now. Make it count.”",
  },
  {
    // Far plains, near the last relay leg
    dir: new THREE.Vector3(-0.55, -0.55, -0.63).normalize(),
    header: "MERIDIAN CREW ROSTER",
    body: "Four names. Three are crossed out in Vasquez's handwriting. The last one — her own — is underlined, with a single word after it: “走 — walking.”",
  },
];

/**
 * Act III: seconds (sim time) to reach the dropship once the storm breaks.
 * The final relay is ~374m of surface from the pad — ~55s walking, ~32s at a
 * sprint — so 180s is a real threat over rough ground without being cruel.
 */
export const EVAC_SECONDS = 180;

export const WIN_LINES = [
  "The relay network carries your voice off-world. Rescue is inbound.",
  "Somewhere below, the Scar keeps its dead — and the network carries their story home.",
];
