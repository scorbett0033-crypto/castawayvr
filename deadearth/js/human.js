// Realistic humans: fully textured, rigged people. Two rigs are supported:
//  - "meshy": the bald base man / woman (Ready Player 2 originals, made with Meshy) with
//    idle / walk / run / sit / death clips; their tee and jeans can be re-dyed;
//  - "rb": people from the Microsoft Rocketbox avatar library (MIT), mocap idle / walk / run / sit.
// The wind-simulated strand hair, verlet cloth and respirator from avatar.js are
// attached to "frames" that ride on the real skeleton's bones.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/utils/SkeletonUtils.js";
import { Avatar, HairSystem, CLOTH_ITEMS, HAIR_COLORS, HAIR_STYLES, PANTS, DEFAULT_LOOK, outfitFor, defaultOutfit, faceFor } from "./avatar.js";

const BASE = new URL("../models/", import.meta.url).href;
const loader = new GLTFLoader();
const pending = new Map();
const ready = new Map();
const clips = {};

export function ensureModel(name) {
  if (!pending.has(name)) {
    pending.set(name, loader.loadAsync(BASE + name + ".glb").then((g) => {
      if (name.startsWith("anims_")) {
        // drop helper tracks that have no matching bone in the character rigs
        g.animations.forEach((c) => (c.tracks = c.tracks.filter((t) => !/MotionExtractionHelper|Footsteps/.test(t.name))));
        clips[name.slice(6)] = g.animations;
      }
      ready.set(name, g);
      return g;
    }));
  }
  return pending.get(name);
}
export const modelReady = (name) => ready.has(name);
export async function loadHumanAssets(names, onProgress) {
  const all = ["anims_m", "anims_f", "anims_bm", "anims_bf", ...new Set(names)];
  let done = 0;
  await Promise.all(all.map((n) => ensureModel(n).then(() => onProgress && onProgress(++done / all.length))));
}

const RB_BONES = {
  pelvis: "Bip01_Pelvis", spine: "Bip01_Spine", spine1: "Bip01_Spine1", spine2: "Bip01_Spine2", neck: "Bip01_Neck", head: "Bip01_Head",
  lUp: "Bip01_L_UpperArm", lFore: "Bip01_L_Forearm", lHand: "Bip01_L_Hand", rUp: "Bip01_R_UpperArm", rFore: "Bip01_R_Forearm", rHand: "Bip01_R_Hand",
  lThigh: "Bip01_L_Thigh", lCalf: "Bip01_L_Calf", lFoot: "Bip01_L_Foot", rThigh: "Bip01_R_Thigh", rCalf: "Bip01_R_Calf", rFoot: "Bip01_R_Foot",
};
const MESHY_BONES = {
  pelvis: "Hips", spine: "Spine02", spine1: "Spine01", spine2: "Spine", neck: "neck", head: "Head",
  lUp: "LeftArm", lFore: "LeftForeArm", lHand: "LeftHand", rUp: "RightArm", rFore: "RightForeArm", rHand: "RightHand",
  lThigh: "LeftUpLeg", lCalf: "LeftLeg", lFoot: "LeftFoot", rThigh: "RightUpLeg", rCalf: "RightLeg", rFoot: "RightFoot",
};
const rigOf = (name) => (name.startsWith("base_") ? "meshy" : "rb");
const bonesOf = (name) => (rigOf(name) === "meshy" ? MESHY_BONES : RB_BONES);
const BONES = RB_BONES; // Rocketbox-only helpers (face swap, bald repaint) use these

function sanitize(look) {
  const L = { ...DEFAULT_LOOK, ...look };
  if (L.body !== "male" && L.body !== "female") L.body = "male";
  if (outfitFor(L).id !== L.outfit) L.outfit = defaultOutfit(L.body);
  L.face = faceFor(L);
  if (!HAIR_STYLES.find((h) => h.id === L.hair)) L.hair = "bald";
  if (!PANTS.find((p) => p.id === L.pants)) L.pants = "orig";
  if (!HAIR_COLORS.find((h) => h.id === L.hairColor)) L.hairColor = "natural";
  return L;
}

// Skull centre (in the head bone's local space) + radius, measured from a model's own head vertices.
const headCache = new Map();
function headInfo(name) {
  if (headCache.has(name)) return headCache.get(name);
  const scene = ready.get(name).scene;
  scene.updateMatrixWorld(true);
  const head = scene.getObjectByName(bonesOf(name).head);
  if (rigOf(name) === "meshy") {
    // bald base: every vertex the head bone drives is skull / face / ears
    const box = new THREE.Box3(), v = new THREE.Vector3();
    scene.traverse((sm) => {
      if (!sm.isSkinnedMesh) return;
      const hw = headWeight(sm, head.name), n = sm.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) if (hw(i) > 0.8) box.expandByPoint(sm.getVertexPosition(i, v).applyMatrix4(sm.matrixWorld));
    });
    const sz = box.getSize(new THREE.Vector3());
    const r = THREE.MathUtils.clamp(sz.x / 2 * 0.86, 0.07, 0.11); // trim the ears
    const c = box.getCenter(new THREE.Vector3()); c.y = box.max.y - r * 1.04; c.z -= 0.012;
    const info = { local: head.worldToLocal(c), r };
    headCache.set(name, info);
    return info;
  }
  let info = { local: head.worldToLocal(head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.09, 0.015))), r: 0.095 };
  const box = new THREE.Box3(), v = new THREE.Vector3();
  const tone = skinTone(name) || [200, 160, 140], ts = tone[0] + tone[1] + tone[2], tr = tone[0] / ts, tg = tone[1] / ts;
  let texData = null, TW = 0, TH = 0;
  scene.traverse((sm) => {
    if (!sm.isSkinnedMesh) return;
    const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
    if (!texData && mats[0].name === "head" && mats[0].map) {
      const img = mats[0].map.image; TW = img.width; TH = img.height;
      const c = document.createElement("canvas"); c.width = TW; c.height = TH;
      const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0); texData = x.getImageData(0, 0, TW, TH).data;
    }
    const g = sm.geometry, hi = sm.skeleton.bones.indexOf(head);
    const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const ranges = g.groups.length ? g.groups.filter((grp) => mats[grp.materialIndex]?.name === "head") : (mats[0].name === "head" ? [{ start: 0, count: g.index ? g.index.count : pos.count }] : []);
    for (const grp of ranges) for (let n = grp.start; n < grp.start + grp.count; n++) {
      const i = g.index ? g.index.getX(n) : n;
      const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], wt = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      if (texData && g.attributes.uv) { // skin texels only, so hair volume doesn't inflate the skull
        const ux = Math.min(TW - 1, Math.max(0, Math.round(g.attributes.uv.getX(i) * TW))), uy = Math.min(TH - 1, Math.max(0, Math.round(g.attributes.uv.getY(i) * TH)));
        const o = (uy * TW + ux) * 4, su = texData[o] + texData[o + 1] + texData[o + 2] + 1e-3;
        if (Math.abs(texData[o] / su - tr) + Math.abs(texData[o + 1] / su - tg) > 0.045 || su / ts < 0.55) continue;
      }
      for (let k = 0; k < 4; k++) if (idx[k] === hi && wt[k] > 0.6) { box.expandByPoint(sm.getVertexPosition(i, v).applyMatrix4(sm.matrixWorld)); break; }
    }
  });
  {
    if (!box.isEmpty()) {
      const sz = box.getSize(new THREE.Vector3());
      const r = THREE.MathUtils.clamp(sz.x / 2, 0.075, 0.12);
      const bc = box.getCenter(new THREE.Vector3());
      const c = bc.clone(); c.y = box.max.y - r * 1.02; c.z -= 0.01;
      info = { off: bc.clone().sub(c), size: sz.clone(), top: box.max.y - c.y, local: head.worldToLocal(c), r };
    }
  }
  headCache.set(name, info);
  return info;
}
const HEAD_PARTS = ["head", "opacity", "helmet"];

