// Survivor avatar: jointed body, respirator + goggles, strand-simulated hair
// that sways in the wind and verlet cloth (scarf / cloak / duster tails)
// colliding with the body.
import * as THREE from "three";
import { mulberry32, noise1, mergeGeos, indexify } from "./utils.js";

/* ---------------- catalog ---------------- */
export const HAIR_STYLES = [
  { id: "buzz", name: "Buzz Cut", price: 0 },
  { id: "crop", name: "Messy Crop", price: 0 },
  { id: "bob", name: "Shoulder Bob", price: 200 },
  { id: "ponytail", name: "Ponytail", price: 250 },
  { id: "long", name: "Long & Loose", price: 300 },
  { id: "mohawk", name: "Mohawk", price: 400 },
  { id: "dreads", name: "Dreadlocks", price: 450 },
];
export const HAIR_COLORS = [
  { id: "black", name: "Jet Black", hex: 0x16120f, price: 0 },
  { id: "brown", name: "Chestnut", hex: 0x4a2c18, price: 0 },
  { id: "blonde", name: "Ash Blonde", hex: 0xa88d62, price: 150 },
  { id: "auburn", name: "Auburn", hex: 0x7a2e14, price: 150 },
  { id: "silver", name: "Silver", hex: 0xb4b4b8, price: 300 },
  { id: "crimson", name: "Crimson Dye", hex: 0x8e1220, price: 400 },
  { id: "teal", name: "Toxic Teal", hex: 0x1d8c84, price: 500 },
];
export const OUTFITS = [
  { id: "scav", name: "Scavenger", price: 0, jacket: 0x4c5438, jacketTex: "fabric", pants: 0x6e6149, boots: 0x3b2a1d, gloves: 0x2b2723, accent: 0x6b5a3a },
  { id: "medic", name: "Field Medic", price: 700, jacket: 0xcfcac0, jacketTex: "fabric", pants: 0x4a5869, boots: 0x22201e, gloves: 0x6f8a95, accent: 0x9c1c1c },
  { id: "leather", name: "Road Leather", price: 600, jacket: 0x3e2618, jacketTex: "leather", pants: 0x252a33, boots: 0x1e1712, gloves: 0x1e1712, accent: 0x777066 },
  { id: "nomad", name: "Desert Nomad", price: 800, jacket: 0xb5a283, jacketTex: "fabric", pants: 0x8b785a, boots: 0x5c4630, gloves: 0x7a6548, accent: 0x7a3b22 },
  { id: "hazmat", name: "Hazmat Suit", price: 900, jacket: 0xd2a91c, jacketTex: "leather", pants: 0xd2a91c, boots: 0x1b1b1b, gloves: 0x1b1b1b, accent: 0x222222 },
  { id: "nightops", name: "Night Ops", price: 1200, jacket: 0x1c1e22, jacketTex: "fabric", pants: 0x24272c, boots: 0x111111, gloves: 0x111111, accent: 0x3b4a3b },
];
export const CLOTH_ITEMS = [
  { id: "none", name: "No Cloth", price: 0 },
  { id: "scarf", name: "Desert Scarf", price: 200, color: 0x8c3b2e },
  { id: "cloak", name: "Tattered Cloak", price: 500, color: 0x4a4038 },
  { id: "duster", name: "Duster Coat", price: 650, color: 0x5a3d26 },
];
export const DEFAULT_LOOK = { hair: "crop", hairColor: "brown", outfit: "scav", cloth: "none" };

/* ---------------- hair styles ---------------- */
const STYLE_PARAMS = {
  buzz: null,
  crop: { count: 230, nodes: 4, len: 0.065, stiff: 0.75, bend: 0.25, width: 0.014, out: 0.7 },
  bob: { count: 230, nodes: 7, len: 0.2, stiff: 0.3, bend: 0.45, width: 0.016, out: 0.35, frame: true },
  long: { count: 260, nodes: 10, len: 0.4, stiff: 0.22, bend: 0.4, width: 0.016, out: 0.3, frame: true },
  ponytail: { count: 90, nodes: 3, len: 0.035, stiff: 1, bend: 0.1, width: 0.016, out: 0.2, sweepBack: true, tail: { count: 70, nodes: 9, len: 0.34, stiff: 0.2, width: 0.014 } },
  mohawk: { count: 150, nodes: 5, len: 0.14, stiff: 0.85, bend: -0.05, width: 0.018, out: 1.0, mohawk: true },
  dreads: { count: 46, nodes: 9, len: 0.33, stiff: 0.18, bend: 0.55, width: 0.022, out: 0.35, crossed: true },
};

const CAP_TILT = -0.5;
const CAP_THETA = Math.PI * 0.52;
const CAP_R = 0.109;
const CAP_C = new THREE.Vector3(0, 0.004, -0.006);

