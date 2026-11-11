// Weapon catalog, procedural gun models and per-gun runtime state.
// Model convention: origin = centre of the gripping hand, barrel along -Z, +Y up.
import * as THREE from "three";
import { Builder, mat4 } from "./utils.js";
import { canvasTex } from "./textures.js";

export const WEAPONS = [
  { id: "pistol", name: "P-9 Service Pistol", price: 0, dmg: 28, rpm: 420, auto: false, mag: 12, reload: 1.1, spread: 0.6, pellets: 1, recoil: 0.07, twoHand: false, range: 80, sound: "pistol", desc: "Reliable sidearm. Every survivor starts with one." },
  { id: "smg", name: "Wasp SMG", price: 450, dmg: 16, rpm: 880, auto: true, mag: 32, reload: 1.5, spread: 1.7, pellets: 1, recoil: 0.025, twoHand: false, range: 60, sound: "smg", desc: "Fast-firing and one-hand friendly. Shreds drones up close." },
  { id: "shotgun", name: "Breacher 12ga", price: 900, dmg: 15, rpm: 75, auto: false, mag: 6, reload: 1.9, spread: 4.2, pellets: 9, recoil: 0.2, twoHand: true, range: 35, sound: "shotgun", desc: "Pump action. Brace it with your off hand on the forend." },
  { id: "rifle", name: "AR-7 Carbine", price: 1500, dmg: 31, rpm: 680, auto: true, mag: 30, reload: 1.8, spread: 0.8, pellets: 1, recoil: 0.04, twoHand: true, range: 150, sound: "rifle", sight: "dot", desc: "Full-auto carbine with a red-dot sight. Two hands = steady aim." },
  { id: "dmr", name: "Longshot DMR", price: 2600, dmg: 96, rpm: 170, auto: false, mag: 10, reload: 2.2, spread: 0.12, pellets: 1, recoil: 0.11, twoHand: true, range: 300, sound: "dmr", sight: "scope", desc: "Marksman rifle. One shot drops most drones." },
  { id: "lancer", name: "Arc Lancer", price: 4800, dmg: 240, rpm: 55, auto: false, mag: 4, reload: 2.4, spread: 0.05, pellets: 1, recoil: 0.16, twoHand: true, range: 300, sound: "lancer", pierce: true, sight: "dot", desc: "Salvaged rail weapon. Bolts pierce every target in a line." },
];
export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || WEAPONS[0];

export function makeWeaponMaterials(T) {
  return {
    metal: new THREE.MeshStandardMaterial({ map: T.gunmetal.map, normalMap: T.gunmetal.normalMap, roughnessMap: T.gunmetal.roughnessMap, metalness: 0.85, roughness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, map: T.gunmetal.map, roughnessMap: T.gunmetal.roughnessMap, metalness: 0.95, roughness: 0.7 }),
    poly: new THREE.MeshStandardMaterial({ map: T.polymer.map, normalMap: T.polymer.normalMap, roughnessMap: T.polymer.roughnessMap, metalness: 0, roughness: 1 }),
    tan: new THREE.MeshStandardMaterial({ color: 0xb59f7c, map: T.polymer.map, normalMap: T.polymer.normalMap, metalness: 0, roughness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ map: T.wood.map, normalMap: T.wood.normalMap, roughness: 0.6, color: 0xa06a40 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x103030, emissive: 0x36f0ff, emissiveIntensity: 2.2, roughness: 0.4 }),
    tritium: new THREE.MeshBasicMaterial({ color: 0x8dff6a }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223040, metalness: 0.9, roughness: 0.05 }),
  };
}

