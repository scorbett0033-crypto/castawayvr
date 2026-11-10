// The lobby: "Shelter 7", a concrete survivor hall with a view of the dead
// world. Benches you can sit on, the armory, the wardrobe and the blast door.
import * as THREE from "three";
import { Builder, mat4, mulberry32 } from "./utils.js";
import { withRepeat, canvasTex } from "./textures.js";
import { makeSky, makeBrokenMoon, Wind } from "./sky.js";
import { Avatar, HAIR_STYLES, HAIR_COLORS, OUTFITS, CLOTH_ITEMS } from "./avatar.js";
import { buildGun, WEAPONS } from "./weapons.js";

export const HALL = { x0: -12, x1: 12, z0: -9, z1: 9, h: 5 };

function hazardTex() {
  return canvasTex(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#d8a91c"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#151515";
    for (let x = -h; x < w + h; x += 48) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 24, h); ctx.lineTo(x + 24 + h, 0); ctx.lineTo(x + h, 0); ctx.fill(); }
    ctx.fillStyle = "rgba(60,40,20,0.25)";
    for (let i = 0; i < 160; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3);
  });
}
function facadeTex() {
  const t = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#8d8479"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(${60 + Math.random() * 40},${55 + Math.random() * 30},${50 + Math.random() * 30},0.15)`; ctx.fillRect(Math.random() * w, Math.random() * h, 4 + Math.random() * 40, 2 + Math.random() * 60); }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const broken = Math.random() < 0.3;
      ctx.fillStyle = broken ? "#120f0c" : `rgb(${30 + Math.random() * 25},${30 + Math.random() * 20},${32 + Math.random() * 20})`;
      ctx.fillRect(x * 64 + 14, y * 64 + 12, 36, 38);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x * 64 + 14, y * 64 + 50, 36, 30); // soot streak
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function signTex(text, sub, color = "#ff9a3d", w = 1024, h = 256) {
  return canvasTex(w, h, (ctx) => {
    ctx.fillStyle = "#0d1013"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = color; ctx.font = `800 ${Math.round(h * 0.38)}px Segoe UI, Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { ctx.font = `600 ${Math.round(h * 0.14)}px Segoe UI, Arial`; ctx.fillStyle = "#c9d2d9"; ctx.fillText(sub, w / 2, h * 0.78); }
  });
}

// bench local frame: sitter faces +Z, seat top at y=0.45, seats at x=-0.6,0,0.6
function addBench(b, x, z, rotY) {
  const M = mat4([x, 0, z], [0, rotY, 0]);
  const put = (key, geo, pos, rot = [0, 0, 0]) => b.add(key, geo, M.clone().multiply(mat4(pos, rot)));
  for (const sx of [-0.97, 0, 0.97]) {
    put("iron", new THREE.BoxGeometry(0.05, 0.45, 0.05), [sx, 0.225, 0.18]);
    put("iron", new THREE.BoxGeometry(0.05, 0.92, 0.05), [sx, 0.44, -0.2], [-0.16, 0, 0]);
    put("iron", new THREE.BoxGeometry(0.05, 0.05, 0.48), [sx, 0.41, 0.0]);
    put("iron", new THREE.BoxGeometry(0.1, 0.02, 0.1), [sx, 0.01, 0.18]);
    put("iron", new THREE.BoxGeometry(0.1, 0.02, 0.1), [sx, 0.01, -0.27]);
    if (sx !== 0) {
      put("iron", new THREE.BoxGeometry(0.06, 0.04, 0.46), [sx, 0.66, 0.0]);
      put("iron", new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), [sx, 0.55, 0.19]);
    }
  }
  for (let i = 0; i < 4; i++) put("wood", new THREE.BoxGeometry(2.04, 0.035, 0.095), [0, 0.45, -0.17 + i * 0.115]);
  for (let i = 0; i < 3; i++) put("wood", new THREE.BoxGeometry(2.04, 0.03, 0.1), [0, 0.6 + i * 0.13, -0.235 - i * 0.021], [-0.16 + Math.PI / 2, 0, 0]);
}

export function buildLobby(renderer, T, sfx, WM) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9c7a5c, 0.0045);
  const rnd = mulberry32(7);

  /* ---------- materials ---------- */
  const wallT = withRepeat(T.concrete, 1, 1);
  const floorT = withRepeat(T.floor, 1, 1);
  const benchWood = withRepeat(T.wood, 1, 1);
  for (const k in benchWood) { benchWood[k].rotation = Math.PI / 2; }
  const hz = hazardTex(); hz.wrapS = hz.wrapT = THREE.RepeatWrapping;
  const M = {
    wall: new THREE.MeshStandardMaterial({ ...wallT, color: 0xbab3a8, roughness: 1 }),
    floor: new THREE.MeshStandardMaterial({ ...floorT, color: 0x9a958c, roughness: 1 }),
    ceil: new THREE.MeshStandardMaterial({ ...wallT, color: 0x6c6862, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ ...benchWood, roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ map: T.painted.map, normalMap: T.painted.normalMap, roughnessMap: T.painted.roughnessMap, color: 0x2c3a33, metalness: 0.6, roughness: 1 }),
    steel: new THREE.MeshStandardMaterial({ map: T.gunmetal.map, roughnessMap: T.gunmetal.roughnessMap, color: 0xaaaaaa, metalness: 0.9, roughness: 1 }),
    rust: new THREE.MeshStandardMaterial({ ...T.rustBare, metalness: 0.5, roughness: 1 }),
    paint: new THREE.MeshStandardMaterial({ map: T.painted.map, normalMap: T.painted.normalMap, roughnessMap: T.painted.roughnessMap, color: 0x46566a, metalness: 0.5, roughness: 1 }),
    locker: new THREE.MeshStandardMaterial({ map: T.painted.map, normalMap: T.painted.normalMap, roughnessMap: T.painted.roughnessMap, color: 0x5d6b55, metalness: 0.5, roughness: 1 }),
    hazard: new THREE.MeshStandardMaterial({ map: hz, roughness: 0.7 }),
    peg: new THREE.MeshStandardMaterial({ map: T.painted.map, normalMap: T.painted.normalMap, roughnessMap: T.painted.roughnessMap, color: 0x9a907e, metalness: 0.2, roughness: 1 }),
    tube: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 3 }),
    housing: new THREE.MeshStandardMaterial({ color: 0x8c8f92, metalness: 0.6, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ map: T.polymer.map, color: 0x333333, roughness: 0.8 }),
    fabric: new THREE.MeshStandardMaterial({ map: T.fabric.map, normalMap: T.fabric.normalMap, color: 0x6b6250, roughness: 1 }),
    crate: new THREE.MeshStandardMaterial({ ...withRepeat(T.wood, 1, 1), color: 0x9a8a6a, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb4c0, metalness: 0.0, roughness: 0.04, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.5 }),
    earth: new THREE.MeshStandardMaterial({ ...withRepeat(T.earth, 60, 60), roughness: 1 }),
    concreteOut: new THREE.MeshStandardMaterial({ map: facadeTex(), color: 0xb0a496, roughness: 1 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xc89a1c, roughness: 0.8, map: T.painted.map }),
  };

  const B = new Builder();
  const UV = { worldUV: 0.25 };
  /* ---------- shell ---------- */
  const { x0, x1, z0, z1, h } = HALL;
  B.box("floor", x1 - x0 + 1, 0.3, z1 - z0 + 1, [0, -0.15, 0], [0, 0, 0], { worldUV: 0.5 });
  B.box("ceil", x1 - x0 + 1, 0.4, z1 - z0 + 1, [0, h + 0.2, 0], [0, 0, 0], UV);
  B.box("wall", 0.5, h, z1 - z0 + 1, [x0 - 0.25, h / 2, 0], [0, 0, 0], UV);
  B.box("wall", 0.5, h, z1 - z0 + 1, [x1 + 0.25, h / 2, 0], [0, 0, 0], UV);
  B.box("wall", x1 - x0 + 1, h, 0.5, [0, h / 2, z1 + 0.25], [0, 0, 0], UV);
  // north wall with blast door (x -9..-7) and observation window (x -4.5..4.5, y 1..3.6)
  const nz = z0 - 0.25;
  const seg = (xa, xb, ya, yb) => B.box("wall", xb - xa, yb - ya, 0.5, [(xa + xb) / 2, (ya + yb) / 2, nz], [0, 0, 0], UV);
  seg(x0 - 0.5, -9.1, 0, h); seg(-9.1, -6.9, 2.75, h); seg(-6.9, -4.5, 0, h);
  seg(-4.5, 4.5, 0, 1.0); seg(-4.5, 4.5, 3.6, h); seg(4.5, x1 + 0.5, 0, h);
  // ceiling beams, pillars
  for (let x = -8; x <= 8; x += 4) B.box("ceil", 0.45, 0.55, z1 - z0, [x, h - 0.27, 0], [0, 0, 0], UV);
  const pillars = [[-6, -4.5], [6, -4.5], [-6, 4.5], [6, 4.5]];
  for (const [px, pz] of pillars) {
    B.box("wall", 0.6, h, 0.6, [px, h / 2, pz], [0, 0, 0], UV);
    B.box("hazard", 0.62, 0.5, 0.62, [px, 0.25, pz]);
  }
  // skirting + floor markings
  B.box("rubber", x1 - x0, 0.12, 0.04, [0, 0.06, z1 - 0.02]);
  B.box("stripe", 0.12, 0.004, 14, [-8, 0.002, -1]);
  B.box("stripe", 0.12, 0.004, 14, [8, 0.002, -1]);
  B.box("hazard", 2.4, 0.004, 0.6, [-8, 0.003, z0 + 0.6]);
  // pipes + cable tray along the walls
  for (const [py, r] of [[4.4, 0.12], [4.1, 0.07]]) {
    B.cyl("rust", r, r, z1 - z0, 14, [x0 + 0.4, py, 0], [Math.PI / 2, 0, 0]);
    B.cyl("rust", r, r, z1 - z0, 14, [x1 - 0.4, py, 0], [Math.PI / 2, 0, 0]);
  }
  for (let z = z0 + 1; z < z1; z += 2.5) { B.box("steel", 0.08, 0.6, 0.05, [x0 + 0.3, 4.4, z]); B.box("steel", 0.08, 0.6, 0.05, [x1 - 0.3, 4.4, z]); }
  B.box("steel", x1 - x0 - 1, 0.06, 0.4, [0, 4.55, z1 - 0.5]);
  // light fixtures
  const lightSpots = [];
  for (const lx of [-8, 0, 8]) for (const lz of [-5, -1.5, 2, 5.5]) {
    B.box("housing", 0.32, 0.08, 1.4, [lx + 2, h - 0.65, lz]);
    B.cyl("tube", 0.025, 0.025, 1.25, 8, [lx + 2 - 0.07, h - 0.7, lz], [Math.PI / 2, 0, 0]);
    B.cyl("tube", 0.025, 0.025, 1.25, 8, [lx + 2 + 0.07, h - 0.7, lz], [Math.PI / 2, 0, 0]);
    B.cyl("steel", 0.005, 0.005, 0.6, 4, [lx + 2, h - 0.3, lz + 0.6]);
    B.cyl("steel", 0.005, 0.005, 0.6, 4, [lx + 2, h - 0.3, lz - 0.6]);
    lightSpots.push([lx + 2, h - 0.8, lz]);
  }

  /* ---------- benches ---------- */
  const BB = new Builder();
  const benchDefs = [];
  for (const bx of [-2.8, 2.8]) for (const bz of [-3.2, -0.6, 2.0]) benchDefs.push([bx, bz, Math.PI]);
  benchDefs.push([-3.5, 7.9, Math.PI], [3.5, 7.9, Math.PI]);
  benchDefs.push([10.6, 6.2, -Math.PI / 2]);
  for (const [bx, bz, r] of benchDefs) addBench(BB, bx, bz, r);
  const benches = BB.build(M);
  benches.children.forEach((m) => (m.userData.bench = true));
  scene.add(benches);
  const seats = [];
  for (const [bx, bz, r] of benchDefs) for (const sx of [-0.6, 0, 0.6]) {
    const p = new THREE.Vector3(sx, 0.45, 0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), r).add(new THREE.Vector3(bx, 0, bz));
    seats.push({ pos: p, yaw: r, taken: false });
  }

  /* ---------- window ---------- */
  B.box("rust", 9.3, 0.2, 0.6, [0, 0.95, z0 - 0.1]);
  B.box("rust", 9.3, 0.2, 0.6, [0, 3.65, z0 - 0.1]);
  for (const wx of [-4.55, -1.5, 1.5, 4.55]) B.box("rust", 0.18, 2.7, 0.6, [wx, 2.3, z0 - 0.1]);
  B.box("rust", 9.2, 0.1, 0.25, [0, 2.3, z0 - 0.15]);
  for (let i = 0; i < 14; i++) B.cyl("steel", 0.02, 0.02, 0.04, 6, [-4.4 + i * 0.68, 3.55, z0 + 0.22], [Math.PI / 2, 0, 0]);
  B.box("paint", 9.6, 0.5, 0.5, [0, 4.0, z0 + 0.1]); // rolled blast shutter housing
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), M.glass);
  glass.position.set(0, 2.3, z0 - 0.12);
  glass.renderOrder = 2;
  scene.add(glass);

  /* ---------- blast door (deploy) ---------- */
  B.box("hazard", 0.25, 2.8, 0.55, [-9.2, 1.4, z0]);
  B.box("hazard", 0.25, 2.8, 0.55, [-6.8, 1.4, z0]);
  B.box("hazard", 2.65, 0.25, 0.55, [-8, 2.8, z0]);
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 0.2), M.paint);
  const doorR = doorL.clone();
  doorL.position.set(-8.55, 1.3, z0 - 0.05); doorR.position.set(-7.45, 1.3, z0 - 0.05);
  for (const d of [doorL, doorR]) { d.castShadow = d.receiveShadow = true; scene.add(d); }
  const doorBolts = new Builder();
  for (let i = 0; i < 5; i++) doorBolts.box("steel", 0.9, 0.05, 0.04, [0, -1.0 + i * 0.5, 0.11]);
  const bl = doorBolts.build(M); doorL.add(bl); doorR.add(bl.clone());
  // airlock corridor behind it
  B.box("wall", 2.4, 0.3, 4, [-8, 2.9, z0 - 2.3], [0, 0, 0], UV);
  B.box("wall", 0.3, 3, 4, [-9.3, 1.5, z0 - 2.3], [0, 0, 0], UV);
  B.box("wall", 0.3, 3, 4, [-6.7, 1.5, z0 - 2.3], [0, 0, 0], UV);
  B.box("paint", 2.4, 3, 0.3, [-8, 1.5, z0 - 4.3]);
  const red = new THREE.PointLight(0xff3020, 3, 6, 2); red.position.set(-8, 2.4, z0 - 2.3); scene.add(red);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0x552200, emissive: 0xff8a00, emissiveIntensity: 1.5 }));
  beacon.position.set(-8, 3.1, z0 + 0.35); scene.add(beacon);
  const deploySign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: signTex("SURFACE ACCESS", "AIRLOCK 7-A  ·  RESPIRATOR REQUIRED", "#ffb02e"), toneMapped: false }));
  deploySign.position.set(-8, 3.5, z0 + 0.03); scene.add(deploySign);

  /* ---------- armory (east) ---------- */
  B.box("paint", 0.75, 1.0, 7.0, [9.4, 0.5, -1.2]);
  B.box("steel", 0.85, 0.05, 7.1, [9.4, 1.025, -1.2]);
  B.box("rubber", 0.77, 0.1, 7.0, [9.4, 0.05, -1.2]);
  B.box("peg", 0.1, 3.0, 7.5, [11.85, 2.0, -1.2]); // pegboard
  for (let i = 0; i < 4; i++) B.box("steel", 0.12, 0.04, 7.2, [11.75, 1.0 + i * 0.75, -1.2]);
  // mesh grille above counter
  for (let i = 0; i <= 14; i++) B.cyl("steel", 0.008, 0.008, 1.6, 4, [9.1, 3.4, -4.7 + i * 0.5]);
  B.box("steel", 0.06, 0.06, 7.1, [9.1, 4.2, -1.2]);
  const armorySign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTex("ARMORY", "TRADE SALVAGE COINS FOR FIREPOWER"), toneMapped: false }));
  armorySign.position.set(11.78, 4.15, -1.2); armorySign.rotation.y = -Math.PI / 2; scene.add(armorySign);
  // mounted guns on the rack
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
  const rackLight = new THREE.SpotLight(0xffe0b8, 25, 9, 0.6, 0.6, 2);
  rackLight.position.set(9.6, 4.6, -1.2); rackLight.target.position.set(11.8, 1.8, -1.2);
  scene.add(rackLight, rackLight.target);
  // display stand for the selected gun
  B.cyl("steel", 0.12, 0.16, 0.06, 20, [9.4, 1.08, 1.4]);
  const display = new THREE.Group(); display.position.set(9.4, 1.32, 1.4); scene.add(display);

  /* ---------- wardrobe (west) ---------- */
  const PED = new THREE.Vector3(-9.4, 0, 1.4);
  B.cyl("paint", 0.65, 0.7, 0.14, 40, [PED.x, 0.07, PED.z]);
  B.add("steel", new THREE.TorusGeometry(0.675, 0.02, 6, 48), mat4([PED.x, 0.14, PED.z], [Math.PI / 2, 0, 0]));
  B.cyl("rubber", 0.6, 0.6, 0.01, 40, [PED.x, 0.145, PED.z]);
  // clothing racks
  for (const rz of [4.4, 6.6]) {
    B.cyl("steel", 0.015, 0.015, 1.9, 8, [-11.3, 1.75, rz], [Math.PI / 2, 0, 0]);
    B.cyl("steel", 0.015, 0.015, 1.75, 8, [-11.3, 0.87, rz - 0.95]);
    B.cyl("steel", 0.015, 0.015, 1.75, 8, [-11.3, 0.87, rz + 0.95]);
    for (let i = 0; i < 7; i++) {
      const c = [0x4c5438, 0x3e2618, 0xb5a283, 0xd2a91c, 0x1c1e22, 0xcfcac0, 0x5a3d26][(i + rz * 3) % 7 | 0];
      const key = "coat" + c;
      if (!M[key]) M[key] = new THREE.MeshStandardMaterial({ map: T.fabric.map, normalMap: T.fabric.normalMap, color: c, roughness: 1 });
      B.add(key, new THREE.BoxGeometry(0.42, 0.95, 0.06), mat4([-11.3, 1.22, rz - 0.75 + i * 0.25], [0, Math.PI / 2 + (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.05]));
    }
  }
  const wardrobeSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTex("WARDROBE", "HAIR · CLOTHES · CLOTH-SIM WIND TEST", "#41c7b9"), toneMapped: false }));
  wardrobeSign.position.set(-11.73, 3.9, 2.0); wardrobeSign.rotation.y = Math.PI / 2; scene.add(wardrobeSign);
  // industrial fan blowing on the pedestal
  const fan = new THREE.Group();
  const fanB = new Builder();
  fanB.cyl("iron", 0.04, 0.04, 1.1, 10, [0, 0.55, 0]);
  fanB.cyl("iron", 0.3, 0.3, 0.04, 20, [0, 0.02, 0]);
  fanB.add("steel", new THREE.TorusGeometry(0.42, 0.025, 8, 32), mat4([0, 1.2, 0]));
  fanB.add("steel", new THREE.TorusGeometry(0.42, 0.025, 8, 32), mat4([0, 1.2, 0.12]));
  for (let i = 0; i < 12; i++) fanB.add("steel", new THREE.BoxGeometry(0.008, 0.008, 0.12), mat4([Math.cos(i / 12 * Math.PI * 2) * 0.42, 1.2 + Math.sin(i / 12 * Math.PI * 2) * 0.42, 0.06]));
  fanB.cyl("iron", 0.12, 0.12, 0.25, 16, [0, 1.2, -0.12], [Math.PI / 2, 0, 0]);
  fan.add(fanB.build(M));
  const blades = new THREE.Group(); blades.position.set(0, 1.2, 0.06);
  for (let i = 0; i < 3; i++) { const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.01), M.steel); bl2.position.set(0, 0.2, 0); const p = new THREE.Group(); p.rotation.z = (i / 3) * Math.PI * 2; bl2.rotation.y = 0.4; p.add(bl2); blades.add(p); }
  fan.add(blades);
  fan.position.set(-7.4, 0, 3.0);
  fan.lookAt(PED.x, 0, PED.z);
  scene.add(fan);
  const fanDir = new THREE.Vector3(PED.x - fan.position.x, 0, PED.z - fan.position.z).normalize();

  /* ---------- props ---------- */
  for (let i = 0; i < 6; i++) { // lockers along the south wall
    const lx = 5 + i * 0.62;
    B.box("locker", 0.6, 1.9, 0.5, [lx, 0.95, z1 - 0.3]);
    B.box("steel", 0.02, 0.15, 0.03, [lx + 0.2, 1.05, z1 - 0.56]);
    for (let k = 0; k < 4; k++) B.box("rubber", 0.4, 0.02, 0.01, [lx, 1.7 - k * 0.04, z1 - 0.555]);
  }
  for (const [cx, cz, s] of [[-10.6, -7.6, 0.9], [-10.6, -6.6, 0.7], [-11.0, -7.0, 0.6], [6.8, -7.6, 0.8], [10.8, -7.8, 1.0]]) {
    B.box("crate", s, s * 0.8, s, [cx, s * 0.4, cz], [0, rnd() * 0.4, 0]);
  }
  for (const [bx, bz] of [[-10.9, 8.0], [-10.2, 8.2], [11.0, -5.6]]) {
    B.cyl("rust", 0.29, 0.29, 0.88, 20, [bx, 0.44, bz]);
    B.add("rust", new THREE.TorusGeometry(0.29, 0.015, 6, 20), mat4([bx, 0.3, bz], [Math.PI / 2, 0, 0]));
    B.add("rust", new THREE.TorusGeometry(0.29, 0.015, 6, 20), mat4([bx, 0.6, bz], [Math.PI / 2, 0, 0]));
  }
  // sandbags under the window
  for (let i = 0; i < 14; i++) B.add("fabric", new THREE.CapsuleGeometry(0.16, 0.35, 3, 8), mat4([-4 + (i % 7) * 1.15 + (i > 6 ? 0.5 : 0), 0.16 + (i > 6 ? 0.28 : 0), z0 + 0.45], [0, 0, Math.PI / 2], [1, 1, 0.7]));

  const shell = B.build(M);
  scene.add(shell);

  // notice board with the controls
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.25), new THREE.MeshStandardMaterial({
    roughness: 0.9,
    map: canvasTex(1024, 640, (ctx, w, hh) => {
      ctx.fillStyle = "#e9e2cf"; ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = "rgba(120,90,50,0.15)"; for (let i = 0; i < 30; i++) { ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * hh, 20 + Math.random() * 80, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#2a2015"; ctx.font = "800 54px Arial"; ctx.fillText("SHELTER 7 — SURVIVOR ORIENTATION", 40, 80);
      ctx.font = "500 32px Arial";
      const L = [
        "LEFT STICK  move   ·   RIGHT STICK  snap turn",
        "Point + TRIGGER at a bench  →  sit down  (trigger again to stand)",
        "Armory terminal  →  buy & equip weapons with salvage coins",
        "Wardrobe  →  try on hair + clothes, buy with coins",
        "Blast door  →  deploy to the surface",
        "ON THE SURFACE:  trigger fire  ·  A eject mag, bring left hand",
        "     to the gun to reload (A again = auto reload)  ·  B switch gun",
        "Grip LEFT on the foregrip to steady two-handed weapons",
        "HOLD Y  (or stand on the beacon)  to extract back here",
      ];
      L.forEach((s, i) => ctx.fillText(s, 50, 150 + i * 52));
    }),
  }));
  board.position.set(0, 2.0, z1 - 0.03); board.rotation.y = Math.PI; scene.add(board);

  /* ---------- outside the window ---------- */
  const sunDir = new THREE.Vector3(-0.3, 0.32, -0.9).normalize();
  const sky = makeSky({ sunDir, radius: 800 });
  scene.add(sky);
  const moon = makeBrokenMoon(T.rock);
  moon.position.set(260, 330, -620); moon.lookAt(0, 0, 0);
  scene.add(moon);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1), M.earth);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.35; ground.receiveShadow = true;
  scene.add(ground);
  const CB = new Builder();
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 500, z = -60 - rnd() * 320;
    const w = 8 + rnd() * 20, hh = 8 + rnd() * 55, d = 8 + rnd() * 18;
    CB.add("concreteOut", new THREE.BoxGeometry(w, hh, d), mat4([x, hh / 2 - 2, z], [0, rnd() * 0.5, (rnd() - 0.5) * 0.12]), { worldUV: 0.035 });
    if (rnd() < 0.5) CB.add("concreteOut", new THREE.BoxGeometry(w * 0.6, hh * 0.3, d * 0.6), mat4([x + w * 0.2, hh - 2 + hh * 0.1, z], [0.2, 0, 0.3]), { worldUV: 0.035 });
  }
  for (let i = 0; i < 30; i++) CB.add("rock", new THREE.DodecahedronGeometry(1 + rnd() * 3, 0), mat4([(rnd() - 0.5) * 60, 0, -14 - rnd() * 40], [rnd() * 3, rnd() * 3, 0], [1, 0.5, 1]));
  M.rock = new THREE.MeshStandardMaterial({ ...T.rock, roughness: 1, color: 0x9a8a78 });
  scene.add(CB.build(M));

  /* ---------- lighting ---------- */
  scene.add(new THREE.HemisphereLight(0xa8a49c, 0x3a332c, 0.55));
  const sun = new THREE.DirectionalLight(0xffc896, 3.2);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 90 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const lamps = [];
  [[-6, -1.5], [2, -1.5], [10, 2], [-6, 5.5], [2, 5.5]].forEach(([lx, lz]) => {
    const l = new THREE.PointLight(0xe6eeff, 14, 13, 1.6);
    l.position.set(lx, h - 0.85, lz);
    scene.add(l); lamps.push(l);
  });
  const flicker = lamps[3];
  // showcase lighting: wardrobe pedestal, armory counter, airlock door
  const pedSpot = new THREE.SpotLight(0xfff0dc, 70, 9, 0.42, 0.5, 1.5);
  pedSpot.position.set(-8.2, 4.6, 0.4); pedSpot.target.position.set(-9.4, 1.0, 1.4);
  pedSpot.castShadow = true; pedSpot.shadow.mapSize.set(512, 512); pedSpot.shadow.bias = -0.002;
  scene.add(pedSpot, pedSpot.target);
  const counterLight = new THREE.PointLight(0xffe2c0, 10, 7, 1.6); counterLight.position.set(8.2, 3.2, -1.2); scene.add(counterLight);
  const doorLight = new THREE.SpotLight(0xffc070, 18, 8, 0.6, 0.6, 1.6);
  doorLight.position.set(-8, 4.4, z0 + 2.2); doorLight.target.position.set(-8, 1.0, z0); scene.add(doorLight, doorLight.target);

  /* ---------- reflections: a tiny proxy room rendered to an env map ---------- */
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x2a2724);
  const er = new THREE.Mesh(new THREE.BoxGeometry(24, 5, 18), new THREE.MeshBasicMaterial({ color: 0x5a554e, side: THREE.BackSide }));
  er.position.y = 2.5; envScene.add(er);
  for (const [lx, , lz] of lightSpots) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff })); p.position.set(lx, 4.9, lz); envScene.add(p); }
  const wp = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), new THREE.MeshBasicMaterial({ color: 0xd8a070 })); wp.position.set(0, 2.3, -8.9); envScene.add(wp);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();

  /* ---------- people ---------- */
  const look = (i) => ({
    hair: HAIR_STYLES[(i * 3 + 2) % HAIR_STYLES.length].id,
    hairColor: HAIR_COLORS[(i * 2 + 1) % HAIR_COLORS.length].id,
    outfit: OUTFITS[(i + 1) % OUTFITS.length].id,
    cloth: CLOTH_ITEMS[(i % 3) + 1].id,
  });
  const npcs = [];
  [1, 5, 13].forEach((seatIdx, i) => {
    const s = seats[seatIdx];
    s.taken = true;
    const a = new Avatar(T, look(i), { quality: 0.45 });
    a.setPose("sit");
    a.root.position.set(s.pos.x, 0, s.pos.z);
    a.root.rotation.y = s.yaw;
    scene.add(a.root);
    npcs.push(a);
  });
  const qm = new Avatar(T, { hair: "mohawk", hairColor: "silver", outfit: "nightops", cloth: "none" }, { quality: 0.45 });
  qm.root.position.set(10.5, 0, -2.6); qm.root.rotation.y = -Math.PI / 2;
  scene.add(qm.root); npcs.push(qm);
  const preview = new Avatar(T, {}, { quality: 1 });
  preview.root.position.set(PED.x, 0.15, PED.z);
  preview.groundY = 0.15;
  scene.add(preview.root);

  /* ---------- winds ---------- */
  const draft = new Wind(0.5, 1.2);
  const fanWind = new THREE.Vector3();
  const tmpW = new THREE.Vector3();

  /* ---------- colliders (XZ boxes for the player) ---------- */
  const colliders = [];
  const box = (cx, cz, w, d) => colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
  for (const [px, pz] of pillars) box(px, pz, 0.7, 0.7);
  for (const [bx, bz, r] of benchDefs) Math.abs(Math.sin(r)) > 0.5 ? box(bx, bz, 0.6, 2.1) : box(bx, bz, 2.1, 0.6);
  box(9.4, -1.2, 0.85, 7.1); box(PED.x, PED.z, 1.4, 1.4); box(6.55, z1 - 0.3, 3.8, 0.6);
  box(0, z0 + 0.45, 9, 0.5); box(fan.position.x, fan.position.z, 0.6, 0.6);
  box(-11.3, 5.5, 0.6, 4.6);

  /* ---------- runtime ---------- */
  let doorOpen = 0, doorTarget = 0;
  let displayed = null;
  return {
    scene, seats, benches, rackGuns, glass,
    spawn: { pos: new THREE.Vector3(0, 0, 5.2), yaw: 0 },
    bounds: { x0: x0 + 0.35, x1: x1 - 0.35, z0: z0 + 0.35, z1: z1 - 0.35 },
    colliders, preview, npcs, deploySign, doorL,
    heightAt: () => 0,
    setDisplay(id, weaponMats) {
      if (displayed === id) return; displayed = id;
      display.clear();
      const g = buildGun(id, weaponMats); g.scale.setScalar(1.4); display.add(g);
    },
    openDoor() { doorTarget = 1; sfx.door(); },
    closeDoor() { doorTarget = 0; },
    update(dt, t) {
      sky.userData.update(t);
      moon.userData.update(t);
      draft.update(dt);
      blades.rotation.z += dt * 18;
      // fan: strong gusty jet at the pedestal + lobby draft
      const gust = 0.75 + 0.35 * Math.sin(t * 2.1) + 0.2 * Math.sin(t * 5.3);
      fanWind.copy(fanDir).multiplyScalar(5.5 * gust).add(draft.vec);
      preview.root.rotation.y += dt * 0.35;
      preview.update(dt, fanWind);
      for (const n of npcs) n.update(dt, tmpW.copy(draft.vec));
      display.rotation.y += dt * 0.6;
      beacon.rotation.y += dt * 4;
      beacon.material.emissiveIntensity = doorTarget ? 2 + Math.sin(t * 12) * 1.5 : 1.2;
      flicker.intensity = Math.random() < 0.03 ? 2 : 14;
      doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 1.2);
      doorL.position.x = -8.55 - doorOpen * 1.05; doorR.position.x = -7.45 + doorOpen * 1.05;
    },
  };
}