class HairSystem {
  constructor(avatar, style, color, quality) {
    this.avatar = avatar;
    const P = STYLE_PARAMS[style];
    this.group = new THREE.Group();
    const capMat = new THREE.MeshStandardMaterial({
      color, map: avatar.tex.hair.map, normalMap: avatar.tex.hair.normalMap, roughness: 0.6,
    });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(CAP_R, 32, 16, 0, Math.PI * 2, 0, style === "buzz" ? CAP_THETA * 0.97 : CAP_THETA), capMat);
    cap.position.copy(CAP_C);
    cap.rotation.x = CAP_TILT;
    if (style === "mohawk") cap.scale.set(0.985, 0.985, 0.985); // shaved sides
    cap.castShadow = true;
    avatar.j.head.add(cap);
    this.cap = cap;
    this.strands = [];
    if (!P) return;
    const rnd = mulberry32(style.length * 977 + 3);
    const capQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(CAP_TILT, 0, 0));
    const capQi = capQ.clone().invert();
    const down = new THREE.Vector3(0, -1, 0);
    const tmp = new THREE.Vector3();
    const addStrand = (root, dir0, nodes, len, stiff, bend, width) => {
      const seg = len / (nodes - 1);
      const pts = [root.clone()];
      const d = dir0.clone().normalize();
      for (let i = 1; i < nodes; i++) {
        d.addScaledVector(down, bend * 0.35).normalize();
        const p = pts[i - 1].clone().addScaledVector(d, seg);
        // keep rest shape outside the skull and the shoulders
        tmp.copy(p).sub(CAP_C);
        if (tmp.length() < 0.118) p.copy(CAP_C).addScaledVector(tmp.normalize(), 0.118);
        tmp.set(p.x, p.y + 0.37, p.z + 0.02);
        if (tmp.length() < 0.21) p.set(0, -0.37, -0.02).addScaledVector(tmp.normalize(), 0.21);
        pts.push(p);
      }
      this.strands.push({ rest: pts, seg, stiff, width, shade: 0.8 + rnd() * 0.35 });
    };
    const count = Math.round(P.count * quality);
    let tries = 0;
    while (this.strands.length < count && tries++ < count * 30) {
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (dir.lengthSq() > 1 || dir.lengthSq() < 0.01) continue;
      dir.normalize();
      const local = dir.clone().applyQuaternion(capQi);
      if (Math.acos(THREE.MathUtils.clamp(local.y, -1, 1)) > CAP_THETA * 0.96) continue;
      if (P.mohawk && Math.abs(dir.x) > 0.17) continue;
      const root = CAP_C.clone().addScaledVector(dir, CAP_R * 0.99);
      const d0 = dir.clone().multiplyScalar(P.out);
      if (P.mohawk) d0.add(new THREE.Vector3(0, 0.6, -0.15));
      else if (P.sweepBack) d0.add(new THREE.Vector3(-dir.x * 0.3, 0.2, -1));
      else d0.add(new THREE.Vector3(0, -0.4, -0.25));
      if (P.frame && dir.z > 0.25) d0.add(new THREE.Vector3(Math.sign(dir.x || 1) * 0.9, 0, -0.5)); // part away from face
      const L = P.len * (0.85 + rnd() * 0.3);
      addStrand(root, d0, P.nodes, L, P.stiff, P.bend, P.width);
    }
    if (P.tail) {
      const tie = new THREE.Vector3(0, 0.05, -0.118);
      const T = P.tail;
      const tieMesh = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.006, 6, 12), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
      tieMesh.position.copy(tie);
      avatar.j.head.add(tieMesh);
      const n = Math.round(T.count * quality);
      for (let i = 0; i < n; i++) {
        const off = new THREE.Vector3((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.01);
        addStrand(tie.clone().add(off), new THREE.Vector3(off.x * 10, -0.1, -1), T.nodes, T.len * (0.8 + rnd() * 0.35), T.stiff, 0.6, T.width);
      }
    }
    this.crossed = !!P.crossed;
    this.buildGeometry(color);
  }
  buildGeometry(color) {
    let nodes = 0;
    for (const s of this.strands) { s.offset = nodes; nodes += s.rest.length; }
    this.nodeCount = nodes;
    this.pos = new Float32Array(nodes * 3);
    this.prev = new Float32Array(nodes * 3);
    this.restW = new Float32Array(nodes * 3);
    const ribbons = this.crossed ? 2 : 1;
    const vPer = 2 * ribbons;
    const vCount = nodes * vPer;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
    const col = new Float32Array(vCount * 3);
    const idx = [];
    for (const s of this.strands) {
      const n = s.rest.length;
      for (let i = 0; i < n; i++) {
        const k = s.offset + i;
        const shade = s.shade * (0.55 + 0.45 * Math.pow(i / (n - 1), 0.6));
        for (let v = 0; v < vPer; v++) { const o = (k * vPer + v) * 3; col[o] = col[o + 1] = col[o + 2] = shade; }
        if (i < n - 1) for (let r = 0; r < ribbons; r++) {
          const a = k * vPer + r * 2, b = (k + 1) * vPer + r * 2;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.0, side: THREE.DoubleSide, vertexColors: true });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.avatar.root.add(this.mesh);
    this.vPer = vPer;
    this.needsReset = true;
  }
  computeRestWorld(headM) {
    const v = new THREE.Vector3();
    for (const s of this.strands) for (let i = 0; i < s.rest.length; i++) {
      v.copy(s.rest[i]).applyMatrix4(headM);
      const o = (s.offset + i) * 3;
      this.restW[o] = v.x; this.restW[o + 1] = v.y; this.restW[o + 2] = v.z;
    }
  }
  update(dt, t, wind, colliders) {
    if (!this.strands.length) return;
    const headM = this.avatar.j.head.matrixWorld;
    this.computeRestWorld(headM);
    const P = this.pos, Q = this.prev, R = this.restW;
    if (this.needsReset) { P.set(R); Q.set(R); this.needsReset = false; }
    const h = Math.min(dt, 1 / 30);
    const drag = 1.7, damping = 0.965, g = -9.8;
    for (let si = 0; si < this.strands.length; si++) {
      const s = this.strands[si];
      const n = s.rest.length;
      const flutter = 0.65 + 0.35 * Math.sin(t * 9 + si * 1.7);
      for (let i = 0; i < n; i++) {
        const o = (s.offset + i) * 3;
        if (i === 0) { P[o] = R[o]; P[o + 1] = R[o + 1]; P[o + 2] = R[o + 2]; Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2]; continue; }
        const vx = (P[o] - Q[o]) * damping, vy = (P[o + 1] - Q[o + 1]) * damping, vz = (P[o + 2] - Q[o + 2]) * damping;
        const ax = (wind.x * flutter - vx / h) * drag;
        const ay = g + (wind.y - vy / h) * drag;
        const az = (wind.z * flutter - vz / h) * drag;
        Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2];
        P[o] += vx + ax * h * h; P[o + 1] += vy + ay * h * h; P[o + 2] += vz + az * h * h;
        const k = s.stiff * Math.pow(1 - i / n, 2);
        P[o] += (R[o] - P[o]) * k; P[o + 1] += (R[o + 1] - P[o + 1]) * k; P[o + 2] += (R[o + 2] - P[o + 2]) * k;
      }
      // follow-the-leader length constraints + body collision
      for (let i = 1; i < n; i++) {
        const o = (s.offset + i) * 3, p = o - 3;
        let dx = P[o] - P[p], dy = P[o + 1] - P[p + 1], dz = P[o + 2] - P[p + 2];
        let l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const f = s.seg / l;
        P[o] = P[p] + dx * f; P[o + 1] = P[p + 1] + dy * f; P[o + 2] = P[p + 2] + dz * f;
        for (let c = 0; c < colliders.length; c++) {
          const C = colliders[c];
          dx = P[o] - C.p.x; dy = P[o + 1] - C.p.y; dz = P[o + 2] - C.p.z;
          const d2 = dx * dx + dy * dy + dz * dz, r = C.r + 0.006;
          if (d2 < r * r) { l = Math.sqrt(d2) || 1e-6; const m = r / l; P[o] = C.p.x + dx * m; P[o + 1] = C.p.y + dy * m; P[o + 2] = C.p.z + dz * m; }
        }
      }
    }
    this.writeMesh(colliders[0].p);
  }
  writeMesh(headCenter) {
    const inv = this.avatar.invRoot;
    const pa = this.mesh.geometry.attributes.position, na = this.mesh.geometry.attributes.normal;
    const pos = pa.array, nor = na.array, P = this.pos;
    const p = new THREE.Vector3(), tA = new THREE.Vector3(), rad = new THREE.Vector3(), side = new THREE.Vector3(), side2 = new THREE.Vector3(), nrm = new THREE.Vector3();
    const m3 = new THREE.Matrix3().setFromMatrix4(inv);
    for (const s of this.strands) {
      const n = s.rest.length;
      for (let i = 0; i < n; i++) {
        const k = s.offset + i, o = k * 3;
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        const oa = (s.offset + a) * 3, ob = (s.offset + b) * 3;
        tA.set(P[ob] - P[oa], P[ob + 1] - P[oa + 1], P[ob + 2] - P[oa + 2]).normalize();
        rad.set(P[o] - headCenter.x, P[o + 1] - headCenter.y, P[o + 2] - headCenter.z).normalize();
        side.crossVectors(tA, rad);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        nrm.crossVectors(side, tA).normalize();
        const w = s.width * (1 - 0.75 * (i / (n - 1))) * 0.5;
        p.set(P[o], P[o + 1], P[o + 2]).applyMatrix4(inv);
        const lside = side.clone().applyMatrix3(m3).normalize().multiplyScalar(w);
        const ln = nrm.applyMatrix3(m3).normalize();
        let vo = k * this.vPer * 3;
        pos[vo] = p.x - lside.x; pos[vo + 1] = p.y - lside.y; pos[vo + 2] = p.z - lside.z;
        pos[vo + 3] = p.x + lside.x; pos[vo + 4] = p.y + lside.y; pos[vo + 5] = p.z + lside.z;
        nor[vo] = nor[vo + 3] = ln.x; nor[vo + 1] = nor[vo + 4] = ln.y; nor[vo + 2] = nor[vo + 5] = ln.z;
        if (this.vPer === 4) {
          side2.copy(ln).multiplyScalar(w);
          vo += 6;
          pos[vo] = p.x - side2.x; pos[vo + 1] = p.y - side2.y; pos[vo + 2] = p.z - side2.z;
          pos[vo + 3] = p.x + side2.x; pos[vo + 4] = p.y + side2.y; pos[vo + 5] = p.z + side2.z;
          const l2 = lside.normalize();
          nor[vo] = nor[vo + 3] = l2.x; nor[vo + 1] = nor[vo + 4] = l2.y; nor[vo + 2] = nor[vo + 5] = l2.z;
        }
      }
    }
    pa.needsUpdate = true; na.needsUpdate = true;
  }
  dispose() {
    this.cap.parent?.remove(this.cap);
    this.cap.geometry.dispose();
    if (this.mesh) { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
  }
}