/* stencil-masked holographic reticle: only visible through the sight lens */
function addReflexSight(g, M, { z, y, len = 0.05, r = 0.018, tube = true, color = 0xff2a1a, size = 0.06 }) {
  const b = new Builder();
  if (tube) {
    b.add("metal", new THREE.CylinderGeometry(r + 0.004, r + 0.004, len, 20, 1, true), mat4([0, y, z], [Math.PI / 2, 0, 0]));
    b.add("metal", new THREE.TorusGeometry(r + 0.002, 0.004, 6, 20), mat4([0, y, z - len / 2]));
    b.add("metal", new THREE.TorusGeometry(r + 0.002, 0.004, 6, 20), mat4([0, y, z + len / 2]));
    b.box("metal", 0.026, 0.012, len * 0.8, [0, y - r - 0.006, z]);
  }
  g.add(b.build(M));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({
    color: 0x6a8aa0, transparent: true, opacity: 0.18, depthWrite: false,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  }));
  lens.position.set(0, y, z - len / 2 + 0.002);
  lens.renderOrder = 20;
  g.add(lens);
  const tex = canvasTex(64, 64, (ctx) => {
    ctx.strokeStyle = "rgba(255,60,40,1)"; ctx.fillStyle = "rgba(255,60,40,1)";
    ctx.beginPath(); ctx.arc(32, 32, 4, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.stroke();
  });
  const ret = new THREE.Mesh(new THREE.PlaneGeometry(size * 10, size * 10), new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.KeepStencilOp,
  }));
  ret.position.set(0, y, z - 25); // far down-range so it reads as "at infinity"
  ret.renderOrder = 21;
  ret.frustumCulled = false;
  g.add(ret);
  return { lens, ret };
}

function ammoDisplay(g, x, y, z, rotY = 0) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 32;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.015), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  g.add(m);
  let last = -1;
  g.userData.setAmmo = (n, max) => {
    if (n === last) return; last = n;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#050806"; ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = n <= Math.ceil(max * 0.25) ? "#ff5040" : "#7dffb0";
    ctx.font = "bold 26px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(n).padStart(2, "0"), 32, 17);
    tex.needsUpdate = true;
  };
}

function marker(g, name, x, y, z) { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); g.add(o); g.userData[name] = o; return o; }

