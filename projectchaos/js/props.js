// Prop catalog, spawning, breaking into real mesh fragments, and repair.
import * as THREE from "three";
import { RAPIER, GROUPS, MATS } from "./physics.js";
import { canvasTex } from "./textures.js";

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _v2 = new THREE.Vector3();
const R = 1.9; // Meshy raw models are normalized to ~1.9 units on their longest side
const wp = (size, x, y, z = 0) => new THREE.Vector3(z, y, x).multiplyScalar(size / R); // raw (barrel -X) -> game (barrel -Z)

/* ---------------- procedural meshes ---------------- */
function lathe(points, mat, seg = 20) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return new THREE.Mesh(g, mat);
}
function centerGroup(g) {
  const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3());
  g.children.forEach((ch) => ch.position.sub(c));
  return g;
}
function grp(...meshes) { const g = new THREE.Group(); meshes.forEach((m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); }); return g; }

export function makeMaterials(T) {
  const M = {};
  M.wood = new THREE.MeshStandardMaterial({ ...T.wood, roughness: 1 });
  M.woodPaint = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6, normalMap: T.wood.normalMap });
  M.concrete = new THREE.MeshStandardMaterial({ ...T.concrete });
  M.metal = new THREE.MeshStandardMaterial({ ...T.gunmetal, metalness: 0.8 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x9fd4c0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false });
  M.glassClear = new THREE.MeshPhysicalMaterial({ color: 0xd8eef5, roughness: 0.04, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  M.ceramic = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.25 });
  M.cardboard = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#b68b57"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(80,50,20,${Math.random() * 0.08})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 30); }
    c.fillStyle = "#c9a26b"; c.fillRect(0, h * 0.44, w, h * 0.12);
    c.fillStyle = "rgba(40,30,20,0.75)"; c.font = "bold 30px monospace"; c.fillText("FRAGILE", 60, 80); c.font = "20px monospace"; c.fillText("THIS SIDE UP ↑", 50, 210);
  }), roughness: 0.95 });
  M.brick = new THREE.MeshStandardMaterial({ ...T.concrete, color: 0xb0614a });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.22 });
  M.cell = new THREE.MeshStandardMaterial({ color: 0x2a3138, metalness: 0.7, roughness: 0.35 });
  M.cellGlow = new THREE.MeshStandardMaterial({ color: 0x0a2a30, emissive: 0x33e6ff, emissiveIntensity: 2.2 });
  M.foam = new THREE.MeshStandardMaterial({ color: 0x2f7cff, roughness: 0.9 });
  M.foamTip = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.9 });
  M.plasticY = new THREE.MeshStandardMaterial({ color: 0xffb21a, roughness: 0.5 });
  M.rubberBlack = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 });
  M.bowling = new THREE.MeshStandardMaterial({ color: 0x5a1a8a, roughness: 0.12, metalness: 0.1 });
  M.beach = new THREE.MeshStandardMaterial({ roughness: 0.4, map: canvasTex(256, 128, (c, w, h) => {
    const cols = ["#ff3b3b", "#ffffff", "#2a7bff", "#ffffff", "#ffd21a", "#ffffff"];
    cols.forEach((col, i) => { c.fillStyle = col; c.fillRect((i * w) / 6, 0, w / 6 + 1, h); });
  }) });
  M.liquid = new THREE.MeshStandardMaterial({ color: 0x3dff7a, emissive: 0x0a5a22, roughness: 0.2 });
  M.liquid2 = new THREE.MeshStandardMaterial({ color: 0xff3df0, emissive: 0x5a0a52, roughness: 0.2 });
  M.radio = new THREE.MeshStandardMaterial({ color: 0x6a2a20, roughness: 0.5 });
  M.speaker = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.9, map: canvasTex(128, 128, (c, w, h) => { c.fillStyle = "#222"; c.fillRect(0, 0, w, h); c.fillStyle = "#000"; for (let y = 6; y < h; y += 10) for (let x = 6; x < w; x += 10) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); } }) });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.2 });
  M.block = [0xff4040, 0x3fa0ff, 0xffd030, 0x40d070, 0xb060ff].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, normalMap: T.wood.normalMap }));
  M.domino = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35 });
  M.dominoDot = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  M.flash = new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.6, roughness: 0.4 });
  M.lens = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0 });
  M.basket = new THREE.MeshStandardMaterial({ color: 0xe0661a, roughness: 0.7, map: canvasTex(256, 128, (c, w, h) => { c.fillStyle = "#e0661a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#221"; c.lineWidth = 4; c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.moveTo(w / 4, 0); c.lineTo(w / 4, h); c.moveTo((3 * w) / 4, 0); c.lineTo((3 * w) / 4, h); c.stroke(); }) });
  return M;
}