/* ---------- bald: paint the model's painted-on hair over with its own scalp skin ---------- */
const baldCache = new Map();
function canvasTexFrom(cv, like, srgb) {
  const t = new THREE.CanvasTexture(cv);
  t.flipY = like.flipY; t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}
function baldHeadMaps(modelName) {
  if (baldCache.has(modelName)) return baldCache.get(modelName);
  const src = ready.get(modelName).scene;
  src.updateMatrixWorld(true);
  const heads = [];
  src.traverse((o) => { if (o.isSkinnedMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m.name === "head") heads.push([o, m]); } });
  const mat = heads[0] && heads[0][1];
  if (!mat || !mat.map) { baldCache.set(modelName, null); return null; }
  const info = headInfo(modelName);
  const center = src.getObjectByName(BONES.head).localToWorld(info.local.clone());
  const img = mat.map.image, W = img.width, H = img.height;
  const mask = document.createElement("canvas"); mask.width = W; mask.height = H;
  const mctx = mask.getContext("2d"); mctx.fillStyle = "#fff"; mctx.beginPath();
  const v = new THREE.Vector3();
  for (const [sm] of heads) {
    const g = sm.geometry, pos = g.attributes.position, uv = g.attributes.uv, ix = g.index;
    const scalp = scalpVerts(modelName, sm);
    const n = ix ? ix.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
      if (scalp[a] + scalp[b] + scalp[c] < 2) continue;
      mctx.moveTo(uv.getX(a) * W, uv.getY(a) * H); mctx.lineTo(uv.getX(b) * W, uv.getY(b) * H); mctx.lineTo(uv.getX(c) * W, uv.getY(c) * H); mctx.closePath();
    }
  }
  mctx.fill();
  const soft = document.createElement("canvas"); soft.width = W; soft.height = H;
  const sctx = soft.getContext("2d", { willReadFrequently: true });
  sctx.filter = `blur(${Math.max(4, W / 70)}px)`; sctx.drawImage(mask, 0, 0); sctx.drawImage(mask, 0, 0); sctx.filter = "none"; sctx.drawImage(mask, 0, 0);
  {
    // weight = core triangles, plus the halo around them where the texel looks like hair (not skin)
    const tone0 = skinTone(modelName) || [200, 160, 140], ts = tone0[0] + tone0[1] + tone0[2], tr = tone0[0] / ts, tg = tone0[1] / ts;
    const cv0 = document.createElement("canvas"); cv0.width = W; cv0.height = H;
    const c0 = cv0.getContext("2d", { willReadFrequently: true }); c0.drawImage(img, 0, 0);
    const px = c0.getImageData(0, 0, W, H).data;
    const sd = sctx.getImageData(0, 0, W, H);
    const md = mask.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    for (let i = 0; i < px.length; i += 4) {
      const halo = sd.data[i + 3] / 255;
      if (halo <= 0) { sd.data[i + 3] = 0; continue; }
      const sum = px[i] + px[i + 1] + px[i + 2] + 1e-3;
      const chroma = Math.abs(px[i] / sum - tr) + Math.abs(px[i + 1] / sum - tg), lum = sum / ts;
      const hairness = Math.min(1, Math.max(0, (chroma - 0.02) / 0.035, (0.75 - lum) / 0.25, (lum - 1.35) / 0.2));
      const core = md[i + 3] / 255;
      sd.data[i] = sd.data[i + 1] = sd.data[i + 2] = 255;
      sd.data[i + 3] = 255 * Math.max(core, Math.min(1, halo * 1.6) * hairness);
    }
    sctx.putImageData(sd, 0, 0);
  }
  const masked = (base, paint) => {
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const o = out.getContext("2d"); o.drawImage(base, 0, 0, W, H);
    const layer = document.createElement("canvas"); layer.width = W; layer.height = H;
    const l = layer.getContext("2d"); paint(l);
    l.globalCompositeOperation = "destination-in"; l.drawImage(soft, 0, 0);
    o.drawImage(layer, 0, 0);
    return out;
  };
  const tone = skinTone(modelName) || [200, 160, 140];
  const sk = `rgb(${tone[0] * 0.97 | 0},${tone[1] * 0.95 | 0},${tone[2] * 0.95 | 0})`;
  const rnd = mulberry(modelName.length * 31);
  const color = masked(img, (l) => {
    l.fillStyle = sk; l.fillRect(0, 0, W, H);
    for (let i = 0; i < W * 6; i++) { const a = 0.04 + rnd() * 0.06; l.fillStyle = `rgba(${tone[0] * 0.6 | 0},${tone[1] * 0.5 | 0},${tone[2] * 0.45 | 0},${a})`; const sz = 1 + rnd() * W / 400; l.fillRect(rnd() * W, rnd() * H, sz, sz); } // pores / shaved stubble
    for (let i = 0; i < 14; i++) { const x = rnd() * W, y = rnd() * H, r = W / 12 + rnd() * W / 8; const gr = l.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(255,240,230,0.08)"); gr.addColorStop(1, "rgba(255,240,230,0)"); l.fillStyle = gr; l.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  const res = { map: canvasTexFrom(color, mat.map, true) };
  if (mat.normalMap) res.normalMap = canvasTexFrom(masked(mat.normalMap.image, (l) => { l.fillStyle = "rgb(128,128,255)"; l.fillRect(0, 0, W, H); }), mat.normalMap, false);
  if (mat.roughnessMap) res.roughnessMap = canvasTexFrom(masked(mat.roughnessMap.image, (l) => { l.fillStyle = "rgb(140,140,0)"; l.fillRect(0, 0, W, H); }), mat.roughnessMap, false);
  baldCache.set(modelName, res);
  return res;
}
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- per-vertex head analysis (rest pose): position vs skull + is the texel hair-coloured ---------- */
const vinfoCache = new WeakMap();
function headVertexInfo(modelName, srcMesh) {
  const key = srcMesh.geometry.attributes.position;
  if (vinfoCache.has(key)) return vinfoCache.get(key);
  const src = ready.get(modelName).scene; src.updateMatrixWorld(true);
  const info = headInfo(modelName);
  const center = src.getObjectByName(BONES.head).localToWorld(info.local.clone());
  const mat = Array.isArray(srcMesh.material) ? srcMesh.material[0] : srcMesh.material;
  const img = mat.map.image, W = img.width, H = img.height;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, W, H).data;
  const tone = skinTone(modelName) || [200, 160, 140];
  const ts = tone[0] + tone[1] + tone[2], tr = tone[0] / ts, tg = tone[1] / ts;
  const g = srcMesh.geometry, pos = g.attributes.position, uv = g.attributes.uv;
  const n = pos.count, v = new THREE.Vector3();
  const res = { dx: new Float32Array(n), dy: new Float32Array(n), dz: new Float32Array(n), dist: new Float32Array(n), ry: new Float32Array(n), hr: new Float32Array(n), hairCol: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    srcMesh.getVertexPosition(i, v).applyMatrix4(srcMesh.matrixWorld).sub(center);
    res.ry[i] = v.y / info.r; res.hr[i] = Math.hypot(v.x, v.z) / info.r;
    const d = v.length(); res.dist[i] = d / info.r; v.divideScalar(d || 1);
    res.dx[i] = v.x; res.dy[i] = v.y; res.dz[i] = v.z;
    const x = Math.min(W - 1, Math.max(0, Math.round(uv.getX(i) * W))), y = Math.min(H - 1, Math.max(0, Math.round(uv.getY(i) * H)));
    const o = (y * W + x) * 4, sum = px[o] + px[o + 1] + px[o + 2] + 1e-3;
    const chroma = Math.abs(px[o] / sum - tr) + Math.abs(px[o + 1] / sum - tg), lum = sum / ts;
    res.hairCol[i] = chroma > 0.045 || lum < 0.55 || lum > 1.5 ? 1 : 0;
  }
  vinfoCache.set(key, res);
  return res;
}
// separate hair pieces: mesh parts not welded to the skull whose texels are mostly hair
const compCache = new WeakMap();
function hairComponents(modelName, srcMesh) {
  const key = srcMesh.geometry.attributes.position;
  if (compCache.has(key)) return compCache.get(key);
  const I = headVertexInfo(modelName, srcMesh);
  const g = srcMesh.geometry, pos = g.attributes.position, ix = g.index, n = pos.count;
  // weld vertices that share a position (UV seams split them), then union along triangles
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const weld = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    if (weld.has(k)) unite(weld.get(k), i); else weld.set(k, i);
  }
  const m = ix ? ix.count : n;
  for (let t = 0; t < m; t += 3) { const a = ix ? ix.getX(t) : t; unite(a, ix ? ix.getX(t + 1) : t + 1); unite(a, ix ? ix.getX(t + 2) : t + 2); }
  const stats = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i); let st = stats.get(r);
    if (!st) stats.set(r, (st = { n: 0, hair: 0, dx: 0, dy: 0, dz: 0 }));
    st.n++; st.hair += I.hairCol[i]; st.dx += I.dx[i]; st.dy += I.dy[i]; st.dz += I.dz[i];
  }
  let biggest = 0; for (const st of stats.values()) biggest = Math.max(biggest, st.n);
  const remove = new Set();
  for (const [r, st] of stats) {
    if (st.n === biggest) continue; // the skull + face itself
    const cx = st.dx / st.n, cy = st.dy / st.n, cz = st.dz / st.n;
    const frontFeature = cz > 0.45 && Math.abs(cx) < 0.6 && cy < 0.35; // eyes, teeth, tongue
    if (!frontFeature && st.hair / st.n > 0.55) remove.add(r);
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (remove.has(find(i))) out[i] = 1;
  compCache.set(key, out);
  return out;
}
// hair that sticks out of the head (shells / hanging locks): delete when not wearing natural hair
function hairVerts(modelName, srcMesh) {
  const I = headVertexInfo(modelName, srcMesh), n = I.dist.length, out = hairComponents(modelName, srcMesh).slice();
  for (let i = 0; i < n; i++) {
    if (!I.hairCol[i]) continue;
    const face = (I.dz[i] > 0.3 && Math.abs(I.dx[i]) < 0.6 && I.dy[i] < 0.62) || (I.dz[i] > 0.55 && I.dy[i] < 0.62);
    const jaw = I.ry[i] < -0.55 && I.dz[i] > 0.15 && I.hr[i] < 0.95;
    const ear = Math.abs(I.dx[i]) > 0.72 && Math.abs(I.dy[i]) < 0.32 && I.dz[i] > -0.35 && I.dz[i] < 0.45 && I.dist[i] < 1.25;
    if (face || jaw || ear) continue;
    if (I.ry[i] > -0.45) { if (I.dist[i] > 1.07) out[i] = 1; }        // volume standing off the skull
    else if (I.hr[i] > 0.85) out[i] = 1;                              // locks hanging past the neck
    if (Math.abs(I.dx[i]) > 0.6 && I.hr[i] > 1.04 && I.ry[i] > -1.8) out[i] = 1; // locks framing the face
  }
  return out;
}
// the whole hair-covered part of the skull (direction only): replaced by a clean dome when bald
function scalpRegion(modelName, srcMesh) {
  const I = headVertexInfo(modelName, srcMesh), n = I.dist.length, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const front = I.dz[i] > 0.4 && I.dy[i] < 0.58;
    const ear = Math.abs(I.dx[i]) > 0.72 && Math.abs(I.dy[i]) < 0.32 && I.dz[i] > -0.35 && I.dz[i] < 0.45 && I.dist[i] < 1.25;
    if (front || ear || I.ry[i] < -0.5) continue;
    if (I.dy[i] > 0.3 || (I.dz[i] < -0.15 && I.dy[i] > -0.3) || (Math.abs(I.dx[i]) > 0.6 && I.dy[i] > 0.1 && I.dz[i] < 0.35)) out[i] = 1;
  }
  return out;
}
// skull vertices with painted-on hair: repaint with scalp skin
function scalpVerts(modelName, srcMesh) {
  const I = headVertexInfo(modelName, srcMesh), n = I.dist.length, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (I.ry[i] < -0.45 || I.dist[i] > 1.3) continue;
    const ear = Math.abs(I.dx[i]) > 0.72 && Math.abs(I.dy[i]) < 0.32 && I.dz[i] > -0.35 && I.dz[i] < 0.45;
    if (ear) continue;
    const face = I.dz[i] > 0.42 && I.dy[i] < 0.6;
    const zone = I.dy[i] > 0.4 || (I.dz[i] < -0.12 && I.dy[i] > -0.5) || (Math.abs(I.dx[i]) > 0.6 && I.dy[i] > -0.12 && I.dz[i] < 0.25);
    if ((zone && !face) || (I.dy[i] > 0.38 && I.hairCol[i])) out[i] = 1;
  }
  return out;
}

