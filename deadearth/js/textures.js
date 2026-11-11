// Procedural PBR texture sets (albedo + normal + roughness), generated once at
// startup. Everything tiles seamlessly. No external image files needed.
import * as THREE from "three";
import { mulberry32 } from "./utils.js";

const SIZE = 512;

/* ---------- tileable noise fields ---------- */
function latticeOctave(out, size, cx, cy, amp, rnd) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cy, yi = Math.floor(fy), ty = fy - yi;
    const sy = ty * ty * (3 - 2 * ty);
    const y0 = (yi % cy) * cx, y1 = ((yi + 1) % cy) * cx;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cx, xi = Math.floor(fx), tx = fx - xi;
      const sx = tx * tx * (3 - 2 * tx);
      const x0 = xi % cx, x1 = (xi + 1) % cx;
      const a = g[y0 + x0], b = g[y0 + x1], c = g[y1 + x0], d = g[y1 + x1];
      out[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
    }
  }
}
function field(size, cells, oct, seed, gain = 0.5, cellsY = cells) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0, cx = cells, cy = cellsY;
  for (let o = 0; o < oct; o++) {
    latticeOctave(out, size, Math.max(1, Math.round(cx)), Math.max(1, Math.round(cy)), amp, rnd);
    norm += amp; amp *= gain; cx *= 2; cy *= 2;
    if (cx > size / 2 || cy > size / 2) break;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
// Tileable Worley noise: returns F1, F2 and cell id per pixel.
function voronoi(size, cells, seed, jitter = 0.9) {
  const rnd = mulberry32(seed);
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells), id = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) { px[i] = 0.5 + (rnd() - 0.5) * jitter; py[i] = 0.5 + (rnd() - 0.5) * jitter; id[i] = rnd(); }
  const F1 = new Float32Array(size * size), F2 = new Float32Array(size * size), ID = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells, cyI = Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, cxI = Math.floor(fx);
      let d1 = 9, d2 = 9, best = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cxI + i, gy = cyI + j;
        const wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells;
        const k = wy * cells + wx;
        const dx = gx + px[k] - fx, dy = gy + py[k] - fy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = id[k]; } else if (d < d2) d2 = d;
      }
      const o = y * size + x;
      F1[o] = d1; F2[o] = d2; ID[o] = best;
    }
  }
  return { F1, F2, ID };
}

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- texture packing ---------- */
function dataTex(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function normalFromHeight(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
    const yu = h[((y - 1 + size) % size) * size + x], yd = h[((y + 1) % size) * size + x];
    let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * size + x) * 4;
    out[o] = (nx * 0.5 + 0.5) * 255; out[o + 1] = (ny * 0.5 + 0.5) * 255; out[o + 2] = (nz * 0.5 + 0.5) * 255; out[o + 3] = 255;
  }
  return out;
}
// build set from per-pixel callback returning [r,g,b,rough,height]
function makeSet(size, fn, normalStrength = 4) {
  const col = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  const px = [0, 0, 0, 0, 0];
  for (let i = 0; i < size * size; i++) {
    fn(i, px);
    const o = i * 4;
    col[o] = Math.min(255, Math.max(0, px[0] * 255));
    col[o + 1] = Math.min(255, Math.max(0, px[1] * 255));
    col[o + 2] = Math.min(255, Math.max(0, px[2] * 255));
    col[o + 3] = 255;
    const r = Math.min(255, Math.max(0, px[3] * 255));
    rough[o] = r; rough[o + 1] = r; rough[o + 2] = r; rough[o + 3] = 255;
    h[i] = px[4];
  }
  return {
    map: dataTex(col, size, true),
    roughnessMap: dataTex(rough, size, false),
    normalMap: dataTex(normalFromHeight(h, size, normalStrength * size / 512), size, false),
  };
}