/* --------- catalog ---------
 * shape: box | ball | cyl | hull ; model: Meshy template ; build: procedural
 * breakable: { hp, kind } ; weapon: config used by weapons.js */
export function makeCatalog(M) {
  return {
    crate: { name: "Wooden Crate", model: "crate", shape: "box", mass: 12, mat: "wood", breakable: { hp: 260, kind: "wood" } },
    barrel: { name: "Steel Drum", model: "barrel", shape: "cyl", mass: 18, mat: "metal" },
    explosive_barrel: { name: "Explosive Barrel", model: "explosive_barrel", shape: "cyl", mass: 20, mat: "metal", breakable: { hp: 45, kind: "explode" } },
    cone: { name: "Traffic Cone", model: "cone", shape: "hull", mass: 1.6, mat: "rubber" },
    extinguisher: { name: "Extinguisher", model: "extinguisher", shape: "hull", mass: 6, mat: "metal" },
    monitor: { name: "CRT Monitor", model: "monitor", shape: "box", mass: 9, mat: "plastic", breakable: { hp: 70, kind: "electronic" } },
    watermelon: { name: "Watermelon", model: "watermelon", shape: "hull", mass: 5, mat: "fruit", breakable: { hp: 30, kind: "fruit" } },
    duck: { name: "Rubber Duck", model: "duck", shape: "hull", mass: 0.15, mat: "rubber", squeak: true },
    tire: { name: "Tire", model: "tire", shape: "hull", mass: 9, mat: "rubber" },
    toolbox: { name: "Toolbox", model: "toolbox", shape: "box", mass: 5, mat: "metal" },
    lab_chair: { name: "Lab Stool", model: "lab_chair", shape: "hull", mass: 3.5, mat: "metal" },
    bowling_pin: { name: "Bowling Pin", model: "bowling_pin", shape: "hull", mass: 1.5, mat: "wood" },
    plant: { name: "Dead Plant", model: "plant", shape: "hull", mass: 4, mat: "stone", breakable: { hp: 30, kind: "ceramic" }, hullScale: 0.6 },
    wrench: { name: "Pipe Wrench", model: "wrench", shape: "hull", mass: 2.4, mat: "heavyMetal", melee: true },
    frying_pan: { name: "Frying Pan", model: "frying_pan", shape: "hull", mass: 2.0, mat: "heavyMetal", melee: true, bonk: true },
    sledgehammer: { name: "Sledgehammer", model: "sledgehammer", shape: "hull", mass: 6, mat: "heavyMetal", melee: true, twoHand: true },
    volt_blaster: { name: "Volt Blaster", model: "volt_blaster", shape: "hull", mass: 1.2, mat: "plastic", tight: true,
      weapon: { type: "blaster", grip: wp(0.3, 0.6, -0.28), muzzle: wp(0.3, -1.0, 0.36), magwell: wp(0.3, 0.68, -0.62), mag: "energy_cell", cap: 12, rate: 0.16, display: wp(0.3, 0.05, 0.12, 0.29) } },
    golden_blaster: { name: "Golden Blaster", model: "volt_blaster", gold: true, shape: "hull", mass: 1.4, mat: "metal", tight: true, spawnable: false,
      weapon: { type: "blaster", infinite: true, grip: wp(0.3, 0.6, -0.28), muzzle: wp(0.3, -1.0, 0.36), magwell: wp(0.3, 0.68, -0.62), mag: "energy_cell", cap: 99, rate: 0.1, display: wp(0.3, 0.05, 0.12, 0.29) } },
    toy_pistol: { name: "Foam Pistol", model: "toy_pistol", shape: "hull", mass: 0.5, mat: "plastic", tight: true,
      weapon: { type: "dart", grip: wp(0.26, 0.62, -0.25), muzzle: wp(0.26, -1.0, 0.33), magwell: wp(0.26, 0.66, -0.66), slide: wp(0.26, 0.82, 0.38), mag: "dart_clip", cap: 8, rate: 0.18 } },
    grav_gun: { name: "Grav-Lift", model: "grav_gun", shape: "hull", mass: 2.2, mat: "metal", tight: true,
      weapon: { type: "grav", grip: wp(0.42, 0.8, -0.3), muzzle: wp(0.42, -1.0, 0.1) } },
    mender: { name: "Mender", model: "mender", shape: "hull", mass: 1.5, mat: "plastic", tight: true,
      weapon: { type: "mender", grip: wp(0.32, 0.22, -0.32), muzzle: wp(0.32, -1.0, 0.36) } },
    flashlight: { name: "Flashlight", build: () => buildFlashlight(M), shape: "cyl", axis: "z", mass: 0.5, mat: "metal", tight: true,
      weapon: { type: "flashlight", grip: new THREE.Vector3(0, 0, 0.04), muzzle: new THREE.Vector3(0, 0, -0.13) } },
    energy_cell: { name: "Energy Cell", build: () => buildCell(M), shape: "cyl", mass: 0.25, mat: "metal", mag: "energy_cell", spawnable: false },
    dart_clip: { name: "Dart Clip", build: () => buildClip(M), shape: "box", mass: 0.12, mat: "plastic", mag: "dart_clip", spawnable: false },
    bowling_ball: { name: "Bowling Ball", build: () => grp(new THREE.Mesh(new THREE.SphereGeometry(0.109, 28, 20), M.bowling)), shape: "ball", r: 0.109, mass: 6.5, mat: "stone", ccd: true },
    beach_ball: { name: "Beach Ball", build: () => grp(new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), M.beach)), shape: "ball", r: 0.25, mass: 0.2, mat: "foam", restitution: 0.75, linDamp: 0.35 },
    basketball: { name: "Ball", build: () => grp(new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), M.basket)), shape: "ball", r: 0.12, mass: 0.6, mat: "rubber", restitution: 0.78 },
    cardboard: { name: "Cardboard Box", build: () => grp(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), M.cardboard)), shape: "box", mass: 1.2, mat: "foam", breakable: { hp: 60, kind: "wood" } },
    cinder: { name: "Cinder Block", build: () => grp(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), M.concrete)), shape: "box", mass: 12, mat: "stone" },
    brick: { name: "Brick", build: () => grp(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.105), M.brick)), shape: "box", mass: 2, mat: "stone" },
    plank: { name: "Plank", build: () => grp(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.16), M.wood)), shape: "box", mass: 2.6, mat: "wood" },
    block: { name: "Toy Block", build: () => grp(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), M.block[Math.floor(Math.random() * 5)])), shape: "box", mass: 0.35, mat: "wood" },
    domino: { name: "Domino", build: () => buildDomino(M), shape: "box", mass: 2.5, mat: "plastic" },
    bottle: { name: "Bottle", build: () => grp(lathe([[0, 0], [0.04, 0], [0.042, 0.005], [0.042, 0.16], [0.03, 0.2], [0.014, 0.23], [0.014, 0.28], [0, 0.28]], M.glass)), shape: "cyl", mass: 0.4, mat: "glass", breakable: { hp: 4, kind: "glass" } },
    beaker: { name: "Beaker", build: () => buildBeaker(M), shape: "cyl", mass: 0.3, mat: "glass", breakable: { hp: 3, kind: "glass" } },
    mug: { name: "Mug", build: () => buildMug(M), shape: "cyl", mass: 0.35, mat: "stone", breakable: { hp: 6, kind: "ceramic" } },
    glass_pane: { name: "Glass Pane", build: () => grp(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 0.02), M.glassClear)), shape: "box", mass: 9, mat: "glass", breakable: { hp: 20, kind: "glass" } },
    radio: { name: "Party Radio", build: () => buildRadio(M), shape: "box", mass: 2.5, mat: "plastic", radio: true },
    golden_duck: { name: "Golden Duck", model: "duck", gold: true, shape: "hull", mass: 0.6, mat: "metal", spawnable: false, collectible: true },
  };
}

