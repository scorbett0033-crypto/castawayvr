// The lobby: NOVA HUB, a future sky-lounge high above a living green city.
// Sittable benches, the armory, the wardrobe and the blue arena portal that
// leads to the only place the Earth is dead: the fighting arena.
import * as THREE from "three";
import { Builder, mat4, mulberry32, worldUV, mergeGeos } from "./utils.js";
import { withRepeat, canvasTex, softDot, scratchSet, leafTexture, soilTexture } from "./textures.js";
import { makeSky, Wind } from "./sky.js";
import { Human } from "./human.js";
import { buildGun, WEAPONS } from "./weapons.js";

export const HALL = { x0: -12, x1: 12, z0: -9, z1: 9, h: 5.5 };

function holoTex(text, sub, color = "#4fe3ff", w = 1024, h = 256) {
  return canvasTex(w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(10,30,50,0.85)"); g.addColorStop(1, "rgba(5,15,30,0.85)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = color; ctx.font = `700 ${Math.round(h * 0.36)}px Segoe UI, Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    ctx.shadowBlur = 0;
    if (sub) { ctx.font = `500 ${Math.round(h * 0.13)}px Segoe UI, Arial`; ctx.fillStyle = "#cfefff"; ctx.fillText(sub, w / 2, h * 0.78); }
    ctx.fillStyle = "rgba(255,255,255,0.04)"; for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
}
function towerTex() {
  const t = canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = "#3d5a74"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
      const lit = Math.random() < 0.35;
      ctx.fillStyle = lit ? `rgba(255,${220 + Math.random() * 30},${170 + Math.random() * 60},0.9)` : `rgba(${120 + Math.random() * 40},${160 + Math.random() * 40},${200 + Math.random() * 40},0.9)`;
      ctx.fillRect(x * 32 + 3, y * 16 + 3, 26, 11);
    }
    ctx.fillStyle = "rgba(230,240,250,0.9)"; for (let y = 0; y < h; y += 64) ctx.fillRect(0, y, w, 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Snake plant (Sansevieria): upright sword leaves with a V-fold, pale cross-bands and yellow margins.
function leafGeometry(h, w, dirA, lean, twist) {
  const SEG = 16, pos = [], uv = [], idx = [];
  const dir = new THREE.Vector3(Math.cos(dirA), 0, Math.sin(dirA));
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const width = w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.92)), 0.65) * (1 - Math.pow(t, 6)) + 0.002;
    const c = dir.clone().multiplyScalar(lean * h * t * t).setY(t * h);
    const a = dirA + Math.PI / 2 + twist * t;
    const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const face = new THREE.Vector3().crossVectors(side, new THREE.Vector3(0, 1, 0)).normalize();
    const L = c.clone().addScaledVector(side, -width / 2), R = c.clone().addScaledVector(side, width / 2), M = c.clone().addScaledVector(face, width * 0.18);
    pos.push(L.x, L.y, L.z, M.x, M.y, M.z, R.x, R.y, R.z);
    uv.push(0, t, 0.5, t, 1, t);
    if (i < SEG) { const b = i * 3, n = b + 3; idx.push(b, b + 1, n, b + 1, n + 1, n, b + 1, b + 2, n + 1, b + 2, n + 2, n + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function makePlant(rnd, leafMat, soilMat, potMat) {
  const g = new THREE.Group();
  const prof = [[0.0, 0.0], [0.33, 0.0], [0.35, 0.02], [0.43, 0.55], [0.46, 0.565], [0.46, 0.6], [0.425, 0.6], [0.41, 0.56]].map(([r, y]) => new THREE.Vector2(r, y));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), potMat);
  pot.castShadow = pot.receiveShadow = true; g.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.415, 40), soilMat);
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.55; soil.receiveShadow = true; g.add(soil);
  const leaves = [];
  const n = 16 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, rr = 0.03 + Math.sqrt(rnd()) * 0.2;
    const h = 0.45 + rnd() * 0.55 * (1 - rr * 2.2);
    const lg = leafGeometry(h, 0.055 + rnd() * 0.035, a + (rnd() - 0.5) * 0.6, 0.06 + rr * 0.6 + rnd() * 0.1, (rnd() - 0.5) * 1.6);
    lg.translate(Math.cos(a) * rr, 0.53, Math.sin(a) * rr);
    leaves.push(lg);
  }
  const lm = new THREE.Mesh(mergeGeos(leaves), leafMat);
  lm.castShadow = true; lm.receiveShadow = true; g.add(lm);
  return g;
}

// futuristic bench, same seat geometry as before: sitter faces +Z, seat top y=0.45, seats x=-0.6,0,0.6
function addBench(b, x, z, rotY) {
  const M = mat4([x, 0, z], [0, rotY, 0]);
  const put = (key, geo, pos, rot = [0, 0, 0], scl = [1, 1, 1]) => b.add(key, geo, M.clone().multiply(mat4(pos, rot, scl)));
  put("shell", new THREE.BoxGeometry(2.0, 0.07, 0.5), [0, 0.415, 0]);
  put("shell", new THREE.CapsuleGeometry(0.035, 2.0 - 0.07, 4, 10), [0, 0.415, 0.25], [0, 0, Math.PI / 2]);
  put("cushion", new THREE.BoxGeometry(1.92, 0.04, 0.44), [0, 0.465, 0.0]);
  put("shell", new THREE.BoxGeometry(2.0, 0.5, 0.05), [0, 0.7, -0.245], [-0.14, 0, 0]);
  put("cushion", new THREE.BoxGeometry(1.92, 0.4, 0.03), [0, 0.71, -0.21], [-0.14, 0, 0]);
  for (const sx of [-0.8, 0.8]) {
    put("chrome", new THREE.BoxGeometry(0.06, 0.4, 0.36), [sx, 0.2, -0.02]);
    put("chrome", new THREE.BoxGeometry(0.2, 0.02, 0.44), [sx, 0.01, -0.02]);
  }
  put("glow", new THREE.BoxGeometry(1.7, 0.012, 0.02), [0, 0.37, 0.2]);
}

/* ---------- sky plaza helpers ---------- */
// pale polished deck: large soft-white panels with fine seams and faint variation
function floorPanels() {
  const t = canvasTex(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#e9edf0"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 233 + ((i * 7 + j * 3) % 5) - 2; ctx.fillStyle = `rgb(${v},${v + 3},${v + 6})`; ctx.fillRect(i * 256 + 2, j * 256 + 2, 252, 252); }
    for (let k = 0; k < 900; k++) { ctx.fillStyle = `rgba(160,170,180,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1); }
    ctx.strokeStyle = "rgba(150,160,172,0.8)"; ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 256, 0); ctx.lineTo(i * 256, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * 256); ctx.lineTo(w, i * 256); ctx.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1);
  return t;
}
// a wide, thin, gently banked ribbon swept along a curve (the floating canopies)
function ribbonGeometry(points, width, thick = 0.25, segs = 120, bank = 0) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.5);
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    side.crossVectors(tg, up).normalize();
    const w = width * (0.55 + 0.45 * Math.sin(Math.PI * t)); // tapered ends
    side.applyAxisAngle(tg, bank * Math.sin(Math.PI * t));
    n.crossVectors(side, tg).normalize();
    for (const [sx, sy] of [[-1, 0.5], [1, 0.5], [1, -0.5], [-1, -0.5]]) {
      pos.push(p.x + side.x * w * 0.5 * sx + n.x * thick * sy, p.y + side.y * w * 0.5 * sx + n.y * thick * sy, p.z + side.z * w * 0.5 * sx + n.z * thick * sy);
    }
    if (i < segs) { const a = i * 4, b = a + 4; for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; idx.push(a + k, b + k, a + k2, a + k2, b + k, b + k2); } }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// pinnate palm frond texture (alpha)