/* ---------------- cloth ---------------- */
class Cloth {
  // attach: Object3D whose matrixWorld drives pinned verts; init(i,j) -> local Vector3
  constructor(avatar, { w, h, attach, init, pinRow = 0, material, tatter = 0, seed = 1 }) {
    this.avatar = avatar; this.w = w; this.h = h; this.attach = attach;
    const N = w * h;
    this.N = N;
    this.local = [];
    this.pinned = new Uint8Array(N);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      this.local.push(init(i, j));
      if (j === pinRow) this.pinned[j * w + i] = 1;
    }
    this.pos = new Float32Array(N * 3);
    this.prev = new Float32Array(N * 3);
    // constraints: structural + shear + light bending
    const c = [];
    const L = (a, b, k) => c.push([a, b, this.local[a].distanceTo(this.local[b]), k]);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const a = j * w + i;
      if (i < w - 1) L(a, a + 1, 1);
      if (j < h - 1) L(a, a + w, 1);
      if (i < w - 1 && j < h - 1) { L(a, a + w + 1, 0.5); L(a + 1, a + w, 0.5); }
      if (j < h - 2) L(a, a + 2 * w, 0.25);
      if (i < w - 2) L(a, a + 2, 0.15);
    }
    this.cons = c;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const uv = new Float32Array(N * 2);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { uv[(j * w + i) * 2] = (i / (w - 1)) * 2; uv[(j * w + i) * 2 + 1] = (j / (h - 1)) * 3; }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const rnd = mulberry32(seed);
    const idx = [];
    for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
      // tattered edge: drop random quads near the hem
      if (tatter && j >= h - 3 && rnd() < tatter * (j - (h - 4)) * 0.5) continue;
      if (tatter && j > 2 && rnd() < tatter * 0.04) continue;
      const a = j * w + i;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    avatar.root.add(this.mesh);
    this.worldNormals = new Float32Array(N * 3);
    this.needsReset = true;
  }
  update(dt, t, wind, colliders) {
    const M = this.attach.matrixWorld;
    const v = new THREE.Vector3();
    const P = this.pos, Q = this.prev;
    if (this.needsReset) {
      for (let k = 0; k < this.N; k++) { v.copy(this.local[k]).applyMatrix4(M); P[k * 3] = Q[k * 3] = v.x; P[k * 3 + 1] = Q[k * 3 + 1] = v.y; P[k * 3 + 2] = Q[k * 3 + 2] = v.z; }
      this.needsReset = false;
    }
    const h = Math.min(dt, 1 / 30);
    const WN = this.worldNormals;
    for (let k = 0; k < this.N; k++) {
      const o = k * 3;
      if (this.pinned[k]) {
        v.copy(this.local[k]).applyMatrix4(M);
        P[o] = Q[o] = v.x; P[o + 1] = Q[o + 1] = v.y; P[o + 2] = Q[o + 2] = v.z;
        continue;
      }
      const vx = (P[o] - Q[o]) * 0.985, vy = (P[o + 1] - Q[o + 1]) * 0.985, vz = (P[o + 2] - Q[o + 2]) * 0.985;
      const turb = 0.75 + 0.5 * noise1(t * 3 + k * 0.13, 9);
      const rx = wind.x * turb - vx / h, ry = wind.y * turb - vy / h, rz = wind.z * turb - vz / h;
      const nx = WN[o], ny = WN[o + 1], nz = WN[o + 2];
      const dn = rx * nx + ry * ny + rz * nz;
      const aero = 1.6, drag = 0.25;
      const ax = nx * dn * aero + rx * drag, ay = -9.8 + ny * dn * aero + ry * drag, az = nz * dn * aero + rz * drag;
      Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2];
      P[o] += vx + ax * h * h; P[o + 1] += vy + ay * h * h; P[o + 2] += vz + az * h * h;
    }
    for (let it = 0; it < 4; it++) {
      for (const [a, b, rest, stiff] of this.cons) {
        const oa = a * 3, ob = b * 3;
        const dx = P[ob] - P[oa], dy = P[ob + 1] - P[oa + 1], dz = P[ob + 2] - P[oa + 2];
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (l < rest && stiff < 1) continue; // bending/shear only resist stretch
        const diff = ((l - rest) / l) * stiff;
        const pa = this.pinned[a], pb = this.pinned[b];
        if (pa && pb) continue;
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        P[oa] += dx * diff * wa; P[oa + 1] += dy * diff * wa; P[oa + 2] += dz * diff * wa;
        P[ob] -= dx * diff * wb; P[ob + 1] -= dy * diff * wb; P[ob + 2] -= dz * diff * wb;
      }
      for (let k = 0; k < this.N; k++) {
        if (this.pinned[k]) continue;
        const o = k * 3;
        for (let c = 0; c < colliders.length; c++) {
          const C = colliders[c];
          const dx = P[o] - C.p.x, dy = P[o + 1] - C.p.y, dz = P[o + 2] - C.p.z;
          const r = C.r + 0.015, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < r * r) { const l = Math.sqrt(d2) || 1e-6, m = r / l; P[o] = C.p.x + dx * m; P[o + 1] = C.p.y + dy * m; P[o + 2] = C.p.z + dz * m; }
        }
        if (P[o + 1] < this.avatar.groundY + 0.01) P[o + 1] = this.avatar.groundY + 0.01;
      }
    }
    // write to mesh in avatar-root space
    const pa = this.mesh.geometry.attributes.position;
    const inv = this.avatar.invRoot;
    for (let k = 0; k < this.N; k++) {
      v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(inv);
      pa.setXYZ(k, v.x, v.y, v.z);
    }
    pa.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    // world normals for next frame's aerodynamic force
    const na = this.mesh.geometry.attributes.normal;
    const rq = this.avatar.rootQuat;
    for (let k = 0; k < this.N; k++) {
      v.fromBufferAttribute(na, k).applyQuaternion(rq);
      WN[k * 3] = v.x; WN[k * 3 + 1] = v.y; WN[k * 3 + 2] = v.z;
    }
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); if (this.extra) this.extra.parent?.remove(this.extra); }
}

