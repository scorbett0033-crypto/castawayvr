// Realistic humans: fully textured, rigged people from the Microsoft Rocketbox
// avatar library (MIT), driven by mocap clips (idle / walk / run / sit).
// The wind-simulated strand hair, verlet cloth and respirator from avatar.js are
// attached to "frames" that ride on the real skeleton's bones.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/utils/SkeletonUtils.js";
import { Avatar, HairSystem, CLOTH_ITEMS, HAIR_COLORS, HAIR_STYLES, DEFAULT_LOOK, outfitFor, defaultOutfit, faceFor } from "./avatar.js";

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
  const all = ["anims_m", "anims_f", ...new Set(names)];
  let done = 0;
  await Promise.all(all.map((n) => ensureModel(n).then(() => onProgress && onProgress(++done / all.length))));
}

const BONES = {
  pelvis: "Bip01_Pelvis", spine: "Bip01_Spine", spine1: "Bip01_Spine1", spine2: "Bip01_Spine2", neck: "Bip01_Neck", head: "Bip01_Head",
  lUp: "Bip01_L_UpperArm", lFore: "Bip01_L_Forearm", lHand: "Bip01_L_Hand", rUp: "Bip01_R_UpperArm", rFore: "Bip01_R_Forearm", rHand: "Bip01_R_Hand",
  lThigh: "Bip01_L_Thigh", lCalf: "Bip01_L_Calf", lFoot: "Bip01_L_Foot", rThigh: "Bip01_R_Thigh", rCalf: "Bip01_R_Calf", rFoot: "Bip01_R_Foot",
};

function sanitize(look) {
  const L = { ...DEFAULT_LOOK, ...look };
  if (L.body !== "male" && L.body !== "female") L.body = "male";
  if (outfitFor(L).id !== L.outfit) L.outfit = defaultOutfit(L.body);
  L.face = faceFor(L);
  if (!HAIR_STYLES.find((h) => h.id === L.hair)) L.hair = "natural";
  if (!HAIR_COLORS.find((h) => h.id === L.hairColor)) L.hairColor = "natural";
  return L;
}

// Skull centre (in the head bone's local space) + radius, measured from a model's own head vertices.
const headCache = new Map();
function headInfo(name) {
  if (headCache.has(name)) return headCache.get(name);
  const scene = ready.get(name).scene;
  scene.updateMatrixWorld(true);
  const head = scene.getObjectByName(BONES.head);
  let info = { local: head.worldToLocal(head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.09, 0.015))), r: 0.095 };
  const box = new THREE.Box3(), v = new THREE.Vector3();
  scene.traverse((sm) => {
    if (!sm.isSkinnedMesh) return;
    const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
    const g = sm.geometry, hi = sm.skeleton.bones.indexOf(head);
    const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const ranges = g.groups.length ? g.groups.filter((grp) => mats[grp.materialIndex]?.name === "head") : (mats[0].name === "head" ? [{ start: 0, count: g.index ? g.index.count : pos.count }] : []);
    for (const grp of ranges) for (let n = grp.start; n < grp.start + grp.count; n++) {
      const i = g.index ? g.index.getX(n) : n;
      const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], wt = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      for (let k = 0; k < 4; k++) if (idx[k] === hi && wt[k] > 0.6) { box.expandByPoint(sm.getVertexPosition(i, v).applyMatrix4(sm.matrixWorld)); break; }
    }
  });
  {
    if (!box.isEmpty()) {
      const sz = box.getSize(new THREE.Vector3());
      const r = THREE.MathUtils.clamp(sz.x / 2, 0.075, 0.12);
      const c = box.getCenter(new THREE.Vector3()); c.y = box.max.y - r * 1.02; c.z -= 0.01;
      info = { local: head.worldToLocal(c), r };
    }
  }
  headCache.set(name, info);
  return info;
}
const HEAD_PARTS = ["head", "opacity", "helmet"];

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
function headWeight(mesh) {
  const isHead = mesh.skeleton.bones.map((b) => { for (let p = b; p; p = p.parent) if (p.name === BONES.head) return true; return false; });
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
    const B = {};
    for (const k in BONES) B[k] = m.getObjectByName(BONES[k]);
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
        o.geometry = subsetGeometry(o.geometry, (a, b, c) => hw(a) < 0.5 || hw(b) < 0.5 || hw(c) < 0.5);
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
    this.hairMat = headMats.find((mt) => mt.name === "opacity" && mt.visible !== false) || null;
    if (this.hairMat) this.hairMat.userData.origMap = this.hairMat.map;
    // animation
    this.gender = outfitFor(this.look).body === "female" ? "f" : "m";
    this.mixer = new THREE.AnimationMixer(m);
    this.actions = {};
    for (const c of clips[this.gender] || []) {
      const a = this.mixer.clipAction(c);
      a.setLoop(THREE.LoopRepeat, Infinity);
      this.actions[c.name] = a;
    }
    this.state = null; this.sitFixed = false;
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
  }
  applyExtras() {
    this.disposeExtras();
    const L = this.look;
    const col = HAIR_COLORS.find((c) => c.id === L.hairColor);
    const natural = !col || col.hex === null;
    // the model's own hair (alpha-card hair on most women, painted on most men)
    if (this.hairMat) {
      this.hairMat.visible = L.hair === "natural";
      this.hairMat.map = natural ? this.hairMat.userData.origMap : grayHairTexture(this.hairMat.userData.origMap);
      this.hairMat.color.setHex(natural ? 0xffffff : col.hex);
      this.hairMat.needsUpdate = true;
    }
    if (L.hair !== "natural") {
      this.root.updateMatrixWorld(true);
      this.hair = new HairSystem(this, L.hair, new THREE.Color(natural ? 0x3a2618 : col.hex), this.quality);
    }
    const item = CLOTH_ITEMS.find((c) => c.id === L.cloth);
    if (item && item.id !== "none") { this.root.updateMatrixWorld(true); Avatar.prototype.buildCloth.call(this, item); }
    if (L.mask === "respirator") this.buildMask();
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
  pickState() {
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
        next.reset(); if (st === "idle" || st === "sit") next.time = Math.random() * next.getClip().duration;
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
      this.model.position.x += 0 - p.x; this.model.position.y += 0.56 - p.y; this.model.position.z += -0.08 - p.z;
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