let FROND = null;
function frondTexture() {
  if (FROND) return FROND;
  FROND = canvasTex(256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#5c6a2c"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(w / 2, 0); ctx.stroke();
    for (let i = 0; i < 46; i++) {
      const y = h - (i / 46) * h * 0.98, L = (w * 0.48) * Math.sin(Math.PI * (0.12 + 0.85 * i / 46)), g = 34 + (i % 3) * 8;
      for (const s of [-1, 1]) {
        ctx.fillStyle = `rgb(${g + 22},${g + 70 + (i % 5) * 4},${g})`;
        ctx.beginPath(); ctx.moveTo(w / 2, y); ctx.quadraticCurveTo(w / 2 + s * L * 0.6, y - 10, w / 2 + s * L, y - 26); ctx.quadraticCurveTo(w / 2 + s * L * 0.55, y - 2, w / 2, y + 7); ctx.fill();
      }
    }
  });
  return FROND;
}
function frondGeometry(len, width, droop) {
  const segs = 10, pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, z = -t * len, y = Math.sin(t * Math.PI * 0.55) * len * 0.25 - t * t * droop;
    for (const s of [-1, 1]) { pos.push(s * width * 0.5, y + Math.abs(s) * 0.02 * Math.sin(t * Math.PI), z); uv.push(s < 0 ? 0 : 1, t); }
    if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function makePalm(rnd, mats, height = 6) {
  const g = new THREE.Group();
  const lean = new THREE.Vector3((rnd() - 0.5) * 1.2, height, (rnd() - 0.5) * 1.2);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean.x * 0.15, height * 0.55, lean.z * 0.15), lean);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.16, 10), mats.trunk);
  trunk.castShadow = true; g.add(trunk);
  // the trunk tapers: scale the tube's radius by height
  const pa = trunk.geometry.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const t = v.y / height; const c = curve.getPoint(Math.min(1, Math.max(0, t))); v.sub(c).multiplyScalar(1.15 - 0.45 * t).add(c); pa.setXYZ(i, v.x, v.y, v.z); }
  trunk.geometry.computeVertexNormals();
  const crown = new THREE.Group(); crown.position.copy(lean); g.add(crown);
  const n = 11 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(frondGeometry(2.4 + rnd() * 0.9, 0.95, 1.2 + rnd() * 0.9), mats.frond);
    f.rotation.y = (i / n) * Math.PI * 2 + rnd() * 0.3; f.rotation.x = 0.25 - rnd() * 0.35;
    f.castShadow = true; crown.add(f);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mats.trunk); nut.scale.y = 0.7; crown.add(nut);
  return g;
}
// a tall column of light (additive, fades up and toward its edges)
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: "varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec3 vN, vV; void main(){ float rim = pow(abs(dot(vN, vV)), 2.0); float h = smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)); float flick = 0.85 + 0.15 * sin(vUv.y * 60.0 - uTime * 3.0); gl_FragColor = vec4(uColor * rim * h * flick * 1.6, 1.0); }",
  });
}