/* ---------- recipes ---------- */
function concrete(seed, { floor = false } = {}) {
  const S = SIZE;
  const base = field(S, 4, 7, seed);
  const pores = field(S, 96, 2, seed + 1);
  const stain = field(S, 3, 4, seed + 2);
  const streak = field(S, 24, 3, seed + 3, 0.5, 2);
  const scuff = field(S, 12, 4, seed + 4);
  const vor = voronoi(S, 5, seed + 5);
  return makeSet(S, (i, o) => {
    const x = i % S, y = (i / S) | 0;
    let g = 0.52 + (base[i] - 0.5) * 0.22;
    const st = sm(0.55, 0.78, stain[i]);
    g -= st * 0.14;
    let h = base[i] * 0.6;
    const p = pores[i] < 0.2 ? (0.2 - pores[i]) * 3 : 0;
    g -= p * 0.25; h -= p * 0.6;
    // hairline cracks
    const crack = sm(floor ? 0.012 : 0.03, 0.0, vor.F2[i] - vor.F1[i]) * sm(0.45, 0.65, stain[i]) * (floor ? 0.4 : 1);
    g -= crack * 0.2; h -= crack * 0.5;
    let r = 0.88 - st * 0.1 + (base[i] - 0.5) * 0.1;
    if (!floor) {
      const s = sm(0.6, 0.85, streak[i]) * 0.08; // vertical water streaks
      g -= s;
    } else {
      // expansion joint along the tile border + polished, scuffed surface
      const ex = Math.min(x, S - 1 - x), ey = Math.min(y, S - 1 - y);
      const joint = Math.min(ex, ey) < 3 ? 1 : 0;
      g -= joint * 0.25; h -= joint * 1.5;
      r = 0.55 + (scuff[i] - 0.5) * 0.5 + st * 0.1 + joint * 0.3;
    }
    o[0] = g * 1.0; o[1] = g * 0.98; o[2] = g * 0.94 - st * 0.02; o[3] = r; o[4] = h;
  }, floor ? 2.5 : 4);
}

function crackedEarth(seed) {
  const S = SIZE;
  const v = voronoi(S, 9, seed);
  const v2 = voronoi(S, 26, seed + 7);
  const n = field(S, 8, 6, seed + 1);
  const dust = field(S, 64, 2, seed + 2);
  return makeSet(S, (i, o) => {
    const e = v.F2[i] - v.F1[i];
    const e2 = v2.F2[i] - v2.F1[i];
    const crack = sm(0.06, 0.0, e);
    const small = sm(0.035, 0.0, e2) * 0.6 * (1 - crack);
    const plate = sm(0.0, 0.35, e);
    const tint = (v.ID[i] - 0.5) * 0.08;
    let r = 0.52 + tint + (n[i] - 0.5) * 0.18, g = 0.45 + tint * 0.8 + (n[i] - 0.5) * 0.14, b = 0.38 + tint * 0.6 + (n[i] - 0.5) * 0.1;
    const d = (dust[i] - 0.5) * 0.08;
    r += d; g += d; b += d;
    const dark = crack * 0.75 + small * 0.35;
    r = r * (1 - dark) + 0.08 * dark; g = g * (1 - dark) + 0.06 * dark; b = b * (1 - dark) + 0.045 * dark;
    o[0] = r; o[1] = g; o[2] = b; o[3] = 0.96 - plate * 0.05;
    o[4] = plate * 1.2 - crack * 2.5 - small * 0.8 + n[i] * 0.4 + dust[i] * 0.15;
  }, 5);
}

function rock(seed) {
  const S = SIZE;
  const n = field(S, 6, 7, seed);
  const m = field(S, 32, 3, seed + 1);
  const strata = field(S, 2, 4, seed + 2, 0.5, 2);
  return makeSet(S, (i, o) => {
    const y = (i / S) | 0;
    const st = Math.sin((y / S) * Math.PI * 2 * 14 + strata[i] * 9) * 0.5 + 0.5;
    const g = 0.36 + (n[i] - 0.5) * 0.3 + st * 0.06 + (m[i] - 0.5) * 0.08;
    o[0] = g * 1.08; o[1] = g * 0.98; o[2] = g * 0.88; o[3] = 0.9; o[4] = n[i] + st * 0.25 + m[i] * 0.3;
  }, 6);
}

