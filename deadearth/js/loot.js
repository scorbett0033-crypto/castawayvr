// Physical loot: shiny gold coins and ammo boxes that spill on the ground.
// - coins you BLEED (owner "self") must be grabbed and pressed back into your wound
// - coins dropped by raiders / on death (owner "drop") can be pulled to your wrist with a flick
import * as THREE from "three";

const COIN_R = 0.02, COIN_T = 0.0035;
const MAX_COINS = 320;

/* ---------- textures: embossed $ face, reeded edge ---------- */
function heightToNormal(h, W, H, strength) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const l = h[y * W + Math.max(0, x - 1)], r = h[y * W + Math.min(W - 1, x + 1)];
    const u = h[Math.max(0, y - 1) * W + x], d = h[Math.min(H - 1, y + 1) * W + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    out[i * 4] = (nx * 0.5 + 0.5) * 255; out[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; out[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; out[i * 4 + 3] = 255;
  }
  return out;
}
function canvasFrom(data, W, H) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  c.getContext("2d").putImageData(new ImageData(data, W, H), 0, 0);
  return c;
}
let FACE = null;
function coinTextures() {
  if (FACE) return FACE;
  const S = 256;
  // height map: raised rim, beaded inner ring, recessed field, big raised "$"
  const hc = document.createElement("canvas"); hc.width = hc.height = S;
  const g = hc.getContext("2d");
  g.fillStyle = "#606060"; g.fillRect(0, 0, S, S);
  const C = S / 2;
  const ring = (r0, r1, col) => { g.beginPath(); g.arc(C, C, r1, 0, Math.PI * 2); g.arc(C, C, r0, 0, Math.PI * 2, true); g.fillStyle = col; g.fill("evenodd"); };
  ring(C * 0.86, C * 1.0, "#e8e8e8");                 // rim
  ring(C * 0.80, C * 0.83, "#9a9a9a");                // fine inner ring
  for (let a = 0; a < 72; a++) {                      // beads
    const t = (a / 72) * Math.PI * 2;
    g.beginPath(); g.arc(C + Math.cos(t) * C * 0.75, C + Math.sin(t) * C * 0.75, S * 0.008, 0, Math.PI * 2); g.fillStyle = "#b0b0b0"; g.fill();
  }
  g.font = `900 ${S * 0.62}px Georgia, 'Times New Roman', serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "#000"; g.shadowBlur = S * 0.02;
  g.fillStyle = "#f4f4f4"; g.fillText("$", C, C + S * 0.03);
  g.shadowBlur = 0;
  const hd = g.getImageData(0, 0, S, S).data, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = hd[i * 4] / 255;
  // soften the height so edges bevel like a struck coin
  const blur = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = Math.min(S - 1, Math.max(0, y + dy)), xx = Math.min(S - 1, Math.max(0, x + dx)); s += h[yy * S + xx]; n++; }
    blur[y * S + x] = s / n;
  }
  const normal = new THREE.CanvasTexture(canvasFrom(heightToNormal(blur, S, S, 9), S, S));
  normal.colorSpace = THREE.NoColorSpace;
  // colour: warm polished gold, slightly deeper in the recesses (cavity), brighter on raised parts
  const col = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const k = 0.78 + blur[i] * 0.3;
    col[i * 4] = Math.min(255, 255 * k); col[i * 4 + 1] = Math.min(255, 196 * k); col[i * 4 + 2] = Math.min(255, 92 * k); col[i * 4 + 3] = 255;
  }
  const map = new THREE.CanvasTexture(canvasFrom(col, S, S)); map.colorSpace = THREE.SRGBColorSpace;
  // edge: fine vertical reeding
  const E = 256, eh = new Float32Array(E * 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < E; x++) eh[y * E + x] = 0.5 + 0.5 * Math.sin((x / E) * Math.PI * 2 * 90);
  const edgeN = new THREE.CanvasTexture(canvasFrom(heightToNormal(eh, E, 8, 3), E, 8)); edgeN.colorSpace = THREE.NoColorSpace;
  edgeN.wrapS = THREE.RepeatWrapping;
  FACE = { map, normal, edgeN };
  return FACE;
}

function coinGeometry() {
  // one cylinder: group 0 = side (reeded), 1/2 = faces
  const g = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_T, 40, 1, false);
  return g;
}

/* ---------- ammo box ---------- */
function ammoBox() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.07), new THREE.MeshStandardMaterial({ color: 0x4a5235, roughness: 0.7, metalness: 0.2 }));
  box.castShadow = true; g.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.124, 0.012, 0.074), new THREE.MeshStandardMaterial({ color: 0x3c432b, roughness: 0.6, metalness: 0.3 }));
  lid.position.y = 0.034; g.add(lid);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.25, metalness: 1 });
  const tip = new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 8);
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(tip, brass); b.position.set(-0.04 + i * 0.02, 0.05, 0.02); g.add(b); }
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.062, 0.072), new THREE.MeshStandardMaterial({ color: 0xd6c25a, roughness: 0.6 }));
  strap.position.x = 0.035; g.add(strap);
  return g;
}

export class Loot {
  constructor() {
    const T = coinTextures();
    const gold = { color: 0xffffff, metalness: 1, roughness: 0.17, envMapIntensity: 1.6 };
    const side = new THREE.MeshStandardMaterial({ ...gold, color: 0xffcf72, normalMap: T.edgeN, normalScale: new THREE.Vector2(0.6, 0.6) });
    const face = new THREE.MeshStandardMaterial({ ...gold, map: T.map, normalMap: T.normal, normalScale: new THREE.Vector2(1.1, 1.1) });
    this.mesh = new THREE.InstancedMesh(coinGeometry(), [side, face, face], MAX_COINS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.coins = []; this.boxes = [];
    this._m = new THREE.Matrix4(); this._s = new THREE.Vector3(1, 1, 1);
    this.heightAt = () => 0;
    this.scene = null;
  }
  attach(scene, heightAt) {
    if (this.scene) this.clear();
    this.scene = scene; this.heightAt = heightAt;
    scene.add(this.mesh);
  }
  clear() {
    this.coins.length = 0; this.mesh.count = 0;
    for (const b of this.boxes) b.mesh.parent?.remove(b.mesh);
    this.boxes.length = 0;
  }
  // spill `total` coins' worth as up to `maxN` physical coins
  spillCoins(pos, total, owner, { maxN = 40, speed = 1.6, up = 1.4, dir = null } = {}) {
    total = Math.floor(total);
    if (total <= 0) return;
    const n = Math.max(1, Math.min(maxN, total, MAX_COINS - this.coins.length));
    if (n <= 0) return;
    const base = Math.floor(total / n);
    let rest = total - base * n;
    for (let i = 0; i < n; i++) {
      const v = base + (rest-- > 0 ? 1 : 0);
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      const vel = new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s);
      if (dir) vel.addScaledVector(dir, 1.2);
      this.coins.push({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08)),
        vel, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        spin: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
        value: v, owner, state: "fall", rest: 0, age: 0, holder: null, target: null, onArrive: null,
      });
    }
  }
  dropAmmo(pos, rounds) {
    if (rounds <= 0 || !this.scene) return;
    const m = ammoBox();
    m.position.copy(pos); m.rotation.y = Math.random() * 6;
    this.scene.add(m);
    this.boxes.push({ mesh: m, rounds, vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5), age: 0 });
  }
  // coins of `owner` on the ground within r of p
  near(p, r, owner) { return this.coins.filter((c) => (c.state === "rest" || c.state === "fall") && (!owner || c.owner === owner) && c.pos.distanceTo(p) < r); }
  hold(coins, holder) { for (const c of coins) { c.state = "held"; c.holder = holder; c.offset = new THREE.Vector3((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.04); } }
  release(holder) { for (const c of this.coins) if (c.holder === holder) { c.state = "fall"; c.holder = null; c.vel.set(0, 0, 0); } }
  heldBy(holder) { return this.coins.filter((c) => c.holder === holder); }
  // fly coins to a moving target (Object3D or function returning a Vector3); onArrive(coin) when they get there
  fly(coins, target, onArrive, delayStep = 0.025) {
    coins.forEach((c, i) => { c.state = "fly"; c.holder = null; c.target = target; c.onArrive = onArrive; c.delay = i * delayStep; c.vel.set(0, 2.5 + Math.random(), 0); });
  }
  take(coins) { const s = new Set(coins); this.coins = this.coins.filter((c) => !s.has(c)); }
  totalOnGround(owner) { let s = 0; for (const c of this.coins) if (c.state !== "fly" && (!owner || c.owner === owner)) s += c.value; return s; }

  update(dt) {
    const H = this.heightAt, tp = new THREE.Vector3(), tmp = new THREE.Vector3(), dq = new THREE.Quaternion();
    const arrived = [];
    for (const c of this.coins) {
      c.age += dt;
      if (c.state === "held") {
        c.holder.getWorldPosition(tp); c.pos.copy(tp).add(c.offset);
        c.q.slerp(c.holder.getWorldQuaternion(dq), Math.min(1, dt * 10));
        continue;
      }
      if (c.state === "fly") {
        if (c.delay > 0) { c.delay -= dt; continue; }
        if (typeof c.target === "function") tp.copy(c.target()); else c.target.getWorldPosition(tp);
        tmp.subVectors(tp, c.pos);
        const d = tmp.length();
        if (d < 0.05) { arrived.push(c); continue; }
        // homing with a little arc
        const want = tmp.multiplyScalar(Math.min(14, 3 + c.age * 6) / d);
        c.vel.lerp(want, Math.min(1, dt * 6));
        c.pos.addScaledVector(c.vel, dt);
        c.q.multiply(dq.setFromAxisAngle(tmp.set(1, 0.3, 0).normalize(), dt * 20));
        continue;
      }
      if (c.state === "fall") {
        c.vel.y -= 9.8 * dt;
        c.pos.addScaledVector(c.vel, dt);
        const sp = c.spin.length();
        if (sp > 1e-3) c.q.premultiply(dq.setFromAxisAngle(tmp.copy(c.spin).divideScalar(sp), sp * dt));
        const gy = H(c.pos.x, c.pos.z) + COIN_T / 2;
        if (c.pos.y < gy) {
          c.pos.y = gy;
          if (Math.abs(c.vel.y) > 1.2) { c.vel.y *= -0.3; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.5); }
          else {
            // settle flat with a little roll
            c.vel.multiplyScalar(Math.max(0, 1 - dt * 6)); c.vel.y = 0;
            const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(c.q.y, c.q.w) * 2, 0));
            c.q.slerp(flat, Math.min(1, dt * 8)); c.spin.multiplyScalar(Math.max(0, 1 - dt * 8));
            c.rest += dt;
            if (c.rest > 0.6 && c.vel.lengthSq() < 0.01) c.state = "rest";
          }
        }
      }
    }
    for (const c of arrived) { this.take([c]); c.onArrive && c.onArrive(c); }
    // ammo boxes
    for (const b of this.boxes) {
      b.age += dt;
      if (b.vel.lengthSq() > 0) {
        b.vel.y -= 9.8 * dt; b.mesh.position.addScaledVector(b.vel, dt);
        const gy = H(b.mesh.position.x, b.mesh.position.z) + 0.03;
        if (b.mesh.position.y < gy) { b.mesh.position.y = gy; b.vel.set(0, 0, 0); }
      }
    }
    // instances
    const n = Math.min(this.coins.length, MAX_COINS);
    for (let i = 0; i < n; i++) { const c = this.coins[i]; this._m.compose(c.pos, c.q, this._s); this.mesh.setMatrixAt(i, this._m); }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // ammo boxes the player walks over
  pickupAmmo(p, r = 0.9) {
    let got = 0;
    this.boxes = this.boxes.filter((b) => {
      if (b.age < 0.4 || b.mesh.position.distanceTo(p) > r) return true;
      got += b.rounds; b.mesh.parent?.remove(b.mesh); return false;
    });
    return got;
  }
}