/* ---------- pants: find the trouser UV islands and re-dye them ---------- */
const pantsCache = new Map();
function camoCanvas(W, H, cols) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); const r = mulberry(99);
  x.fillStyle = "#" + cols[0].toString(16).padStart(6, "0"); x.fillRect(0, 0, W, H);
  for (let k = 1; k < cols.length; k++) for (let i = 0; i < 140; i++) {
    x.fillStyle = "#" + cols[k].toString(16).padStart(6, "0"); x.beginPath();
    const cx = r() * W, cy = r() * H, rad = W * (0.012 + r() * 0.03);
    for (let a = 0; a < 6.28; a += 0.6) { const rr = rad * (0.6 + r() * 0.7); x.lineTo(cx + Math.cos(a) * rr * 1.6, cy + Math.sin(a) * rr); }
    x.fill();
  }
  return x.getImageData(0, 0, W, H).data;
}
function pantsMap(key, mesh, baseMap, ownTone, pants) {
  if (pantsCache.has(key)) return pantsCache.get(key);
  const g = mesh.geometry, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, ix = g.index;
  const nV = g.attributes.position.count, nI = ix ? ix.count : nV;
  const bones = mesh.skeleton.bones;
  const legB = bones.map((b) => /Thigh|Calf/.test(b.name)), footB = bones.map((b) => /Foot|Toe/.test(b.name));
  const wOf = (i, arr) => (arr[si.getX(i)] ? sw.getX(i) : 0) + (arr[si.getY(i)] ? sw.getY(i) : 0) + (arr[si.getZ(i)] ? sw.getZ(i) : 0) + (arr[si.getW(i)] ? sw.getW(i) : 0);
  // UV islands = connected triangles (vertices are split at UV seams)
  const parent = new Int32Array(nV); for (let i = 0; i < nV; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < nI; t += 3) { const a = find(ix ? ix.getX(t) : t), b = find(ix ? ix.getX(t + 1) : t + 1), c = find(ix ? ix.getX(t + 2) : t + 2); parent[b] = a; parent[find(c)] = a; }
  const leg = new Map(), foot = new Map(), cnt = new Map();
  for (let i = 0; i < nV; i++) { const r = find(i); cnt.set(r, (cnt.get(r) || 0) + 1); leg.set(r, (leg.get(r) || 0) + (wOf(i, legB) > 0.5 ? 1 : 0)); foot.set(r, (foot.get(r) || 0) + (wOf(i, footB) > 0.5 ? 1 : 0)); }
  const isPants = (r) => leg.get(r) / cnt.get(r) > 0.45 && foot.get(r) / cnt.get(r) < 0.3;
  const img = baseMap.image, W = img.width, H = img.height;
  const mask = document.createElement("canvas"); mask.width = W; mask.height = H;
  const mctx = mask.getContext("2d", { willReadFrequently: true }); mctx.fillStyle = "#fff"; mctx.strokeStyle = "#fff"; mctx.lineWidth = 2; mctx.beginPath();
  for (let t = 0; t < nI; t += 3) {
    const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
    if (!isPants(find(a))) continue;
    mctx.moveTo(uv.getX(a) * W, uv.getY(a) * H); mctx.lineTo(uv.getX(b) * W, uv.getY(b) * H); mctx.lineTo(uv.getX(c) * W, uv.getY(c) * H); mctx.closePath();
  }
  mctx.fill(); mctx.stroke();
  const md = mctx.getImageData(0, 0, W, H).data;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H), d = id.data;
  const fs = ownTone ? ownTone[0] + ownTone[1] + ownTone[2] : 1, fr = ownTone ? ownTone[0] / fs : 0, fg = ownTone ? ownTone[1] / fs : 0;
  const isSkin = (i) => { if (!ownTone) return false; const s = d[i] + d[i + 1] + d[i + 2] + 1e-3; return Math.abs(d[i] / s - fr) + Math.abs(d[i + 1] / s - fg) < 0.045 && s > 120; };
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (md[i] > 128 && !isSkin(i)) { sum += d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15; n++; }
  const mean = n ? sum / n : 128;
  const camo = pants.camo ? camoCanvas(W, H, pants.camo) : null;
  const tint = pants.tint ?? 0x777777, tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
  for (let i = 0; i < d.length; i += 4) {
    if (md[i] < 128 || isSkin(i)) continue;
    const L = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / mean;
    const k = Math.pow(L, 0.9);
    const cr = camo ? camo[i] : tr, cg = camo ? camo[i + 1] : tg, cb = camo ? camo[i + 2] : tb;
    d[i] = Math.min(255, cr * k); d[i + 1] = Math.min(255, cg * k); d[i + 2] = Math.min(255, cb * k);
  }
  ctx.putImageData(id, 0, 0);
  const t = canvasTexFrom(cv, baseMap, true);
  pantsCache.set(key, t);
  return t;
}