function rustPaint(seed, paint = [0.5, 0.5, 0.5], rustAmt = 0.5) {
  const S = SIZE;
  const n = field(S, 5, 7, seed);
  const pit = field(S, 80, 2, seed + 1);
  const drip = field(S, 30, 4, seed + 2, 0.5, 3);
  return makeSet(S, (i, o) => {
    const mask = sm(0.62 - rustAmt * 0.3, 0.68 - rustAmt * 0.3, n[i] * 0.8 + drip[i] * 0.3);
    const fade = 0.75 + n[i] * 0.3;
    const rr = 0.42 + (pit[i] - 0.5) * 0.25, rg = 0.21 + (pit[i] - 0.5) * 0.12, rb = 0.1;
    o[0] = paint[0] * fade * (1 - mask) + rr * mask;
    o[1] = paint[1] * fade * (1 - mask) + rg * mask;
    o[2] = paint[2] * fade * (1 - mask) + rb * mask;
    o[3] = 0.5 * (1 - mask) + 0.95 * mask;
    o[4] = mask * 0.6 + pit[i] * mask * 0.8 - mask * 0.2;
  }, 3);
}

function gunmetal(seed, base = 0.11) {
  const S = SIZE;
  const brushed = field(S, 2, 6, seed, 0.6, 96);
  const wear = field(S, 6, 5, seed + 1);
  const fine = field(S, 128, 2, seed + 2);
  return makeSet(S, (i, o) => {
    const w = sm(0.68, 0.8, wear[i]);
    const g = base + (brushed[i] - 0.5) * 0.04 + w * 0.12 + (fine[i] - 0.5) * 0.02;
    o[0] = g; o[1] = g * 1.01; o[2] = g * 1.04; o[3] = 0.36 + (brushed[i] - 0.5) * 0.12 - w * 0.12; o[4] = brushed[i] * 0.2 + fine[i] * 0.1;
  }, 1.5);
}

function polymer(seed) {
  const S = SIZE;
  const stip = field(S, 160, 2, seed);
  const n = field(S, 6, 4, seed + 1);
  return makeSet(S, (i, o) => {
    const g = 0.07 + (n[i] - 0.5) * 0.02 + (stip[i] - 0.5) * 0.015;
    o[0] = g; o[1] = g; o[2] = g * 1.05; o[3] = 0.62 + (stip[i] - 0.5) * 0.2; o[4] = stip[i];
  }, 2.5);
}

function wood(seed) {
  const S = SIZE;
  const n = field(S, 4, 5, seed, 0.5, 1);
  const fine = field(S, 2, 6, seed + 1, 0.55, 64);
  const grey = field(S, 3, 4, seed + 2);
  return makeSet(S, (i, o) => {
    const x = i % S;
    const ring = Math.sin(((x / S) * 22 + n[i] * 5) * Math.PI * 2) * 0.5 + 0.5;
    const grain = fine[i];
    const weather = sm(0.35, 0.7, grey[i]);
    let r = 0.44 + ring * 0.06 - (1 - grain) * 0.08, g = 0.3 + ring * 0.04 - (1 - grain) * 0.06, b = 0.18 + ring * 0.02 - (1 - grain) * 0.04;
    // sun-bleached grey wood
    r = r * (1 - weather * 0.6) + 0.46 * weather * 0.6;
    g = g * (1 - weather * 0.6) + 0.42 * weather * 0.6;
    b = b * (1 - weather * 0.6) + 0.37 * weather * 0.6;
    o[0] = r; o[1] = g; o[2] = b; o[3] = 0.72 + weather * 0.15; o[4] = ring * 0.2 + grain * 0.6;
  }, 3);
}

function fabric(seed) {
  const S = SIZE;
  const n = field(S, 8, 5, seed);
  const fuzz = field(S, 128, 2, seed + 1);
  const N = 96; // threads per tile
  return makeSet(S, (i, o) => {
    const x = i % S, y = (i / S) | 0;
    const u = (x / S) * N, v = (y / S) * N;
    const wu = Math.sin(u * Math.PI * 2), wv = Math.sin(v * Math.PI * 2);
    const over = ((Math.floor(u) + Math.floor(v)) & 1) ? wu : wv;
    const g = 0.8 + over * 0.05 + (n[i] - 0.5) * 0.12 + (fuzz[i] - 0.5) * 0.05;
    o[0] = g; o[1] = g; o[2] = g; o[3] = 0.95; o[4] = over * 0.5 + fuzz[i] * 0.3;
  }, 3);
}

