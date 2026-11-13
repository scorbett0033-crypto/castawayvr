// First-person hands. The hand mesh was generated with Meshy (models/hand.glb);
// Meshy can't rig fingers, so at load time we build a 15-joint finger skeleton from
// measured landmarks and skin the mesh to it (distance-weighted to the nearest bones).
// Fingers are driven per finger: index from the trigger, middle/ring/pinky from the
// grip, thumb from button touch — or straight from hand-tracking curls.
// Frame: fingers along -Z, back of the hand +Y; right hand thumb on -X (left hand mirrored).
import * as THREE from "three";

// Landmarks on the Meshy hand after rotating it -90° about X (model units)
const LM = {
  fingers: [
    [[-0.234, -0.17, -0.29], [-0.306, -0.25, -0.877]], // index MCP -> tip
    [[-0.075, -0.17, -0.3], [-0.096, -0.27, -0.937]], // middle
    [[0.09, -0.17, -0.27], [0.075, -0.25, -0.847]], // ring
    [[0.21, -0.18, -0.18], [0.321, -0.24, -0.571]], // pinky
  ],
  thumb: [[-0.24, -0.3, 0.15], [-0.63, -0.55, -0.2]],
  wrist: [0.05, -0.15, 0.27], cuff: [0.42, 0.3, 0.62],
  palm: [-0.03, -0.2, -0.05],
  scale: 0.151, // model units -> metres (wrist to middle fingertip ≈ 18.5 cm)
};
const PART = [0.46, 0.3, 0.24];
const THUMB = [-0.6, 0.5, -0.6, -0.7]; // swing, lift, flex1, flex2 at full curl

let base = null; // { geo, mat } prepared once from the GLB

export function prepareHandAsset(gltf) {
  let src = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  if (!src) return;
  const geo = src.geometry.clone();
  geo.applyMatrix4(src.matrixWorld);
  const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  geo.applyMatrix4(m);
  const P0 = new THREE.Vector3(...LM.palm);
  geo.translate(-P0.x, -P0.y, -P0.z);
  geo.scale(LM.scale, LM.scale, LM.scale);
  const mat = src.material.clone();
  mat.side = THREE.FrontSide;
  base = { geo, mat };
}

const lmv = (a, mirror) => new THREE.Vector3((a[0] - LM.palm[0]) * LM.scale * mirror, (a[1] - LM.palm[1]) * LM.scale, (a[2] - LM.palm[2]) * LM.scale);

// quaternion whose -Z points along dir and +Y stays as close to `up` as possible
function frameQuat(dir, up = new THREE.Vector3(0, 1, 0)) {
  const z = dir.clone().normalize().negate();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function segDist(p, a, b) {
  const ab = _b.subVectors(b, a), t = THREE.MathUtils.clamp(_a.subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
  return _a.copy(a).addScaledVector(ab, t).distanceTo(p);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function makeMeshyHand(side) {
  const mirror = side === 1 ? 1 : -1; // the Meshy hand is a right hand
  const geo = base.geo.clone();
  if (mirror < 0) {
    geo.scale(-1, 1, 1);
    const idx = geo.index;
    if (idx) for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); }
    geo.computeVertexNormals();
  }
  // ---- skeleton ----
  const root = new THREE.Bone(); root.name = "palm";
  const bones = [root];
  const segs = []; // [a, b, boneIndex]
  const W = lmv(LM.wrist, mirror), C = lmv(LM.cuff, mirror);
  const wrist = new THREE.Bone(); wrist.position.copy(W); root.add(wrist); bones.push(wrist);
  segs.push([W, C, bones.length - 1]);
  const fingers = [];
  const mcps = [];
  let indexTip = null;
  const addChain = (A, Bt, isThumb) => {
    const dir = new THREE.Vector3().subVectors(Bt, A); const len = dir.length();
    const q = frameQuat(dir);
    const chain = [];
    let parent = root, prevEnd = A.clone();
    let acc = 0;
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Bone();
      if (k === 0) { b.position.copy(A); b.quaternion.copy(q); } else b.position.set(0, 0, -len * PART[k - 1]);
      parent.add(b); bones.push(b); chain.push(b);
      const s0 = A.clone().addScaledVector(dir, acc / len);
      acc += len * PART[k];
      const s1 = A.clone().addScaledVector(dir, acc / len);
      segs.push([s0, s1, bones.length - 1]);
      parent = b; prevEnd = s1;
    }
    const tip = new THREE.Object3D(); tip.position.set(0, 0, -len * PART[2]); parent.add(tip);
    return { chain, base: q.clone(), tip };
  };
  for (const [a, b] of LM.fingers) {
    const A = lmv(a, mirror), Bt = lmv(b, mirror);
    mcps.push(A);
    const f = addChain(A, Bt, false);
    if (!indexTip) indexTip = f.tip;
    fingers.push(f);
  }
  const thumb = addChain(lmv(LM.thumb[0], mirror), lmv(LM.thumb[1], mirror), true);
  // palm segments map to the root bone
  for (const m of mcps) segs.push([W, m, 0]);
  segs.push([W, lmv(LM.thumb[0], mirror), 0]);
  // ---- skin weights ----
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    let b1 = 0, d1 = Infinity, b2 = 0, d2 = Infinity;
    // best distance per bone
    const best = new Map();
    for (const [a, b, bi] of segs) { const d = segDist(p, a, b); if (!best.has(bi) || d < best.get(bi)) best.set(bi, d); }
    for (const [bi, d] of best) { if (d < d1) { b2 = b1; d2 = d1; b1 = bi; d1 = d; } else if (d < d2) { b2 = bi; d2 = d; } }
    const w1 = 1 / (Math.pow(d1, 4) + 1e-12), w2 = 1 / (Math.pow(d2, 4) + 1e-12), t = w1 + w2;
    si[i * 4] = b1; si[i * 4 + 1] = b2; sw[i * 4] = w1 / t; sw[i * 4 + 1] = w2 / t;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  const mesh = new THREE.SkinnedMesh(geo, base.mat);
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.frustumCulled = false;
  // straighten the Meshy cuff (it was modelled with the wrist bent up)
  const cuffDir = new THREE.Vector3().subVectors(C, W).normalize();
  wrist.quaternion.setFromUnitVectors(cuffDir, new THREE.Vector3(0.05 * mirror, -0.08, 1).normalize());
  const g = new THREE.Group(); g.add(mesh);
  return { g, fingers, thumb, indexTip, mirror };
}