/* ---------- bald base people: re-dye the tee and the jeans by colour ---------- */
const dyeCache = new Map();
function baseDyeMap(key, mesh, baseMap, pants, shirtHex) {
  if (dyeCache.has(key)) return dyeCache.get(key);
  const g = mesh.geometry, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, ix = g.index;
  const nI = ix ? ix.count : g.attributes.position.count;
  const bones = mesh.skeleton.bones;
  const legB = bones.map((b) => /^(Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)$/.test(b.name));
  const footB = bones.map((b) => /Foot|Toe/.test(b.name));
  const torsoB = bones.map((b) => /^(Hips|Spine|Spine01|Spine02|neck|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm)$/.test(b.name));
  const wOf = (i, arr) => (arr[si.getX(i)] ? sw.getX(i) : 0) + (arr[si.getY(i)] ? sw.getY(i) : 0) + (arr[si.getZ(i)] ? sw.getZ(i) : 0) + (arr[si.getW(i)] ? sw.getW(i) : 0);
  const img = baseMap.image, W = img.width, H = img.height;
  const maskOf = (test) => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#fff"; x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath();
    for (let t = 0; t < nI; t += 3) {
      const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, cc = ix ? ix.getX(t + 2) : t + 2;
      if (!test(a) && !test(b) && !test(cc)) continue;
      x.moveTo(uv.getX(a) * W, uv.getY(a) * H); x.lineTo(uv.getX(b) * W, uv.getY(b) * H); x.lineTo(uv.getX(cc) * W, uv.getY(cc) * H); x.closePath();
    }
    x.fill(); x.stroke();
    return x.getImageData(0, 0, W, H).data;
  };
  const legM = pants && pants.id !== "orig" ? maskOf((i) => wOf(i, legB) > 0.5 && wOf(i, footB) < 0.3) : null;
  const torsoM = shirtHex != null ? maskOf((i) => wOf(i, torsoB) > 0.5) : null;
  const cv = imgCanvas(img), ctx = cv.getContext("2d", { willReadFrequently: true });
  const id = ctx.getImageData(0, 0, W, H), d = id.data, o = d.slice(); // classify on the original colours
  const lum = (i) => o[i] * 0.3 + o[i + 1] * 0.55 + o[i + 2] * 0.15;
  const skin = (i) => o[i] > o[i + 1] && o[i + 1] >= o[i + 2] - 4 && o[i] - o[i + 2] > 22;
  const denim = (i) => !skin(i) && (o[i + 2] - o[i] > 6 || lum(i) < 60);
  const tee = (i) => { const mx = Math.max(o[i], o[i + 1], o[i + 2]), mn = Math.min(o[i], o[i + 1], o[i + 2]); return !skin(i) && mx - mn < 26 && lum(i) > 70 && o[i + 2] - o[i] < 12; };
  const recolor = (mask, test, tint, camo) => {
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (mask[i] > 128 && test(i)) { sum += lum(i); n++; }
    const mean = n ? sum / n : 128;
    const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
    for (let i = 0; i < d.length; i += 4) {
      if (mask[i] < 128 || !test(i)) continue;
      const k = Math.pow(lum(i) / mean, 0.9);
      d[i] = Math.min(255, (camo ? camo[i] : tr) * k); d[i + 1] = Math.min(255, (camo ? camo[i + 1] : tg) * k); d[i + 2] = Math.min(255, (camo ? camo[i + 2] : tb) * k);
    }
  };
  if (torsoM) recolor(torsoM, tee, shirtHex);
  if (legM) recolor(legM, denim, pants.tint ?? 0x777777, pants.camo ? camoCanvas(W, H, pants.camo) : null);
  ctx.putImageData(id, 0, 0);
  const t = canvasTexFrom(cv, baseMap, true);
  dyeCache.set(key, t);
  return t;
}