export function buildGun(id, M) {
  const g = new THREE.Group();
  const b = new Builder();
  const mag = new Builder();
  let magPos = [0, 0, 0];
  const R = (x) => [x, 0, 0];
  switch (id) {
    case "pistol": {
      // slide with serrations, frame, raked grip
      b.box("metal", 0.03, 0.034, 0.19, [0, 0.056, -0.045]);
      for (let i = 0; i < 7; i++) b.box("poly", 0.031, 0.026, 0.003, [0, 0.058, 0.02 + i * 0.006]);
      b.box("metal", 0.012, 0.012, 0.04, [0, 0.044, -0.03]); // ejection port edge
      b.cyl("steel", 0.0065, 0.0065, 0.02, 12, [0, 0.055, -0.145], R(Math.PI / 2));
      b.box("poly", 0.028, 0.022, 0.165, [0, 0.03, -0.04]);
      b.box("poly", 0.022, 0.008, 0.06, [0, 0.016, -0.09]); // accessory rail
      b.add("poly", new THREE.BoxGeometry(0.03, 0.11, 0.052), mat4([0, -0.018, 0.028], [0.28, 0, 0]));
      for (let i = 0; i < 5; i++) b.add("poly", new THREE.BoxGeometry(0.031, 0.004, 0.044), mat4([0, -0.05 + i * 0.016, 0.034 - i * 0.004], [0.28, 0, 0]));
      b.add("poly", new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI), mat4([0, 0.018, -0.022], [0, 0, Math.PI]));
      b.box("steel", 0.006, 0.018, 0.006, [0, 0.012, -0.018], [0.3, 0, 0]);
      b.box("metal", 0.026, 0.008, 0.008, [0, 0.077, 0.04]);
      b.box("metal", 0.006, 0.008, 0.006, [0, 0.077, -0.13]);
      b.add("tritium", new THREE.SphereGeometry(0.0018, 6, 6), mat4([0, 0.08, -0.127]));
      b.add("tritium", new THREE.SphereGeometry(0.0018, 6, 6), mat4([0.007, 0.08, 0.044]));
      b.add("tritium", new THREE.SphereGeometry(0.0018, 6, 6), mat4([-0.007, 0.08, 0.044]));
      mag.add("metal", new THREE.BoxGeometry(0.022, 0.1, 0.04), mat4([0, 0, 0], [0.28, 0, 0]));
      mag.add("poly", new THREE.BoxGeometry(0.03, 0.012, 0.05), mat4([0, -0.052, 0.014], [0.28, 0, 0]));
      magPos = [0, -0.03, 0.032];
      marker(g, "muzzle", 0, 0.055, -0.16);
      marker(g, "eject", 0.02, 0.06, -0.03);
      ammoDisplay(g, 0, 0.06, 0.0505);
      break;
    }
    case "smg": {
      b.box("metal", 0.042, 0.06, 0.27, [0, 0.055, -0.07]);
      b.box("poly", 0.038, 0.03, 0.2, [0, 0.015, -0.06]);
      b.add("metal", new THREE.CylinderGeometry(0.019, 0.019, 0.13, 16), mat4([0, 0.06, -0.26], R(Math.PI / 2)));
      for (let i = 0; i < 6; i++) b.add("poly", new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16), mat4([0, 0.06, -0.21 - i * 0.017], R(Math.PI / 2)));
      b.cyl("steel", 0.008, 0.008, 0.04, 10, [0, 0.06, -0.335], R(Math.PI / 2));
      b.add("poly", new THREE.BoxGeometry(0.032, 0.1, 0.045), mat4([0, -0.02, 0.025], [0.22, 0, 0]));
      b.add("poly", new THREE.TorusGeometry(0.024, 0.004, 6, 12, Math.PI), mat4([0, 0.0, -0.02], [0, 0, Math.PI]));
      b.box("steel", 0.006, 0.02, 0.006, [0, 0.0, -0.016], [0.3, 0, 0]);
      // folding wire stock
      b.cyl("steel", 0.005, 0.005, 0.2, 6, [0.017, 0.06, 0.16], R(Math.PI / 2));
      b.cyl("steel", 0.005, 0.005, 0.2, 6, [-0.017, 0.06, 0.16], R(Math.PI / 2));
      b.box("poly", 0.05, 0.08, 0.015, [0, 0.04, 0.26]);
      // iron sights + rail
      b.box("metal", 0.024, 0.008, 0.18, [0, 0.089, -0.07]);
      for (let i = 0; i < 9; i++) b.box("poly", 0.026, 0.004, 0.006, [0, 0.094, -0.15 + i * 0.02]);
      b.box("metal", 0.024, 0.02, 0.012, [0, 0.1, 0.04]);
      b.box("metal", 0.006, 0.02, 0.006, [0, 0.1, -0.2]);
      b.add("tritium", new THREE.SphereGeometry(0.002, 6, 6), mat4([0, 0.111, -0.2]));
      b.box("metal", 0.012, 0.012, 0.03, [0.026, 0.07, -0.13]); // charging handle
      mag.add("metal", new THREE.BoxGeometry(0.026, 0.16, 0.035), mat4([0, 0, 0], [-0.12, 0, 0]));
      mag.add("poly", new THREE.BoxGeometry(0.03, 0.012, 0.042), mat4([0, -0.08, -0.01], [-0.12, 0, 0]));
      magPos = [0, -0.05, -0.1];
      marker(g, "muzzle", 0, 0.06, -0.36);
      marker(g, "eject", 0.025, 0.07, -0.05);
      ammoDisplay(g, 0, 0.065, 0.0955);
      break;
    }
    case "shotgun": {
      b.box("metal", 0.045, 0.07, 0.24, [0, 0.05, -0.06]);
      b.cyl("steel", 0.012, 0.012, 0.56, 16, [0, 0.07, -0.45], R(Math.PI / 2));
      b.cyl("metal", 0.011, 0.011, 0.44, 14, [0, 0.038, -0.39], R(Math.PI / 2));
      b.cyl("steel", 0.013, 0.013, 0.02, 14, [0, 0.07, -0.72], R(Math.PI / 2));
      b.add("tritium", new THREE.SphereGeometry(0.003, 6, 6), mat4([0, 0.085, -0.72]));
      b.add("wood", new THREE.BoxGeometry(0.04, 0.1, 0.05), mat4([0, -0.02, 0.03], [0.3, 0, 0]));
      // stock with drop
      b.add("wood", new THREE.BoxGeometry(0.042, 0.06, 0.28), mat4([0, 0.02, 0.2], [0.12, 0, 0]));
      b.add("wood", new THREE.BoxGeometry(0.042, 0.12, 0.05), mat4([0, 0.0, 0.33], [0.12, 0, 0]));
      b.box("poly", 0.044, 0.13, 0.02, [0, -0.003, 0.36], [0.12, 0, 0]);
      b.add("poly", new THREE.TorusGeometry(0.024, 0.004, 6, 12, Math.PI), mat4([0, 0.008, -0.02], [0, 0, Math.PI]));
      b.box("steel", 0.006, 0.02, 0.006, [0, 0.0, -0.018], [0.3, 0, 0]);
      for (let i = 0; i < 3; i++) b.cyl("brass", 0.01, 0.01, 0.025, 10, [0.026, 0.06, -0.03 - i * 0.03], [0, 0, Math.PI / 2]);
      // pump forend is a separate mesh so it can animate
      const fb = new Builder();
      fb.cyl("wood", 0.026, 0.026, 0.17, 16, [0, 0, 0], R(Math.PI / 2));
      for (let i = 0; i < 7; i++) fb.add("poly", new THREE.TorusGeometry(0.026, 0.003, 4, 16), mat4([0, 0, -0.07 + i * 0.023]));
      const pump = fb.build(M);
      pump.position.set(0, 0.045, -0.32);
      g.add(pump); g.userData.pump = pump;
      mag.add("brass", new THREE.CylinderGeometry(0.011, 0.011, 0.07, 10), mat4([0, 0, 0], R(Math.PI / 2)));
      mag.add("poly", new THREE.CylinderGeometry(0.0115, 0.0115, 0.05, 10), mat4([0, 0, -0.04], R(Math.PI / 2)));
      magPos = [0, 0.012, -0.02];
      marker(g, "muzzle", 0, 0.07, -0.74);
      marker(g, "fore", 0, 0.03, -0.32);
      marker(g, "eject", 0.03, 0.07, -0.06);
      ammoDisplay(g, 0, 0.07, 0.0505);
      break;
    }
    case "rifle":
    case "dmr": {
      const dmr = id === "dmr";
      const bl = dmr ? 0.48 : 0.3;
      b.box("metal", 0.046, 0.055, 0.25, [0, 0.07, -0.05]); // upper
      b.box("metal", 0.042, 0.05, 0.2, [0, 0.02, -0.04]); // lower
      b.box("metal", 0.03, 0.045, 0.06, [0, 0.02, -0.13]); // magwell flare
      b.box("metal", 0.024, 0.008, 0.25, [0, 0.102, -0.05]); // top rail
      for (let i = 0; i < 12; i++) b.box("poly", 0.026, 0.005, 0.007, [0, 0.107, -0.16 + i * 0.019]);
      // handguard with M-LOK slots
      const hgL = dmr ? 0.32 : 0.24;
      const hgZ = -0.175 - hgL / 2;
      b.add("tan", new THREE.CylinderGeometry(0.026, 0.026, hgL, 8), mat4([0, 0.07, hgZ], R(Math.PI / 2)));
      for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) b.box("poly", 0.003, 0.012, 0.03, [0.025 * sx, 0.07, hgZ - hgL / 2 + 0.04 + i * (hgL - 0.08) / 4]);
      b.box("metal", 0.024, 0.008, hgL, [0, 0.1, hgZ]);
      b.cyl("steel", 0.009, 0.009, bl, 12, [0, 0.07, -0.175 - bl / 2 - 0.02], R(Math.PI / 2));
      const mz = -0.175 - bl - 0.04;
      b.cyl("metal", 0.015, 0.015, 0.06, 12, [0, 0.07, mz], R(Math.PI / 2));
      for (let i = 0; i < 3; i++) b.box("poly", 0.032, 0.004, 0.006, [0, 0.07, mz - 0.015 + i * 0.015]);
      b.add("poly", new THREE.BoxGeometry(0.032, 0.1, 0.045), mat4([0, -0.025, 0.035], [0.3, 0, 0]));
      b.add("poly", new THREE.TorusGeometry(0.024, 0.004, 6, 12, Math.PI), mat4([0, 0.0, -0.015], [0, 0, Math.PI]));
      b.box("steel", 0.006, 0.02, 0.006, [0, -0.002, -0.012], [0.3, 0, 0]);
      // buffer tube + stock
      b.cyl("metal", 0.016, 0.016, 0.2, 12, [0, 0.068, 0.17], R(Math.PI / 2));
      b.box("tan", 0.045, 0.08, 0.16, [0, 0.055, 0.25]);
      b.box("poly", 0.046, 0.12, 0.022, [0, 0.04, 0.335]);
      if (dmr) b.box("tan", 0.03, 0.025, 0.12, [0, 0.105, 0.23]); // cheek riser
      b.box("metal", 0.01, 0.012, 0.04, [0.026, 0.085, 0.05]); // charging handle
      b.cyl("steel", 0.006, 0.006, 0.02, 8, [-0.026, 0.05, -0.02], [0, 0, Math.PI / 2]);
      if (dmr) {
        b.cyl("metal", 0.006, 0.006, 0.2, 6, [0.012, 0.035, hgZ - 0.02], R(Math.PI / 2)); // folded bipod
        b.cyl("metal", 0.006, 0.006, 0.2, 6, [-0.012, 0.035, hgZ - 0.02], R(Math.PI / 2));
        addReflexSight(g, M, { z: -0.04, y: 0.142, len: 0.22, r: 0.02, size: 0.04, color: 0xff3020 });
        b.cyl("metal", 0.024, 0.024, 0.03, 16, [0, 0.142, -0.15], R(Math.PI / 2));
        b.cyl("metal", 0.024, 0.024, 0.03, 16, [0, 0.142, 0.07], R(Math.PI / 2));
        b.cyl("metal", 0.012, 0.012, 0.025, 10, [0, 0.172, -0.04]);
        b.box("metal", 0.012, 0.03, 0.02, [0, 0.12, -0.11]);
        b.box("metal", 0.012, 0.03, 0.02, [0, 0.12, 0.03]);
        mag.add("metal", new THREE.BoxGeometry(0.028, 0.1, 0.07), mat4([0, 0, 0]));
        mag.add("poly", new THREE.BoxGeometry(0.032, 0.012, 0.075), mat4([0, -0.05, 0]));
      } else {
        addReflexSight(g, M, { z: -0.07, y: 0.134, len: 0.05, r: 0.017, size: 0.07 });
        b.box("metal", 0.03, 0.012, 0.03, [0, 0.112, -0.07]);
        mag.add("metal", new THREE.BoxGeometry(0.026, 0.09, 0.065), mat4([0, 0, 0], [-0.08, 0, 0]));
        mag.add("metal", new THREE.BoxGeometry(0.026, 0.08, 0.062), mat4([0, -0.07, -0.012], [-0.3, 0, 0]));
        mag.add("poly", new THREE.BoxGeometry(0.03, 0.012, 0.07), mat4([0, -0.11, -0.025], [-0.3, 0, 0]));
      }
      magPos = [0, -0.03, -0.12];
      marker(g, "muzzle", 0, 0.07, mz - 0.035);
      marker(g, "fore", 0, 0.04, hgZ);
      marker(g, "eject", 0.026, 0.075, -0.04);
      ammoDisplay(g, 0.0215, 0.03, -0.04, Math.PI / 2);
      break;
    }
    case "lancer": {
      b.box("metal", 0.06, 0.08, 0.36, [0, 0.07, -0.08]);
      b.add("metal", new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6), mat4([0, 0.075, -0.5], R(Math.PI / 2)));
      for (let i = 0; i < 6; i++) b.add("glow", new THREE.TorusGeometry(0.038 - i * 0.002, 0.006, 6, 18), mat4([0, 0.075, -0.32 - i * 0.07]));
      b.box("steel", 0.012, 0.03, 0.5, [0.03, 0.075, -0.5]);
      b.box("steel", 0.012, 0.03, 0.5, [-0.03, 0.075, -0.5]);
      b.add("poly", new THREE.BoxGeometry(0.034, 0.11, 0.05), mat4([0, -0.025, 0.03], [0.28, 0, 0]));
      b.add("poly", new THREE.TorusGeometry(0.026, 0.004, 6, 12, Math.PI), mat4([0, 0.005, -0.02], [0, 0, Math.PI]));
      b.box("steel", 0.006, 0.02, 0.006, [0, 0.0, -0.016], [0.3, 0, 0]);
      b.box("poly", 0.05, 0.09, 0.22, [0, 0.06, 0.2]);
      b.box("poly", 0.052, 0.13, 0.02, [0, 0.04, 0.31]);
      b.box("poly", 0.05, 0.05, 0.2, [0, 0.0, -0.32]);
      b.box("metal", 0.024, 0.008, 0.2, [0, 0.114, -0.05]);
      addReflexSight(g, M, { z: -0.06, y: 0.14, len: 0.05, r: 0.018, size: 0.07, color: 0x30e8ff });
      b.box("metal", 0.03, 0.012, 0.03, [0, 0.12, -0.06]);
      mag.add("metal", new THREE.BoxGeometry(0.04, 0.06, 0.08), mat4([0, 0, 0]));
      mag.add("glow", new THREE.BoxGeometry(0.042, 0.02, 0.06), mat4([0, 0.0, 0]));
      magPos = [0, 0.0, -0.13];
      marker(g, "muzzle", 0, 0.075, -0.78);
      marker(g, "fore", 0, -0.0, -0.32);
      marker(g, "eject", 0.03, 0.08, -0.05);
      ammoDisplay(g, 0.0305, 0.07, 0.0, Math.PI / 2);
      break;
    }
  }
  g.add(b.build(M));
  const magMesh = mag.build(M);
  magMesh.position.set(...magPos);
  g.add(magMesh);
  g.userData.mag = magMesh;
  g.userData.magHome = new THREE.Vector3(...magPos);
  g.userData.magBuilder = () => { const m = magMesh.clone(); return m; };
  marker(g, "magwell", magPos[0], magPos[1], magPos[2]);
  g.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  return g;
}