function leather(seed) {
  const S = SIZE;
  const v = voronoi(S, 48, seed);
  const n = field(S, 6, 5, seed + 1);
  return makeSet(S, (i, o) => {
    const e = v.F2[i] - v.F1[i];
    const crease = sm(0.08, 0.0, e);
    const g = 0.78 + (n[i] - 0.5) * 0.2 - crease * 0.12;
    o[0] = g; o[1] = g; o[2] = g; o[3] = 0.5 + crease * 0.2 + (n[i] - 0.5) * 0.15; o[4] = -crease + n[i] * 0.3;
  }, 3);
}

function paintedMetal(seed) {
  const S = SIZE;
  const n = field(S, 6, 6, seed);
  const chips = field(S, 24, 4, seed + 1);
  const scr = field(S, 1, 6, seed + 2, 0.7, 120);
  return makeSet(S, (i, o) => {
    const chip = sm(0.74, 0.78, chips[i]);
    const scratch = sm(0.8, 0.9, scr[i]) * 0.5;
    const paint = 0.82 + (n[i] - 0.5) * 0.12;
    const metal = 0.35;
    const g = paint * (1 - chip) + metal * chip - scratch * 0.15;
    o[0] = g; o[1] = g; o[2] = g; o[3] = 0.55 * (1 - chip) + 0.4 * chip + (n[i] - 0.5) * 0.1; o[4] = -chip * 0.5 - scratch * 0.3 + n[i] * 0.1;
  }, 2);
}

function hairCap(seed) {
  const S = SIZE;
  const strands = field(S, 192, 3, seed, 0.6, 4);
  return makeSet(S, (i, o) => {
    const g = 0.75 + (strands[i] - 0.5) * 0.5;
    o[0] = g; o[1] = g; o[2] = g; o[3] = 0.5 + (strands[i] - 0.5) * 0.3; o[4] = strands[i];
  }, 3);
}

function skin(seed) {
  const S = 256;
  const n = field(S, 16, 4, seed);
  return makeSet(S, (i, o) => {
    const g = 0.9 + (n[i] - 0.5) * 0.08;
    o[0] = g; o[1] = g; o[2] = g; o[3] = 0.55 + (n[i] - 0.5) * 0.2; o[4] = n[i] * 0.4;
  }, 1);
}


function whitePanel(seed) {
  const S = SIZE;
  const n = field(S, 6, 5, seed), smudge = field(S, 3, 4, seed + 1), fine = field(S, 128, 2, seed + 2);
  return makeSet(S, (i, o) => {
    const x = i % S, y = (i / S) | 0;
    const seam = (x % (S / 2) < 3 || y < 3) ? 1 : 0;
    const vent = (y > S * 0.46 && y < S * 0.54 && (x % 24) < 12 && x > S * 0.6 && x < S * 0.9) ? 1 : 0;
    const g = 0.88 + (n[i] - 0.5) * 0.04 - sm(0.6, 0.9, smudge[i]) * 0.05 + (fine[i] - 0.5) * 0.01 - seam * 0.45 - vent * 0.5;
    o[0] = g * 0.98; o[1] = g; o[2] = g * 1.03; o[3] = 0.3 + smudge[i] * 0.15 + seam * 0.4; o[4] = -seam * 1.5 - vent + fine[i] * 0.05;
  }, 3);
}
function floorTiles(seed) {
  const S = SIZE;
  const n = field(S, 5, 6, seed), smudge = field(S, 4, 5, seed + 1), vein = field(S, 3, 5, seed + 2, 0.6, 9);
  return makeSet(S, (i, o) => {
    const x = i % S, y = (i / S) | 0;
    const grout = (x % (S / 2) < 2 || y % (S / 2) < 2) ? 1 : 0;
    const v = sm(0.48, 0.5, vein[i]) * sm(0.52, 0.5, vein[i]) * 4;
    const g = 0.22 + (n[i] - 0.5) * 0.05 + v * 0.05 + grout * 0.25;
    o[0] = g; o[1] = g * 1.02; o[2] = g * 1.07; o[3] = 0.1 + sm(0.55, 0.85, smudge[i]) * 0.25 + grout * 0.5; o[4] = -grout * 1.2;
  }, 2);
}
function grass(seed) {
  const S = SIZE;
  const n = field(S, 6, 6, seed), fine = field(S, 160, 2, seed + 1), dry = field(S, 3, 4, seed + 2);
  return makeSet(S, (i, o) => {
    const d = sm(0.55, 0.8, dry[i]);
    const g = 0.6 + (n[i] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.35;
    o[0] = (0.2 + d * 0.25) * g; o[1] = (0.42 + d * 0.05) * g; o[2] = 0.12 * g; o[3] = 0.95; o[4] = fine[i] + n[i] * 0.5;
  }, 4);
}

export async function generateTextures(onProgress = () => {}) {
  const jobs = [
    ["concrete", () => concrete(11)],
    ["floor", () => concrete(23, { floor: true })],
    ["earth", () => crackedEarth(31)],
    ["rock", () => rock(41)],
    ["rustRed", () => rustPaint(51, [0.42, 0.1, 0.08], 0.55)],
    ["rustBlue", () => rustPaint(52, [0.16, 0.24, 0.32], 0.45)],
    ["rustBare", () => rustPaint(53, [0.3, 0.3, 0.29], 0.75)],
    ["gunmetal", () => gunmetal(61)],
    ["polymer", () => polymer(71)],
    ["wood", () => wood(81)],
    ["fabric", () => fabric(91)],
    ["leather", () => leather(101)],
    ["painted", () => paintedMetal(111)],
    ["hair", () => hairCap(121)],
    ["skin", () => skin(131)],
    ["panel", () => whitePanel(141)],
    ["tiles", () => floorTiles(151)],
    ["grass", () => grass(161)],
  ];
  const T = {};
  for (let k = 0; k < jobs.length; k++) {
    const [name, fn] = jobs[k];
    T[name] = fn();
    onProgress((k + 1) / jobs.length, name);
    await new Promise((r) => setTimeout(r, 0)); // let the loading bar paint
  }
  return T;
}

// Repeat helper: textures are shared, so clone when a different repeat is needed.
export function withRepeat(set, rx, ry = rx) {
  const out = {};
  for (const k of Object.keys(set)) {
    const t = set[k].clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    out[k] = t;
  }
  return out;
}

// Small canvas-texture helper for signs, posters and soft particles.
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function softDot(color = "255,255,255") {
  return canvasTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${color},1)`);
    g.addColorStop(0.35, `rgba(${color},0.55)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });
}

