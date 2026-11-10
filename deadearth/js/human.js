// Realistic humans: fully textured, rigged people from the Microsoft Rocketbox
// avatar library (MIT), driven by mocap clips (idle / walk / run / sit).
// The wind-simulated strand hair, verlet cloth and respirator from avatar.js are
// attached to "frames" that ride on the real skeleton's bones.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/utils/SkeletonUtils.js";
import { Avatar, HairSystem, CLOTH_ITEMS, HAIR_COLORS, HAIR_STYLES, DEFAULT_LOOK, outfitFor, defaultOutfit } from "./avatar.js";

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
  if (!HAIR_STYLES.find((h) => h.id === L.hair)) L.hair = "natural";
  if (!HAIR_COLORS.find((h) => h.id === L.hairColor)) L.hairColor = "natural";
  return L;
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
    if (!modelReady(o.model)) {
      ensureModel(o.model).then(() => { if (this.look === L) this.setLook(L); });
      if (!this.model) return;
    } else if (this.modelName !== o.model) this.buildModel(o.model);
    this.applyExtras();
  }

  /* ---------- the rigged body ---------- */
  buildModel(name) {
    this.disposeExtras();
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
    this.hairMat = this.matList.find((mt) => mt.name === "opacity") || null;
    if (this.hairMat) this.hairMat.userData.origMap = this.hairMat.map;
    const B = {};
    for (const k in BONES) B[k] = m.getObjectByName(BONES[k]);
    this.B = B;
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
    let headC = P(B.head).add(new THREE.Vector3(0, 0.09, 0.015)), headR = 0.095;
    if (skinned) {
      // head centre / radius from the vertices that belong to the head bone
      const hi = skinned.skeleton.bones.indexOf(B.head);
      const pos = skinned.geometry.attributes.position, si = skinned.geometry.attributes.skinIndex, sw = skinned.geometry.attributes.skinWeight;
      const box = new THREE.Box3(), v = new THREE.Vector3();
      const mw = new THREE.Matrix4().multiplyMatrices(inv0, skinned.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], wt = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
        for (let k = 0; k < 4; k++) if (idx[k] === hi && wt[k] > 0.6) { box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mw)); break; }
      }
      if (!box.isEmpty()) {
        const sz = box.getSize(new THREE.Vector3());
        headR = THREE.MathUtils.clamp(sz.x / 2, 0.075, 0.12);
        headC = box.getCenter(new THREE.Vector3());
        headC.y = box.max.y - headR * 1.02; headC.z -= 0.01;
      }
    }
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