export class GunState {
  static pool = null;
  constructor(def) {
    this.def = def;
    this.ammo = def.mag;
    this.cool = 0;
    this.magOut = false;
    this.reloadT = 0;
    this.bloom = 0;
    this.kick = 0;
    this.pumpT = 0;
    this.triggerHeld = false;
  }
  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.bloom = Math.max(0, this.bloom - dt * 3);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.pumpT = Math.max(0, this.pumpT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.ammo = this.take(); this.magOut = false; this.reloadT = 0; return "reloaded"; }
    }
    return null;
  }
  canFire() { return !this.magOut && this.reloadT <= 0 && this.cool <= 0 && this.ammo > 0; }
  fire() {
    this.ammo--; this.cool = 60 / this.def.rpm;
    this.bloom = Math.min(1, this.bloom + (this.def.auto ? 0.12 : 0.25));
    this.kick = 1;
    if (this.def.id === "shotgun") this.pumpT = 0.45;
  }
  // rounds for a fresh magazine come out of the shared reserve (GunState.pool); no pool = endless
  take() { const p = GunState.pool; if (!p) return this.def.mag; const n = Math.min(this.def.mag, p.rounds); p.rounds -= n; return n; }
  hasReserve() { return !GunState.pool || GunState.pool.rounds > 0; }
  startTimedReload() { if (this.reloadT > 0 || this.ammo === this.def.mag || !this.hasReserve()) return false; this.reloadT = this.def.reload; this.magOut = true; return true; }
  insertMag() { this.ammo = this.take(); this.magOut = false; this.reloadT = 0; }
}
