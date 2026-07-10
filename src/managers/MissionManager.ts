import * as THREE from "three";
import { events } from "../utils/EventBus";
import { gameState } from "../core/GameState";
import { queries } from "../ecs/World";
import { renderer } from "../core/Renderer";
import { audioManager } from "./AudioManager";
import {
  ACT_CARDS,
  BEACON_ORDER,
  BEACON_LOGS,
  CACHE_LOG,
  DATA_PADS,
  EVAC_SECONDS,
  WIN_LINES,
} from "../core/MissionData";
import { cachePosition } from "../ecs/factories/CacheFactory";

/**
 * The mission director: owns the three-act structure, the single active
 * objective, transmissions (story playback), the Act III storm/countdown,
 * and the end-of-run stats. Systems read `missionState` to know what the
 * player should be doing; the WaypointSystem asks `getMissionTarget()`
 * where to point.
 *
 *   Act I   — reach the Meridian supply cache (learn to navigate)
 *   Act II  — bring the three relay nodes online, in sequence
 *   Act III — storm breaks; reach the dropship before the countdown ends
 */

export const missionState = {
  /** -1 before the game starts; 0..2 = act index into ACT_CARDS. */
  actIndex: -1,
  /** Which beacon (BeaconFactory index) is the live objective. */
  currentBeaconIndex: BEACON_ORDER[0],
  beaconsOnline: 0,
  cacheFound: false,
  evacActive: false,
  evacRemaining: EVAC_SECONDS,
};

export interface MissionTarget {
  label: string;
  className: string;
  position: THREE.Vector3;
}

const _target: MissionTarget = {
  label: "",
  className: "",
  position: new THREE.Vector3(),
};

/** The single navigation target for the current act (null = no marker). */
export function getMissionTarget(): MissionTarget | null {
  switch (missionState.actIndex) {
    case 0: {
      if (missionState.cacheFound) return null;
      _target.label = "SUPPLY CACHE";
      _target.className = "waypoint-cache";
      _target.position.copy(cachePosition);
      return _target;
    }
    case 1: {
      for (const b of queries.beacons) {
        if (!b.object3d || !b.beacon || b.beacon.collected) continue;
        if (b.object3d.userData.index !== missionState.currentBeaconIndex) continue;
        _target.label = `RELAY ${missionState.beaconsOnline + 1}/3`;
        _target.className = "waypoint-beacon";
        _target.position.copy(b.object3d.position);
        return _target;
      }
      return null;
    }
    case 2: {
      const dropship = queries.dropships.first;
      if (!dropship?.object3d || dropship.dropship?.activated) return null;
      _target.label = "DROPSHIP";
      _target.className = "waypoint-extract";
      _target.position.copy(dropship.object3d.position);
      return _target;
    }
    default:
      return null;
  }
}

const EVAC_WARNINGS = [120, 60, 30, 10];
const BASE_FOG_DENSITY = 0.004;
const STORM_FOG_DENSITY = 0.012;
const BASE_FOG_COLOR = new THREE.Color(0x38203e); // dusty mauve (matches main.ts)
const STORM_FOG_COLOR = new THREE.Color(0x1d242c); // cold storm slate

class MissionManager {
  private objectivePanel!: HTMLElement;
  private objectiveAct!: HTMLElement;
  private objectiveText!: HTMLElement;
  private objectiveDist!: HTMLElement;

  private actCard!: HTMLElement;
  private actNum!: HTMLElement;
  private actTitle!: HTMLElement;
  private actSub!: HTMLElement;

  private txPanel!: HTMLElement;
  private txHeader!: HTMLElement;
  private txBody!: HTMLElement;
  private txQueue: { header: string; body: string }[] = [];
  private txVisible = false;

  private stats = { time: 0, distance: 0, o2Collected: 0, padsFound: 0 };
  private lastPos = new THREE.Vector3();
  private hasLastPos = false;
  private tick = 0;
  private warned = new Set<number>();
  private ended = false;

  constructor() {
    this.buildDOM();

    events.on("game:start", () => {
      // Let the landing settle before the first title card
      window.setTimeout(() => this.startAct(0), 1600);
    });

    events.on("beacon:collected", () => this.onBeaconOnline());

    events.on("datapad:collected", (loreIndex: number) => {
      this.stats.padsFound++;
      const pad = DATA_PADS[loreIndex];
      if (pad) this.queueTransmission(pad.header, pad.body);
    });

    events.on("pickup:collected", (amount: number) => {
      this.stats.o2Collected += amount;
    });

    events.on("mission:complete", () => this.onWin());
    events.on("game:over", () => {
      this.ended = true;
      this.objectivePanel.style.display = "none";
    });
  }

  /** Snapshot of the run stats (win screen + smoke test). */
  public getStats() {
    return { ...this.stats };
  }

