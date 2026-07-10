import * as THREE from "three";

/**
 * Procedural canvas textures — every surface detail in the game is generated
 * here at boot, so there are zero texture downloads and the look stays fully
 * deterministic (seeded rand).
 *
 * Each maker returns { map, bump } sharing one canvas render: the color map
 * carries the design, the bump map (same image) gives cheap surface relief.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext("2d")!];
}

function toTextures(canvas: HTMLCanvasElement, bumpFrom?: HTMLCanvasElement) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(bumpFrom ?? canvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

/** Grease, dust streaks, and micro-scratches over any base. */
function weather(
  ctx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  amount = 60,
) {
  for (let i = 0; i < amount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 4 + rand() * 26;
    const dark = rand() > 0.45;
    ctx.strokeStyle = dark
      ? `rgba(0,0,0,${0.05 + rand() * 0.1})`
      : `rgba(255,255,255,${0.03 + rand() * 0.07})`;
    ctx.lineWidth = 0.5 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * len, y + (rand() - 0.5) * len);
    ctx.stroke();
  }
}

/** Ship hull: paneling, rivets, worn edges. */
export function hullTexture(base = "#8995a8") {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  const rand = mulberry32(101);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Panel grid with per-panel tone variance
  const cols = 4;
  const rows = 5;
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const w = size / cols;
      const h = size / rows;
      const tone = (rand() - 0.5) * 22;
      ctx.fillStyle = `rgba(${tone > 0 ? 255 : 0},${tone > 0 ? 255 : 0},${tone > 0 ? 255 : 0},${Math.abs(tone) / 255})`;
      ctx.fillRect(cx * w + 1, cy * h + 1, w - 2, h - 2);
      // Panel seam
      ctx.strokeStyle = "rgba(10,14,20,0.55)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx * w + 0.5, cy * h + 0.5, w - 1, h - 1);
      // Rivets in the corners
      ctx.fillStyle = "rgba(20,24,30,0.7)";
      for (const [rx, ry] of [
        [cx * w + 5, cy * h + 5],
        [cx * w + w - 5, cy * h + 5],
        [cx * w + 5, cy * h + h - 5],
        [cx * w + w - 5, cy * h + h - 5],
      ]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // A few hazard chevrons and a hull stencil
  ctx.fillStyle = "rgba(217,106,30,0.8)";
  ctx.fillRect(8, size - 26, 54, 10);
  ctx.fillStyle = "rgba(20,26,34,0.85)";
  ctx.font = "bold 13px monospace";
  ctx.fillText("AURA-9", 10, size - 32);

  weather(ctx, size, rand, 80);
  return toTextures(canvas);
}

/** Landing pad deck: concentric plates, radial seams, hazard ring. */
export function deckTexture() {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size);
  const rand = mulberry32(202);
  const c = size / 2;

  ctx.fillStyle = "#454d59";
  ctx.fillRect(0, 0, size, size);

  // Concentric plate rings
  for (let r = size / 2; r > 12; r -= 34) {
    ctx.strokeStyle = "rgba(15,19,26,0.6)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(${rand() > 0.5 ? 255 : 0},255,255,0.02)`;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Radial seams
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.strokeStyle = "rgba(15,19,26,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 30, c + Math.sin(a) * 30);
    ctx.lineTo(c + Math.cos(a) * (size / 2), c + Math.sin(a) * (size / 2));
    ctx.stroke();
  }

  // Hazard ring near the rim
  for (let i = 0; i < 32; i++) {
    if (i % 2) continue;
    const a0 = (i / 32) * Math.PI * 2;
    const a1 = ((i + 1) / 32) * Math.PI * 2;
    ctx.strokeStyle = "rgba(255,190,60,0.55)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.42, a0, a1);
    ctx.stroke();
  }

  // Center marking: landing cross
  ctx.strokeStyle = "rgba(0,255,204,0.5)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(c - 46, c);
  ctx.lineTo(c + 46, c);
  ctx.moveTo(c, c - 46);
  ctx.lineTo(c, c + 46);
  ctx.stroke();

  weather(ctx, size, rand, 140);
  return toTextures(canvas);
}

/** EVA suit fabric: woven micro-pattern with faint seams. */
export function suitTexture() {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size);
  const rand = mulberry32(303);

  ctx.fillStyle = "#d8d3c8";
  ctx.fillRect(0, 0, size, size);

  // Weave noise
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const v = (rand() - 0.5) * 14;
      ctx.fillStyle = `rgba(${v > 0 ? 255 : 40},${v > 0 ? 255 : 38},${v > 0 ? 250 : 34},${Math.abs(v) / 200})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  // Quilted seams
  ctx.strokeStyle = "rgba(120,112,100,0.35)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i * size) / 4);
    ctx.lineTo(size, (i * size) / 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((i * size) / 4, 0);
    ctx.lineTo((i * size) / 4, size);
    ctx.stroke();
  }
  return toTextures(canvas);
}

/** Supply crate: brushed metal, stencil, hazard stripe. */
export function crateTexture() {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  const rand = mulberry32(404);

  ctx.fillStyle = "#39404c";
  ctx.fillRect(0, 0, size, size);

  // Brushed metal streaks
  for (let i = 0; i < 160; i++) {
    const y = rand() * size;
    ctx.strokeStyle = `rgba(${rand() > 0.5 ? 255 : 0},255,255,${0.015 + rand() * 0.03})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rand() - 0.5) * 6);
    ctx.stroke();
  }

  // Hazard stripe band
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, size * 0.42, size, size * 0.16);
  ctx.clip();
  for (let x = -size; x < size * 2; x += 26) {
    ctx.fillStyle = "rgba(255,170,68,0.85)";
    ctx.beginPath();
    ctx.moveTo(x, size * 0.58);
    ctx.lineTo(x + 13, size * 0.42);
    ctx.lineTo(x + 26, size * 0.42);
    ctx.lineTo(x + 13, size * 0.58);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Stencils
  ctx.fillStyle = "rgba(220,228,236,0.8)";
  ctx.font = "bold 22px monospace";
  ctx.fillText("MERIDIAN", 16, 40);
  ctx.font = "bold 12px monospace";
  ctx.fillText("O₂ RESUPPLY // KEEP CLEAR", 16, 60);
  ctx.fillText("CACHE 07-A", 16, size - 18);

  weather(ctx, size, rand, 90);
  return toTextures(canvas);
}
