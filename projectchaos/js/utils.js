// Shared helpers: noise, a geometry merger that batches meshes per material,
// world-space UV projection, small math helpers.
import * as THREE from "three";

/* ---------------- deterministic random ---------------- */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 2D value noise (non tiling, for terrain) ---------------- */
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f + i * 17.3, y * f - i * 9.1) * amp;
    norm += amp; amp *= gain; f *= lac;
  }
  return s / norm;
}
export function ridged(x, y, oct = 5) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * f + i * 31.7, y * f + i * 7.7) * 2 - 1);
    s += n * n * amp; norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}
export function noise1(t, seed = 0) { return vnoise(t, seed * 13.37) * 2 - 1; }

/* ---------------- geometry batching ----------------
   Collect many primitive geometries + transforms grouped by material key,
   then emit one merged mesh per material. Keeps draw calls low on Quest. */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function mat4(pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2], "YXZ");
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
}

export class Builder {
  constructor() { this.parts = new Map(); }
  // opts.worldUV: number => re-project UVs from world-space coords (meters * scale)
  add(key, geo, matrix, opts = {}) {
    let g = geo.index ? geo.clone() : indexify(geo.clone());
    if (matrix) g.applyMatrix4(matrix);
    if (opts.worldUV) worldUV(g, opts.worldUV);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  box(key, w, h, d, pos, rot, opts) {
    return this.add(key, new THREE.BoxGeometry(w, h, d), mat4(pos, rot), opts);
  }
  cyl(key, rt, rb, h, seg, pos, rot, opts) {
    return this.add(key, new THREE.CylinderGeometry(rt, rb, h, seg), mat4(pos, rot), opts);
  }
  // Emit Group with one mesh per material key.
  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [key, geos] of this.parts) {
      const merged = mergeGeos(geos);
      const mesh = new THREE.Mesh(merged, materials[key]);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.name = key;
      group.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    return group;
  }
}

export function indexify(g) {
  const n = g.attributes.position.count;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(idx);
  return g;
}

export function mergeGeos(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (t) uv.set(t.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
    vo += p.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Box-projected UVs from world-space position so textures keep a constant
// real-world scale across differently sized walls/boards.
export function worldUV(g, scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u * scale, v * scale);
  }
  g.setAttribute("uv", uv);
}

// Push vertices of a geometry along their normals by noise -> organic rocks.
export function displace(geo, amount, freq, seed = 0) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const len = v.length() || 1;
    const n = fbm(v.x * freq + seed, v.z * freq + v.y * freq * 0.7 - seed, 4) - 0.5;
    v.multiplyScalar(1 + (n * amount) / len);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Place a mesh (whose geometry is along +Y, centered) between two points.
const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
export function placeBetween(mesh, a, b, thicknessScale = 1) {
  _d.subVectors(b, a);
  const len = _d.length();
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
  mesh.scale.set(thicknessScale, len, thicknessScale);
}

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
export function rand(a, b) { return a + Math.random() * (b - a); }