/* ---------------- glove hand (also used for the VR player's hands) ---------------- */
export function makeGlove(material, side = 1) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.095), material);
  palm.castShadow = true;
  g.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set((-0.03 + i * 0.02) * side, 0, -0.047);
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.045 - Math.abs(i - 1.5) * 0.006, 3, 6), material);
    seg.rotation.x = Math.PI / 2;
    seg.position.z = -0.025;
    f.add(seg);
    g.add(f); fingers.push(f);
  }
  const thumb = new THREE.Group();
  thumb.position.set(0.044 * side, -0.005, 0.0);
  const ts = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 3, 6), material);
  ts.rotation.x = Math.PI / 2; ts.position.z = -0.022;
  thumb.add(ts); thumb.rotation.y = 0.6 * side;
  g.add(thumb);
  g.userData.setCurl = (c) => {
    fingers.forEach((f) => (f.rotation.x = -c * 1.6));
    thumb.rotation.x = -c * 0.6;
  };
  return g;
}

/* ---------------- avatar ---------------- */
export class Avatar {
  constructor(textures, look = DEFAULT_LOOK, { quality = 1 } = {}) {
    this.tex = textures;
    this.quality = quality;
    this.root = new THREE.Group();
    this.invRoot = new THREE.Matrix4();
    this.rootQuat = new THREE.Quaternion();
    this.groundY = 0;
    this.pose = "stand";
    this.walkPhase = 0; this.speed = 0;
    this.t = Math.random() * 100;
    this.mats = {
      jacket: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      pants: new THREE.MeshStandardMaterial({ roughness: 0.95, map: textures.fabric.map, normalMap: textures.fabric.normalMap }),
      boots: new THREE.MeshStandardMaterial({ roughness: 0.6, map: textures.leather.map, normalMap: textures.leather.normalMap }),
      gloves: new THREE.MeshStandardMaterial({ roughness: 0.7, map: textures.leather.map, normalMap: textures.leather.normalMap }),
      accent: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xc69a7c, roughness: 0.6, map: textures.skin.map, normalMap: textures.skin.normalMap }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, map: textures.polymer.map, normalMap: textures.polymer.normalMap }),
      metal: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.35, metalness: 0.9 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x3a2a10, roughness: 0.05, metalness: 0.6, emissive: 0x1a0f00 }),
    };
    this.buildBody();
    this.hair = null; this.cloths = [];
    this.colliders = [];
    this.setLook(look);
  }
  joint(parent, name, x, y, z) {
    const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); this.j[name] = g; return g;
  }
  limb(parent, mat, r, len, scale = [1, 1, 1]) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
    m.position.y = -len / 2;
    m.scale.set(...scale);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  buildBody() {
    this.j = {};
    const M = this.mats;
    const hips = this.joint(this.root, "hips", 0, 0.97, 0);
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.12, 4, 10), M.pants);
    pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1, 0.78); pelvis.castShadow = true;
    hips.add(pelvis);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.018, 6, 24), M.boots);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.78, 1); belt.position.y = 0.05;
    hips.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), M.metal);
    buckle.position.set(0, 0.05, 0.128); hips.add(buckle);
    const spine = this.joint(hips, "spine", 0, 0.08, 0);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.22, 6, 14), M.jacket);
    torso.position.y = 0.17; torso.scale.set(1.18, 1, 0.74); torso.castShadow = true; torso.receiveShadow = true;
    spine.add(torso);
    const chest = this.joint(spine, "chest", 0, 0.22, 0);
    // jacket details
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.028, 8, 20), M.jacket);
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.2; chest.add(collar);
    for (const sx of [-1, 1]) {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.025), M.jacket);
      pocket.position.set(0.08 * sx, 0.03, 0.105); pocket.rotation.x = -0.12; chest.add(pocket);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.025, 0.03), M.accent);
      flap.position.set(0.08 * sx, 0.075, 0.108); chest.add(flap);
    }
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.36, 0.01), M.metal);
    zip.position.set(0, -0.06, 0.112); chest.add(zip);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.1), M.accent);
    pack.position.set(0, -0.05, -0.15); pack.castShadow = true; chest.add(pack);
    this.packMesh = pack;
    const neck = this.joint(chest, "neck", 0, 0.2, 0);
    const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.1, 10), M.skin);
    neckM.position.y = 0.03; neck.add(neckM);
    const head = this.joint(neck, "head", 0, 0.13, 0.01);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 18), M.skin);
    skull.scale.set(0.95, 1.08, 1.04); skull.castShadow = true; head.add(skull);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), M.skin);
      ear.scale.set(0.45, 1, 0.8); ear.position.set(0.094 * sx, -0.005, -0.005); head.add(ear);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.03, 0.03, 18), M.rubber);
      lens.rotation.x = Math.PI / 2; lens.position.set(0.037 * sx, -0.002, 0.092); head.add(lens);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.023, 18), M.lens);
      glass.position.set(0.037 * sx, -0.002, 0.108); head.add(glass);
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.035, 14), M.rubber);
      can.rotation.set(Math.PI / 2, 0, 0.9 * sx); can.position.set(0.055 * sx, -0.07, 0.083); head.add(can);
      const grill = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 14), M.metal);
      grill.rotation.set(Math.PI / 2, 0, 0.9 * sx); grill.position.set(0.066 * sx, -0.075, 0.097); head.add(grill);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.012), M.rubber);
    bridge.position.set(0, 0.0, 0.1); head.add(bridge);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.007, 6, 30), M.rubber);
    strap.position.set(0, -0.002, -0.004); strap.scale.set(0.96, 1.05, 1); strap.rotation.x = Math.PI / 2; head.add(strap);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), M.rubber);
    mask.scale.set(1.05, 0.95, 0.8); mask.position.set(0, -0.065, 0.068); head.add(mask);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.025, 12), M.metal);
    valve.rotation.x = Math.PI / 2; valve.position.set(0, -0.078, 0.118); head.add(valve);

    for (const sx of [1, -1]) {
      const s = sx > 0 ? "L" : "R";
      const sh = this.joint(chest, "shoulder" + s, 0.2 * sx, 0.15, 0);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), M.jacket);
      pad.scale.set(1.1, 0.9, 1); sh.add(pad);
      this.limb(sh, M.jacket, 0.052, 0.21);
      const el = this.joint(sh, "elbow" + s, 0, -0.28, 0);
      this.limb(el, M.jacket, 0.045, 0.19, [1, 1, 1]);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), M.accent);
      cuff.position.y = -0.22; el.add(cuff);
      const hand = this.joint(el, "hand" + s, 0, -0.27, 0);
      const glove = makeGlove(M.gloves, sx);
      glove.rotation.x = -Math.PI / 2;
      glove.scale.setScalar(0.95);
      glove.position.y = -0.03;
      glove.userData.setCurl(0.35);
      hand.add(glove);
      const hp = this.joint(hips, "hip" + s, 0.095 * sx, -0.04, 0);
      this.limb(hp, M.pants, 0.075, 0.33, [1, 1, 1.05]);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.1), M.pants);
      pocket.position.set(0.075 * sx, -0.22, 0); hp.add(pocket);
      const kn = this.joint(hp, "knee" + s, 0, -0.44, 0);
      this.limb(kn, M.pants, 0.06, 0.33);
      const kneepad = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.accent);
      kneepad.scale.set(1, 1.1, 0.6); kneepad.position.set(0, 0, 0.05); kn.add(kneepad);
      const an = this.joint(kn, "ankle" + s, 0, -0.43, 0);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.25), M.boots);
      boot.position.set(0, -0.0, 0.045); boot.castShadow = true; an.add(boot);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.14, 12), M.boots);
      shaft.position.y = 0.06; an.add(shaft);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.025, 0.26), M.rubber);
      sole.position.set(0, -0.045, 0.045); an.add(sole);
    }
    this.j.shoulderL.rotation.z = 0.08; this.j.shoulderR.rotation.z = -0.08;
    pack.userData.keep = true;
    this.optimize();
  }
  // Merge the static meshes hanging off each joint (per material) -> far fewer draw calls.
  optimize() {
    for (const name in this.j) {
      const joint = this.j[name];
      const groups = new Map();
      for (const c of joint.children) {
        if (!c.isMesh || c.userData.keep) continue;
        if (!groups.has(c.material)) groups.set(c.material, []);
        groups.get(c.material).push(c);
      }
      for (const [mat, meshes] of groups) {
        if (meshes.length < 2) continue;
        const geos = meshes.map((m) => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.clone() : indexify(m.geometry.clone()); g.applyMatrix4(m.matrix); return g; });
        const merged = new THREE.Mesh(mergeGeos(geos), mat);
        merged.castShadow = true; merged.receiveShadow = true;
        meshes.forEach((m) => { joint.remove(m); m.geometry.dispose(); });
        geos.forEach((g) => g.dispose());
        joint.add(merged);
      }
    }
  }
  setLook(look) {
    this.look = { ...DEFAULT_LOOK, ...look };
    const o = OUTFITS.find((x) => x.id === this.look.outfit) || OUTFITS[0];
    const jt = this.tex[o.jacketTex] || this.tex.fabric;
    Object.assign(this.mats.jacket, { map: jt.map, normalMap: jt.normalMap, roughness: o.jacketTex === "leather" ? 0.55 : 0.92 });
    this.mats.jacket.color.setHex(o.jacket);
    this.mats.jacket.needsUpdate = true;
    this.mats.pants.color.setHex(o.pants);
    this.mats.boots.color.setHex(o.boots);
    this.mats.gloves.color.setHex(o.gloves);
    this.mats.accent.color.setHex(o.accent);
    // hair
    if (this.hair) this.hair.dispose();
    const hc = (HAIR_COLORS.find((c) => c.id === this.look.hairColor) || HAIR_COLORS[0]).hex;
    this.root.updateMatrixWorld(true);
    this.hair = new HairSystem(this, this.look.hair, new THREE.Color(hc), this.quality);
    // cloth
    this.cloths.forEach((c) => c.dispose());
    this.cloths = [];
    const item = CLOTH_ITEMS.find((c) => c.id === this.look.cloth);
    if (item && item.id !== "none") this.buildCloth(item);
    this.packMesh.visible = this.look.cloth !== "cloak";
  }
  buildCloth(item) {
    const T = this.tex;
    if (item.id === "cloak") {
      const mat = new THREE.MeshStandardMaterial({ color: item.color, map: T.fabric.map, normalMap: T.fabric.normalMap, roughness: 1, side: THREE.DoubleSide });
      const W = 11, H = 15;
      this.cloths.push(new Cloth(this, {
        w: W, h: H, attach: this.j.chest, material: mat, tatter: 0.45, seed: 7,
        init: (i, j) => {
          const a = (i / (W - 1) - 0.5) * Math.PI * 1.15;
          const flare = 1 + j * 0.035;
          return new THREE.Vector3(Math.sin(a) * 0.2 * flare, 0.17 - j * 0.085, -Math.cos(a) * 0.14 * flare - 0.02 - j * 0.004);
        },
      }));
      // hood collar bunched around the neck
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 20, Math.PI * 1.3), mat);
      hood.rotation.set(Math.PI / 2, 0, -Math.PI * 0.15 - Math.PI);
      hood.position.set(0, 0.19, -0.02);
      hood.castShadow = true;
      this.j.chest.add(hood);
      this.cloths[0].extra = hood;
    } else if (item.id === "duster") {
      const mat = new THREE.MeshStandardMaterial({ color: item.color, map: T.leather.map, normalMap: T.leather.normalMap, roughness: 0.65, side: THREE.DoubleSide });
      const W = 20, H = 10;
      this.cloths.push(new Cloth(this, {
        w: W, h: H, attach: this.j.hips, material: mat, seed: 3,
        init: (i, j) => {
          const a = 0.55 + (i / (W - 1)) * (Math.PI * 2 - 1.1);
          const flare = 1 + j * 0.05;
          return new THREE.Vector3(Math.sin(a) * 0.19 * flare, 0.0 - j * 0.08, Math.cos(a) * 0.15 * flare);
        },
      }));
      this.mats.jacket.color.setHex(item.color);
      Object.assign(this.mats.jacket, { map: T.leather.map, normalMap: T.leather.normalMap, roughness: 0.65 });
      this.mats.jacket.needsUpdate = true;
    } else if (item.id === "scarf") {
      const mat = new THREE.MeshStandardMaterial({ color: item.color, map: T.fabric.map, normalMap: T.fabric.normalMap, roughness: 1, side: THREE.DoubleSide });
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.035, 10, 22), mat);
      wrap.rotation.x = Math.PI / 2 + 0.15; wrap.position.set(0, 0.23, 0.005); wrap.scale.set(1, 1, 1.2);
      wrap.castShadow = true;
      this.j.chest.add(wrap);
      const tails = [[0.05, 0.08, 0.95], [-0.02, -0.09, 0.75]];
      tails.forEach(([x, z, len], n) => {
        const W = 4, H = 12;
        const c = new Cloth(this, {
          w: W, h: H, attach: this.j.chest, material: mat, seed: 11 + n,
          init: (i, j) => new THREE.Vector3(x + (i / (W - 1) - 0.5) * 0.09, 0.22 - j * (0.6 * len) / (H - 1), z + Math.sign(z) * (0.02 + j * 0.005)),
        });
        if (n === 0) c.extra = wrap;
        this.cloths.push(c);
      });
    }
  }
  setPose(p) { this.pose = p; }
  applyPose(dt) {
    const J = this.j;
    const t = this.t;
    const breathe = Math.sin(t * 1.6) * 0.012;
    J.spine.rotation.x = breathe;
    J.neck.rotation.x = -breathe * 0.5;
    const reset = (n, x = 0, y = 0, z = 0) => J[n].rotation.set(x, y, z);
    if (this.pose === "sit") {
      J.hips.position.set(0, 0.53, -0.05);
      reset("hipL", -1.5, 0.08, 0); reset("hipR", -1.5, -0.08, 0);
      reset("kneeL", 1.45); reset("kneeR", 1.45);
      reset("ankleL", 0.05); reset("ankleR", 0.05);
      reset("shoulderL", -0.35, 0, 0.12); reset("shoulderR", -0.35, 0, -0.12);
      reset("elbowL", -0.95, 0, -0.1); reset("elbowR", -0.95, 0, 0.1);
      J.spine.rotation.x = 0.12 + breathe;
      J.head.rotation.y = noise1(t * 0.15, 3) * 0.6;
      J.head.rotation.x = 0.1 + noise1(t * 0.1, 4) * 0.15;
    } else {
      const ph = this.walkPhase;
      const amt = Math.min(1, this.speed / 2.2);
      J.hips.position.set(0, 0.97 - Math.abs(Math.sin(ph)) * 0.03 * amt, 0);
      const s = Math.sin(ph);
      reset("hipL", -s * 0.55 * amt, 0.04, 0); reset("hipR", s * 0.55 * amt, -0.04, 0);
      reset("kneeL", Math.max(0, Math.sin(ph + 1.4)) * 0.9 * amt + 0.05);
      reset("kneeR", Math.max(0, Math.sin(ph + Math.PI + 1.4)) * 0.9 * amt + 0.05);
      reset("ankleL", 0); reset("ankleR", 0);
      reset("shoulderL", s * 0.45 * amt + 0.02, 0, 0.1); reset("shoulderR", -s * 0.45 * amt + 0.02, 0, -0.1);
      reset("elbowL", -0.25 - amt * 0.3); reset("elbowR", -0.25 - amt * 0.3);
      if (this.holdingGun) { reset("shoulderR", -1.35, 0.25, -0.1); reset("elbowR", -0.2); }
      J.head.rotation.y = this.headYaw ?? noise1(t * 0.12, 5) * 0.35;
      J.head.rotation.x = noise1(t * 0.09, 6) * 0.1;
    }
  }
  updateColliders() {
    const J = this.j;
    const C = this.colliders;
    const set = (i, joint, x, y, z, r) => {
      if (!C[i]) C[i] = { p: new THREE.Vector3(), r };
      C[i].p.set(x, y, z); joint.localToWorld(C[i].p); C[i].r = r;
    };
    set(0, J.head, 0, 0.0, 0.0, 0.112);
    set(1, J.neck, 0, 0.0, 0, 0.065);
    set(2, J.chest, 0, 0.02, 0.0, 0.165);
    set(3, J.chest, 0, 0.14, -0.04, 0.14);
    set(4, J.shoulderL, 0, 0, 0, 0.085);
    set(5, J.shoulderR, 0, 0, 0, 0.085);
    set(6, J.hips, 0, 0.02, 0, 0.18);
    set(7, J.hipL, 0, -0.15, 0, 0.09);
    set(8, J.hipR, 0, -0.15, 0, 0.09);
    set(9, J.hipL, 0, -0.33, 0, 0.08);
    set(10, J.hipR, 0, -0.33, 0, 0.08);
    set(11, J.kneeL, 0, -0.18, 0, 0.07);
    set(12, J.kneeR, 0, -0.18, 0, 0.07);
    set(13, J.shoulderL, 0, -0.14, 0, 0.06);
    set(14, J.shoulderR, 0, -0.14, 0, 0.06);
    set(15, J.spine, 0, 0.05, -0.07, 0.15);
    if (this.packMesh.visible) set(16, J.chest, 0, -0.05, -0.16, 0.13); else C.length = 16;
  }
  update(dt, wind) {
    this.t += dt;
    if (this.speed > 0.05) this.walkPhase += dt * this.speed * 3.2;
    this.applyPose(dt);
    this.root.updateMatrixWorld(true);
    this.invRoot.copy(this.root.matrixWorld).invert();
    this.root.getWorldQuaternion(this.rootQuat);
    this.updateColliders();
    const hairCols = this.colliders.slice(0, 6);
    this.hair.update(dt, this.t, wind, hairCols);
    for (const c of this.cloths) c.update(dt, this.t, wind, this.colliders);
  }
  // Teleports (sit down / spawn) should not drag hair & cloth across the room.
  resetSim() { if (this.hair) this.hair.needsReset = true; this.cloths.forEach((c) => (c.needsReset = true)); }
}