  /** Fixed-tick update, called from the engine at 60Hz. */
  public update(dt: number) {
    if (this.ended || !gameState.isPlaying || missionState.actIndex < 0) return;

    const player = queries.player.first;
    if (!player?.object3d) return;
    const playerPos = player.object3d.position;

    // Run stats: sim time + honest ground distance (skip teleports/respawns)
    this.stats.time += dt;
    if (this.hasLastPos) {
      const step = this.lastPos.distanceTo(playerPos);
      if (step < 5) this.stats.distance += step;
    }
    this.lastPos.copy(playerPos);
    this.hasLastPos = true;

    // Act I: reach the supply cache
    if (missionState.actIndex === 0 && !missionState.cacheFound) {
      if (playerPos.distanceTo(cachePosition) < 5) {
        missionState.cacheFound = true;
        this.queueTransmission(CACHE_LOG.header, CACHE_LOG.body);
        const pc = player.playerControl;
        if (pc) {
          pc.oxygen = Math.min(pc.maxOxygen, pc.oxygen + 25);
          events.emit("player:oxygen:changed", pc.oxygen, pc.maxOxygen);
        }
        events.emit("log:message", "SUPPLY CACHE RECOVERED — O₂ +25%", "success");
        window.setTimeout(() => this.startAct(1), 2600);
      }
    }

    // Act III: storm wall + evacuation countdown
    if (missionState.actIndex === 2 && missionState.evacActive) {
      missionState.evacRemaining = Math.max(0, missionState.evacRemaining - dt);

      const progress = 1 - missionState.evacRemaining / EVAC_SECONDS;
      const fog = renderer.scene.fog as THREE.FogExp2 | null;
      if (fog) {
        fog.density = BASE_FOG_DENSITY + progress * (STORM_FOG_DENSITY - BASE_FOG_DENSITY);
        fog.color.copy(BASE_FOG_COLOR).lerp(STORM_FOG_COLOR, progress);
      }

      for (const w of EVAC_WARNINGS) {
        if (missionState.evacRemaining <= w && !this.warned.has(w)) {
          this.warned.add(w);
          events.emit("log:message", `STORM WALL: T-${w} SECONDS`, "danger");
          audioManager.playLowOxygenWarning();
        }
      }

      if (missionState.evacRemaining <= 0) {
        missionState.evacActive = false;
        events.emit("game:over", "THE STORM CLOSED IN");
        events.emit("log:message", "ATMOSPHERIC COLLAPSE — SUIT INTEGRITY LOST", "danger");
        return;
      }
    }

    // Throttled HUD refresh (~4Hz is plenty for a distance readout)
    if (++this.tick % 15 === 0) this.refreshObjectiveHUD(playerPos);
  }

  // --- Act flow ---

  private startAct(index: number) {
    missionState.actIndex = index;
    const card = ACT_CARDS[index];
    if (!card) return;

    this.actNum.textContent = card.num;
    this.actTitle.textContent = card.title;
    this.actSub.textContent = card.sub;
    this.actCard.classList.add("visible");
    window.setTimeout(() => this.actCard.classList.remove("visible"), 4200);
    audioManager.playUIClick();

    events.emit("log:message", `${card.num} — ${card.title}`, "warn");
    this.objectivePanel.style.display = "";
    this.updateObjectiveText();

    if (index === 2) {
      missionState.evacActive = true;
      this.objectivePanel.classList.add("objective-evac");
      events.emit("log:message", "STORM FRONT INBOUND — RETURN TO THE DROPSHIP", "danger");
      audioManager.playLowOxygenWarning();
    }
  }

  private onBeaconOnline() {
    // Safety: if the player somehow reaches a relay before the cache,
    // fold Act I silently and continue the chain.
    if (missionState.actIndex < 1) missionState.actIndex = 1;

    const legIndex = missionState.beaconsOnline;
    const log = BEACON_LOGS[legIndex];
    if (log) this.queueTransmission(log.header, log.body);

    missionState.beaconsOnline++;
    if (missionState.beaconsOnline < BEACON_ORDER.length) {
      missionState.currentBeaconIndex = BEACON_ORDER[missionState.beaconsOnline];
      this.updateObjectiveText();
      events.emit(
        "log:message",
        `NEXT RELAY NODE MARKED — ${missionState.beaconsOnline + 1}/3`,
        "warn",
      );
    } else {
      window.setTimeout(() => this.startAct(2), 3200);
    }
  }

