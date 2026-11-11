// Survivor avatar: jointed body, respirator + goggles, strand-simulated hair
// that sways in the wind and verlet cloth (scarf / cloak / duster tails)
// colliding with the body.
import * as THREE from "three";
import { mulberry32, noise1, mergeGeos, indexify } from "./utils.js";
import { withRepeat, hairStrandTexture } from "./textures.js";
let STRAND_TEX = null;

const SKIN = 0xdcab90;

/* ---------------- catalog ---------------- */
export const HAIR_STYLES = [
  { id: "bald", name: "Bald", price: 0, icon: "◯" },
  { id: "natural", name: "Outfit's Hair", price: 0, icon: "★" },
  { id: "crop", name: "Messy Crop", price: 0 },
  { id: "bob", name: "Shoulder Bob", price: 200 },
  { id: "ponytail", name: "Ponytail", price: 250 },
  { id: "long", name: "Long & Loose", price: 300 },
  { id: "mohawk", name: "Mohawk", price: 400 },
  { id: "dreads", name: "Dreadlocks", price: 450 },
];
export const HAIR_COLORS = [
  { id: "natural", name: "Natural", hex: null, price: 0, icon: "★" },
  { id: "black", name: "Jet Black", hex: 0x16120f, price: 0 },
  { id: "brown", name: "Chestnut", hex: 0x4a2c18, price: 0 },
  { id: "honey", name: "Honey Brown", hex: 0x7a4a2a, price: 0 },
  { id: "blonde", name: "Ash Blonde", hex: 0xa88d62, price: 150 },
  { id: "auburn", name: "Auburn", hex: 0x7a2e14, price: 150 },
  { id: "silver", name: "Silver", hex: 0xb4b4b8, price: 300 },
  { id: "crimson", name: "Crimson Dye", hex: 0x8e1220, price: 400 },
  { id: "teal", name: "Toxic Teal", hex: 0x1d8c84, price: 500 },
];
// Realistic outfits. "Basics" are the bald base people (rig: meshy) with a re-dyeable tee;
// the rest are fully textured, rigged humans from the Microsoft Rocketbox library (own face + hair).
const BASICS = [
  ["grey", "Grey Tee", 0x86888b, 0], ["white", "White Tee", null, 0], ["black", "Black Tee", 0x1c1d20, 100],
  ["navy", "Navy Tee", 0x1f2e4a, 100], ["olive", "Olive Tee", 0x4c5236, 150], ["red", "Red Tee", 0x7e1f22, 150],
];
export const OUTFITS = [
  ...["male", "female"].flatMap((body) => BASICS.map(([k, name, shirt, price]) => ({
    id: (body === "male" ? "m_base" : "f_base") + (k === "grey" ? "" : "_" + k), name, body, model: body === "male" ? "base_bm" : "base_bf",
    rig: "meshy", shirt, price, swatch: shirt ?? 0xe8e8e6,
  }))),
  { id: "m_shirt", name: "Dark Shirt", body: "male", model: "Male_Adult_11", price: 0, swatch: 0x2b2a24 },
  { id: "m_bluetee", name: "Blue Tee", body: "male", model: "Male_Adult_16", price: 0, swatch: 0x2e4d78 },
  { id: "m_oxford", name: "Oxford Shirt", body: "male", model: "Male_Adult_08", price: 300, swatch: 0x9fb8d4 },
  { id: "m_hoodie", name: "Brown Hoodie", body: "male", model: "Male_Adult_20", price: 400, swatch: 0x4a2f22 },
  { id: "m_track", name: "Track Jacket", body: "male", model: "Male_Adult_10", price: 450, swatch: 0x8a1c22 },
  { id: "m_denim", name: "Denim Jacket", body: "male", model: "Male_Adult_12", price: 500, swatch: 0x34465e },
  { id: "m_suit", name: "Business Suit", body: "male", model: "Business_Male_01", price: 800, swatch: 0x1a1a1e },
  { id: "m_combat", name: "Combat Fatigues", body: "male", model: "Military_Male_02", price: 1200, swatch: 0x7a7d6a },
  { id: "m_ranger", name: "Ranger Kit", body: "male", model: "Military_Male_01", price: 1500, swatch: 0x8a8a74 },
  { id: "f_tee", name: "Grey Tee", body: "female", model: "Female_Adult_08", price: 0, swatch: 0x8e8d88 },
  { id: "f_greentee", name: "Green Tee", body: "female", model: "Female_Adult_17", price: 0, swatch: 0x4fae78 },
  { id: "f_pink", name: "Pink Blouse", body: "female", model: "Female_Adult_01", price: 300, swatch: 0xd47a92 },
  { id: "f_hoodie", name: "Hoodie & Shorts", body: "female", model: "Female_Adult_12", price: 400, swatch: 0x1e2024 },
  { id: "f_leather", name: "Leather Jacket", body: "female", model: "Female_Adult_04", price: 500, swatch: 0x5a3322 },
  { id: "f_medic", name: "Medic Scrubs", body: "female", model: "Medical_Female_01", price: 600, swatch: 0xe6e8ea },
  { id: "f_combat", name: "Combat Fatigues", body: "female", model: "Military_Female_01", price: 1200, swatch: 0x7a7d6a },
];
// Faces: any person's head can be worn on any outfit of the same body type.
export const FACES = [
  { id: "own", name: "Outfit's Own", price: 0, icon: "★" },
  { id: "Male_Adult_11", name: "Ethan", body: "male", price: 0 },
  { id: "Male_Adult_16", name: "Lukas", body: "male", price: 0 },
  { id: "Male_Adult_08", name: "Marco", body: "male", price: 0 },
  { id: "Male_Adult_20", name: "Daniel", body: "male", price: 150 },
  { id: "Male_Adult_10", name: "Kenji", body: "male", price: 150 },
  { id: "Male_Adult_12", name: "Jamal", body: "male", price: 150 },
  { id: "Business_Male_01", name: "Victor", body: "male", price: 200 },
  { id: "Military_Male_02", name: "Rafael", body: "male", price: 200 },
  { id: "Military_Male_01", name: "Marcus (helmet)", body: "male", price: 250 },
  { id: "Female_Adult_08", name: "Sofia", body: "female", price: 0 },
  { id: "Female_Adult_17", name: "Emma", body: "female", price: 0 },
  { id: "Female_Adult_01", name: "Hannah", body: "female", price: 0 },
  { id: "Female_Adult_04", name: "Kate", body: "female", price: 150 },
  { id: "Female_Adult_12", name: "Mia", body: "female", price: 150 },
  { id: "Medical_Female_01", name: "Lin", body: "female", price: 200 },
  { id: "Military_Female_01", name: "Alex (helmet)", body: "female", price: 250 },
];
// faces are Rocketbox heads: they only fit Rocketbox outfits
export const faceFor = (look) => { const f = FACES.find((x) => x.id === look.face); return f && (f.id === "own" || (f.body === look.body && outfitFor(look).rig !== "meshy")) ? f.id : "own"; };
// Pants: re-dye the legs of any outfit (the fabric detail of the original texture is kept).
export const PANTS = [
  { id: "orig", name: "Outfit's Own", price: 0, icon: "★" },
  { id: "denim", name: "Blue Denim", price: 100, tint: 0x3a5577 },
  { id: "black", name: "Black Jeans", price: 120, tint: 0x1f2126 },
  { id: "grey", name: "Grey Joggers", price: 120, tint: 0x6e7176 },
  { id: "khaki", name: "Khaki Chinos", price: 150, tint: 0xa38f66 },
  { id: "olive", name: "Olive Cargo", price: 180, tint: 0x4f5638 },
  { id: "white", name: "White", price: 200, tint: 0xd8d8d4 },
  { id: "burgundy", name: "Burgundy", price: 220, tint: 0x6a1e26 },
  { id: "camo", name: "Desert Camo", price: 300, camo: [0xb3a37a, 0x8a7a55, 0x6b5f45, 0x4a4433] },
  { id: "navycamo", name: "Urban Camo", price: 300, camo: [0x8e9196, 0x5d6168, 0x3a3d43, 0x22252a] },
];
export const defaultOutfit = (body) => (body === "female" ? "f_base" : "m_base");
export const outfitFor = (look) => OUTFITS.find((o) => o.id === look.outfit && o.body === look.body) || OUTFITS.find((o) => o.id === defaultOutfit(look.body));
// legacy procedural outfits (fallback body only)
const PROC_OUTFITS = [
  { id: "tee", name: "Grey Tee", price: 0, tee: true, jacket: 0x55585b, jacketTex: "fabric", pants: 0x2c3036, boots: 0x2a2a2c, gloves: "skin", accent: 0x3a3d40 },
  { id: "aero", name: "Aero Suit", price: 1000, jacket: 0xe4e8ec, jacketTex: "leather", pants: 0xd8dde2, boots: 0x30363c, gloves: 0x30363c, accent: 0x2fc6e0, noPack: true },
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
export const BODY_TYPES = [
  { id: "male", name: "Male", price: 0, icon: "♂" },
  { id: "female", name: "Female", price: 0, icon: "♀" },
];
export const MASKS = [
  { id: "none", name: "Bare Face", price: 0, icon: "☺" },
  { id: "respirator", name: "Respirator", price: 0, icon: "◉" },
];
export const DEFAULT_LOOK = { body: "male", face: "own", pants: "orig", hair: "bald", hairColor: "natural", outfit: "m_base", cloth: "none", mask: "none" };

/* painted face detail (sphere UV: face centre at u=0.25, v=0.5) */
const faceCache = {};
function jawTexture(body) {
  const key = "jaw_" + body;
  if (faceCache[key]) return faceCache[key];
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#dcab90"; ctx.fillRect(0, 0, 256, 128);
  if (body === "male") for (let i = 0; i < 2600; i++) { const y = 60 + Math.random() * 68; ctx.fillStyle = `rgba(70,48,36,${0.18 + Math.random() * 0.3})`; ctx.fillRect(Math.random() * 256, y, 1.2, 1.2); }
  else { const g = ctx.createRadialGradient(64, 40, 0, 64, 40, 40); g.addColorStop(0, "rgba(220,120,115,0.18)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (faceCache[key] = t);
}
function faceTexture(body) {
  if (faceCache[body]) return faceCache[body];
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#dcab90"; ctx.fillRect(0, 0, 512, 256);
  const blob = (x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  const fx = 128; // face centre column
  blob(fx - 42, 150, 26, body === "female" ? "rgba(225,115,110,0.28)" : "rgba(205,115,100,0.18)"); // cheeks
  blob(fx + 42, 150, 26, body === "female" ? "rgba(225,115,110,0.28)" : "rgba(205,115,100,0.18)");
  blob(fx - 27, 118, 13, "rgba(110,65,55,0.22)"); blob(fx + 27, 118, 13, "rgba(110,65,55,0.22)"); // under-eye shadow
  blob(fx, 80, 44, "rgba(255,232,218,0.18)"); // forehead sheen
  if (body === "male") { // stubble along jaw, upper lip, chin
    for (let i = 0; i < 2200; i++) {
      const a = Math.random() * Math.PI, rr = 44 + Math.random() * 26;
      const x = fx + Math.cos(a) * rr * 1.1, y = 150 + Math.sin(a) * rr * 0.8;
      if (y < 158) continue;
      ctx.fillStyle = `rgba(70,48,36,${0.1 + Math.random() * 0.16})`; ctx.fillRect(x, y, 1.3, 1.3);
    }
    for (let i = 0; i < 500; i++) { ctx.fillStyle = `rgba(70,48,36,${0.1 + Math.random() * 0.15})`; ctx.fillRect(fx - 18 + Math.random() * 36, 160 + Math.random() * 10, 1.3, 1.3); }
  }
  for (let i = 0; i < 1500; i++) { ctx.fillStyle = `rgba(150,90,70,${Math.random() * 0.06})`; ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); } // pores/freckles
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (faceCache[body] = t);
}

/* ---------------- hair styles ---------------- */
const STYLE_PARAMS = {
  buzz: null,
  natural: null,
  bald: null,
  crop: { count: 440, nodes: 5, len: 0.06, stiff: 0.8, bend: 0.7, width: 0.03, out: 0.2 },
  bob: { count: 420, nodes: 8, len: 0.2, stiff: 0.3, bend: 0.6, width: 0.034, out: 0.12, frame: true },
  long: { count: 480, nodes: 11, len: 0.42, stiff: 0.22, bend: 0.55, width: 0.034, out: 0.1, frame: true },
  ponytail: { count: 140, nodes: 4, len: 0.05, stiff: 1, bend: 0.2, width: 0.034, out: 0.1, sweepBack: true, tail: { count: 90, nodes: 9, len: 0.34, stiff: 0.2, width: 0.03 } },
  mohawk: { count: 170, nodes: 5, len: 0.14, stiff: 0.85, bend: -0.05, width: 0.03, out: 1.0, mohawk: true },
  dreads: { count: 46, nodes: 9, len: 0.33, stiff: 0.18, bend: 0.55, width: 0.024, out: 0.35, crossed: true },
};

const CAP_TILT = -0.5;
const CAP_THETA = Math.PI * 0.52;
const CAP_R = 0.109;
const CAP_C = new THREE.Vector3(0, 0.004, -0.006);
const _hv = new THREE.Vector3();

// alpha for the scalp cap: fully opaque on top, breaking up into wisps along the bottom edge (uv.y -> 0)
let HAIRLINE = null;
function hairlineAlpha() {
  if (HAIRLINE) return HAIRLINE;
  const W = 512, H = 128, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"), img = x.createImageData(W, H), rnd = mulberry32(41);
  const edge = new Float32Array(W); // per-column hairline height with smooth + jagged variation
  for (let i = 0; i < W; i++) edge[i] = 0.1 + 0.035 * Math.sin(i / W * Math.PI * 6) + 0.025 * Math.sin(i / W * Math.PI * 22 + 1.3);
  for (let i = 0; i < W; i++) edge[i] += (rnd() - 0.5) * 0.06;
  for (let yy = 0; yy < H; yy++) for (let i = 0; i < W; i++) {
    const v = 1 - yy / (H - 1); // canvas row 0 = uv.y 1 (top of the cap)
    const t = (v - edge[i]) / 0.07; // soft ramp above the hairline
    const a = Math.max(0, Math.min(1, t + (rnd() - 0.5) * 0.9));
    const o = (yy * W + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = a * 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  HAIRLINE = new THREE.CanvasTexture(c);
  return HAIRLINE;
}

export class HairSystem {
  constructor(avatar, style, color, quality) {
    this.avatar = avatar;
    const P = STYLE_PARAMS[style];
    this.group = new THREE.Group();
    const capMat = new THREE.MeshStandardMaterial({
      color, map: avatar.tex.hair.map, normalMap: avatar.tex.hair.normalMap, roughness: 0.6,
      alphaMap: hairlineAlpha(), alphaTest: 0.5, alphaToCoverage: true, // soft, uneven hairline instead of a hard edge
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
      if (P.frame && dir.z > 0.25) d0.add(new THREE.Vector3(Math.sign(dir.x || 1) * 0.45, 0, -0.35)); // part away from face
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
    const uvs = new Float32Array(vCount * 2);
    const idx = [];
    for (const s of this.strands) {
      const n = s.rest.length;
      const u0 = Math.random(), uw = 0.3 + Math.random() * 0.25;
      for (let i = 0; i < n; i++) {
        const k = s.offset + i;
        for (let v = 0; v < vPer; v++) { const o = (k * vPer + v) * 2; uvs[o] = u0 + (v % 2) * uw; uvs[o + 1] = 0.02 + 0.96 * (i / (n - 1)); }
        const shade = s.shade * (0.55 + 0.45 * Math.pow(i / (n - 1), 0.6));
        for (let v = 0; v < vPer; v++) { const o = (k * vPer + v) * 3; col[o] = col[o + 1] = col[o + 2] = shade; }
        if (i < n - 1) for (let r = 0; r < ribbons; r++) {
          const a = k * vPer + r * 2, b = (k + 1) * vPer + r * 2;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    if (!STRAND_TEX) STRAND_TEX = hairStrandTexture();
    // hair cards: fine strands with soft, see-through tips (alpha-to-coverage keeps edges smooth under MSAA)
    this.mat = new THREE.MeshStandardMaterial({ color, map: STRAND_TEX, roughness: 0.42, metalness: 0.0, side: THREE.DoubleSide, vertexColors: true, alphaTest: 0.32, alphaToCoverage: true });
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
    if (this.needsReset || !Number.isFinite(P[P.length - 1])) { P.set(R); Q.set(R); this.needsReset = false; }
    if (!(dt > 1e-4)) { this.writeMesh(colliders[0].p); return; } // a zero-length frame would divide by zero
    this.invHead = (this.invHead || new THREE.Matrix4()).copy(headM).invert();
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
        // the skull, in the head frame (scaled to this person's skull): keeps hair on the head, not floating out
        _hv.set(P[o], P[o + 1], P[o + 2]).applyMatrix4(this.invHead).sub(CAP_C);
        const hl = _hv.length();
        if (hl < CAP_R * 1.02) { _hv.multiplyScalar(CAP_R * 1.02 / (hl || 1e-6)).add(CAP_C).applyMatrix4(headM); P[o] = _hv.x; P[o + 1] = _hv.y; P[o + 2] = _hv.z; }
        for (let c = 1; c < colliders.length; c++) {
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
export class Cloth {
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
    if (!(dt > 1e-4)) return; // zero-length frame: nothing to simulate (and no divide by zero)
    if (!Number.isFinite(P[P.length - 1])) { this.needsReset = true; return; }
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


/* ---------------- anatomy: sculpted torso + muscle-shaped limbs ---------------- */
const cosInterp = (prof, y, k) => {
  if (y <= prof[0][0]) return prof[0][k];
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i], b = prof[i + 1];
    if (y <= b[0]) { const t = (y - a[0]) / (b[0] - a[0]); const u = (1 - Math.cos(t * Math.PI)) / 2; return a[k] + (b[k] - a[k]) * u; }
  }
  return prof[prof.length - 1][k];
};
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));
// Torso in spine-joint space (y up from the spine joint, +z = front).
function sculptTorso(F) {
  // [y, half-width, half-depth]: waist -> ribs -> chest -> armpits -> shoulder line -> trapezius slope -> neck base
  const prof = F
    ? [[-0.05, 0.128, 0.092], [0.04, 0.118, 0.086], [0.13, 0.126, 0.09], [0.21, 0.14, 0.1], [0.28, 0.152, 0.1], [0.33, 0.16, 0.092], [0.365, 0.152, 0.08], [0.395, 0.112, 0.064], [0.425, 0.06, 0.05]]
    : [[-0.05, 0.142, 0.1], [0.04, 0.136, 0.094], [0.13, 0.15, 0.104], [0.21, 0.166, 0.112], [0.28, 0.182, 0.112], [0.33, 0.192, 0.102], [0.37, 0.18, 0.084], [0.405, 0.125, 0.068], [0.435, 0.066, 0.054]];
  const RINGS = 34, SEG = 48;
  const y0 = prof[0][0], y1 = prof[prof.length - 1][0];
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1), y = y0 + (y1 - y0) * t;
    const W = cosInterp(prof, y, 1), D = cosInterp(prof, y, 2);
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      let x = W * Math.sign(c) * Math.pow(Math.abs(c), 0.8);
      let z = D * Math.sign(sn) * Math.pow(Math.abs(sn), 0.85);
      const ax = Math.abs(x);
      if (sn > 0) {
        if (F) z += 0.034 * gauss(ax - 0.058, 0.05) * gauss(y - 0.255, 0.055) * sn;             // bust
        else z += 0.02 * gauss(ax - 0.07, 0.065) * gauss(y - 0.275, 0.05) * sn;               // pectorals
        z -= 0.006 * gauss(x, 0.012) * gauss(y - 0.27, 0.08) * sn;                             // sternum line
        z += 0.008 * gauss(ax - 0.06, 0.05) * gauss(y - 0.37, 0.018) * sn;                     // collarbones
        z += (F ? 0.004 : 0.008) * gauss(y - 0.08, 0.06) * gauss(x, 0.08) * sn;               // belly
      } else {
        z -= 0.012 * gauss(ax - 0.075, 0.05) * gauss(y - 0.3, 0.06) * -sn;                     // shoulder blades
        z += 0.006 * gauss(x, 0.012) * gauss(y - 0.2, 0.2) * -sn;                              // spine groove
      }
      x += (F ? -0.004 : 0.006) * gauss(y - 0.2, 0.08) * Math.sign(c) * Math.abs(c);          // lats (V-taper)
      pos.push(x, y, z); uv.push(j / SEG, t);
    }
  }
  for (let i = 0; i < RINGS - 1; i++) for (let j = 0; j < SEG; j++) {
    const a = i * (SEG + 1) + j, b = a + SEG + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Pelvis/hips band in hips-joint space: waist -> hip bones -> seat, closed at the crotch.
function sculptPelvis(F) {
  const prof = F
    ? [[0.11, 0.128, 0.092], [0.05, 0.15, 0.098], [-0.02, 0.172, 0.108], [-0.08, 0.168, 0.106], [-0.13, 0.13, 0.09], [-0.165, 0.05, 0.05]]
    : [[0.11, 0.14, 0.098], [0.05, 0.146, 0.098], [-0.02, 0.158, 0.102], [-0.08, 0.152, 0.1], [-0.13, 0.118, 0.088], [-0.165, 0.045, 0.045]];
  const RINGS = 16, SEG = 40, y0 = prof[0][0], y1 = prof[prof.length - 1][0];
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1), y = y0 + (y1 - y0) * t, W = cosInterp(prof, y, 1), D = cosInterp(prof, y, 2);
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      let z = D * Math.sign(sn) * Math.pow(Math.abs(sn), 0.85);
      if (sn < 0) z -= 0.02 * gauss(Math.abs(c) - 0.5, 0.35) * gauss(y + 0.07, 0.05) * -sn; // seat
      pos.push(W * Math.sign(c) * Math.pow(Math.abs(c), 0.8), y, z); uv.push(j / SEG * 2, t);
    }
  }
  for (let i = 0; i < RINGS - 1; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Limb from a [y, radius] profile (y descending from the joint), slightly flattened front-to-back.
function limbGeo(prof, flat = 0.92, seg = 18) {
  const pts = prof.slice().sort((a, b) => a[0] - b[0]).map(([y, r]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(1, 1, flat);
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
      skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55, normalMap: textures.skin.normalMap }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, map: textures.polymer.map, normalMap: textures.polymer.normalMap }),
      metal: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.35, metalness: 0.9 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x3a2a10, roughness: 0.05, metalness: 0.6, emissive: 0x1a0f00 }),
      // separate instances so outfits / masks can show or hide whole groups of merged parts
      sleeve: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      detail: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      detailAccent: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      zip: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.35, metalness: 0.9 }),
      cuff: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      teeCollar: new THREE.MeshStandardMaterial({ roughness: 0.95, map: textures.fabric.map }),
      gear: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, map: textures.polymer.map, normalMap: textures.polymer.normalMap }),
      gearMetal: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.35, metalness: 0.9 }),
      face: new THREE.MeshStandardMaterial({ roughness: 0.55, normalMap: textures.skin.normalMap }),
      jaw: new THREE.MeshStandardMaterial({ roughness: 0.55, normalMap: textures.skin.normalMap }),
      nose: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.5 }),
      lips: new THREE.MeshStandardMaterial({ color: 0xb06a62, roughness: 0.4 }),
      sclera: new THREE.MeshStandardMaterial({ color: 0xf2eee8, roughness: 0.15 }),
      iris: new THREE.MeshStandardMaterial({ color: 0x5f6a3a, roughness: 0.1 }),
      pupil: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05 }),
      brow: new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.9 }),
    };
    this.fine = { fabric: withRepeat(textures.fabric, 5, 5), leather: withRepeat(textures.leather, 3, 3) };
    this.mats.pants.map = this.fine.fabric.map; this.mats.pants.normalMap = this.fine.fabric.normalMap;
    this.mats.teeCollar.map = this.fine.fabric.map;
    this.hair = null; this.cloths = [];
    this.colliders = [];
    this.look = { ...DEFAULT_LOOK, ...look };
    this.body = this.look.body;
    this.buildBody();
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
    const F = this.body === "female";
    this.root.scale.setScalar(F ? 0.95 : 1);
    const hips = this.joint(this.root, "hips", 0, 0.97, 0);
    const pelvis = new THREE.Mesh(sculptPelvis(F), M.pants);
    pelvis.castShadow = true; pelvis.receiveShadow = true;
    hips.add(pelvis);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(F ? 0.142 : 0.146, 0.012, 6, 40), M.boots);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.69, 1); belt.position.y = 0.075;
    hips.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), M.metal);
    buckle.position.set(0, 0.075, F ? 0.1 : 0.106); hips.add(buckle);
    const spine = this.joint(hips, "spine", 0, 0.08, 0);
    const torso = new THREE.Mesh(sculptTorso(F), M.jacket);
    torso.castShadow = true; torso.receiveShadow = true;
    spine.add(torso);
    const chest = this.joint(spine, "chest", 0, 0.22, 0);
    // jacket details
    const crew = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 20), M.teeCollar);
    crew.rotation.x = Math.PI / 2 + 0.15; crew.position.set(0, 0.198, 0.006); crew.scale.set(F ? 0.98 : 1.08, F ? 0.86 : 0.9, 1); chest.add(crew);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.028, 8, 20), M.detail);
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.205; collar.scale.set(1.05, 0.85, 1); chest.add(collar);
    for (const sx of [-1, 1]) {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.025), M.detail);
      pocket.position.set(0.075 * sx, 0.04, F ? 0.118 : 0.128); pocket.rotation.x = -0.12; chest.add(pocket);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.025, 0.03), M.detailAccent);
      flap.position.set(0.075 * sx, 0.085, F ? 0.122 : 0.132); chest.add(flap);
    }
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.36, 0.01), M.zip);
    zip.position.set(0, -0.06, F ? 0.1 : 0.118); chest.add(zip);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.1), M.accent);
    pack.position.set(0, -0.05, -0.15); pack.castShadow = true; chest.add(pack);
    this.packMesh = pack;
    const neck = this.joint(chest, "neck", 0, 0.2, 0);
    const neckM = new THREE.Mesh(new THREE.CylinderGeometry(F ? 0.04 : 0.047, F ? 0.046 : 0.054, 0.1, 12), M.skin);
    neckM.position.y = 0.03; neck.add(neckM);
    const head = this.joint(neck, "head", 0, 0.13, 0.01);
    const skullGeo = new THREE.SphereGeometry(0.1, 48, 32);
    {
      const P = skullGeo.attributes.position, v = new THREE.Vector3();
      const bump = (d, cx, cy, cz, w, amt) => { const dd = (d.x - cx) ** 2 + (d.y - cy) ** 2 + (d.z - cz) ** 2; return amt * Math.exp(-dd / (w * w)); };
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i); const d = v.clone().normalize();
        let k = 1;
        for (const sx of [-1, 1]) {
          k -= bump(d, 0.33 * sx, 0.1, 0.94, 0.17, 0.09);            // eye sockets
          k += bump(d, 0.3 * sx, 0.3, 0.9, 0.16, 0.035);             // brow ridge
          k += bump(d, 0.55 * sx, -0.18, 0.8, 0.2, F ? 0.03 : 0.04); // cheekbones
          k -= bump(d, 0.85 * sx, 0.1, 0.4, 0.3, 0.05);              // temples
        }
        if (d.z > 0.5) k -= (d.z - 0.5) * 0.06;                     // flatter face plane
        if (d.z < -0.2) k += (-d.z - 0.2) * 0.08;                   // fuller cranium
        k += bump(d, 0, -0.78, 0.62, 0.22, F ? 0.05 : 0.08);        // chin
        if (!F) for (const sx of [-1, 1]) k += bump(d, 0.62 * sx, -0.58, 0.5, 0.22, 0.04); // jaw angle
        v.multiplyScalar(k);
        if (d.y < 0) {                                               // long lower face tapering to the jaw
          const tpr = THREE.MathUtils.smoothstep(-d.y, 0.1, 0.95);
          v.x *= 1 - tpr * (F ? 0.3 : 0.22);
          v.y *= 1.18;
          v.z *= 1 - tpr * 0.1 * (d.z < 0 ? 2 : 0);
        }
        P.setXYZ(i, v.x, v.y, v.z);
      }
      skullGeo.computeVertexNormals();
    }
    const skull = new THREE.Mesh(skullGeo, M.face);
    skull.scale.set(F ? 0.9 : 0.95, F ? 1.06 : 1.08, F ? 1.0 : 1.04); skull.castShadow = true; head.add(skull);
    skull.userData.keep = true;
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), M.skin);
      ear.scale.set(0.42, 1, 0.75); ear.position.set((F ? 0.087 : 0.093) * sx, -0.008, -0.004); head.add(ear);
      // eyes
      const ex = 0.033 * sx, ey = 0.01, ez = 0.08;
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.0128, 16, 12), M.sclera); sclera.position.set(ex, ey, ez); head.add(sclera);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0068, 20), M.iris); iris.position.set(ex, ey, ez + 0.0127); head.add(iris);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.003, 14), M.pupil); pupil.position.set(ex, ey, ez + 0.0129); head.add(pupil);
      const lashLine = new THREE.Mesh(new THREE.TorusGeometry(0.0128, 0.0016, 4, 16, Math.PI * 0.9), M.pupil); lashLine.position.set(ex, ey + 0.001, ez + 0.002); lashLine.rotation.set(-0.5, 0, Math.PI * 0.05); head.add(lashLine);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0138, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), M.skin);
      lid.position.set(ex, ey, ez); lid.rotation.x = 0.35; head.add(lid);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0134, 16, 6, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22), M.skin);
      lower.position.set(ex, ey, ez); lower.rotation.x = -0.2; head.add(lower);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, F ? 0.004 : 0.0065, 0.008), M.brow);
      brow.position.set(0.035 * sx, 0.031, 0.096); brow.rotation.set(-0.3, 0, (F ? -0.14 : -0.06) * sx); head.add(brow);
      if (F) { const lash = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.002, 0.006), M.brow); lash.position.set(ex, ey + 0.009, ez + 0.012); lash.rotation.x = -0.6; head.add(lash); }
      // nose wings
      const ala = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), M.nose); ala.position.set(0.0105 * sx, -0.026, 0.1); head.add(ala);
      // respirator gear
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.03, 0.03, 18), M.gear);
      lens.rotation.x = Math.PI / 2; lens.position.set(0.035 * sx, 0.006, 0.098); head.add(lens);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.023, 18), M.lens);
      glass.position.set(0.035 * sx, 0.006, 0.114); head.add(glass);
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.035, 14), M.gear);
      can.rotation.set(Math.PI / 2, 0, 0.9 * sx); can.position.set(0.058 * sx, -0.07, 0.09); head.add(can);
      const grill = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 14), M.gearMetal);
      grill.rotation.set(Math.PI / 2, 0, 0.9 * sx); grill.position.set(0.069 * sx, -0.075, 0.104); head.add(grill);
    }
    // nose: bridge + tip
    const bridgeN = new THREE.Mesh(new THREE.CapsuleGeometry(F ? 0.0068 : 0.008, 0.03, 4, 10), M.nose);
    bridgeN.scale.set(1, 1, 1.3); bridgeN.position.set(0, -0.006, 0.1); bridgeN.rotation.x = -0.38; head.add(bridgeN);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(F ? 0.0105 : 0.012, 12, 10), M.nose);
    tip.position.set(0, -0.024, 0.108); head.add(tip);
    // lips
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(F ? 0.0062 : 0.0052, 0.022, 4, 8), M.lips);
    upper.rotation.z = Math.PI / 2; upper.scale.set(1, 1, 0.7); upper.position.set(0, -0.049, 0.094); head.add(upper);
    const lowerL = new THREE.Mesh(new THREE.CapsuleGeometry(F ? 0.0072 : 0.006, 0.019, 4, 8), M.lips);
    lowerL.rotation.z = Math.PI / 2; lowerL.scale.set(1, 1, 0.75); lowerL.position.set(0, -0.059, 0.092); head.add(lowerL);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.012), M.gear);
    bridge.position.set(0, 0.008, 0.108); head.add(bridge);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.007, 6, 30), M.gear);
    strap.position.set(0, 0.006, -0.004); strap.scale.set(0.96, 1.05, 1); strap.rotation.x = Math.PI / 2; head.add(strap);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), M.gear);
    mask.scale.set(1.05, 0.95, 0.85); mask.position.set(0, -0.06, 0.075); head.add(mask);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.025, 12), M.gearMetal);
    valve.rotation.x = Math.PI / 2; valve.position.set(0, -0.072, 0.13); head.add(valve);

    for (const sx of [1, -1]) {
      const s = sx > 0 ? "L" : "R";
      const sh = this.joint(chest, "shoulder" + s, (F ? 0.165 : 0.188) * sx, 0.155, 0);
      const k = F ? 0.86 : 1;
      // deltoid cap: rounds the shoulder and blends the arm into the torso
      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.052 * k, 20, 14), M.jacket);
      delt.scale.set(0.88, 1.3, 1.02); delt.position.set(-0.006 * sx, -0.068, 0.0); delt.castShadow = true; sh.add(delt);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.066 * k, 14, 10), M.detail);
      pad.scale.set(0.95, 0.6, 1.0); pad.position.set(0.0, -0.035, 0); sh.add(pad);
      // upper arm: sleeve on top, biceps/triceps below (skin on a T-shirt)
      const up1 = new THREE.Mesh(limbGeo([[0.0, 0.05 * k], [-0.06, 0.054 * k], [-0.13, 0.052 * k], [-0.15, 0.05 * k]]), M.jacket);
      up1.castShadow = true; sh.add(up1);
      const up2 = new THREE.Mesh(limbGeo([[-0.13, 0.048 * k], [-0.18, 0.05 * k], [-0.23, 0.044 * k], [-0.29, 0.037 * k]]), M.sleeve);
      up2.castShadow = true; sh.add(up2);
      const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.037 * k, 12, 10), M.sleeve); elbowCap.position.y = -0.285; sh.add(elbowCap);
      const el = this.joint(sh, "elbow" + s, 0, -0.28, 0);
      const fore = new THREE.Mesh(limbGeo([[0.01, 0.037 * k], [-0.05, 0.043 * k], [-0.12, 0.039 * k], [-0.2, 0.029 * k], [-0.25, 0.026 * k]], 0.86), M.sleeve);
      fore.castShadow = true; el.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), M.cuff);
      cuff.position.y = -0.22; el.add(cuff);
      const hand = this.joint(el, "hand" + s, 0, -0.27, 0);
      const glove = makeGlove(M.gloves, sx);
      glove.rotation.x = -Math.PI / 2;
      glove.scale.setScalar(0.95);
      glove.position.y = -0.03;
      glove.userData.setCurl(0.35);
      hand.add(glove);
      const hp = this.joint(hips, "hip" + s, (F ? 0.1 : 0.095) * sx, -0.04, 0);
      this.limb(hp, M.pants, F ? 0.072 : 0.075, 0.33, [1, 1, 1.05]);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.1), M.pants);
      pocket.position.set(0.075 * sx, -0.22, 0); hp.add(pocket);
      const kn = this.joint(hp, "knee" + s, 0, -0.44, 0);
      this.limb(kn, M.pants, 0.06, 0.33);
      const kneepad = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.detailAccent);
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
    const M = this.mats;
    if (this.look.body !== this.body) {
      // different body type: rebuild the whole rig
      if (this.hair) { this.hair.dispose(); this.hair = null; }
      this.cloths.forEach((c) => c.dispose()); this.cloths = [];
      while (this.root.children.length) this.root.remove(this.root.children[0]);
      this.body = this.look.body;
      this.colliders = [];
      this.buildBody();
    }
    const o = PROC_OUTFITS.find((x) => x.id === this.look.outfit) || PROC_OUTFITS[0];
    const jt = this.fine[o.jacketTex] || this.fine.fabric;
    for (const m of [M.jacket, M.detail]) {
      Object.assign(m, { map: jt.map, normalMap: jt.normalMap, roughness: o.jacketTex === "leather" ? 0.55 : 0.92 });
      m.color.setHex(o.jacket); m.needsUpdate = true;
    }
    M.teeCollar.color.setHex(o.jacket).multiplyScalar(0.85);
    M.pants.color.setHex(o.pants);
    M.boots.color.setHex(o.boots);
    M.accent.color.setHex(o.accent); M.detailAccent.color.setHex(o.accent); M.cuff.color.setHex(o.accent);
    const bare = o.gloves === "skin";
    Object.assign(M.gloves, { map: bare ? null : this.tex.leather.map, normalMap: bare ? this.tex.skin.normalMap : this.tex.leather.normalMap, roughness: bare ? 0.55 : 0.7 });
    M.gloves.color.setHex(bare ? SKIN : o.gloves); M.gloves.needsUpdate = true;
    // T-shirt: bare forearms, no jacket hardware
    const src = o.tee ? M.skin : M.jacket;
    Object.assign(M.sleeve, { map: src.map, normalMap: src.normalMap, roughness: src.roughness }); M.sleeve.color.copy(src.color); M.sleeve.needsUpdate = true;
    for (const m of [M.detail, M.detailAccent, M.zip, M.cuff]) m.visible = !o.tee;
    M.teeCollar.visible = !!o.tee;
    // face + respirator
    const masked = this.look.mask === "respirator";
    M.face.map = faceTexture(this.body); M.face.color.setHex(0xffffff); M.face.needsUpdate = true;
    M.jaw.map = jawTexture(this.body); M.jaw.color.setHex(0xffffff); M.jaw.needsUpdate = true;
    M.iris.color.setHex(this.body === "female" ? 0x5a3a22 : 0x6a6a3a);
    M.lips.color.setHex(this.body === "female" ? 0xb8605c : 0xa86a60);
    for (const m of [M.gear, M.gearMetal, M.lens]) m.visible = masked;
    for (const m of [M.nose, M.lips]) m.visible = !masked;
    // hair
    if (this.hair) this.hair.dispose();
    const hc = (HAIR_COLORS.find((c) => c.id === this.look.hairColor) || HAIR_COLORS[0]).hex ?? 0x4a2c18;
    this.root.updateMatrixWorld(true);
    this.hair = new HairSystem(this, this.look.hair, new THREE.Color(hc), this.quality);
    M.brow.color.setHex(hc).multiplyScalar(0.8);
    // cloth
    this.cloths.forEach((c) => c.dispose());
    this.cloths = [];
    const item = CLOTH_ITEMS.find((c) => c.id === this.look.cloth);
    if (item && item.id !== "none") this.buildCloth(item);
    this.packMesh.visible = this.look.cloth !== "cloak" && !o.tee && !o.noPack;
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
        const W = 5, H = 12;
        const c = new Cloth(this, {
          w: W, h: H, attach: this.j.chest, material: mat, seed: 11 + n,
          init: (i, j) => new THREE.Vector3(x + (i / (W - 1) - 0.5) * 0.13, 0.22 - j * (0.6 * len) / (H - 1), z + Math.sign(z) * (0.02 + j * 0.005)),
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