function buildCell(M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.085, 16), M.cell);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.05, 12), M.cellGlow);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 16), M.chrome); cap.position.y = 0.044;
  const cap2 = cap.clone(); cap2.position.y = -0.044;
  glow.scale.set(1.45, 1, 1.45);
  g.add(body, glow, cap, cap2);
  g.traverse((m) => (m.castShadow = true));
  return g;
}
function buildClip(M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.09, 0.04), M.plasticY));
  for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), M.foamTip); d.rotation.x = Math.PI / 2; d.position.set(0, 0.046, -0.012 + i * 0.008); g.add(d); }
  g.traverse((m) => (m.castShadow = true));
  return g;
}
function buildFlashlight(M) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 16), M.flash); b.rotation.x = Math.PI / 2;
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.06, 16), M.flash); h.rotation.x = Math.PI / 2; h.position.z = -0.12;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 16), M.lens.clone()); lens.position.z = -0.151; lens.rotation.y = Math.PI; lens.name = "lens";
  g.add(b, h, lens);
  g.traverse((m) => (m.castShadow = true));
  return centerGroup(g);
}
function buildDomino(M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.48, 0.06), M.domino));
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.062), M.dominoDot); g.add(line);
  const pips = [[-0.06, 0.12], [0.06, 0.12], [0, 0.17], [-0.06, -0.12], [0.06, -0.15], [0, -0.09]];
  for (const [x, y] of pips) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.064, 10), M.dominoDot); p.rotation.x = Math.PI / 2; p.position.set(x, y, 0); g.add(p); }
  g.traverse((m) => (m.castShadow = true));
  return g;
}
function buildBeaker(M) {
  const liquid = Math.random() < 0.5 ? M.liquid : M.liquid2;
  const g = grp(lathe([[0, 0], [0.045, 0], [0.047, 0.004], [0.047, 0.14], [0.052, 0.15], [0.05, 0.152], [0.043, 0.142], [0.043, 0.006], [0, 0.006]], M.glassClear, 22));
  const l = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.07, 18), liquid); l.position.y = 0.042; g.add(l);
  return centerGroup(g);
}
function buildMug(M) {
  const g = grp(lathe([[0, 0], [0.04, 0], [0.042, 0.004], [0.042, 0.1], [0.037, 0.1], [0.037, 0.008], [0, 0.008]], M.ceramic, 22));
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16, Math.PI), M.ceramic); h.position.set(0.042, 0.05, 0); h.rotation.z = -Math.PI / 2; g.add(h);
  return centerGroup(g);
}
function buildRadio(M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.11), M.radio));
  for (const x of [-0.09, 0.09]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.01, 20), M.speaker); s.rotation.x = Math.PI / 2; s.position.set(x, -0.01, 0.056); g.add(s); }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.009, 8, 20, Math.PI), M.chrome); handle.position.y = 0.1; g.add(handle);
  const dial = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.012), M.cellGlow); dial.position.set(0, 0.07, 0.056); dial.name = "dial"; g.add(dial);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.3), M.chrome); ant.position.set(0.15, 0.24, -0.03); ant.rotation.z = -0.3; g.add(ant);
  g.traverse((m) => (m.castShadow = true));
  return centerGroup(g);
}

