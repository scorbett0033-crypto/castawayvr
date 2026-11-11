// The surface of the dead world: cracked dust plains, a broken highway with
// burnt-out cars, ruined concrete buildings, toppled pylons, dead trees,
// tumbleweeds blown by the wind, drifting ash and a shattered moon.
import * as THREE from "three";
import { Builder, mat4, mulberry32, fbm, ridged, displace, mergeGeos } from "./utils.js";
import { withRepeat, softDot } from "./textures.js";
import { makeSky, makeBrokenMoon } from "./sky.js";

const SIZE = 520, SEG = 260;
export const ARENA_R = 72;

const CRATERS = [
  { x: 24, z: 30, r: 7, d: 2.2 }, { x: -34, z: -4, r: 5, d: 1.6 }, { x: 52, z: -8, r: 9, d: 2.8 },
  { x: -8, z: -38, r: 4, d: 1.2 }, { x: -60, z: 48, r: 12, d: 3.5 },
];
function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  const flat = THREE.MathUtils.smoothstep(r, 25, 85);
  let hgt = (fbm(x * 0.006, z * 0.006, 5) - 0.5) * 22 * (0.12 + 0.88 * flat);
  hgt += (fbm(x * 0.03 + 3, z * 0.045, 3) - 0.5) * 2.2;
  hgt += ridged(x * 0.0045 + 7, z * 0.0045, 4) * 55 * THREE.MathUtils.smoothstep(r, 110, 240);
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1) hgt -= c.d * (1 - d * d);
    hgt += c.d * 0.45 * Math.exp(-((d - 1) * (d - 1)) / 0.06);
  }
  // road bed: flatten a strip
  const roadW = THREE.MathUtils.smoothstep(Math.abs(z - 9), 6, 3.2);
  return hgt * (1 - roadW * 0.8) + roadW * -0.2;
}