/* ---------- skin-tone matching for face swaps ---------- */
function imgCanvas(img, w = img.width, h = img.height) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, w, h);
  return c;
}
const toneCache = new Map();
function skinTone(name) {
  if (toneCache.has(name)) return toneCache.get(name);
  let map = null;
  ready.get(name).scene.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.name === "head" && m.map) map = m.map; }); });
  if (!map) return null;
  const c = imgCanvas(map.image, 256, 256), ctx = c.getContext("2d");
  let r = 0, g = 0, b = 0, n = 0;
  for (const [u, v] of [[0.5, 0.26], [0.37, 0.44], [0.63, 0.44], [0.5, 0.36]]) {
    const d = ctx.getImageData(Math.round(u * 256) - 6, Math.round(v * 256) - 6, 12, 12).data;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  }
  const t = [r / n, g / n, b / n];
  toneCache.set(name, t);
  return t;
}
const retoneCache = new Map();
// per-vertex "how much does the head bone (or a facial bone) drive this vertex"
function headWeight(mesh, headName = BONES.head) {
  const isHead = mesh.skeleton.bones.map((b) => { for (let p = b; p; p = p.parent) if (p.name === headName) return true; return false; });
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  return (i) => (isHead[si.getX(i)] ? sw.getX(i) : 0) + (isHead[si.getY(i)] ? sw.getY(i) : 0) + (isHead[si.getZ(i)] ? sw.getZ(i) : 0) + (isHead[si.getW(i)] ? sw.getW(i) : 0);
}
// same vertex data, only the triangles that pass keep(a, b, c)
function subsetGeometry(g, keep) {
  const out = new THREE.BufferGeometry();
  for (const k in g.attributes) out.setAttribute(k, g.attributes[k]);
  const idx = [], n = g.index ? g.index.count : g.attributes.position.count;
  for (let t = 0; t < n; t += 3) {
    const a = g.index ? g.index.getX(t) : t, b = g.index ? g.index.getX(t + 1) : t + 1, c = g.index ? g.index.getX(t + 2) : t + 2;
    if (keep(a, b, c)) idx.push(a, b, c);
  }
  out.setIndex(idx);
  out.boundingSphere = g.boundingSphere; out.boundingBox = g.boundingBox;
  return out;
}
// Texture with the bare skin shifted from one person's tone to another's.
function retonedBodyMap(outfitName, faceName, bodyMesh, bodyMat, part = "body") {
  const key = outfitName + ">" + faceName + ":" + part;
  if (retoneCache.has(key)) return retoneCache.get(key);
  const from = skinTone(outfitName), to = skinTone(faceName);
  if (!from || !to || !bodyMat.map) return null;
  const diff = Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) + Math.abs(from[2] - to[2]);
  if (diff < 18) { retoneCache.set(key, null); return null; }
  const img = bodyMat.map.image, W = img.width, H = img.height;
  // 1) mask = triangles driven by arm / hand / neck bones
  const mask = document.createElement("canvas"); mask.width = W; mask.height = H;
  const mctx = mask.getContext("2d", { willReadFrequently: true }); mctx.fillStyle = "#fff";
  const g = bodyMesh.geometry, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, ix = g.index;
  const skinBone = bodyMesh.skeleton.bones.map((b) => part === "neck" || /Hand|Finger|Forearm|UpperArm|Neck|Head|Clavicle/.test(b.name));
  const isSkinVert = (i) => { let w = 0; for (const [k, gw] of [[si.getX(i), sw.getX(i)], [si.getY(i), sw.getY(i)], [si.getZ(i), sw.getZ(i)], [si.getW(i), sw.getW(i)]]) if (skinBone[k]) w += gw; return w > 0.5; };
  const tri = ix ? ix.count : g.attributes.position.count;
  mctx.beginPath();
  for (let t = 0; t < tri; t += 3) {
    const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
    if (!(isSkinVert(a) || isSkinVert(b) || isSkinVert(c))) continue;
    mctx.moveTo(uv.getX(a) * W, uv.getY(a) * H); mctx.lineTo(uv.getX(b) * W, uv.getY(b) * H); mctx.lineTo(uv.getX(c) * W, uv.getY(c) * H); mctx.closePath();
  }
  mctx.fill();
  const md = mctx.getImageData(0, 0, W, H).data;
  // 2) within the mask, recolour pixels whose hue matches the original skin
  const cv = imgCanvas(img), ctx = cv.getContext("2d");
  const id = ctx.getImageData(0, 0, W, H), d = id.data;
  const fs = from[0] + from[1] + from[2], fr = from[0] / fs, fg = from[1] / fs;
  const kr = to[0] / from[0], kg = to[1] / from[1], kb = to[2] / from[2];
  for (let i = 0; i < d.length; i += 4) {
    if (md[i] < 128) continue;
    const s = d[i] + d[i + 1] + d[i + 2] + 1e-3;
    const dc = Math.abs(d[i] / s - fr) + Math.abs(d[i + 1] / s - fg);
    const lim = part === "neck" ? 0.13 : 0.06;
    if (dc > lim || s < 25) continue;
    const blend = Math.min(1, (lim - dc) / 0.025);
    d[i] += (Math.min(255, d[i] * kr) - d[i]) * blend;
    d[i + 1] += (Math.min(255, d[i + 1] * kg) - d[i + 1]) * blend;
    d[i + 2] += (Math.min(255, d[i + 2] * kb) - d[i + 2]) * blend;
  }
  ctx.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = bodyMat.map.flipY; tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = bodyMat.map.wrapS; tex.wrapT = bodyMat.map.wrapT;
  tex.anisotropy = 4;
  retoneCache.set(key, tex);
  return tex;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
// rotate `bone` (in world space) so that the point `from` (one of its descendants) moves toward `to`
function swing(bone, from, to) {
  bone.getWorldPosition(_v3);
  _v1.subVectors(from, _v3).normalize(); _v2.subVectors(to, _v3).normalize();
  if (_v1.lengthSq() < 1e-8 || _v2.lengthSq() < 1e-8) return;
  _q1.setFromUnitVectors(_v1, _v2);
  bone.getWorldQuaternion(_q2);
  _q1.multiply(_q2);
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(_q1));
  bone.updateMatrixWorld(true);
}
function twoBoneIK(up, fore, hand, target, pole) {
  const a = up.getWorldPosition(new THREE.Vector3()), b = fore.getWorldPosition(new THREE.Vector3()), c = hand.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const toT = target.clone().sub(a);
  const d = THREE.MathUtils.clamp(toT.length(), 0.05, l1 + l2 - 0.002);
  const dir = toT.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const p = pole.clone().sub(a); p.addScaledVector(dir, -p.dot(dir)).normalize();
  const elbow = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(p, l1 * Math.sqrt(1 - cosA * cosA));
  swing(up, b, elbow);
  hand.getWorldPosition(c);
  swing(fore, c, a.clone().addScaledVector(dir, d));
}