  private onWin() {
    this.ended = true;
    this.objectivePanel.style.display = "none";

    const screen = document.getElementById("mission-complete-screen");
    const content = screen?.querySelector(".overlay-content");
    if (!content) return;

    const reason = content.querySelector(".overlay-reason");
    if (reason) reason.textContent = WIN_LINES[0];

    const mm = Math.floor(this.stats.time / 60);
    const ss = Math.floor(this.stats.time % 60).toString().padStart(2, "0");
    const statsDiv = document.createElement("div");
    statsDiv.className = "mission-stats";
    statsDiv.innerHTML = [
      `<div><span>SURFACE TIME</span><span>${mm}:${ss}</span></div>`,
      `<div><span>DISTANCE COVERED</span><span>${Math.round(this.stats.distance)}m</span></div>`,
      `<div><span>O₂ RECOVERED</span><span>${Math.round(this.stats.o2Collected)}%</span></div>`,
      `<div><span>MERIDIAN LOGS</span><span>${this.stats.padsFound}/${DATA_PADS.length}</span></div>`,
    ].join("");
    const prompt = content.querySelector(".overlay-prompt");
    content.insertBefore(statsDiv, prompt);

    const epitaph = document.createElement("p");
    epitaph.className = "mission-epitaph";
    epitaph.textContent = WIN_LINES[1];
    content.insertBefore(epitaph, prompt);
  }

  // --- HUD ---

  private updateObjectiveText() {
    const card = ACT_CARDS[missionState.actIndex];
    this.objectiveAct.textContent = card ? card.num : "";
    switch (missionState.actIndex) {
      case 0:
        this.objectiveText.textContent = "RECOVER THE MERIDIAN SUPPLY CACHE";
        break;
      case 1:
        this.objectiveText.textContent = `BRING RELAY NODE ${missionState.beaconsOnline + 1}/3 ONLINE`;
        break;
      case 2:
        this.objectiveText.textContent = "REACH THE DROPSHIP";
        break;
    }
  }

  private refreshObjectiveHUD(playerPos: THREE.Vector3) {
    const target = getMissionTarget();
    let line = target ? `${Math.round(playerPos.distanceTo(target.position))}m` : "";
    if (missionState.actIndex === 2 && missionState.evacActive) {
      const t = Math.ceil(missionState.evacRemaining);
      const mm = Math.floor(t / 60);
      const ss = (t % 60).toString().padStart(2, "0");
      line = `T-${mm}:${ss}${line ? " — " + line : ""}`;
    }
    this.objectiveDist.textContent = line;
  }

  // --- Transmissions (queued so logs never overwrite each other) ---

  private queueTransmission(header: string, body: string) {
    this.txQueue.push({ header, body });
    this.pumpTransmissions();
  }

  private pumpTransmissions() {
    if (this.txVisible) return;
    const tx = this.txQueue.shift();
    if (!tx) return;

    this.txVisible = true;
    this.txHeader.textContent = tx.header;
    this.txBody.textContent = tx.body;
    this.txPanel.classList.add("visible");
    audioManager.playUIClick();

    // Hold long enough to read, scaled by length
    const hold = Math.min(15000, 4500 + tx.body.length * 38);
    window.setTimeout(() => {
      this.txPanel.classList.remove("visible");
      window.setTimeout(() => {
        this.txVisible = false;
        this.pumpTransmissions();
      }, 700);
    }, hold);
  }

  private buildDOM() {
    // Objective panel — top center, inside the HUD so it fades in with it
    this.objectivePanel = document.createElement("div");
    this.objectivePanel.id = "objective-panel";
    this.objectivePanel.style.display = "none";
    this.objectiveAct = document.createElement("div");
    this.objectiveAct.className = "objective-act";
    this.objectiveText = document.createElement("div");
    this.objectiveText.className = "objective-text";
    this.objectiveDist = document.createElement("div");
    this.objectiveDist.className = "objective-dist";
    this.objectivePanel.append(this.objectiveAct, this.objectiveText, this.objectiveDist);
    document.getElementById("hud")?.appendChild(this.objectivePanel);

    // Act title card — full-screen flash on act transitions
    this.actCard = document.createElement("div");
    this.actCard.id = "act-card";
    this.actNum = document.createElement("div");
    this.actNum.className = "act-num";
    this.actTitle = document.createElement("div");
    this.actTitle.className = "act-title";
    this.actSub = document.createElement("div");
    this.actSub.className = "act-sub";
    this.actCard.append(this.actNum, this.actTitle, this.actSub);
    document.body.appendChild(this.actCard);

    // Transmission panel — bottom center, Meridian crew logs
    this.txPanel = document.createElement("div");
    this.txPanel.id = "transmission";
    this.txHeader = document.createElement("div");
    this.txHeader.className = "tx-header";
    this.txBody = document.createElement("div");
    this.txBody.className = "tx-body";
    this.txPanel.append(this.txHeader, this.txBody);
    document.body.appendChild(this.txPanel);
  }
}

export const missionManager = new MissionManager();

/** Engine hook: fixed-tick mission logic. */
export function updateMissionSystem(dt: number) {
  missionManager.update(dt);
}