export function buildLobby(renderer, T, sfx, WM) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xbfdcf5, 0.0011);
  const rnd = mulberry32(7);

  /* ---------- materials ---------- */
  const panelT = withRepeat(T.panel, 1, 1);
  const tileT = withRepeat(T.tiles, 1, 1);
  const M = {
    wall: new THREE.MeshStandardMaterial({ ...panelT, color: 0xeef1f4, roughness: 1 }),
    floor: new THREE.MeshStandardMaterial({ map: floorPanels(), color: 0xd6dbe0, roughness: 0.22, metalness: 0, envMapIntensity: 1.3 }),
    ceil: new THREE.MeshStandardMaterial({ ...panelT, color: 0xdfe4ea, roughness: 1 }),
    shell: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.25, metalness: 0.05 }),
    cushion: new THREE.MeshStandardMaterial({ map: T.leather.map, normalMap: T.leather.normalMap, color: 0x3d5566, roughness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ map: T.gunmetal.map, roughnessMap: T.gunmetal.roughnessMap, color: 0xd8dde2, metalness: 1, roughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.3, metalness: 0.4 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3fdcff, emissiveIntensity: 2.5 }),
    glowSoft: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9fe8ff, emissiveIntensity: 1.2 }),
    lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfd8e8, metalness: 0.1, roughness: 0.02, transparent: true, opacity: 0.08, depthWrite: false, envMapIntensity: 2 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x2c2218, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ ...withRepeat(T.grass, 220, 220), roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x3a6f95, roughness: 0.06, metalness: 0.3 }),
    tower: new THREE.MeshStandardMaterial({ map: towerTex(), metalness: 0.5, roughness: 0.2, emissive: 0x222a30, envMapIntensity: 1.5 }),
    towerWhite: new THREE.MeshStandardMaterial({ color: 0xf0f2f4, roughness: 0.4 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1, map: T.wood.map }),
    tree: new THREE.MeshStandardMaterial({ color: 0x4f8a42, roughness: 0.9, flatShading: true }),
  };

  // light wear on the furniture: fine scratches, scuffs and chips only
  const WEAR = scratchSet(5);
  Object.assign(M.shell, { map: WEAR.map, roughnessMap: WEAR.roughnessMap, normalMap: WEAR.normalMap, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6) });
  Object.assign(M.dark, { roughnessMap: WEAR.roughnessMap, normalMap: WEAR.normalMap, roughness: 1.1, normalScale: new THREE.Vector2(0.5, 0.5) });
  Object.assign(M.pot, { map: WEAR.map, roughnessMap: WEAR.roughnessMap, normalMap: WEAR.normalMap, roughness: 2.2, normalScale: new THREE.Vector2(0.4, 0.4) });
  const plantMats = {
    leaf: new THREE.MeshStandardMaterial({ map: leafTexture(), roughness: 0.5, side: THREE.DoubleSide }),
    soil: new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1 }),
  };
  const B = new Builder();
  const UV = { worldUV: 0.3 };
  /* ---------- the sky plaza: an open platform high above the city ---------- */
  const { x0, x1, z0, z1, h } = HALL;
  const PX = 17, PZ = 13; // platform half-size (railing)
  B.box("floor", PX * 2, 0.6, PZ * 2, [0, -0.3, 0], [0, 0, 0], { worldUV: 0.5 });
  B.box("shell", PX * 2 + 0.6, 0.5, PZ * 2 + 0.6, [0, -0.85, 0]);                 // white rim under the deck
  B.add("shell", new THREE.CylinderGeometry(PX * 0.9, 4, 7, 48, 1, false), mat4([0, -4.6, 0], [0, 0, 0], [1, 1, PZ / PX])); // tapering hull below
  // glass balustrade with a chrome top rail all round
  for (const [ax, az, len, rot] of [[0, -PZ, PX * 2, 0], [0, PZ, PX * 2, 0], [-PX, 0, PZ * 2, Math.PI / 2], [PX, 0, PZ * 2, Math.PI / 2]]) {
    B.add("chrome", new THREE.CylinderGeometry(0.035, 0.035, len, 10), mat4([ax, 1.05, az], [0, rot, Math.PI / 2]));
    B.box("glow", rot ? 0.02 : len, 0.02, rot ? len : 0.02, [ax, 0.03, az]);
    for (let k = -len / 2; k <= len / 2 + 0.01; k += 2) B.cyl("chrome", 0.03, 0.03, 1.05, 8, rot ? [ax, 0.52, k] : [k, 0.52, az]);
  }
  const balGeo = new THREE.BoxGeometry(1, 1, 0.025);
  for (const [ax, az, len, rot] of [[0, -PZ, PX * 2, 0], [0, PZ, PX * 2, 0], [-PX, 0, PZ * 2, Math.PI / 2], [PX, 0, PZ * 2, Math.PI / 2]]) {
    const gl = new THREE.Mesh(balGeo, M.glass); gl.scale.set(len, 1.0, 1); gl.position.set(ax, 0.52, az); gl.rotation.y = rot; gl.renderOrder = 2; scene.add(gl);
  }
  // glowing guide lines in the floor
  for (const lx of [-6, 6]) B.box("glowSoft", 0.04, 0.006, PZ * 2 - 2, [lx, 0.003, 0]);
  B.box("glowSoft", PX * 2 - 2, 0.006, 0.04, [0, 0.003, 9.6]);
  // sweeping white ribbon canopies (like wings over the plaza)
  const ribbons = [
    [[[-40, 14, 30], [-14, 11, 8], [0, 10.5, -4], [18, 12, -14], [60, 17, -30]], 9, 0.5, 0.25],
    [[[-50, 22, -20], [-20, 18, -10], [10, 16.5, 4], [35, 19, 18], [70, 26, 30]], 6, 0.4, -0.3],
    [[[30, 8, 40], [16, 7.6, 16], [12, 8.2, -6], [24, 10, -26], [50, 13, -40]], 4.5, 0.35, 0.35],
  ];
  ribbons.forEach(([pts, w, th, bank]) => B.add("shell", ribbonGeometry(pts, w, th, 140, bank), mat4([0, 0, 0])));
  // a floating halo above the centre, glowing underneath
  B.add("shell", new THREE.TorusGeometry(9, 0.45, 12, 96), mat4([0, 13.5, 0], [Math.PI / 2, 0, 0], [1, 1, 0.35]));
  B.add("glow", new THREE.TorusGeometry(9, 0.08, 6, 96), mat4([0, 13.32, 0], [Math.PI / 2, 0, 0]));
  // slim pylons carrying the near canopy
  for (const [px, pz, ph] of [[-15.5, 8.5, 11], [15.5, -11.5, 12]]) { B.cyl("shell", 0.22, 0.35, ph, 20, [px, ph / 2, pz]); B.cyl("glow", 0.24, 0.24, 0.05, 20, [px, 0.1, pz]); }
  // palms in white planters along the edges
  const palmMats = { trunk: new THREE.MeshStandardMaterial({ map: T.wood.map, color: 0x9a8064, roughness: 1 }), frond: new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }) };
  const planters = [[-14.5, 10.5], [14.5, 10.5], [-14.5, -10.5], [-5.5, -11.2], [5.5, -11.2], [14.5, 2.5], [-14.5, -4.5]];
  for (const [px, pz] of planters) {
    B.cyl("shell", 0.75, 0.6, 0.7, 28, [px, 0.35, pz]); B.cyl("glow", 0.77, 0.77, 0.03, 28, [px, 0.66, pz]);
    const palm = makePalm(rnd, palmMats, 5 + rnd() * 3); palm.position.set(px, 0.65, pz); scene.add(palm);
  }
  // smaller potted plants by the benches
  for (const [px, pz] of [[-6, 0], [6, 0]]) { const plant = makePlant(rnd, plantMats.leaf, plantMats.soil, M.pot); plant.position.set(px, 0, pz); plant.rotation.y = rnd() * 6; scene.add(plant); }
  const pillars = [];
  /* ---------- benches (same seat layout as before) ---------- */
  const BB = new Builder();
  const benchDefs = [];
  for (const bx of [-2.8, 2.8]) for (const bz of [-3.2, -0.6, 2.0]) benchDefs.push([bx, bz, Math.PI]);
  benchDefs.push([-3.5, 7.9, Math.PI], [3.5, 7.9, Math.PI]);
  benchDefs.push([10.6, 5.2, -Math.PI / 2]);
  for (const [bx, bz, r] of benchDefs) addBench(BB, bx, bz, r);
  const benches = BB.build(M);
  benches.children.forEach((mesh) => { if (mesh.name === "shell" || mesh.name === "cushion") worldUV(mesh.geometry, 0.8); });
  benches.children.forEach((m) => (m.userData.bench = true));
  scene.add(benches);
  const seats = [];
  for (const [bx, bz, r] of benchDefs) for (const sx of [-0.6, 0, 0.6]) {
    const p = new THREE.Vector3(sx, 0.45, 0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), r).add(new THREE.Vector3(bx, 0, bz));
    seats.push({ pos: p, yaw: r, taken: false });
  }

  /* ---------- the blue arena portal ---------- */
  const PORTAL = new THREE.Vector3(-9.2, 1.55, -6.6);
  const portal = new THREE.Group();
  portal.position.copy(PORTAL);
  {
    const pb = new Builder();
    pb.add("chrome", new THREE.TorusGeometry(1.32, 0.12, 16, 64), null);
    pb.add("dark", new THREE.TorusGeometry(1.32, 0.06, 8, 64), mat4([0, 0, 0.1]));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pb.box("chrome", 0.16, 0.3, 0.3, [Math.cos(a) * 1.36, Math.sin(a) * 1.36, 0], [0, 0, a]); }
    pb.box("chrome", 0.5, 0.3, 0.9, [-1.2, -1.42, 0]); pb.box("chrome", 0.5, 0.3, 0.9, [1.2, -1.42, 0]);
    portal.add(pb.build(M));
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: 0x55c8ff, toneMapped: false }));
    portal.add(ringGlow);
  }
  const portalMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uArmed: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform float uTime, uArmed; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        float sw = sin(a * 5.0 + r * 14.0 - uTime * 3.2) * 0.5 + 0.5;
        float sw2 = sin(a * 3.0 - r * 22.0 + uTime * 2.1) * 0.5 + 0.5;
        vec3 deep = vec3(0.01, 0.08, 0.35), bright = vec3(0.25, 0.75, 1.0);
        vec3 col = mix(deep, bright, sw * 0.65 + sw2 * 0.35);
        col += vec3(0.5, 0.85, 1.0) * smoothstep(0.65, 1.0, r) * (0.9 + uArmed);
        col += vec3(0.85, 0.95, 1.0) * pow(max(0.0, 1.0 - r), 5.0) * (0.5 + uArmed);
        float alpha = smoothstep(1.0, 0.94, r) * (0.72 + 0.25 * sw);
        gl_FragColor = vec4(col * (1.5 + uArmed * 0.8), alpha);
      }`,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.22, 64), portalMat);
  disc.renderOrder = 3;
  portal.add(disc);
  // orbiting sparks
  const sparkMat = new THREE.SpriteMaterial({ map: softDot("120,210,255"), color: 0x8fe0ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const motes = [];
  for (let k = 0; k < 26; k++) { const m = new THREE.Sprite(sparkMat); m.scale.setScalar(0.06 + Math.random() * 0.08); m.userData = { a: Math.random() * 6.28, r: 1.0 + Math.random() * 0.45, s: 0.6 + Math.random() * 1.2, z: (Math.random() - 0.5) * 0.4 }; portal.add(m); motes.push(m); }
  scene.add(portal);
  const portalLight = new THREE.PointLight(0x3aa8ff, 8, 7, 1.6);
  portalLight.position.set(PORTAL.x, PORTAL.y, PORTAL.z + 0.8); scene.add(portalLight);
  const portalSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: holoTex("ARENA PORTAL", "DEAD EARTH  ·  STAKE COINS TO ENTER  ·  WINNER TAKES ALL"), transparent: true, toneMapped: false }));
  portalSign.position.set(PORTAL.x, 3.7, PORTAL.z); scene.add(portalSign);
  B.box("glow", 2.8, 0.006, 0.08, [PORTAL.x, 0.004, PORTAL.z + 1.0]);
  B.box("glow", 0.08, 0.006, 2.0, [PORTAL.x - 1.4, 0.004, PORTAL.z + 0.1]); B.box("glow", 0.08, 0.006, 2.0, [PORTAL.x + 1.4, 0.004, PORTAL.z + 0.1]);

  /* ---------- armory (east) ---------- */
  B.box("shell", 0.75, 1.0, 7.0, [9.4, 0.5, -1.2]);
  B.box("dark", 0.85, 0.05, 7.1, [9.4, 1.025, -1.2]);
  B.box("glow", 0.02, 0.03, 7.0, [9.02, 0.95, -1.2]);
  B.box("dark", 0.1, 3.4, 7.5, [11.85, 2.1, -1.2]); // display wall
  for (let i = 0; i < 4; i++) B.box("glowSoft", 0.03, 0.02, 7.2, [11.78, 1.05 + i * 0.75, -1.2]);
  const armorySign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: holoTex("ARMORY", "TRADE ARENA WINNINGS FOR FIREPOWER", "#ffb24a"), transparent: true, toneMapped: false }));
  armorySign.position.set(11.78, 4.4, -1.2); armorySign.rotation.y = -Math.PI / 2; scene.add(armorySign);
  const rackGuns = [];
  WEAPONS.forEach((w, i) => {
    const g = buildGun(w.id, WM);
    const row = i % 3, col = Math.floor(i / 3);
    g.position.set(11.7, 1.4 + row * 0.75, -3.6 + col * 3.0 + (row % 2) * 0.5);
    g.scale.setScalar(1.6);
    g.userData.weaponId = w.id;
    rackGuns.push(g);
    scene.add(g);
  });
  const rackLight = new THREE.SpotLight(0xe8f4ff, 30, 9, 0.6, 0.6, 2);
  rackLight.position.set(9.6, 5.0, -1.2); rackLight.target.position.set(11.8, 1.8, -1.2);
  scene.add(rackLight, rackLight.target);
  B.cyl("chrome", 0.12, 0.16, 0.06, 20, [9.4, 1.08, 1.4]);
  B.cyl("glow", 0.13, 0.13, 0.01, 20, [9.4, 1.115, 1.4]);
  const display = new THREE.Group(); display.position.set(9.4, 1.32, 1.4); scene.add(display);

  /* ---------- wardrobe (west) ---------- */
  const PED = new THREE.Vector3(-9.4, 0, 1.4);
  B.cyl("shell", 0.65, 0.7, 0.14, 48, [PED.x, 0.07, PED.z]);
  B.add("glow", new THREE.TorusGeometry(0.672, 0.012, 6, 64), mat4([PED.x, 0.142, PED.z], [Math.PI / 2, 0, 0]));
  for (const rz of [4.4, 6.6]) {
    B.cyl("chrome", 0.015, 0.015, 1.9, 8, [-11.3, 1.75, rz], [Math.PI / 2, 0, 0]);
    B.cyl("chrome", 0.015, 0.015, 1.75, 8, [-11.3, 0.87, rz - 0.95]);
    B.cyl("chrome", 0.015, 0.015, 1.75, 8, [-11.3, 0.87, rz + 0.95]);
    for (let i = 0; i < 7; i++) {
      const c = [0x55585b, 0xe4e8ec, 0x3e2618, 0xb5a283, 0xd2a91c, 0x1c1e22, 0xcfcac0][(i + rz * 3) % 7 | 0];
      const key = "coat" + c;
      if (!M[key]) M[key] = new THREE.MeshStandardMaterial({ map: T.fabric.map, normalMap: T.fabric.normalMap, color: c, roughness: 1 });
      B.add(key, new THREE.BoxGeometry(0.42, 0.95, 0.06), mat4([-11.3, 1.22, rz - 0.75 + i * 0.25], [0, Math.PI / 2 + (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.05]));
    }
  }
  const wardrobeSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: holoTex("WARDROBE", "BODY · HAIR · CLOTHES · LIVE WIND TEST", "#41f0d0"), transparent: true, toneMapped: false }));
  wardrobeSign.position.set(-11.73, 4.2, 2.0); wardrobeSign.rotation.y = Math.PI / 2; scene.add(wardrobeSign);
  // wind turbine vent blowing on the pedestal
  const fan = new THREE.Group();
  const fanB = new Builder();
  fanB.cyl("shell", 0.05, 0.05, 1.1, 12, [0, 0.55, 0]);
  fanB.cyl("shell", 0.3, 0.32, 0.05, 28, [0, 0.025, 0]);
  fanB.add("shell", new THREE.CylinderGeometry(0.47, 0.47, 0.22, 40, 1, true), mat4([0, 1.2, 0.03], [Math.PI / 2, 0, 0]));
  fanB.add("glow", new THREE.TorusGeometry(0.47, 0.012, 6, 48), mat4([0, 1.2, 0.14]));
  fanB.cyl("dark", 0.13, 0.13, 0.22, 20, [0, 1.2, -0.06], [Math.PI / 2, 0, 0]);
  fan.add(fanB.build(M));
  const blades = new THREE.Group(); blades.position.set(0, 1.2, 0.06);
  for (let i = 0; i < 5; i++) { const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.008), M.chrome); bl2.position.set(0, 0.21, 0); const p = new THREE.Group(); p.rotation.z = (i / 5) * Math.PI * 2; bl2.rotation.y = 0.45; p.add(bl2); blades.add(p); }
  fan.add(blades);
  fan.position.set(-7.4, 0, 3.0);
  fan.lookAt(PED.x, 0, PED.z);
  scene.add(fan);
  const fanDir = new THREE.Vector3(PED.x - fan.position.x, 0, PED.z - fan.position.z).normalize();

  /* ---------- props ---------- */
  for (let i = 0; i < 6; i++) { // personal lockers, sleek
    const lx = 5 + i * 0.62;
    B.box("shell", 0.6, 2.1, 0.5, [lx, 1.05, z1 - 0.3]);
    B.box("glow", 0.02, 0.4, 0.01, [lx + 0.22, 1.2, z1 - 0.555]);
  }
  B.box("dark", 1.6, 1.0, 0.7, [-9.5, 0.5, z1 - 0.5]); // drinks bar
  B.box("glowSoft", 1.6, 0.02, 0.02, [-9.5, 1.0, z1 - 0.86]);
  const shell = B.build(M);
  shell.children.forEach((mesh) => { if (mesh.name === "shell" || mesh.name === "dark") worldUV(mesh.geometry, 0.8); });
  scene.add(shell);

  // holo info board with the controls
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.35), new THREE.MeshBasicMaterial({
    transparent: true, toneMapped: false,
    map: canvasTex(1024, 640, (ctx, w, hh) => {
      const g = ctx.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, "rgba(8,30,48,0.92)"); g.addColorStop(1, "rgba(4,16,28,0.92)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
      ctx.strokeStyle = "#4fe3ff"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, w - 12, hh - 12);
      ctx.fillStyle = "#4fe3ff"; ctx.font = "700 50px Segoe UI, Arial"; ctx.fillText("NOVA HUB  ·  YEAR 2291", 40, 76);
      ctx.font = "500 30px Segoe UI, Arial"; ctx.fillStyle = "#d8f3ff";
      const L = [
        "LEFT STICK move  ·  RIGHT STICK snap turn",
        "Point + TRIGGER at a bench → sit  (trigger again to stand)",
        "ARMORY: buy weapons  ·  WARDROBE: body, hair & clothes",
        "ARENA: choose a coin stake at the portal terminal,",
        "   then walk through the BLUE PORTAL to the dead Earth",
        "Kill a rival → take their stake. Die → your killer takes yours",
        "Extract alive (hold Y / stand on the beacon) to bank it all",
        "In the arena: A eject mag → left hand reload · B switch gun",
      ];
      L.forEach((s, i) => ctx.fillText(s, 50, 150 + i * 56));
    }),
  }));
  board.position.set(0, 2.1, z1 + 0.2); board.rotation.y = Math.PI; scene.add(board);
  { const st = new Builder(); st.box("dark", 2.35, 1.5, 0.08, [0, 2.1, z1 + 0.25]); st.cyl("chrome", 0.04, 0.04, 1.4, 8, [-0.9, 0.7, z1 + 0.25]); st.cyl("chrome", 0.04, 0.04, 1.4, 8, [0.9, 0.7, z1 + 0.25]); scene.add(st.build(M)); }

  /* ---------- outside: a living future city ---------- */
  const sunDir = new THREE.Vector3(-0.35, 0.42, -0.84).normalize();
  const sky = makeSky({ sunDir, radius: 1400, top: new THREE.Color(0x1e58c2), horizon: new THREE.Color(0xb9dcf7), ground: new THREE.Color(0x8fb4d4), sunColor: new THREE.Color(0xfff6e6) });
  scene.add(sky);
  // the hub is high up: the city sits 60 m below the window
  const CITY_Y = -260;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), M.grass);
  ground.rotation.x = -Math.PI / 2; ground.position.y = CITY_Y; scene.add(ground);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(3000, 90), M.water);
  river.rotation.x = -Math.PI / 2; river.rotation.z = 0.3; river.position.set(0, CITY_Y + 0.3, -420); scene.add(river);
  const CB = new Builder();
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * 1100, z = -90 - rnd() * 800;
    if (Math.abs(z + 420 + x * 0.3) < 60) continue; // keep the river clear
    const hgt = 60 + rnd() * 260, w = 18 + rnd() * 26;
    if (rnd() < 0.4) CB.add("tower", new THREE.CylinderGeometry(w * 0.5, w * 0.6, hgt, 24), mat4([x, CITY_Y + hgt / 2, z]), { worldUV: 0.012 });
    else CB.add("tower", new THREE.BoxGeometry(w, hgt, w * (0.7 + rnd() * 0.6)), mat4([x, CITY_Y + hgt / 2, z], [0, rnd() * 1.2, 0]), { worldUV: 0.012 });
    CB.add("towerWhite", new THREE.CylinderGeometry(w * 0.3, w * 0.55, 8, 16), mat4([x, CITY_Y + hgt + 4, z]));
    if (rnd() < 0.35) CB.add("towerWhite", new THREE.TorusGeometry(w * 0.75, 1.2, 6, 32), mat4([x, CITY_Y + hgt * (0.4 + rnd() * 0.4), z], [Math.PI / 2, 0, 0]));
  }
  // park trees just below the window
  for (let i = 0; i < 160; i++) {
    const x = (rnd() - 0.5) * 300, z = -30 - rnd() * 200, s = 4 + rnd() * 6;
    CB.cyl("trunk", 0.4, 0.6, s, 6, [x, CITY_Y + s / 2, z]);
    CB.add("tree", new THREE.IcosahedronGeometry(s * 0.6, 1), mat4([x, CITY_Y + s * 1.1, z], [rnd(), rnd(), 0], [1, 0.8, 1]));
  }
  // orbital ring in the sky
  CB.add("towerWhite", new THREE.TorusGeometry(900, 6, 6, 160, Math.PI * 0.9), mat4([200, 300, -1100], [1.25, 0.2, 0.4]));
  scene.add(CB.build(M, { castShadow: false }));
  // the great light beam and the streaks of light rising into the sky
  const beams = [];
  const beamAt = (x, z, r, hgt, col) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.3, hgt, 32, 1, true), beamMaterial(col)); m.position.set(x, CITY_Y + hgt / 2, z); m.renderOrder = 5; scene.add(m); beams.push(m); };
  beamAt(30, -230, 9, 900, 0xdff4ff); beamAt(30, -230, 3.5, 900, 0xffffff);
  beamAt(-260, -380, 4, 700, 0x9fe0ff); beamAt(320, -420, 5, 700, 0xffd0f0); beamAt(-120, -600, 3, 600, 0xc8f0ff);
  {
    const pts = [], cols = [], cA = new THREE.Color(0xbfefff), cB = new THREE.Color(0xffffff);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, r = 120 + rnd() * 600;
      const from = new THREE.Vector3(30 + Math.cos(a) * r, CITY_Y + rnd() * 40, -230 + Math.sin(a) * r * 0.7);
      const to = new THREE.Vector3(30 + (rnd() - 0.5) * 60, 250 + rnd() * 250, -230 + (rnd() - 0.5) * 60);
      pts.push(from.x, from.y, from.z, to.x, to.y, to.z);
      const c = rnd() < 0.5 ? cA : cB; cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); lg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  }
  // floating spheres: a big "ALPHA PRIME" globe with a ring, and coloured orbs
  const orbs = [];
  {
    const glassOrb = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.85, envMapIntensity: 2 });
    const big = new THREE.Group(); big.position.set(-34, 26, -70);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(7, 48, 32), glassOrb); big.add(ball);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(7.15, 7.15, 1.6, 64, 1, true), new THREE.MeshBasicMaterial({ map: holoTex("ALPHA PRIME", "SKY DISTRICT · NOVA HUB", "#ffffff", 2048, 256), transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    band.position.y = 1.2; big.add(band);
    big.add(new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.12, 6, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })).rotateX(Math.PI / 2 - 0.2));
    scene.add(big); orbs.push({ o: big, y: big.position.y, s: 0.3 });
    for (const [x, y, z, r, c] of [[-60, 14, -40, 2.2, 0x7fd8ff], [48, 30, -90, 3.2, 0xd8304a], [80, 12, -30, 1.6, 0x9ad0ff], [-22, 40, -150, 4, 0xbfe8ff], [12, 22, -48, 1.2, 0xffffff]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.12, envMapIntensity: 1.8 }));
      m.position.set(x, y, z); scene.add(m); orbs.push({ o: m, y, s: 0.4 + rnd() * 0.5 });
    }
  }
  // distant floating platforms with palms and little pavilions
  {
    const fp = new Builder(); const palmsFar = [];
    for (const [x, y, z, r] of [[-70, -6, -30, 16], [-55, -2, 45, 12], [70, -10, 20, 20], [95, 4, -70, 14], [-110, 8, -110, 22], [40, -14, -140, 26]]) {
      fp.add("shell", new THREE.CylinderGeometry(r, r * 0.92, 1.2, 48), mat4([x, y, z]));
      fp.add("shell", new THREE.ConeGeometry(r * 0.9, r * 0.6, 48), mat4([x, y - 0.6 - r * 0.3, z], [Math.PI, 0, 0]));
      fp.add("glow", new THREE.TorusGeometry(r, 0.12, 6, 64), mat4([x, y + 0.6, z], [Math.PI / 2, 0, 0]));
      fp.add("shell", new THREE.CylinderGeometry(r * 0.25, r * 0.3, 2.5, 24), mat4([x + r * 0.3, y + 1.8, z - r * 0.2]));
      fp.add("glass", new THREE.SphereGeometry(r * 0.25, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat4([x + r * 0.3, y + 3.05, z - r * 0.2]));
      for (let k = 0; k < 5; k++) { const a = rnd() * 6.28, rr = r * (0.4 + rnd() * 0.45); palmsFar.push([x + Math.cos(a) * rr, y + 0.6, z + Math.sin(a) * rr]); }
    }
    scene.add(fp.build(M, { castShadow: false }));
    for (const [x, y, z] of palmsFar) { const pm2 = makePalm(rnd, palmMats, 5 + rnd() * 4); pm2.position.set(x, y, z); pm2.traverse((o) => (o.castShadow = false)); scene.add(pm2); }
  }
  // flying traffic
  const cars = [];
  const carGeo = new THREE.CapsuleGeometry(0.9, 2.2, 4, 10); carGeo.rotateZ(Math.PI / 2);
  const carMats = [0xf2f4f6, 0x2a3440, 0xd04a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.25 }));
  const tail = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false });
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Mesh(carGeo, carMats[i % 3]);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), tail); l.position.x = -1.9; c.add(l);
    c.userData = { lane: -80 - (i % 6) * 70, y: CITY_Y + 30 + (i % 4) * 25, speed: (18 + rnd() * 20) * (i % 2 ? 1 : -1), x: (rnd() - 0.5) * 900 };
    c.rotation.y = c.userData.speed > 0 ? 0 : Math.PI;
    scene.add(c); cars.push(c);
  }

  /* ---------- lighting ---------- */
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0xb8c2cc, 1.35));
  const sun = new THREE.DirectionalLight(0xfff4e2, 3.4);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const pedSpot = new THREE.SpotLight(0xffffff, 60, 9, 0.42, 0.5, 1.5);
  pedSpot.position.set(-8.2, 5.0, 0.4); pedSpot.target.position.set(-9.4, 1.0, 1.4);
  pedSpot.castShadow = true; pedSpot.shadow.mapSize.set(512, 512); pedSpot.shadow.bias = -0.002;
  scene.add(pedSpot, pedSpot.target);

  /* ---------- reflections: bright proxy room ---------- */
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: "varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }", fragmentShader: "varying vec3 d; void main(){ float t = clamp(d.y, -1.0, 1.0); vec3 c = t > 0.0 ? mix(vec3(0.74,0.86,0.97), vec3(0.16,0.38,0.80), pow(t, 0.6)) : mix(vec3(0.74,0.86,0.97), vec3(0.62,0.72,0.82), -t); gl_FragColor = vec4(c, 1.0); }" }));
  envScene.add(envSky);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0xdfe5ea })); deck.rotation.x = -Math.PI / 2; deck.position.y = -0.5; envScene.add(deck);
  const rb = new THREE.Mesh(new THREE.TorusGeometry(12, 1.5, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff })); rb.position.y = 13; rb.rotation.x = Math.PI / 2; envScene.add(rb);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); sunDisc.position.copy(sunDir).multiplyScalar(150); envScene.add(sunDisc);
  const bp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0x3aa8ff })); bp.position.set(PORTAL.x, PORTAL.y, PORTAL.z); envScene.add(bp);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();

  /* ---------- people of the hub ---------- */
  const citizen = (i) => [
    { body: "male", outfit: "m_suit", hair: "natural" }, { body: "female", outfit: "f_medic", hair: "natural" },
    { body: "male", outfit: "m_bluetee", hair: "natural" }, { body: "female", outfit: "f_greentee", hair: "natural" },
  ][i % 4];
  const npcs = [];
  [1, 5, 13, 15].forEach((seatIdx, i) => {
    const s = seats[seatIdx];
    s.taken = true;
    const a = new Human(T, citizen(i), { quality: 0.45 });
    a.setPose("sit");
    a.root.position.set(s.pos.x, 0, s.pos.z);
    a.root.rotation.y = s.yaw;
    scene.add(a.root);
    npcs.push(a);
  });
  const qm = new Human(T, { body: "male", outfit: "m_oxford", hair: "natural" }, { quality: 0.45 });
  qm.root.position.set(10.5, 0, -2.6); qm.root.rotation.y = -Math.PI / 2;
  scene.add(qm.root); npcs.push(qm);
  const preview = new Human(T, {}, { quality: 1 });
  preview.root.position.set(PED.x, 0.15, PED.z);
  preview.groundY = 0.15;
  scene.add(preview.root);

  const draft = new Wind(0.5, 1.2);
  const fanWind = new THREE.Vector3();
  const tmpW = new THREE.Vector3();

  /* ---------- colliders ---------- */
  const colliders = [];
  const box = (cx, cz, w, d) => colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
  for (const [px, pz] of pillars) box(px, pz, 0.75, 0.75);
  for (const [px, pz] of planters) box(px, pz, 1.6, 1.6);
  box(-15.5, 8.5, 0.8, 0.8); box(15.5, -11.5, 0.8, 0.8);
  for (const [bx, bz, r] of benchDefs) Math.abs(Math.sin(r)) > 0.5 ? box(bx, bz, 0.6, 2.1) : box(bx, bz, 2.1, 0.6);
  box(9.4, -1.2, 0.85, 7.1); box(PED.x, PED.z, 1.4, 1.4); box(6.55, z1 - 0.3, 3.8, 0.6);
  box(fan.position.x, fan.position.z, 0.6, 0.6); box(-11.3, 5.5, 0.6, 4.6); box(-9.5, z1 - 0.5, 1.7, 0.8);
  box(PORTAL.x - 1.25, PORTAL.z, 0.45, 0.9); box(PORTAL.x + 1.25, PORTAL.z, 0.45, 0.9);

  let displayed = null, armed = 0;
  return {
    scene, seats, benches, rackGuns, glass: null,
    spawn: { pos: new THREE.Vector3(0, 0, 5.2), yaw: 0 },
    bounds: { x0: -PX + 0.4, x1: PX - 0.4, z0: -PZ + 0.4, z1: PZ - 0.4 },
    colliders, preview, npcs,
    portal: { pos: PORTAL, radius: 1.2 },
    heightAt: () => 0,
    setDisplay(id, weaponMats) {
      if (displayed === id) return; displayed = id;
      display.clear();
      const g = buildGun(id, weaponMats); g.scale.setScalar(1.4); display.add(g);
    },
    setArmed(v) { armed = v ? 1 : 0; },
    openDoor() {}, closeDoor() {},
    update(dt, t) {
      sky.userData.update(t);
      for (const b of beams) b.material.uniforms.uTime.value = t;
      for (const o of orbs) o.o.position.y = o.y + Math.sin(t * o.s) * 0.8;
      draft.update(dt);
      blades.rotation.z += dt * 18;
      const gust = 0.75 + 0.35 * Math.sin(t * 2.1) + 0.2 * Math.sin(t * 5.3);
      fanWind.copy(fanDir).multiplyScalar(5.5 * gust).add(draft.vec);
      preview.root.rotation.y += dt * 0.35;
      preview.update(dt, fanWind);
      for (const n of npcs) n.update(dt, tmpW.copy(draft.vec));
      display.rotation.y += dt * 0.6;
      portalMat.uniforms.uTime.value = t;
      portalMat.uniforms.uArmed.value += (armed - portalMat.uniforms.uArmed.value) * Math.min(1, dt * 3);
      portalLight.intensity = 8 + portalMat.uniforms.uArmed.value * 10 + Math.sin(t * 3) * 1.5;
      for (const m of motes) { const u = m.userData; u.a += dt * u.s; m.position.set(Math.cos(u.a) * u.r, Math.sin(u.a) * u.r, u.z); }
      for (const c of cars) { const u = c.userData; u.x += u.speed * dt; if (u.x > 500) u.x = -500; if (u.x < -500) u.x = 500; c.position.set(u.x, u.y, u.lane); }
    },
  };
}