let grayCache = new WeakMap();
function grayHairTexture(tex) {
  if (grayCache.has(tex)) return grayCache.get(tex);
  const img = tex.image;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const l = Math.min(255, (a[i] * 0.3 + a[i + 1] * 0.55 + a[i + 2] * 0.15) * 2.4 + 30);
    a[i] = a[i + 1] = a[i + 2] = l;
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  grayCache.set(tex, t);
  return t;
}

export class Human {
  constructor(textures, look = DEFAULT_LOOK, { quality = 1 } = {}) {
    this.tex = textures; this.quality = quality;
    this.root = new THREE.Group();
    this.invRoot = new THREE.Matrix4(); this.rootQuat = new THREE.Quaternion();
    this.groundY = 0; this.pose = "stand"; this.speed = 0; this.walkPhase = 0; this.t = Math.random() * 100;
    this.hair = null; this.cloths = []; this.colliders = []; this.j = {};
    this.model = null; this.modelName = null; this.state = null; this.frozen = false;
    this.holdingGun = false; this.aimAt = null; this.headYaw = 0;
    this.mats = { jacket: new THREE.MeshStandardMaterial() }; // used by the shared cloth builder
    this.setLook(look);
  }
  get ready() { return !!this.model; }

  setLook(look) {
    const L = sanitize(look);
    this.look = L;
    const o = outfitFor(L);
    const face = L.face === "own" ? o.model : L.face;
    const need = [o.model, face].filter((n) => !modelReady(n));
    if (need.length) {
      Promise.all(need.map(ensureModel)).then(() => { if (this.look === L) this.setLook(L); });
      if (!this.model) return;
    } else if (this.modelName !== o.model || this.faceName !== face) this.buildModel(o.model, face);
    this.applyExtras();
  }