/* ---------------- prop manager ---------------- */
export class Props {
  constructor(game) {
    this.game = game;
    this.list = new Set();
    this.records = new Set(); // broken objects awaiting repair
    this.fragCache = new Map();
    this.M = makeMaterials(game.T);
    this.defs = makeCatalog(this.M);
    this.goldMat = this.M.gold;
  }

  makeMesh(def) {
    let mesh;
    if (def.model && this.game.assets.has(def.model)) {
      mesh = this.game.assets.instance(def.model);
      if (def.gold) mesh.traverse((m) => { if (m.isMesh) { const mm = this.goldMat.clone(); mm.normalMap = m.material.normalMap; mm.map = null; m.material = mm; } });
    } else if (def.build) mesh = def.build();
    else mesh = grp(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.M.woodPaint)); // model missing fallback
    return mesh;
  }

  colliderDescs(def, mesh) {
    // measure in the prop's local frame
    const p0 = mesh.position.clone(), q0 = mesh.quaternion.clone();
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    mesh.position.copy(p0); mesh.quaternion.copy(q0); mesh.updateMatrixWorld(true);
    const descs = [];
    let d;
    const shrink = 0.98;
    if (def.shape === "ball") d = RAPIER.ColliderDesc.ball(def.r || size.x / 2);
    else if (def.shape === "cyl") {
      if (def.axis === "z") { d = RAPIER.ColliderDesc.cylinder(size.z / 2 * shrink, Math.max(size.x, size.y) / 2 * shrink); d.setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }); }
      else d = RAPIER.ColliderDesc.cylinder(size.y / 2 * shrink, Math.max(size.x, size.z) / 2 * shrink);
    } else if (def.shape === "hull") {
      let pts = def.model && this.game.assets.hulls[def.model];
      if (pts && def.hullScale) { pts = pts.slice(); for (let i = 0; i < pts.length; i += 3) { pts[i] *= def.hullScale; pts[i + 2] *= def.hullScale; } }
      d = pts ? RAPIER.ColliderDesc.convexHull(pts) : null;
      if (!d) d = RAPIER.ColliderDesc.cuboid(size.x / 2 * shrink, size.y / 2 * shrink, size.z / 2 * shrink);
    } else d = RAPIER.ColliderDesc.cuboid(Math.max(0.005, size.x / 2 * shrink), Math.max(0.005, size.y / 2 * shrink), Math.max(0.005, size.z / 2 * shrink));
    if (def.shape !== "hull" && c.lengthSq() > 1e-6) d.setTranslation(c.x, c.y, c.z);
    d.setMass(def.mass);
    descs.push(d);
    return { descs, size };
  }

  spawn(type, pos, quat = null, opts = {}) {
    const def = this.defs[type];
    if (!def) { console.warn("unknown prop", type); return null; }
    const mesh = this.makeMesh(def);
    mesh.position.copy(pos);
    if (quat) mesh.quaternion.copy(quat);
    this.game.scene.add(mesh);
    const ent = { kind: "prop", type, def, mesh, mass: def.mass, grabbable: true, hp: def.breakable?.hp ?? 0, maxHp: def.breakable?.hp ?? 0, spawned: !!opts.spawned };
    const { descs, size } = this.colliderDescs(def, mesh);
    ent.size = size.length();
    const mat = { ...MATS[def.mat] };
    if (def.restitution != null) mat.restitution = def.restitution;
    this.game.physics.createBody(ent, { pos, quat: quat || mesh.quaternion, colliders: descs, mat, mass: def.mass, linDamp: def.linDamp ?? 0.04, angDamp: 0.12, ccd: def.ccd || def.mass < 1 || def.tight });
    ent.sound = MATS[def.mat].sound;
    mesh.userData.ent = ent;
    if (opts.sleep) ent.body.sleep();
    this.list.add(ent);
    if (def.weapon || def.mag || def.radio) this.game.weapons?.attach(ent);
    return ent;
  }

  remove(ent) {
    this.game.interaction?.forceRelease(ent);
    this.game.physics.remove(ent);
    if (ent.mesh) this.game.scene.remove(ent.mesh);
    this.list.delete(ent);
    ent.dead = true;
    this.game.weapons?.detach(ent);
  }

  clearSpawned() {
    for (const e of [...this.list]) if (e.spawned) this.remove(e);
    for (const r of [...this.records]) if (r.spawned) { r.pieces.forEach((p) => this.removePiece(p)); this.records.delete(r); }
  }

  /* ----- damage & breaking ----- */
  damage(ent, amount, dir = null) {
    if (!ent.def?.breakable || ent.dead || ent.breaking) return;
    ent.hp -= amount;
    if (ent.hp <= 0) this.breakProp(ent, dir);
  }

  fragmentsFor(type, mesh) {
    if (this.fragCache.has(type)) return this.fragCache.get(type);
    const def = this.defs[type];
    const kind = def.breakable.kind;
    const count = kind === "glass" ? (type === "glass_pane" ? 14 : 8) : kind === "fruit" ? 7 : kind === "explode" ? 9 : 8;
    mesh.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    // gather triangles in prop-local space, grouped by material
    const tris = [];
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
      for (let i = 0; i < p.count; i += 3) tris.push({ o, g, m, i, p, uv, n });
    });
    const box = new THREE.Box3().setFromObject(mesh).applyMatrix4(inv);
    const seeds = [];
    for (let i = 0; i < count; i++) seeds.push(new THREE.Vector3(THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()), THREE.MathUtils.lerp(box.min.y, box.max.y, Math.random()), THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random())));
    const cells = seeds.map(() => new Map()); // material -> {pos:[], uv:[], nor:[]}
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cen = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    for (const t of tris) {
      a.fromBufferAttribute(t.p, t.i).applyMatrix4(t.m); b.fromBufferAttribute(t.p, t.i + 1).applyMatrix4(t.m); c.fromBufferAttribute(t.p, t.i + 2).applyMatrix4(t.m);
      cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      let best = 0, bd = Infinity;
      for (let s = 0; s < seeds.length; s++) { const d = seeds[s].distanceToSquared(cen); if (d < bd) { bd = d; best = s; } }
      const mat = t.o.material;
      let bucket = cells[best].get(mat);
      if (!bucket) { bucket = { pos: [], uv: [], nor: [] }; cells[best].set(mat, bucket); }
      nm.getNormalMatrix(t.m);
      for (let k = 0; k < 3; k++) {
        const v = k === 0 ? a : k === 1 ? b : c;
        bucket.pos.push(v.x, v.y, v.z);
        if (t.uv) bucket.uv.push(t.uv.getX(t.i + k), t.uv.getY(t.i + k)); else bucket.uv.push(0, 0);
        if (t.n) { _v.fromBufferAttribute(t.n, t.i + k).applyMatrix3(nm).normalize(); bucket.nor.push(_v.x, _v.y, _v.z); } else bucket.nor.push(0, 1, 0);
      }
    }
    const frags = [];
    for (const cell of cells) {
      if (!cell.size) continue;
      const parts = [];
      const allPts = [];
      for (const [mat, bk] of cell) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(bk.pos, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(bk.uv, 2));
        g.setAttribute("normal", new THREE.Float32BufferAttribute(bk.nor, 3));
        parts.push({ g, mat });
        for (let i = 0; i < bk.pos.length; i += 3) allPts.push(bk.pos[i], bk.pos[i + 1], bk.pos[i + 2]);
      }
      // centroid
      const ctr = new THREE.Vector3();
      for (let i = 0; i < allPts.length; i += 3) ctr.x += allPts[i], ctr.y += allPts[i + 1], ctr.z += allPts[i + 2];
      ctr.multiplyScalar(3 / allPts.length);
      const hull = [];
      const step = Math.max(1, Math.floor(allPts.length / 3 / 60));
      for (let i = 0; i < allPts.length; i += 3 * step) hull.push(allPts[i] - ctr.x, allPts[i + 1] - ctr.y, allPts[i + 2] - ctr.z);
      parts.forEach((p) => p.g.translate(-ctr.x, -ctr.y, -ctr.z));
      frags.push({ parts, center: ctr, hull: new Float32Array(hull), share: allPts.length });
    }
    const total = frags.reduce((s, f) => s + f.share, 0);
    frags.forEach((f) => (f.share /= total));
    this.fragCache.set(type, frags);
    return frags;
  }

  breakProp(ent, dir = null) {
    if (ent.breaking) return;
    ent.breaking = true;
    const g = this.game;
    const def = ent.def, kind = def.breakable.kind;
    const t = ent.body.translation(), r = ent.body.rotation(), lv = ent.body.linvel();
    const pos = new THREE.Vector3(t.x, t.y, t.z), quat = new THREE.Quaternion(r.x, r.y, r.z, r.w), vel = new THREE.Vector3(lv.x, lv.y, lv.z);
    const frags = this.fragmentsFor(ent.type, ent.mesh);
    const record = { type: ent.type, pos: pos.clone(), quat: quat.clone(), pieces: [], spawned: ent.spawned, repair: 0, time: g.time };
    this.remove(ent);
    for (const f of frags) {
      const m = new THREE.Group();
      for (const p of f.parts) { const mm = new THREE.Mesh(p.g, p.mat); mm.castShadow = true; m.add(mm); }
      if (kind === "fruit" || kind === "glass" || kind === "ceramic") m.children.forEach((c) => { c.material = c.material.clone(); c.material.side = THREE.DoubleSide; });
      const wpos = f.center.clone().applyQuaternion(quat).add(pos);
      m.position.copy(wpos); m.quaternion.copy(quat);
      g.scene.add(m);
      const piece = { kind: "debris", mesh: m, grabbable: true, mass: Math.max(0.05, def.mass * f.share), record, home: f.center.clone(), sound: kind === "glass" ? "glass" : MATS[def.mat].sound };
      let cd = f.hull.length >= 12 ? RAPIER.ColliderDesc.convexHull(f.hull) : null;
      if (!cd) cd = RAPIER.ColliderDesc.ball(0.03);
      cd.setMass(piece.mass);
      g.physics.createBody(piece, { pos: wpos, quat, colliders: [cd], mat: MATS[def.mat], groups: GROUPS.debris, linDamp: 0.1, angDamp: 0.2, mass: piece.mass });
      const out = f.center.clone().normalize().applyQuaternion(quat);
      const burst = kind === "explode" ? 9 : kind === "glass" ? 1.6 : kind === "fruit" ? 1.8 : 1.1;
      _v.copy(vel).multiplyScalar(0.6).addScaledVector(out, burst * (0.5 + Math.random()));
      if (dir) _v.addScaledVector(dir, 1.5);
      piece.body.setLinvel({ x: _v.x, y: _v.y + (kind === "explode" ? 4 : 0.5), z: _v.z }, true);
      piece.body.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
      record.pieces.push(piece);
    }
    this.records.add(record);
    // effects
    const snd = { glass: "shatter", wood: "crunch", fruit: "splat", electronic: "shatter", ceramic: "shatter", explode: "boom" }[kind];
    g.audio.play(snd, pos, { vol: kind === "explode" ? 1.6 : 1, ref: kind === "explode" ? 6 : 1.5 });
    if (kind === "electronic") { g.audio.play("spark", pos); g.fx.sparks(pos, null, 30, 0x9fe8ff); }
    if (kind === "fruit") g.fx.burst(pos, 0xd8233a, 40, 2.5, 0.025);
    if (kind === "glass") g.fx.burst(pos, 0xcfefff, 24, 2, 0.01);
    if (kind === "wood") g.fx.burst(pos, 0x8a6236, 20, 1.6, 0.02);
    if (kind === "explode") g.explode(pos, 1);
    g.noise(pos, kind === "explode" ? 2.5 : 1.0, "break");
    g.stats.broken = (g.stats.broken || 0) + 1;
    // keep the debris count bounded
    if (this.records.size > 40) { const old = this.records.values().next().value; old.pieces.forEach((p) => this.removePiece(p)); this.records.delete(old); }
  }

  removePiece(p) { this.game.interaction?.forceRelease(p); this.game.physics.remove(p); this.game.scene.remove(p.mesh); p.dead = true; }

  // Mender beam: progress a broken record towards reassembly
  repairStep(record, dt) {
    if (!this.records.has(record)) return false;
    if (record.repair === 0) {
      // choose where to rebuild: the break spot, unless the pieces wandered far away
      const c = new THREE.Vector3(); record.pieces.forEach((p) => c.add(p.mesh.position)); c.multiplyScalar(1 / record.pieces.length);
      if (c.distanceTo(record.pos) > 2.5) record.pos.copy(c).add(_v2.set(0, 0.4, 0));
      record.pieces.forEach((p) => { this.game.interaction?.forceRelease(p); p.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); p.from = p.mesh.position.clone(); p.fromQ = p.mesh.quaternion.clone(); });
    }
    record.repair = Math.min(1, record.repair + dt / 1.3);
    const k = record.repair * record.repair * (3 - 2 * record.repair);
    for (const p of record.pieces) {
      const target = p.home.clone().applyQuaternion(record.quat).add(record.pos);
      _v.lerpVectors(p.from, target, k);
      _q.slerpQuaternions(p.fromQ, record.quat, k);
      p.body.setNextKinematicTranslation(_v); p.body.setNextKinematicRotation(_q);
      p.mesh.position.copy(_v); p.mesh.quaternion.copy(_q);
    }
    if (record.repair >= 1) {
      record.pieces.forEach((p) => this.removePiece(p));
      this.records.delete(record);
      const e = this.spawn(record.type, record.pos, record.quat, { spawned: record.spawned });
      this.game.audio.play("ok", record.pos, { vol: 0.6 });
      this.game.fx.burst(record.pos, 0x5dff9a, 26, 1.2, 0.015);
      this.game.onRepaired && this.game.onRepaired(e);
      return true;
    }
    return false;
  }

  // Undo an unfinished repair if the beam moves away
  cancelRepair(record) {
    if (!this.records.has(record) || record.repair === 0) return;
    record.repair = 0;
    record.pieces.forEach((p) => p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true));
  }
}