export function buildWasteland(renderer, T) {
  const scene = new THREE.Scene();
  const rnd = mulberry32(99);
  const horizon = new THREE.Color(0xb08664);
  scene.fog = new THREE.FogExp2(horizon, 0.0105);

  /* ---------- height grid ---------- */
  const N = SEG + 1, step = SIZE / SEG, half = SIZE / 2;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = rawHeight(-half + i * step, -half + j * step);
  function heightAt(x, z) {
    const fx = (x + half) / step, fz = (z + half) / step;
    const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    // match the mesh triangulation (PlaneGeometry splits quads a-b-d / b-c-d)
    const h00 = H[j * N + i], h10 = H[j * N + i + 1], h01 = H[(j + 1) * N + i], h11 = H[(j + 1) * N + i + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  /* ---------- terrain mesh ---------- */
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  const cols = new Float32Array(tp.count * 3);
  for (let k = 0; k < tp.count; k++) {
    const x = tp.getX(k), z = tp.getZ(k);
    const i = Math.round((x + half) / step), j = Math.round((z + half) / step);
    const y = H[j * N + i];
    tp.setY(k, y);
    const m = fbm(x * 0.02, z * 0.02, 3);
    const ash = THREE.MathUtils.smoothstep(-y, 0.2, 2.5) * 0.6 + (m > 0.62 ? 0.25 : 0);
    let r = 1.0 - m * 0.18, g = 0.95 - m * 0.2, b = 0.9 - m * 0.2;
    r = r * (1 - ash) + 0.62 * ash; g = g * (1 - ash) + 0.6 * ash; b = b * (1 - ash) + 0.6 * ash;
    const hi = THREE.MathUtils.smoothstep(y, 6, 30);
    r = r * (1 - hi) + 0.95 * hi; g = g * (1 - hi) + 0.72 * hi; b = b * (1 - hi) + 0.58 * hi;
    cols[k * 3] = r; cols[k * 3 + 1] = g; cols[k * 3 + 2] = b;
  }
  tg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const earth = withRepeat(T.earth, SIZE / 2.6, SIZE / 2.6);
  const terrainMat = new THREE.MeshStandardMaterial({ ...earth, vertexColors: true, roughness: 1, normalScale: new THREE.Vector2(0.75, 0.75) });
  const terrain = new THREE.Mesh(tg, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  /* ---------- materials ---------- */
  const M = {
    concrete: new THREE.MeshStandardMaterial({ ...withRepeat(T.concrete, 1, 1), color: 0xa69a8c, roughness: 1 }),
    concreteDark: new THREE.MeshStandardMaterial({ ...withRepeat(T.concrete, 1, 1), color: 0x6c6259, roughness: 1 }),
    rust: new THREE.MeshStandardMaterial({ ...T.rustBare, metalness: 0.55, roughness: 1 }),
    carRed: new THREE.MeshStandardMaterial({ ...T.rustRed, metalness: 0.5, roughness: 1 }),
    carBlue: new THREE.MeshStandardMaterial({ ...T.rustBlue, metalness: 0.5, roughness: 1 }),
    carBare: new THREE.MeshStandardMaterial({ ...T.rustBare, metalness: 0.5, roughness: 1 }),
    tyre: new THREE.MeshStandardMaterial({ map: T.polymer.map, normalMap: T.polymer.normalMap, color: 0x2a2826, roughness: 0.95 }),
    void: new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.6, metalness: 0.2 }),
    bark: new THREE.MeshStandardMaterial({ ...withRepeat(T.wood, 1, 3), color: 0x5a4a3e, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ ...withRepeat(T.rock, 1, 1), color: 0x9c8673, roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ ...withRepeat(T.concrete, 1, 1), color: 0xd6cdc2, roughness: 1 }),
    line: new THREE.MeshStandardMaterial({ color: 0xb59a52, roughness: 0.9, map: T.concrete.map }),
    weed: new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.8, map: T.concrete.map }),
  };
  const solids = [];
  const colliders = [];
  const addSolid = (g) => { g.traverse((o) => { if (o.isMesh) solids.push(o); }); scene.add(g); };
  const aabb = (x0, x1, z0, z1) => colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });

  /* ---------- highway ---------- */
  {
    const RL = 400, RS = 200, W = 7;
    const g = new THREE.PlaneGeometry(RL, W, RS, 4);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), z = p.getZ(k) + 9; p.setZ(k, z); p.setY(k, heightAt(x, z) + 0.04); }
    g.computeVertexNormals();
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) * 0.25, p.getZ(k) * 0.25);
    const road = new THREE.Mesh(g, M.asphalt); road.receiveShadow = true; scene.add(road);
    // faded centre dashes
    const B = new Builder();
    for (let x = -190; x < 190; x += 6) {
      if (rnd() < 0.3) continue;
      const y = heightAt(x, 9) + 0.06;
      B.box("line", 2.6, 0.01, 0.14, [x, y, 9], [0, 0, Math.atan2(heightAt(x + 1.3, 9) - heightAt(x - 1.3, 9), 2.6)]);
    }
    scene.add(B.build(M, { castShadow: false }));
  }

  /* ---------- ruined buildings ---------- */
  const ruins = [
    [18, -22, 10, 8, 2], [-26, -16, 8, 12, 3], [-13, 30, 12, 7, 1], [32, 22, 7, 7, 2],
    [-44, 22, 14, 10, 2], [5, -52, 16, 10, 3], [46, -36, 9, 9, 1], [-46, -46, 10, 10, 2], [58, 40, 8, 12, 2],
  ];
  for (const [cx, cz, w, d, floors] of ruins) {
    const B = new Builder();
    let base = Infinity;
    for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) base = Math.min(base, heightAt(cx + ox, cz + oz));
    base -= 0.15;
    const FH = 3.2, TH = 0.3, UVo = { worldUV: 0.3 };
    const breakTop = (floors - 1) * FH + 0.8 + rnd() * 1.5;
    const walls = [
      { ax: "x", fixed: cz - d / 2, a: cx - w / 2, b: cx + w / 2 },
      { ax: "x", fixed: cz + d / 2, a: cx - w / 2, b: cx + w / 2 },
      { ax: "z", fixed: cx - w / 2, a: cz - d / 2, b: cz + d / 2 },
      { ax: "z", fixed: cx + w / 2, a: cz - d / 2, b: cz + d / 2 },
    ];
    walls.forEach((wl, wi) => {
      const len = wl.b - wl.a, ncol = Math.max(3, Math.round(len / 1.6)), cw = len / ncol;
      const door = wi === Math.floor(rnd() * 4) ? -1 : 1 + Math.floor(rnd() * (ncol - 2));
      for (let c = 0; c < ncol; c++) {
        const mid = wl.a + cw * (c + 0.5);
        const top = Math.max(0.6, breakTop + Math.sin(c * 1.7 + wi) * 1.2 + (rnd() - 0.5) * 1.6);
        let colTop = -1; // highest concrete actually built in this column
        const piece = (y0, y1) => {
          y1 = Math.min(y1, top); if (y1 - y0 < 0.05) return;
          colTop = Math.max(colTop, y1);
          const sz = [wl.ax === "x" ? cw : TH, y1 - y0, wl.ax === "x" ? TH : cw];
          const pos = [wl.ax === "x" ? mid : wl.fixed, base + (y0 + y1) / 2, wl.ax === "x" ? wl.fixed : mid];
          B.box("concrete", sz[0], sz[1], sz[2], pos, [0, 0, 0], UVo);
          if (y0 < 1.0 && y1 > 0.8) {
            if (wl.ax === "x") aabb(mid - cw / 2, mid + cw / 2, wl.fixed - TH / 2 - 0.1, wl.fixed + TH / 2 + 0.1);
            else aabb(wl.fixed - TH / 2 - 0.1, wl.fixed + TH / 2 + 0.1, mid - cw / 2, mid + cw / 2);
          }
        };
        for (let f = 0; f < floors; f++) {
          const y = f * FH;
          if (f === 0 && c === door) { piece(y + 2.3, y + FH); continue; }
          if (f === 0 && c === door + 1 && rnd() < 0.3) { piece(-1, y + 0.4); continue; } // blown-out hole
          const win = (c % 2 === 1) && !(f === 0 && rnd() < 0.5);
          if (win) { piece(f === 0 ? -1 : y, y + 1.0); if (top >= y + FH) piece(y + 2.2, y + FH); }
          else piece(f === 0 ? -1 : y, y + FH);
        }
        // exposed rebar only where the broken concrete really ends (never floating over doors/windows)
        if (colTop > 0.5 && colTop >= top - 0.05 && top < floors * FH && rnd() < 0.7) {
          for (let k = 0; k < 3; k++) {
            const off = (k - 1) * cw * 0.3, L = 0.35 + rnd() * 0.5;
            const tilt = [(rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5];
            const y = base + colTop + L / 2 - 0.12; // bottom end stays buried in the wall
            const p = wl.ax === "x" ? [mid + off, y, wl.fixed] : [wl.fixed, y, mid + off];
            B.cyl("rust", 0.009, 0.009, L, 5, p, tilt);
          }
        }
      }
    });
    // floor slabs, partially collapsed
    for (let f = 1; f < floors; f++) {
      const y = base + f * FH;
      if (f * FH > breakTop - 1.3) break;
      B.box("concreteDark", w * 0.5, 0.25, d, [cx - w * 0.25, y, cz], [0, 0, 0], UVo);
      if (rnd() < 0.6) B.box("concreteDark", w * 0.5, 0.25, d * 0.9, [cx + w * 0.22, y - 1.3, cz], [0, 0, -0.52], UVo);
      else B.box("concreteDark", w * 0.45, 0.25, d * 0.5, [cx + w * 0.25, y, cz - d * 0.25], [0, 0, 0], UVo);
    }
    B.box("concreteDark", w, 0.2, d, [cx, base + 0.15, cz], [0, 0, 0], UVo);
    // rubble pile
    for (let k = 0; k < 14; k++) {
      const s = 0.3 + rnd() * 0.9;
      const px = cx + (rnd() - 0.5) * (w + 4), pz = cz + (rnd() - 0.5) * (d + 4);
      B.add("concrete", new THREE.BoxGeometry(s, s * 0.6, s * 1.3), mat4([px, heightAt(px, pz) + s * 0.2, pz], [rnd() * 3, rnd() * 3, rnd() * 3]), UVo);
    }
    addSolid(B.build(M));
  }

  /* ---------- car wrecks ---------- */
  const carShape = new THREE.Shape();
  [[-2.2, 0.32], [-2.28, 0.72], [-1.35, 0.86], [-0.62, 1.38], [0.72, 1.36], [1.32, 0.86], [2.2, 0.76], [2.26, 0.34]].forEach(([x, y], i) => (i ? carShape.lineTo(x, y) : carShape.moveTo(x, y)));
  carShape.closePath();
  const carBody = new THREE.ExtrudeGeometry(carShape, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  carBody.translate(0, 0, -0.81);
  const cars = [[-30, 7.5, 0.1, 0], [-21, 10.6, 3.0, 0], [-8, 8, 0.4, 1], [6, 11, -0.2, 0], [14, 7.2, 2.8, 2], [27, 9.5, 0.05, 0], [40, 8.2, 1.4, 0], [-55, 9, 0.2, 0], [70, 10, 3.1, 0], [-16, -6, 1.1, 0], [36, -10, 2.0, 2]];
  cars.forEach(([x, z, yaw, mode], i) => {
    const B = new Builder();
    const mat = ["carRed", "carBlue", "carBare"][i % 3];
    B.add(mat, carBody, null, { worldUV: 0.5 });
    // window holes (dark voids) and details
    for (const sz of [-0.83, 0.83]) {
      B.add("void", new THREE.BoxGeometry(0.62, 0.38, 0.02), mat4([-0.45, 1.08, sz]));
      B.add("void", new THREE.BoxGeometry(0.62, 0.38, 0.02), mat4([0.42, 1.08, sz]));
    }
    B.add("void", new THREE.BoxGeometry(0.02, 0.4, 1.4), mat4([1.02, 1.1, 0], [0, 0, 0.62]));
    B.add("void", new THREE.BoxGeometry(0.02, 0.36, 1.4), mat4([-0.98, 1.1, 0], [0, 0, -0.75]));
    B.add("rust", new THREE.BoxGeometry(0.12, 0.18, 1.7), mat4([2.27, 0.42, 0]));
    B.add("rust", new THREE.BoxGeometry(0.12, 0.18, 1.7), mat4([-2.27, 0.42, 0]));
    for (const [wx, wz] of [[-1.4, -0.78], [-1.4, 0.78], [1.4, -0.78], [1.4, 0.78]]) {
      if (rnd() < 0.2) continue; // missing wheel
      B.add("tyre", new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), mat4([wx, 0.3, wz], [Math.PI / 2, 0, 0], [1, 1, 0.85]));
      B.add("rust", new THREE.CylinderGeometry(0.18, 0.18, 0.24, 10), mat4([wx, 0.3, wz], [Math.PI / 2, 0, 0]));
    }
    const g = B.build(M);
    const gy = heightAt(x, z);
    g.position.set(x, gy - 0.05, z);
    g.rotation.y = yaw;
    if (mode === 1) { g.rotation.x = Math.PI; g.position.y = gy + 1.4; }
    if (mode === 2) { g.rotation.x = Math.PI / 2 * 0.95; g.position.y = gy + 0.8; }
    g.rotation.z += (heightAt(x + 1, z) - heightAt(x - 1, z)) * 0.3;
    addSolid(g);
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const hx = 2.3 * c + 0.9 * s, hz = 2.3 * s + 0.9 * c;
    aabb(x - hx, x + hx, z - hz, z + hz);
  });

  /* ---------- power pylons + sagging cables ---------- */
  function pylon(B, h) {
    const legs = [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]];
    const top = 0.5;
    const pt = (lx, lz, y) => [lx * (1 - (y / h) * (1 - top / 1.6)), y, lz * (1 - (y / h) * (1 - top / 1.6))];
    for (const [lx, lz] of legs) {
      const a = new THREE.Vector3(...pt(lx, lz, 0)), b = new THREE.Vector3(...pt(lx, lz, h));
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      B.add("rust", new THREE.BoxGeometry(0.12, len, 0.12), new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    }
    for (let y = 0; y < h - 1; y += 2.4) for (let s = 0; s < 4; s++) {
      const [ax, az] = legs[s], [bx, bz] = legs[(s + 1) % 4];
      const a = new THREE.Vector3(...pt(ax, az, y)), b = new THREE.Vector3(...pt(bx, bz, y + 2.4));
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      B.add("rust", new THREE.BoxGeometry(0.05, len, 0.05), new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new THREE.Vector3(1, 1, 1)));
      const c2 = new THREE.Vector3(...pt(ax, az, y + 2.4)), d2 = new THREE.Vector3(...pt(bx, bz, y));
      B.add("rust", new THREE.BoxGeometry(0.05, c2.distanceTo(d2), 0.05), new THREE.Matrix4().compose(c2.clone().add(d2).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2.clone().sub(c2).normalize()), new THREE.Vector3(1, 1, 1)));
    }
    B.box("rust", 7, 0.25, 0.25, [0, h - 0.6, 0]);
    B.box("rust", 4.5, 0.2, 0.2, [0, h - 2.6, 0]);
    for (const x of [-3.3, 0, 3.3]) B.cyl("void", 0.08, 0.08, 0.6, 6, [x, h - 1.0, 0]);
  }
  const pylonPos = [[-60, -30], [-20, -62], [22, -96]];
  const tops = [];
  pylonPos.forEach(([x, z], i) => {
    const B = new Builder();
    pylon(B, 20);
    const g = B.build(M);
    g.position.set(x, heightAt(x, z) - 0.2, z);
    g.rotation.y = Math.atan2(40, 32);
    if (i === 1) { g.rotation.z = 1.42; g.position.y += 1.4; } // toppled
    else tops.push(new THREE.Vector3(x, heightAt(x, z) + 19.4, z));
    addSolid(g);
    if (i !== 1) aabb(x - 1.8, x + 1.8, z - 1.8, z + 1.8);
  });
  {
    const a = tops[0], b = tops[1];
    for (const off of [-3.3, 3.3]) {
      const side = new THREE.Vector3(b.z - a.z, 0, -(b.x - a.x)).normalize().multiplyScalar(off);
      const pts = [];
      for (let k = 0; k <= 20; k++) { const t = k / 20; const p = a.clone().lerp(b, t).add(side); p.y -= Math.sin(t * Math.PI) * 6; pts.push(p); }
      const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.03, 4), M.void);
      scene.add(cable);
    }
    // snapped cable dangling from the standing pylon toward the fallen one
    const p0 = tops[0].clone(), pts = [];
    for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(p0.x + k * 1.2, p0.y - k * k * 0.17, p0.z - k * 1.1));
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.03, 4), M.void));
  }

  /* ---------- dead trees ---------- */
  function tree(B, seed) {
    const r = mulberry32(seed);
    const branch = (pos, dir, len, rad, depth) => {
      const end = pos.clone().addScaledVector(dir, len);
      const mid = pos.clone().add(end).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      B.add("bark", new THREE.CylinderGeometry(rad * 0.68, rad, len, 7), new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), { worldUV: 0 });
      if (depth === 0 || rad < 0.02) return;
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const nd = dir.clone().add(new THREE.Vector3((r() - 0.5) * 1.4, r() * 0.5, (r() - 0.5) * 1.4)).normalize();
        branch(end, nd, len * (0.55 + r() * 0.25), rad * 0.62, depth - 1);
      }
    };
    branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3((r() - 0.5) * 0.2, 1, (r() - 0.5) * 0.2).normalize(), 2.4 + r() * 1.5, 0.2 + r() * 0.1, 4);
  }
  const treeProtos = [];
  for (let k = 0; k < 4; k++) { const B = new Builder(); tree(B, 300 + k * 17); treeProtos.push(B.build(M)); }
  for (let k = 0; k < 34; k++) {
    const a = rnd() * Math.PI * 2, rr = 14 + rnd() * 110;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.abs(z - 9) < 5) continue;
    const t = treeProtos[k % 4].clone();
    t.position.set(x, heightAt(x, z), z);
    t.rotation.y = rnd() * 6;
    t.scale.setScalar(0.8 + rnd() * 0.7);
    t.rotation.z = (rnd() - 0.5) * 0.25;
    scene.add(t);
    if (rr < ARENA_R + 5) { aabb(x - 0.35, x + 0.35, z - 0.35, z + 0.35); t.traverse((o) => o.isMesh && solids.push(o)); }
  }

  /* ---------- rocks & boulders (instanced) ---------- */
  const rockGeos = [0, 1, 2].map((s) => displace(new THREE.IcosahedronGeometry(1, 2), 0.55, 1.2, s * 5.3));
  const rockCounts = [130, 110, 90];
  const dummy = new THREE.Object3D();
  rockGeos.forEach((geo, gi) => {
    const im = new THREE.InstancedMesh(geo, M.rock, rockCounts[gi]);
    let n = 0;
    for (let k = 0; k < rockCounts[gi]; k++) {
      const a = rnd() * Math.PI * 2, rr = 6 + Math.pow(rnd(), 0.7) * 160;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (Math.abs(z - 9) < 4.5) continue;
      const big = rnd() < 0.12;
      const s = big ? 1.2 + rnd() * 1.6 : 0.12 + rnd() * 0.45;
      dummy.position.set(x, heightAt(x, z) - s * 0.25, z);
      dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      dummy.scale.set(s * (0.8 + rnd() * 0.6), s * (0.5 + rnd() * 0.4), s * (0.8 + rnd() * 0.6));
      dummy.updateMatrix();
      im.setMatrixAt(n++, dummy.matrix);
      if (big && rr < ARENA_R + 5) aabb(x - s * 0.8, x + s * 0.8, z - s * 0.8, z + s * 0.8);
    }
    im.count = n;
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im); solids.push(im);
  });

  /* ---------- scattered junk: tyres, bones of something big, dry weeds ---------- */
  {
    const B = new Builder();
    for (let k = 0; k < 24; k++) {
      const x = (rnd() - 0.5) * 120, z = (rnd() - 0.5) * 120;
      B.add("tyre", new THREE.TorusGeometry(0.32, 0.12, 8, 16), mat4([x, heightAt(x, z) + 0.08, z], [Math.PI / 2 + (rnd() - 0.5) * 0.4, rnd() * 3, 0]));
    }
    // ribcage of a great dead beast near the crater
    const cx = 52, cz = -8;
    for (let k = 0; k < 9; k++) {
      const z = cz - 4 + k * 1.0;
      B.add("bone", new THREE.TorusGeometry(2.6 - Math.abs(k - 4) * 0.18, 0.1, 6, 20, Math.PI * 0.85), mat4([cx, heightAt(cx, z) - 0.6, z], [0, Math.PI / 2, 0.25]));
    }
    B.add("bone", new THREE.CylinderGeometry(0.16, 0.2, 11, 8), mat4([cx, heightAt(cx, cz) + 0.1, cz - 0.5], [Math.PI / 2, 0, 0]));
    const weedGeo = (() => { const W = new Builder(); for (let s = 0; s < 9; s++) { const a = (s / 9) * Math.PI * 2, tilt = 0.35 + (s % 3) * 0.2; W.add("weed", new THREE.CylinderGeometry(0.004, 0.009, 0.42 - (s % 4) * 0.06, 4).translate(0, 0.2, 0), mat4([0, 0, 0], [tilt, a, 0])); } return mergeGeos(W.parts.get("weed")); })();
    for (let k = 0; k < 160; k++) {
      const x = (rnd() - 0.5) * 180, z = (rnd() - 0.5) * 180;
      B.add("weed", weedGeo, mat4([x, heightAt(x, z) - 0.02, z], [0, rnd() * 3, 0], [1, 0.6 + rnd(), 1]));
    }
    addSolid(B.build(M));
  }

  /* ---------- tumbleweeds ---------- */
  const twProto = (() => {
    const B = new Builder();
    const r = mulberry32(5);
    for (let k = 0; k < 46; k++) B.add("weed", new THREE.TorusGeometry(0.22 + r() * 0.16, 0.007, 3, 14, Math.PI * (0.8 + r())), mat4([0, 0, 0], [r() * 6, r() * 6, r() * 6]));
    return B.build(M, { castShadow: true });
  })();
  const tumbleweeds = [];
  for (let k = 0; k < 8; k++) {
    const t = twProto.clone();
    t.position.set((rnd() - 0.5) * 80, 0, (rnd() - 0.5) * 80);
    t.userData.v = new THREE.Vector3(); t.userData.vy = 0; t.userData.r = 0.35;
    scene.add(t); tumbleweeds.push(t);
  }

  /* ---------- drifting ash/dust ---------- */
  const DUST = 1400, DR = 26;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(DUST * 3);
  for (let k = 0; k < DUST; k++) { dp[k * 3] = (Math.random() - 0.5) * DR * 2; dp[k * 3 + 1] = Math.random() * 12; dp[k * 3 + 2] = (Math.random() - 0.5) * DR * 2; }
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: softDot("230,205,175"), size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, color: 0xd8c0a0 }));
  dust.frustumCulled = false;
  scene.add(dust);

  /* ---------- extraction beacon ---------- */
  const beaconPos = new THREE.Vector3(0, heightAt(0, 4), 4);
  const beacon = new THREE.Group();
  {
    const B = new Builder();
    B.cyl("rust", 1.3, 1.45, 0.18, 32, [0, 0.05, 0]);
    B.cyl("void", 0.08, 0.1, 2.4, 8, [1.1, 1.2, 0]);
    B.box("rust", 0.3, 0.4, 0.2, [1.1, 2.2, 0]);
    beacon.add(B.build(M));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.04, 8, 48), new THREE.MeshStandardMaterial({ color: 0x0a2a2a, emissive: 0x30e0d0, emissiveIntensity: 2 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.16; beacon.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x30e0d0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(1.1, 31, 0); beacon.add(beam);
    beacon.userData.ring = ring;
  }
  beacon.position.copy(beaconPos);
  scene.add(beacon);

  /* ---------- sky, moon, light ---------- */
  const sunDir = new THREE.Vector3(-0.55, 0.26, -0.79).normalize();
  const sky = makeSky({ sunDir, horizon, radius: 900 });
  scene.add(sky);
  const moon = makeBrokenMoon(T.rock);
  moon.position.set(250, 300, -560); moon.lookAt(0, 0, 0);
  scene.add(moon);
  scene.add(new THREE.HemisphereLight(0xc7a07c, 0x4a3628, 0.85));
  const sun = new THREE.DirectionalLight(0xffc48c, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 200 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  // environment reflections from the dusty sky
  {
    const envScene = new THREE.Scene();
    envScene.add(makeSky({ sunDir, horizon, radius: 100 }));
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x6a5240 }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = -2; envScene.add(gnd);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.03).texture;
    pm.dispose();
  }

  /* ---------- world raycast (bullets) ---------- */
  const raycaster = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  function raycastWorld(origin, dir, maxDist) {
    let best = null;
    // heightfield march
    let t = 0, prevT = 0;
    while (t < maxDist) {
      tmp.copy(origin).addScaledVector(dir, t);
      const gap = tmp.y - heightAt(tmp.x, tmp.z);
      if (gap < 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; tmp.copy(origin).addScaledVector(dir, m); if (tmp.y < heightAt(tmp.x, tmp.z)) b = m; else a = m; }
        const p = origin.clone().addScaledVector(dir, b);
        const e = 0.3;
        const n = new THREE.Vector3(heightAt(p.x - e, p.z) - heightAt(p.x + e, p.z), 2 * e, heightAt(p.x, p.z - e) - heightAt(p.x, p.z + e)).normalize();
        best = { dist: b, point: p, normal: n, surface: "dirt" };
        break;
      }
      prevT = t;
      t += Math.max(0.25, gap * 0.6);
    }
    raycaster.set(origin, dir);
    raycaster.far = best ? best.dist : maxDist;
    const hits = raycaster.intersectObjects(solids, false);
    if (hits.length) {
      const h = hits[0];
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      if (h.instanceId !== undefined && h.face) { const im = new THREE.Matrix4(); h.object.getMatrixAt(h.instanceId, im); n.copy(h.face.normal).transformDirection(im).transformDirection(h.object.matrixWorld); }
      const key = h.object.name;
      best = { dist: h.distance, point: h.point.clone(), normal: n, surface: /car|rust|void/.test(key) ? "metal" : /tyre|weed|bark/.test(key) ? "soft" : "concrete" };
    }
    return best;
  }

  return {
    scene, heightAt, colliders, solids, raycastWorld, beaconPos,
    spawn: { pos: new THREE.Vector3(0, heightAt(0, 1.5), 1.5), yaw: 0 },
    bounds: null,
    update(dt, t, player, wind) {
      sky.userData.update(t, player);
      moon.userData.update(t);
      // shadow camera follows the player
      sun.position.copy(player).addScaledVector(sunDir, 90);
      sun.target.position.copy(player);
      beacon.userData.ring.material.emissiveIntensity = 1.5 + Math.sin(t * 3) * 0.8;
      // ash drift with the wind, wrapped around the player
      const p = dg.attributes.position.array;
      for (let k = 0; k < DUST; k++) {
        const o = k * 3;
        p[o] += (wind.x * 0.8 + Math.sin(t * 1.3 + k) * 0.15) * dt;
        p[o + 1] += (wind.y + Math.sin(t * 0.7 + k * 0.37) * 0.2 - 0.12) * dt;
        p[o + 2] += (wind.z * 0.8 + Math.cos(t * 1.1 + k) * 0.15) * dt;
        if (p[o] - player.x > DR) p[o] -= DR * 2; else if (p[o] - player.x < -DR) p[o] += DR * 2;
        if (p[o + 2] - player.z > DR) p[o + 2] -= DR * 2; else if (p[o + 2] - player.z < -DR) p[o + 2] += DR * 2;
        const gy = player.y - 1;
        if (p[o + 1] < gy) p[o + 1] += 12; else if (p[o + 1] > gy + 12) p[o + 1] -= 12;
      }
      dg.attributes.position.needsUpdate = true;
      // tumbleweeds roll with the gusts and bounce on the ground
      for (const tw of tumbleweeds) {
        const u = tw.userData;
        u.v.x += (wind.x * 1.1 - u.v.x) * dt * 0.8;
        u.v.z += (wind.z * 1.1 - u.v.z) * dt * 0.8;
        tw.position.x += u.v.x * dt; tw.position.z += u.v.z * dt;
        const gy = heightAt(tw.position.x, tw.position.z) + u.r;
        u.vy -= 9.8 * dt;
        tw.position.y += u.vy * dt;
        if (tw.position.y < gy) { tw.position.y = gy; u.vy = Math.random() < 0.08 ? 1.5 + Math.random() * 2.5 : Math.abs(u.vy) * 0.2; }
        const sp = Math.hypot(u.v.x, u.v.z);
        if (sp > 0.01) tw.rotateOnWorldAxis(tmp.set(u.v.z / sp, 0, -u.v.x / sp), (sp / u.r) * dt);
        const dx = tw.position.x - player.x, dz = tw.position.z - player.z;
        if (dx * dx + dz * dz > 70 * 70) { // respawn upwind
          const wl = Math.hypot(wind.x, wind.z) || 1;
          tw.position.set(player.x - (wind.x / wl) * 55 + (Math.random() - 0.5) * 50, 0, player.z - (wind.z / wl) * 55 + (Math.random() - 0.5) * 50);
          tw.position.y = heightAt(tw.position.x, tw.position.z) + 2;
        }
      }
    },
  };
}