  /* ---------- the rigged body ---------- */
  buildModel(name, faceName = name) {
    this.disposeExtras();
    this.faceName = faceName;
    if (this.model) { this.root.remove(this.model); this.mixer?.stopAllAction(); }
    const g = ready.get(name);
    const m = SkeletonUtils.clone(g.scene);
    this.model = m; this.modelName = name;
    this.root.add(m);
    this.matList = [];
    let skinned = null;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((mt) => this.matList.push(mt));
      if (o.isSkinnedMesh) skinned = o;
    });
    this.rig = rigOf(name);
    const BN = bonesOf(name), B = {};
    for (const k in BN) B[k] = m.getObjectByName(BN[k]);
    this.B = B;
    // wear another person's head: hide ours, bind theirs to our skeleton
    this.faceMeshes = [];
    if (faceName !== name) {
      this.matList.forEach((mt) => { if (mt.name === "opacity" || mt.name === "helmet") mt.visible = false; });
      // our head mesh keeps only the neck / neckline (re-toned); the face comes from the other person
      m.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const mt = Array.isArray(o.material) ? o.material[0] : o.material;
        if (mt.name !== "head") return;
        const hw = headWeight(o);
        let hv = null;
        try { const own = new Map(); ready.get(name).scene.traverse((x) => { if (x.isSkinnedMesh) own.set(x.geometry.attributes.position, x); }); const sm0 = own.get(o.geometry.attributes.position); if (sm0) hv = hairVerts(name, sm0); } catch (e) { hv = null; }
        o.geometry = subsetGeometry(o.geometry, (a, b, c) => (hw(a) < 0.5 || hw(b) < 0.5 || hw(c) < 0.5) && !(hv && hv[a] + hv[b] + hv[c] >= 2));
        try { const t = retonedBodyMap(name, faceName, o, mt, "neck"); if (t) { mt.map = t; mt.needsUpdate = true; } } catch (e) { console.warn("neck retone failed", e); }
      });
      this.faceMeshes = this.attachFace(faceName);
      // match the bare skin of the body (hands, arms, neck) to the new face
      m.traverse((o) => {
        if (!o.isSkinnedMesh || o.name === "face") return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((mt) => {
          if (mt.name !== "body") return;
          try { const t = retonedBodyMap(name, faceName, o, mt); if (t) { mt.map = t; mt.needsUpdate = true; } } catch (e) { console.warn("skin retone failed", e); }
        });
      });
    }
    const headMats = this.faceMeshes.length ? this.faceMeshes.flatMap((fm) => (Array.isArray(fm.material) ? fm.material : [fm.material])) : this.matList;
    this.headMats = headMats.filter((mt) => mt.name === "head" && (this.faceMeshes.length || mt.visible !== false));
    // head pieces whose hair shells can be removed (+ the original mesh for rest-pose measurements)
    const srcByPos = new Map();
    ready.get(faceName).scene.traverse((o) => { if (o.isSkinnedMesh) srcByPos.set(o.geometry.attributes.position, o); });
    this.headPieces = [];
    const pieces = this.rig === "meshy" ? [] : this.faceMeshes.length ? this.faceMeshes : (() => { const a = []; m.traverse((o) => { if (o.isSkinnedMesh) a.push(o); }); return a; })();
    for (const o of pieces) {
      const mt = Array.isArray(o.material) ? o.material[0] : o.material;
      const srcMesh = srcByPos.get(o.geometry.attributes.position);
      if (mt.name === "head" && srcMesh) this.headPieces.push({ mesh: o, full: o.geometry, srcMesh });
    }
    this.headMats.forEach((mt) => (mt.userData.orig = { map: mt.map, normalMap: mt.normalMap, roughnessMap: mt.roughnessMap }));
    this.bodyParts = [];
    m.traverse((o) => {
      if (!o.isSkinnedMesh || o.name === "face") return;
      const mt = Array.isArray(o.material) ? o.material[0] : o.material;
      if ((mt.name === "body" || this.rig === "meshy") && mt.map) this.bodyParts.push({ mesh: o, mat: mt, base: mt.map });
    });
    this.hairMats = headMats.filter((mt) => mt.name === "opacity" && mt.visible !== false);
    this.hairMats.forEach((mt) => (mt.userData.origMap = mt.map));
    this.hairMat = this.hairMats[0] || null;
    // animation
    this.gender = (this.rig === "meshy" ? "b" : "") + (outfitFor(this.look).body === "female" ? "f" : "m");
    this.mixer = new THREE.AnimationMixer(m);
    this.actions = {};
    for (const c of clips[this.gender] || []) {
      const a = this.mixer.clipAction(c);
      if (c.name === "death") { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
      this.actions[c.name] = a;
    }
    this.state = null; this.sitFixed = false; this.dead = false;
    // attachment frames, measured in the bind pose (root-local space)
    this.root.updateMatrixWorld(true);
    const inv0 = this.root.matrixWorld.clone().invert();
    const P = (bone) => bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv0);
    const hInfo = headInfo(faceName);
    const headC = B.head.localToWorld(hInfo.local.clone()).applyMatrix4(inv0), headR = hInfo.r;
    const frame = (bone, pos, s = 1) => {
      const f = new THREE.Object3D();
      bone.add(f);
      const D = new THREE.Matrix4().compose(pos, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      const Bm = new THREE.Matrix4().multiplyMatrices(inv0, bone.matrixWorld);
      f.matrix.copy(Bm.invert().multiply(D));
      f.matrix.decompose(f.position, f.quaternion, f.scale);
      return f;
    };
    const lUp = P(B.lUp), rUp = P(B.rUp);
    const shoulderY = (lUp.y + rUp.y) / 2;
    const s2 = P(B.spine2);
    this.headR = headR;
    this.j = {
      head: frame(B.head, headC, headR / 0.1),
      neck: frame(B.neck, P(B.neck)),
      chest: frame(B.spine2, new THREE.Vector3(s2.x, shoulderY - 0.16, s2.z)),
      spine: frame(B.spine1 || B.spine, P(B.spine1 || B.spine)),
      hips: frame(B.pelvis, P(B.pelvis)),
      shoulderL: frame(B.lUp, lUp), shoulderR: frame(B.rUp, rUp),
      elbowL: frame(B.lFore, P(B.lFore)), elbowR: frame(B.rFore, P(B.rFore)),
      handL: frame(B.lHand, P(B.lHand)), handR: frame(B.rHand, P(B.rHand)),
      hipL: frame(B.lThigh, P(B.lThigh)), hipR: frame(B.rThigh, P(B.rThigh)),
      kneeL: frame(B.lCalf, P(B.lCalf)), kneeR: frame(B.rCalf, P(B.rCalf)),
      ankleL: frame(B.lFoot, P(B.lFoot)), ankleR: frame(B.rFoot, P(B.rFoot)),
    };
    this.colliders = [];
  }

  attachFace(faceName) {
    const src = ready.get(faceName).scene;
    const find = (n) => this.model.getObjectByName(n);
    const meshes = [];
    src.traverse((sm) => {
      if (!sm.isSkinnedMesh) return;
      const srcMats = Array.isArray(sm.material) ? sm.material : [sm.material];
      if (!srcMats.some((mt) => HEAD_PARTS.includes(mt.name))) return;
      // map their bones onto ours by name; graft any facial bones we lack
      const bones = sm.skeleton.bones.map((b) => find(b.name) || null);
      for (let pass = 0; pass < 4 && bones.includes(null); pass++) {
        sm.skeleton.bones.forEach((b, i) => {
          if (bones[i]) return;
          const parent = b.parent && find(b.parent.name);
          if (!parent) return;
          const nb = new THREE.Bone(); nb.name = b.name;
          nb.position.copy(b.position); nb.quaternion.copy(b.quaternion); nb.scale.copy(b.scale);
          parent.add(nb); bones[i] = nb;
        });
      }
      for (let i = 0; i < bones.length; i++) if (!bones[i]) bones[i] = this.B.head;
      const mats = srcMats.map((mt) => { const c = mt.clone(); c.visible = HEAD_PARTS.includes(mt.name); return c; });
      let geo = sm.geometry;
      if (srcMats[0].name === "head") { const hw = headWeight(sm); geo = subsetGeometry(geo, (a, b, c) => hw(a) > 0.5 || hw(b) > 0.5 || hw(c) > 0.5); }
      const mesh = new THREE.SkinnedMesh(geo, Array.isArray(sm.material) ? mats : mats[0]);
      mesh.name = "face";
      mesh.position.copy(sm.position); mesh.quaternion.copy(sm.quaternion); mesh.scale.copy(sm.scale);
      (find(sm.parent.name) || this.model).add(mesh);
      mesh.bind(new THREE.Skeleton(bones, sm.skeleton.boneInverses.map((x) => x.clone())), sm.bindMatrix.clone());
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      meshes.push(mesh);
    });
    return meshes;
  }

  /* ---------- hair, cloth, gear ---------- */
  disposeExtras() {
    if (this.hair) { this.hair.dispose(); this.hair = null; }
    this.cloths.forEach((c) => c.dispose()); this.cloths = [];
    if (this.mask) { this.mask.parent?.remove(this.mask); this.mask = null; }
    if (this.scalp) { this.scalp.parent?.remove(this.scalp); this.scalp.geometry.dispose(); this.scalp = null; }
  }
  applyExtras() {
    this.disposeExtras();
    const L = this.look;
    const col = HAIR_COLORS.find((c) => c.id === L.hairColor);
    const natural = !col || col.hex === null;
    // the model's own hair (alpha-card hair on most women, painted on most men)
    // bald scalp unless the model's own hair is chosen
    const rb = this.rig !== "meshy";
    const bald = rb && L.hair !== "natural" ? baldHeadMaps(this.faceName) : null;
    // delete the hair shells of the head mesh unless the natural hair is worn
    for (const hp of this.headPieces || []) {
      let geo = hp.full;
      if (L.hair !== "natural") {
        try {
          const hv = hairVerts(this.faceName, hp.srcMesh);
          hp.bald = hp.bald || subsetGeometry(hp.full, (a, b, c) => hv[a] + hv[b] + hv[c] < 2);
          geo = hp.bald;
        } catch (e) { console.warn("hair shell removal failed", e); }
      }
      if (hp.mesh.geometry !== geo) hp.mesh.geometry = geo;
    }

    for (const hm of this.headMats || []) {
      const o = hm.userData.orig, src = bald || o;
      hm.map = src.map; hm.normalMap = src.normalMap || o.normalMap; hm.roughnessMap = src.roughnessMap || o.roughnessMap;
      hm.needsUpdate = true;
    }
    // pants dye
    const pants = PANTS.find((p) => p.id === L.pants), outfit = outfitFor(L);
    for (const bp of this.bodyParts || []) {
      let map = bp.base;
      if (!rb) {
        if ((pants && pants.id !== "orig") || outfit.shirt != null) try { map = baseDyeMap(`${this.modelName}>${pants?.id}>${outfit.shirt}`, bp.mesh, bp.base, pants, outfit.shirt); } catch (e) { console.warn("dye failed", e); }
      } else if (pants && pants.id !== "orig") { try { map = pantsMap(`${this.modelName}>${this.faceName}>${pants.id}`, bp.mesh, bp.base, skinTone(this.faceName), pants); } catch (e) { console.warn("pants dye failed", e); } }
      if (bp.mat.map !== map) { bp.mat.map = map; bp.mat.needsUpdate = true; }
    }
    for (const hm of this.hairMats || []) {
      hm.visible = L.hair === "natural";
      hm.map = natural ? hm.userData.origMap : grayHairTexture(hm.userData.origMap);
      hm.color.setHex(natural ? 0xffffff : col.hex);
      hm.needsUpdate = true;
    }
    // strand hair; a Rocketbox person who goes "bald" gets a close shave (their mesh hair is removed above)
    const style = L.hair === "bald" ? (rb ? "buzz" : null) : L.hair === "natural" ? null : L.hair;
    if (style) {
      this.root.updateMatrixWorld(true);
      this.hair = new HairSystem(this, style, new THREE.Color(natural ? 0x3a2618 : col.hex), this.quality);
    }
    const item = CLOTH_ITEMS.find((c) => c.id === L.cloth);
    if (item && item.id !== "none") { this.root.updateMatrixWorld(true); Avatar.prototype.buildCloth.call(this, item); }
    if (L.mask === "respirator") this.buildMask();
  }
  // smooth skin scalp fitted to this person's skull (sits under where the hair was)
  buildScalp() {
    const info = headInfo(this.faceName), s = info.r / 0.1;
    const tone = skinTone(this.faceName) || [200, 160, 140];
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${tone[0] * 0.98 | 0},${tone[1] * 0.96 | 0},${tone[2] * 0.95 | 0})`), roughness: 0.48, normalMap: this.tex.skin.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });
    const geo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.64);
    const cap = new THREE.Mesh(geo, mat);
    // shaved skull: width from the skin-only head measurement (ears trimmed), typical depth/height ratios
    const rx = info.r * 0.93, rz = info.r * 1.17, ry = info.r * 1.08;
    cap.scale.set(rx / s, ry / s, rz / s);
    cap.position.set(0, -0.012 / s, -0.018 / s);
    cap.rotation.x = -0.18;
    cap.castShadow = true; cap.receiveShadow = true;
    this.j.head.add(cap);
    this.scalp = cap;
  }
  buildMask() {
    const g = new THREE.Group();
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, map: this.tex.polymer.map, normalMap: this.tex.polymer.normalMap });
    const metal = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.35, metalness: 0.9 });
    const lensM = new THREE.MeshStandardMaterial({ color: 0x3a2a10, roughness: 0.05, metalness: 0.6, emissive: 0x1a0f00 });
    const add = (geo, mat, p, r = [0, 0, 0], s = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; g.add(m); };
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.027, 0.03, 0.03, 18), rubber, [0.036 * sx, 0.012, 0.1], [Math.PI / 2, 0, 0]);
      add(new THREE.CircleGeometry(0.023, 18), lensM, [0.036 * sx, 0.012, 0.116]);
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.035, 14), rubber, [0.058 * sx, -0.07, 0.095], [Math.PI / 2, 0, 0.9 * sx]);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 14), metal, [0.069 * sx, -0.075, 0.11], [Math.PI / 2, 0, 0.9 * sx]);
    }
    add(new THREE.BoxGeometry(0.02, 0.012, 0.012), rubber, [0, 0.014, 0.11]);
    add(new THREE.TorusGeometry(0.106, 0.007, 6, 30), rubber, [0, 0.012, -0.004], [Math.PI / 2, 0, 0], [0.98, 1.06, 1]);
    add(new THREE.SphereGeometry(0.064, 16, 12), rubber, [0, -0.058, 0.08], [0, 0, 0], [1.05, 0.95, 0.85]);
    add(new THREE.CylinderGeometry(0.018, 0.022, 0.025, 12), metal, [0, -0.07, 0.136], [Math.PI / 2, 0, 0]);
    this.j.head.add(g);
    this.mask = g;
  }

  setPose(p) { this.pose = p; }
  resetSim() { if (this.hair) this.hair.needsReset = true; this.cloths.forEach((c) => (c.needsReset = true)); }

  /* ---------- per frame ---------- */
  // play the death clip if this rig has one (returns false when it can only freeze)
  die() {
    if (!this.actions?.death) return false;
    this.dead = true; this.holdingGun = false;
    return true;
  }
  pickState() {
    if (this.dead) return "death";
    if (this.pose === "sit") return "sit";
    if (this.speed > 3.2) return "run";
    if (this.speed > 0.15) return "walk";
    return "idle";
  }
  update(dt, wind) {
    if (!this.model) return;
    this.t += dt;
    if (!this.frozen) {
      const st = this.pickState();
      if (st !== this.state && this.actions[st]) {
        const next = this.actions[st];
        next.reset(); if (st === "idle" || (st === "sit" && this.rig !== "meshy")) next.time = Math.random() * next.getClip().duration;
        next.play();
        const prev = this.state && this.actions[this.state];
        if (prev) next.crossFadeFrom(prev, 0.3, false);
        this.state = st;
        if (st !== "sit") { this.model.position.set(0, 0, 0); this.sitFixed = false; }
      }
      const a = this.actions[this.state];
      if (a) a.timeScale = this.state === "walk" ? THREE.MathUtils.clamp(this.speed / 1.35, 0.6, 1.8) : this.state === "run" ? THREE.MathUtils.clamp(this.speed / 3.6, 0.8, 1.6) : 1;
      this.mixer.update(dt);
    }
    this.root.updateMatrixWorld(true);
    this.invRoot.copy(this.root.matrixWorld).invert();
    // seat the sitting animation's pelvis onto the bench we were placed on
    if (this.state === "sit" && !this.sitFixed) {
      const p = this.B.pelvis.getWorldPosition(new THREE.Vector3()).applyMatrix4(this.invRoot);
      this.model.position.x += 0 - p.x; this.model.position.y += 0.575 - p.y; this.model.position.z += -0.17 - p.z;
      this.sitFixed = true;
      this.root.updateMatrixWorld(true);
    }
    if (this.holdingGun && !this.frozen) this.aimArms();
    this.root.getWorldQuaternion(this.rootQuat);
    this.updateColliders();
    if (this.hair) this.hair.update(dt, this.t, wind, this.colliders.slice(0, 6));
    for (const c of this.cloths) c.update(dt, this.t, wind, this.colliders);
  }
  aimArms() {
    const B = this.B;
    const sh = B.rUp.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    if (this.aimAt) { const d = this.aimAt.clone().sub(sh); if (d.lengthSq() > 0.01) { fwd.copy(d.normalize()); fwd.y = THREE.MathUtils.clamp(fwd.y, -0.6, 0.6); fwd.normalize(); } }
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize().negate();
    const handT = sh.clone().addScaledVector(fwd, 0.5).addScaledVector(right, 0.06).add(new THREE.Vector3(0, -0.06, 0));
    twoBoneIK(B.rUp, B.rFore, B.rHand, handT, sh.clone().add(new THREE.Vector3(0, -1, 0)).addScaledVector(right, 0.5));
    const lsh = B.lUp.getWorldPosition(new THREE.Vector3());
    const supT = handT.clone().addScaledVector(fwd, 0.17).add(new THREE.Vector3(0, -0.03, 0));
    twoBoneIK(B.lUp, B.lFore, B.lHand, supT, lsh.clone().add(new THREE.Vector3(0, -1, 0)).addScaledVector(right, -0.5));
  }
  updateColliders() {
    const J = this.j, C = this.colliders;
    const set = (i, p, r) => { if (!C[i]) C[i] = { p: new THREE.Vector3(), r }; C[i].p.copy(p); C[i].r = r; };
    const w = (o) => o.getWorldPosition(new THREE.Vector3());
    const mid = (a, b, t) => w(a).lerp(w(b), t);
    const ch = w(J.chest);
    set(0, w(J.head), this.headR * 1.12);
    set(1, w(J.neck), 0.06);
    set(2, ch, 0.15);
    set(3, J.chest.localToWorld(new THREE.Vector3(0, 0.1, -0.04)), 0.13);
    set(4, w(J.shoulderL), 0.07); set(5, w(J.shoulderR), 0.07);
    set(6, w(J.hips), 0.16);
    set(7, mid(J.hipL, J.kneeL, 0.4), 0.085); set(8, mid(J.hipR, J.kneeR, 0.4), 0.085);
    set(9, mid(J.hipL, J.kneeL, 0.85), 0.072); set(10, mid(J.hipR, J.kneeR, 0.85), 0.072);
    set(11, mid(J.kneeL, J.ankleL, 0.45), 0.062); set(12, mid(J.kneeR, J.ankleR, 0.45), 0.062);
    set(13, mid(J.shoulderL, J.elbowL, 0.5), 0.055); set(14, mid(J.shoulderR, J.elbowR, 0.5), 0.055);
    set(15, w(J.spine), 0.15);
  }
}