/* ---------- canvas-painted detail textures ---------- */
function rngCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d", { willReadFrequently: true })]; }

// Hair card: many fine strands, opaque at the root, thinning out to wispy tips (alpha).
export function hairStrandTexture() {
  const [c, ctx] = rngCanvas(256, 512);
  const r = mulberry32(77);
  for (let i = 0; i < 420; i++) {
    const x0 = r() * 256, len = 0.55 + r() * 0.45, w = 0.6 + r() * 1.6, g = 150 + r() * 105;
    const wave = (r() - 0.5) * 6, ph = r() * 6;
    const grad = ctx.createLinearGradient(0, 0, 0, 512 * len);
    grad.addColorStop(0, `rgba(${g},${g},${g},${0.85 + r() * 0.15})`);
    grad.addColorStop(0.75, `rgba(${g},${g},${g},${0.6 + r() * 0.3})`);
    grad.addColorStop(1, `rgba(${g},${g},${g},0)`);
    ctx.strokeStyle = grad; ctx.lineWidth = w; ctx.beginPath();
    for (let y = 0; y <= 512 * len; y += 16) { const x = x0 + Math.sin(y / 60 + ph) * wave + (y / 512) * (r() - 0.5) * 4; y ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Light wear: fine scratches, scuffs and tiny chips on otherwise clean surfaces.
export function scratchSet(seed = 5, size = 1024) {
  const r = mulberry32(seed);
  const [c, ctx] = rngCanvas(size, size);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  const [rc, rctx] = rngCanvas(size, size);
  rctx.fillStyle = "rgb(70,70,70)"; rctx.fillRect(0, 0, size, size); // base roughness ~0.27
  const [hc, hctx] = rngCanvas(size, size);
  hctx.fillStyle = "rgb(128,128,128)"; hctx.fillRect(0, 0, size, size);
  const line = (x, y, len, ang, wdt, a, curve) => {
    for (const [cx, col, w2] of [[ctx, `rgba(90,90,95,${a})`, wdt], [rctx, `rgba(190,190,190,${a * 1.6})`, wdt * 1.4], [hctx, `rgba(60,60,60,${a * 2})`, wdt]]) {
      cx.strokeStyle = col; cx.lineWidth = w2; cx.beginPath(); cx.moveTo(x, y);
      cx.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + curve, y + Math.sin(ang) * len * 0.5 - curve, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      cx.stroke();
    }
  };
  for (let i = 0; i < 260; i++) line(r() * size, r() * size, 10 + r() * 90, r() * 6.28, 0.5 + r() * 0.8, 0.08 + r() * 0.18, (r() - 0.5) * 12);
  for (let k = 0; k < 14; k++) { // clusters of parallel scuffs
    const x = r() * size, y = r() * size, ang = r() * 6.28;
    for (let i = 0; i < 10; i++) line(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, 30 + r() * 60, ang + (r() - 0.5) * 0.15, 0.6, 0.06 + r() * 0.08, 0);
  }
  for (let i = 0; i < 40; i++) { // tiny chips
    const x = r() * size, y = r() * size, s = 1 + r() * 2.5;
    ctx.fillStyle = "rgba(120,120,125,0.35)"; ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
    hctx.fillStyle = "rgba(40,40,40,0.6)"; hctx.beginPath(); hctx.arc(x, y, s, 0, 7); hctx.fill();
  }
  for (let i = 0; i < 18; i++) { // soft scuff marks (slightly rougher, barely darker)
    const x = r() * size, y = r() * size, rad = 20 + r() * 50;
    const g = rctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, "rgba(150,150,150,0.35)"); g.addColorStop(1, "rgba(150,150,150,0)");
    rctx.fillStyle = g; rctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, rad); g2.addColorStop(0, "rgba(0,0,0,0.035)"); g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // height -> normal
  const hd = hctx.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = hd[i * 4] / 255;
  const mk = (canvas, srgb) => { const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const rgh = rctx.getImageData(0, 0, size, size);
  for (let i = 0; i < rgh.data.length; i += 4) { rgh.data[i + 2] = 0; } // G = roughness, B = metalness 0
  rctx.putImageData(rgh, 0, 0);
  return { map: mk(c, true), roughnessMap: mk(rc, false), normalMap: dataTex(normalFromHeight(h, size, 1.2), size, false) };
}

// Snake-plant leaf: dark green with wavy pale cross-bands and yellow margins.
export function leafTexture() {
  const [c, ctx] = rngCanvas(128, 512);
  const r = mulberry32(31);
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, "#c8b84a"); g.addColorStop(0.09, "#c9b94e"); g.addColorStop(0.13, "#2f5a2a"); g.addColorStop(0.5, "#24461f"); g.addColorStop(0.87, "#2f5a2a"); g.addColorStop(0.91, "#c9b94e"); g.addColorStop(1, "#c8b84a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 512);
  for (let y = 0; y < 512; y += 7 + r() * 9) {
    ctx.strokeStyle = `rgba(${150 + r() * 40},${180 + r() * 30},${130 + r() * 30},${0.25 + r() * 0.25})`;
    ctx.lineWidth = 1.5 + r() * 3; ctx.beginPath();
    for (let x = 16; x <= 112; x += 6) { const yy = y + Math.sin(x / 9 + y) * 3; x === 16 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(20,40,18,${r() * 0.25})`; ctx.fillRect(16 + r() * 96, r() * 512, 1, 20 + r() * 80); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Potting soil with bark chips and small pebbles.
export function soilTexture() {
  const [c, ctx] = rngCanvas(512, 512);
  const r = mulberry32(17);
  ctx.fillStyle = "#3a2a1e"; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const s = r() * 3; const v = 30 + r() * 40; ctx.fillStyle = `rgb(${v + 12},${v},${v - 10})`; ctx.fillRect(r() * 512, r() * 512, s, s); }
  for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgb(${90 + r() * 40},${60 + r() * 25},${35 + r() * 20})`; ctx.save(); ctx.translate(r() * 512, r() * 512); ctx.rotate(r() * 6); ctx.fillRect(-6, -2, 6 + r() * 10, 2 + r() * 3); ctx.restore(); }
  for (let i = 0; i < 90; i++) { const v = 120 + r() * 80; ctx.fillStyle = `rgb(${v},${v - 5},${v - 12})`; ctx.beginPath(); ctx.arc(r() * 512, r() * 512, 1.5 + r() * 3, 0, 7); ctx.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