/* ---------- procedural fallback (used only if the Meshy hand failed to load) ---------- */
function makeProceduralHand(side) {
  const mirror = side === 1 ? 1 : -1;
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd2a58a, roughness: 0.55 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin); palm.scale.set(0.043, 0.015, 0.05); g.add(palm);
  const fingers = [];
  let indexTip = null;
  const X = [-0.024, -0.008, 0.009, 0.025], LEN = [0.074, 0.081, 0.076, 0.061];
  const cap = (r, l) => { const c = new THREE.CapsuleGeometry(r, l, 3, 8); c.rotateX(Math.PI / 2); c.translate(0, 0, -l / 2); return c; };
  const chain = (start, q, len, r) => {
    const out = []; let parent = g;
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Object3D();
      if (k === 0) { b.position.copy(start); b.quaternion.copy(q); } else b.position.set(0, 0, -len * PART[k - 1]);
      b.add(new THREE.Mesh(cap(r, len * PART[k]), skin)); parent.add(b); out.push(b); parent = b;
    }
    const tip = new THREE.Object3D(); tip.position.z = -len * PART[2]; parent.add(tip);
    return { chain: out, base: q.clone(), tip };
  };
  for (let i = 0; i < 4; i++) { const f = chain(new THREE.Vector3(X[i] * mirror, 0, -0.045), new THREE.Quaternion(), LEN[i], 0.0085); fingers.push(f); if (!indexTip) indexTip = f.tip; }
  const thumb = chain(new THREE.Vector3(-0.03 * mirror, -0.006, 0.008), frameQuat(new THREE.Vector3(-0.7 * mirror, -0.3, -0.6)), 0.09, 0.01);
  return { g, fingers, thumb, indexTip, mirror };
}

export function makeHand(side = 1) {
  const H = base ? makeMeshyHand(side) : makeProceduralHand(side);
  const { g, fingers, thumb, indexTip, mirror } = H;
  const cur = [0, 0, 0, 0, 0], target = [0, 0, 0, 0, 0];
  const rx = new THREE.Quaternion(), ry = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Yv = new THREE.Vector3(0, 1, 0);
  const apply = () => {
    fingers.forEach((f, i) => {
      const c = cur[i + 1];
      const a = [-c * 1.45 - 0.08, -c * 1.6 - 0.1, -c * 1.0 - 0.06];
      f.chain[0].quaternion.copy(f.base).multiply(rx.setFromAxisAngle(X, a[0]));
      f.chain[1].quaternion.setFromAxisAngle(X, a[1]);
      f.chain[2].quaternion.setFromAxisAngle(X, a[2]);
    });
    const t = cur[0];
    // thumb swings across the palm (opposition) then flexes
    const TO = g.userData.thumbOverride || THUMB;
    thumb.chain[0].quaternion.copy(thumb.base).multiply(ry.setFromAxisAngle(Yv, t * TO[0] * mirror)).multiply(rx.setFromAxisAngle(X, t * TO[1]));
    thumb.chain[1].quaternion.setFromAxisAngle(X, t * TO[2] - 0.05);
    thumb.chain[2].quaternion.setFromAxisAngle(X, t * TO[3] - 0.05);
  };
  g.userData = {
    indexTip,
    setFingers(th, index, middle, ring = middle, pinky = middle) { target[0] = th; target[1] = index; target[2] = middle; target[3] = ring; target[4] = pinky; },
    update(dt, instant = false) {
      const k = instant ? 1 : 1 - Math.exp(-dt * 22);
      for (let i = 0; i < 5; i++) cur[i] += (target[i] - cur[i]) * k;
      apply();
    },
  };
  g.userData.setFingers(0.2, 0.15, 0.2);
  g.userData.update(0, true);
  return g;
}
