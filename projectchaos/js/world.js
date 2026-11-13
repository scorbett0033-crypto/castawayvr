// The facility: hub, training range, sandbox hall, abandoned lab (+ secret room),
// vault, tunnel and the outdoor test range. Static geometry is merged per material
// and per zone (zones not visible from where you stand are hidden).
import * as THREE from "three";
import { RAPIER, GROUPS, MATS, tv, tq } from "./physics.js";
import { Builder, mat4, displace } from "./utils.js";
import { canvasTex, withRepeat } from "./textures.js";
import { labelTex } from "./interactables.js";

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = new THREE.Vector3(0, 1, 0);
const qy = (a) => new THREE.Quaternion().setFromAxisAngle(Y, a);

export const ZONES = {
  hub: [-9, -9, 9, 9], ncorr: [-1.2, -12, 1.2, -9], training: [-8, -34, 8, -12], ecorr: [9, -1.2, 12, 1.2], sandbox: [12, -12, 36, 12],
  wcorr: [-12, -1.2, -9, 1.2], lab: [-34, -10, -12, 10], secret: [-42, -3, -34, 3], vault: [-8, 9, -3, 14], tunnel: [-2, 9, 2, 38], outdoor: [-50, 38, 50, 130],
};
const SEES = {
  hub: ["hub", "ncorr", "training", "ecorr", "sandbox", "wcorr", "lab", "vault", "tunnel"], ncorr: ["hub", "ncorr", "training"], training: ["training", "ncorr", "hub"],
  ecorr: ["hub", "ecorr", "sandbox"], sandbox: ["sandbox", "ecorr", "hub"], wcorr: ["hub", "wcorr", "lab"], lab: ["lab", "wcorr", "hub", "secret"],
  secret: ["secret", "lab", "wcorr"], vault: ["vault", "hub"], tunnel: ["tunnel", "hub", "outdoor"], outdoor: ["outdoor", "tunnel"],
};
export function zoneAt(p) { for (const [k, r] of Object.entries(ZONES)) if (p.x >= r[0] && p.x <= r[2] && p.z >= r[1] && p.z <= r[3]) return k; return "outdoor"; }

class StaticBuilder {
  constructor(game) { this.game = game; this.zones = {}; this.zone = "hub"; }
  b() { return (this.zones[this.zone] ||= new Builder()); }
  // axis-aligned-ish box with optional yaw / pitch; adds a collider unless collide:false
  box(mat, w, h, d, x, y, z, o = {}) {
    const rot = [o.rx || 0, o.ry || 0, o.rz || 0];
    this.b().box(mat, w, h, d, [x, y, z], rot, { worldUV: o.uv ?? 0.5 });
    if (o.collide !== false) {
      _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], "YXZ"));
      const c = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z).setRotation(_q);
      this.game.physics.addStatic(c, o.ent || null, o.phys || MATS.stone);
    }
  }
  cyl(mat, r, h, x, y, z, o = {}) {
    this.b().cyl(mat, o.rt ?? r, r, h, o.seg || 16, [x, y, z], [o.rx || 0, o.ry || 0, o.rz || 0], { worldUV: o.uv });
    if (o.collide !== false) {
      _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, "YXZ"));
      this.game.physics.addStatic(RAPIER.ColliderDesc.cylinder(h / 2, r).setTranslation(x, y, z).setRotation(_q), null, o.phys || MATS.metal);
    }
  }
  geo(mat, geo, matrix, o = {}) { this.b().add(mat, geo, matrix, o); }
  build(materials) {
    const groups = {};
    for (const [z, b] of Object.entries(this.zones)) { const g = b.build(materials); g.name = z; groups[z] = g; this.game.scene.add(g); }
    return groups;
  }
}

function stripes(a = "#ffb21a", b = "#141414") {
  return canvasTex(256, 256, (c, w, h) => { c.fillStyle = b; c.fillRect(0, 0, w, h); c.fillStyle = a; for (let i = -4; i < 8; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64 + 32, 0); c.lineTo(i * 64 + 32 + h, h); c.lineTo(i * 64 + h, h); c.fill(); } });
}
function sign(text, sub = "", { w = 1024, h = 256, bg = "#11161b", fg = "#ff8a1f" } = {}) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h); c.strokeStyle = fg; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = fg; c.font = `900 ${Math.floor(h * 0.36)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
    if (sub) { c.fillStyle = "#c9d4dc"; c.font = `bold ${Math.floor(h * 0.15)}px sans-serif`; c.fillText(sub, w / 2, h * 0.75); }
  });
}

export class World {
  constructor(game) { this.game = game; this.locations = []; this.zoneGroups = {}; this.sensors = []; }

  build() {
    const g = this.game, T = g.T;
    const M = (this.M = {
      panel: new THREE.MeshStandardMaterial({ ...withRepeat(T.panel, 1), roughness: 1 }),
      concrete: new THREE.MeshStandardMaterial({ ...T.concrete, roughness: 1 }),
      floor: new THREE.MeshStandardMaterial({ ...T.floor, roughness: 1 }),
      tiles: new THREE.MeshStandardMaterial({ ...T.tiles, roughness: 1 }),
      labWall: new THREE.MeshStandardMaterial({ ...T.concrete, color: 0x9fae9a, roughness: 1 }),
      labFloor: new THREE.MeshStandardMaterial({ ...T.tiles, color: 0xb0b8a8, roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ ...T.painted, metalness: 0.6, roughness: 1 }),
      dark: new THREE.MeshStandardMaterial({ ...T.gunmetal, metalness: 0.7, roughness: 1 }),
      rust: new THREE.MeshStandardMaterial({ ...T.rustBare, metalness: 0.5, roughness: 1 }),
      blue: new THREE.MeshStandardMaterial({ ...T.rustBlue, metalness: 0.4, roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ ...T.wood, roughness: 1 }),
      rock: new THREE.MeshStandardMaterial({ ...T.rock, roughness: 1 }),
      ground: new THREE.MeshStandardMaterial({ ...T.earth, roughness: 1 }),
      hazard: new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.6 }),
      light: new THREE.MeshBasicMaterial({ color: 0xf4f8ff }),
      lightWarm: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
      glowO: new THREE.MeshBasicMaterial({ color: 0xff8a1f }),
      glowC: new THREE.MeshBasicMaterial({ color: 0x46e6ff }),
      glowG: new THREE.MeshBasicMaterial({ color: 0x50ff8a }),
      labLight: new THREE.MeshBasicMaterial({ color: 0xcfe8c8 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.2 }),
      lane: new THREE.MeshStandardMaterial({ ...withRepeat(T.wood, 1), color: 0xe8c890, roughness: 0.35 }),
      brick: new THREE.MeshStandardMaterial({ ...T.concrete, color: 0xa0624e }),
      purple: new THREE.MeshBasicMaterial({ color: 0xb04dff }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.25 }),
    });
    this.S = new StaticBuilder(g);
    this.buildHub(); this.buildTraining(); this.buildSandbox(); this.buildLab(); this.buildVaultTunnel(); this.buildOutdoor();
    this.zoneGroups = this.S.build(M);
    this.locations = [
      { name: "Central Hub", pos: V(0, 0.05, 3), yaw: 0 }, { name: "Training Range", pos: V(0, 0.05, -14), yaw: 0 },
      { name: "Sandbox Hall", pos: V(15, 0.05, 0), yaw: -Math.PI / 2 }, { name: "Abandoned Lab", pos: V(-14, 0.05, 0), yaw: Math.PI / 2 },
      { name: "Service Tunnel", pos: V(0, 0.05, 12), yaw: Math.PI }, { name: "Outdoor Test Range", pos: V(0, 0.05, 44), yaw: Math.PI },
    ];
  }

  /* ---------------- generic room shell ---------------- */
  // doors: [{side, at, w, h}] side n/s (z0/z1) uses x position; e/w (x1/x0) uses z
  room(x0, z0, x1, z1, h, { floor = "floor", wall = "panel", ceil = "panel", doors = [], skip = [], lights = "light", lightGrid = 4 } = {}) {
    const S = this.S, t = 0.3;
    S.box(floor, x1 - x0 + t, 0.3, z1 - z0 + t, (x0 + x1) / 2, -0.15, (z0 + z1) / 2, { phys: MATS.stone });
    S.box(ceil, x1 - x0 + t, 0.3, z1 - z0 + t, (x0 + x1) / 2, h + 0.15, (z0 + z1) / 2, { uv: 0.4 });
    const sides = { n: [x0, x1, z0, "x"], s: [x0, x1, z1, "x"], w: [z0, z1, x0, "z"], e: [z0, z1, x1, "z"] };
    for (const [side, [a0, a1, c, ax]] of Object.entries(sides)) {
      if (skip.includes(side)) continue;
      const ds = doors.filter((d) => d.side === side).sort((p, q) => p.at - q.at);
      let cur = a0;
      const seg = (s0, s1, y0, y1) => {
        if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
        const m = (s0 + s1) / 2, len = s1 - s0 + (s0 === a0 ? t / 2 : 0) + (s1 === a1 ? t / 2 : 0), mm = m + ((s1 === a1 ? t / 4 : 0) - (s0 === a0 ? t / 4 : 0));
        if (ax === "x") S.box(wall, len, y1 - y0, t, mm, (y0 + y1) / 2, c); else S.box(wall, t, y1 - y0, len, c, (y0 + y1) / 2, mm);
      };
      for (const d of ds) { seg(cur, d.at - d.w / 2, 0, h); seg(d.at - d.w / 2, d.at + d.w / 2, d.h, h); cur = d.at + d.w / 2; }
      seg(cur, a1, 0, h);
    }
    // ceiling light panels
    if (lights) {
      const nx = Math.max(1, Math.round((x1 - x0) / lightGrid)), nz = Math.max(1, Math.round((z1 - z0) / lightGrid));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) S.box(lights, 1.2, 0.04, 0.5, x0 + ((i + 0.5) * (x1 - x0)) / nx, h - 0.02, z0 + ((j + 0.5) * (z1 - z0)) / nz, { collide: false });
    }
  }
  corridor(x0, z0, x1, z1, h, alongX, o = {}) {
    const S = this.S, t = 0.3;
    S.box(o.floor || "floor", x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, -0.15, (z0 + z1) / 2);
    S.box(o.ceil || "dark", x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, h + 0.15, (z0 + z1) / 2);
    if (alongX) { S.box(o.wall || "dark", x1 - x0, h, t, (x0 + x1) / 2, h / 2, z0 - t / 2); S.box(o.wall || "dark", x1 - x0, h, t, (x0 + x1) / 2, h / 2, z1 + t / 2); }
    else { S.box(o.wall || "dark", t, h, z1 - z0, x0 - t / 2, h / 2, (z0 + z1) / 2); S.box(o.wall || "dark", t, h, z1 - z0, x1 + t / 2, h / 2, (z0 + z1) / 2); }
    // glowing guide strips
    if (alongX) { S.box("glowO", x1 - x0, 0.04, 0.04, (x0 + x1) / 2, 0.15, z0 + 0.03, { collide: false }); S.box("glowO", x1 - x0, 0.04, 0.04, (x0 + x1) / 2, 0.15, z1 - 0.03, { collide: false }); }
    else { S.box("glowO", 0.04, 0.04, z1 - z0, x0 + 0.03, 0.15, (z0 + z1) / 2, { collide: false }); S.box("glowO", 0.04, 0.04, z1 - z0, x1 - 0.03, 0.15, (z0 + z1) / 2, { collide: false }); }
    S.box("light", alongX ? x1 - x0 - 0.4 : 0.3, 0.04, alongX ? 0.3 : z1 - z0 - 0.4, (x0 + x1) / 2, h - 0.02, (z0 + z1) / 2, { collide: false });
  }
  table(x, z, w, d, h = 0.92, ry = 0, mat = "metal", top = "dark") {
    const S = this.S;
    S.box(top, w, 0.05, d, x, h - 0.025, z, { ry, phys: MATS.metal });
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const lx = a * (w / 2 - 0.06), lz = b * (d / 2 - 0.06); S.box(mat, 0.05, h - 0.05, 0.05, x + lx * c + lz * s, (h - 0.05) / 2, z - lx * s + lz * c, { ry, collide: false }); }
    S.box(mat, w - 0.1, 0.4, 0.02, x, (h - 0.05) - 0.25, z, { ry, collide: false });
  }
  plane(tex, w, h, pos, ry, basic = true, parent = null) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic ? new THREE.MeshBasicMaterial({ map: tex, transparent: true }) : new THREE.MeshStandardMaterial({ map: tex }));
    m.position.copy(pos); m.rotation.y = ry; (parent || this.game.scene).add(m); m.userData.zone = zoneAt(pos); this.decor(m);
    return m;
  }
  decor(m) { (this.decorList ||= []).push(m); }
  P(type, x, y, z, ry = 0, o = {}) {
    const q = qy(ry);
    if (o.flat) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    return this.game.props.spawn(type, V(x, y, z), q, { sleep: o.sleep !== false });
  }

  /* ---------------- HUB ---------------- */
  buildHub() {
    const g = this.game, S = this.S, I = g.interact, M = this.M;
    S.zone = "hub";
    this.room(-9, -9, 9, 9, 7, {
      doors: [{ side: "n", at: 0, w: 2.4, h: 2.8 }, { side: "e", at: 0, w: 2.4, h: 2.8 }, { side: "w", at: 0, w: 2.4, h: 2.8 }, { side: "s", at: 0, w: 4, h: 3.6 }, { side: "s", at: -5.5, w: 1.4, h: 2.4 }],
      floor: "tiles", lightGrid: 4.5,
    });
    // trims, pillars, central dais
    for (const [x, z] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) { S.cyl("metal", 0.35, 7, x, 3.5, z); S.cyl("glowO", 0.37, 0.08, x, 1.2, z, { collide: false }); S.cyl("glowO", 0.37, 0.08, x, 5.5, z, { collide: false }); }
    S.cyl("dark", 2.3, 0.14, 0, 0.07, 0, { seg: 40 }); S.cyl("glowC", 2.36, 0.05, 0, 0.05, 0, { seg: 40, collide: false });
    for (const [x, z, w, d] of [[0, -8.82, 18, 0.06], [0, 8.82, 18, 0.06], [-8.82, 0, 0.06, 18], [8.82, 0, 0.06, 18]]) S.box("hazard", w, 0.18, d, x, 0.09, z, { collide: false, uv: 2 });
    // catwalk ring (visual)
    for (const [x, z, w, d] of [[0, -8.2, 16, 1.2], [0, 8.2, 16, 1.2], [-8.2, 0, 1.2, 14], [8.2, 0, 1.2, 14]]) { S.box("dark", w, 0.08, d, x, 4.6, z, { collide: false }); }
    // holo sign
    const holo = this.plane(sign("PROJECT CHAOS", "PHYSICS RESEARCH DIVISION · SUBLEVEL 7", { bg: "rgba(0,0,0,0)" }), 4, 1, V(0, 4.2, 0), 0);
    holo.material.blending = THREE.AdditiveBlending; holo.material.side = THREE.DoubleSide; this.holo = holo;
    // room signs over doors
    this.plane(sign("TRAINING RANGE", "▲ NORTH"), 2.4, 0.6, V(0, 3.3, -8.84), 0);
    this.plane(sign("SANDBOX HALL", "▶ EAST"), 2.4, 0.6, V(8.84, 3.3, 0), -Math.PI / 2);
    this.plane(sign("LAB B-2", "CONDEMNED — DO NOT ENTER", { fg: "#ff5a4a" }), 2.4, 0.6, V(-8.84, 3.3, 0), Math.PI / 2);
    this.plane(sign("TEST RANGE", "▼ SERVICE TUNNEL"), 2.4, 0.6, V(0, 4.1, 8.84), Math.PI);
    this.plane(sign("VAULT 07", "AUTHORIZED STAFF", { fg: "#ffd34d" }), 1.4, 0.35, V(-5.5, 2.75, 8.84), Math.PI);
    // posters
    this.plane(sign("REMEMBER:", "TED UNITS ARE NOT TOYS (THEY ARE, A LITTLE)", { bg: "#1c2a33", fg: "#46e6ff" }), 2.2, 0.55, V(-8.84, 2.2, -5), Math.PI / 2);
    this.plane(sign("SAFETY FIRST", "WEAR YOUR WRISTBAND · REPORT ALL GRAVITY ANOMALIES", { bg: "#2a1c14" }), 2.2, 0.55, V(8.84, 2.2, 5.6), -Math.PI / 2);
    // weapon table + melee table
    this.table(-6.6, -6.2, 2.6, 0.9, 0.92, 0);
    this.plane(sign("ARMORY", "BLASTERS · TOOLS · GADGETS"), 1.6, 0.4, V(-6.6, 2.0, -8.83), 0);
    this.P("volt_blaster", -7.5, 1.02, -6.2, Math.PI / 2); this.P("toy_pistol", -6.9, 1.0, -6.2, Math.PI / 2); this.P("grav_gun", -6.2, 1.03, -6.15, Math.PI / 2);
    this.P("mender", -5.5, 1.02, -6.2, Math.PI / 2); this.P("flashlight", -7.6, 0.97, -5.9, 0);
    for (let i = 0; i < 3; i++) { this.P("energy_cell", -7.75 + i * 0.07, 1.0, -6.55, 0); this.P("dart_clip", -6.3 + i * 0.07, 1.0, -6.55, 0); }
    this.table(6.6, -6.2, 2.6, 0.9, 0.92, 0, "metal", "wood");
    this.P("wrench", 7.4, 0.98, -6.2, 0.3); this.P("frying_pan", 6.6, 0.99, -6.2, 0); this.P("sledgehammer", 6.0, 1.0, -5.95, 0.1); this.P("toolbox", 7.4, 1.18, -6.45, 0);
    this.plane(sign("TOOL CRIB"), 1.6, 0.4, V(6.6, 2.0, -8.83), 0);
    // benches + props
    this.table(-6.5, 5.6, 0.6, 2.2, 0.45, 0, "dark", "wood");
    this.P("radio", -6.5, 0.58, 5.2, Math.PI / 2);
    this.P("crate", 6.8, 0.32, 1.8); this.P("crate", 6.8, 0.95, 1.85, 0.3); this.P("crate", 7.5, 0.32, 2.6, 0.1);
    this.P("barrel", -7.5, 0.3, 2.6); this.P("cone", -3, 0.36, 6.5); this.P("basketball", 2, 0.2, 2.5); this.P("beach_ball", -2.5, 0.3, -2.5);
    this.P("cardboard", 6.5, 0.2, 7.5); this.P("cardboard", 6.9, 0.58, 7.6, 0.5); this.P("duck", 0.6, 0.25, 1.4);
    for (let i = 0; i < 6; i++) this.P("block", -1.0 + (i % 3) * 0.13, 0.2 + Math.floor(i / 3) * 0.13, -1.4);
    // spawner console
    this.buildSpawner(V(4.2, 0, 6.2), V(6.2, 0, 6.2), [["crate", "CRATE", 0xc48a4a], ["barrel", "BARREL", 0x3b7bd6], ["watermelon", "MELON", 0x3fc060], ["beach_ball", "BALL", 0xff5a5a], ["duck", "DUCK", 0xffd21a], ["explosive_barrel", "BOOM", 0xff2a1a], ["ted", "TED", 0x46e6ff]]);
    // vault keypad + door
    this.vaultDoor = I.slidingDoor(V(-5.5, 1.2, 9), 0, 1.4, 2.4, { mat: M.metal, auto: false, locked: true, slide: V(-1, 0, 0) });
    I.keypad(V(-3.95, 1.35, 8.84), V(0, 0, -1), "0724", () => { this.vaultDoor.locked = false; I.setSlider(this.vaultDoor, true); g.secretFound("vault"); });
    // challenge board
    this.boardTex = document.createElement("canvas"); this.boardTex.width = 1024; this.boardTex.height = 720;
    const bt = new THREE.CanvasTexture(this.boardTex); bt.colorSpace = THREE.SRGBColorSpace; this.boardT = bt;
    this.plane(bt, 3.2, 2.25, V(-4.6, 3.0, -8.83), 0);
    // trophy pedestal
    S.cyl("dark", 0.35, 1.0, 3.5, 0.5, 8.2); S.cyl("gold", 0.38, 0.05, 3.5, 1.025, 8.2, { collide: false });
    this.plane(sign("TROPHY", "BRING THE GOLDEN DUCK HOME", { fg: "#ffd34d" }), 0.9, 0.22, V(3.5, 0.6, 7.84), Math.PI);
    this.trophy = V(3.5, 1.05, 8.2);
    // welcome panel
    this.welcome = this.plane(canvasTex(1024, 640, (c) => {
      c.fillStyle = "rgba(10,13,16,0.9)"; c.fillRect(0, 0, 1024, 640); c.strokeStyle = "#ff8a1f"; c.lineWidth = 8; c.strokeRect(6, 6, 1012, 628);
      c.fillStyle = "#fff"; c.font = "900 64px sans-serif"; c.fillText("WELCOME, TEST SUBJECT", 50, 100);
      c.fillStyle = "#ff8a1f"; c.font = "bold 34px sans-serif"; c.fillText("Everything here is physical. Have fun.", 50, 160);
      c.fillStyle = "#c9d4dc"; c.font = "30px sans-serif";
      ["• GRIP to grab · swing & let go to throw · use two hands on heavy stuff", "• Point at things & hold GRIP to pull them to you", "• TRIGGER fires · A/X ejects the mag · grab a new one at your hip", "• Y opens the wrist menu: settings, spawner, challenges, travel", "• Press buttons with your finger. Open doors by their handles.", "• Check the GOALS board. Some rooms are hidden…"].forEach((t, i) => c.fillText(t, 50, 240 + i * 62));
    }), 1.5, 0.94, V(0, 1.75, 0.6), 0, true);
    this.welcome.material.side = THREE.DoubleSide;
    // hub doors
    I.slidingDoor(V(0, 1.4, -9), 0, 2.4, 2.8, { mat: M.metal, label: "TRAINING" });
    I.slidingDoor(V(9, 1.4, 0), -Math.PI / 2, 2.4, 2.8, { mat: M.metal, label: "SANDBOX" });
    this.corridor(-1.2, -12, 1.2, -9, 3, false); S.zone = "ncorr";
    S.zone = "ecorr"; this.corridor(9, -1.2, 12, 1.2, 3, true);
    S.zone = "wcorr"; this.corridor(-12, -1.2, -9, 1.2, 3, true, { wall: "labWall", floor: "labFloor" });
    S.zone = "hub";
  }

  buildSpawner(pad, consolePos, items, f = -1) {
    const g = this.game, S = this.S, I = g.interact;
    S.cyl("dark", 0.9, 0.06, pad.x, 0.03, pad.z, { seg: 32 }); S.cyl("glowC", 0.94, 0.03, pad.x, 0.02, pad.z, { seg: 32, collide: false });
    S.cyl("dark", 0.6, 0.5, pad.x, 6.75, pad.z, { collide: false, seg: 24 }); S.cyl("glowO", 0.62, 0.05, pad.x, 6.5, pad.z, { collide: false, seg: 24 });
    // console: slanted top facing -x
    const c = consolePos;
    S.box("dark", 0.6, 1.0, 1.9, c.x, 0.5, c.z);
    S.box("metal", 0.7, 0.06, 2.0, c.x + f * 0.05, 1.03, c.z, { rz: -f * 0.35 });
    const n = V(f * Math.sin(0.35), Math.cos(0.35), 0);
    items.forEach(([type, label, col], i) => {
      const z = c.z - 0.78 + (i * 1.56) / (items.length - 1);
      const p = V(c.x + f * 0.08, 1.07, z);
      I.button(p, n, { color: col, radius: 0.05, label, onPress: () => {
        if (type === "ted") { g.spawnTed(pad.clone().add(V(0, 0.1, 0))); return; }
        const e = g.props.spawn(type, pad.clone().add(V((Math.random() - 0.5) * 0.3, 5.8, (Math.random() - 0.5) * 0.3)), qy(Math.random() * 6), { spawned: true });
        e && e.body.setAngvel({ x: Math.random() - 0.5, y: Math.random() * 2, z: Math.random() - 0.5 }, true);
        g.audio.play("servo", pad.clone().setY(6), { vol: 0.5, ref: 4 });
      } });
    });
    this.plane(sign("FABRICATOR", "PRESS TO PRINT"), 1.2, 0.3, V(c.x - f * 0.2, 1.75, c.z), (f * Math.PI) / 2);
  }

  /* ---------------- TRAINING ---------------- */
  buildTraining() {
    const g = this.game, S = this.S, I = g.interact, M = this.M;
    S.zone = "training";
    this.room(-8, -34, 8, -12, 5, { doors: [{ side: "s", at: 0, w: 2.4, h: 2.8 }], wall: "concrete", floor: "floor", ceil: "dark" });
    // firing line counter
    S.box("dark", 12, 1.0, 0.6, 0, 0.5, -15.5); S.box("wood", 12.1, 0.05, 0.7, 0, 1.025, -15.5, { phys: MATS.wood });
    S.box("hazard", 16, 0.01, 0.15, 0, 0.005, -16.0, { collide: false, uv: 2 });
    // lane dividers + backstop
    for (const x of [-6, -2, 2, 6]) S.box("metal", 0.06, 1.4, 6, x, 0.7, -19.5, { collide: false });
    S.box("rust", 15.6, 4.6, 0.4, 0, 2.3, -33.6);
    for (let i = 0; i < 6; i++) S.box("light", 0.3, 0.04, 16, -6 + i * 2.4, 4.95, -24, { collide: false });
    this.plane(sign("RANGE CONTROL", "PRESS START · HIT 10 TARGETS IN 40 s"), 1.6, 0.4, V(7.5, 1.9, -15.5), -Math.PI / 2);
    this.plane(sign("HOOP DREAMS", "THROW 5 THINGS IN THE BIN FROM BEHIND THE COUNTER"), 2.2, 0.55, V(-5, 2.8, -33.38), 0);
    this.P("volt_blaster", -1.0, 1.12, -15.5, Math.PI / 2); this.P("toy_pistol", 1.0, 1.1, -15.5, Math.PI / 2);
    for (let i = 0; i < 2; i++) { this.P("energy_cell", -1.5 + i * 0.07, 1.1, -15.35); this.P("dart_clip", 1.5 + i * 0.07, 1.1, -15.35); }
    for (let i = 0; i < 4; i++) this.P("basketball", -4.5 + i * 0.3, 1.2, -15.5);
    this.P("bottle", 3.5, 1.2, -15.5); this.P("bottle", 3.7, 1.2, -15.5); this.P("mug", 4.0, 1.12, -15.5); this.P("watermelon", 5, 1.25, -15.5);
    // targets
    this.targets = [];
    const tp = [[-4.5, -22], [-1.2, -24], [2.4, -21.5], [4.8, -26], [-3, -28.5], [0.5, -30.5], [3.6, -31], [-5.5, -31.5]];
    for (const [x, z] of tp) this.targets.push(I.target(V(x, 0, z), 0, () => g.challenges.targetHit()));
    I.button(V(7.6, 1.2, -14.6), V(-1, 0, 0), { color: 0x38d070, radius: 0.06, label: "START", onPress: () => g.challenges.startRange() });
    // range clock
    this.rangeCanvas = document.createElement("canvas"); this.rangeCanvas.width = 512; this.rangeCanvas.height = 128;
    this.rangeTex = new THREE.CanvasTexture(this.rangeCanvas); this.rangeTex.colorSpace = THREE.SRGBColorSpace;
    this.plane(this.rangeTex, 2, 0.5, V(0, 3.6, -16), Math.PI);
    this.plane(this.rangeTex, 2, 0.5, V(0, 3.6, -16.02), 0);
    // basket bin
    const bx = -5, bz = -21.5;
    S.box("blue", 1.0, 0.05, 1.0, bx, 0.025, bz); for (const [dx, dz, w, d] of [[0, -0.5, 1.04, 0.05], [0, 0.5, 1.04, 0.05], [-0.5, 0, 0.05, 1.0], [0.5, 0, 0.05, 1.0]]) S.box("blue", w, 0.9, d, bx + dx, 0.45, bz + dz, { phys: MATS.metal });
    S.box("glowO", 1.06, 0.05, 1.06, bx, 0.92, bz, { collide: false });
    this.bin = { x: bx, z: bz };
    // punching bag
    const bagM = new THREE.MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.8 });
    const bag = new THREE.Group(); const bm = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.75, 6, 16), bagM); bm.castShadow = true; bag.add(bm);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6), new THREE.MeshStandardMaterial({ color: 0x222 })); rope.position.y = 1.8; bag.add(rope);
    bag.position.set(6.2, 1.6, -13.2); g.scene.add(bag);
    const be = { kind: "prop", mesh: bag, mass: 30, grabbable: true, sound: "soft", def: { name: "bag" }, jointed: true };
    g.physics.createBody(be, { pos: bag.position, colliders: [RAPIER.ColliderDesc.capsule(0.375, 0.2).setMass(30)], mat: MATS.foam, angDamp: 0.6, linDamp: 0.2, mass: 30 });
    const anc = g.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(6.2, 4.95, -13.2));
    g.physics.world.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 3.35, z: 0 }), anc, be.body, true);
    S.zone = "hub";
  }

  /* ---------------- SANDBOX ---------------- */
  buildSandbox() {
    const g = this.game, S = this.S, I = g.interact, M = this.M;
    S.zone = "sandbox";
    this.room(12, -12, 36, 12, 10, { doors: [{ side: "w", at: 0, w: 2.4, h: 2.8 }], floor: "floor", wall: "panel", ceil: "dark", lightGrid: 6 });
    for (let x = 14; x < 36; x += 4) S.box("hazard", 0.06, 0.012, 24, x, 0.006, 0, { collide: false, uv: 3 });
    // big ramp
    S.box("metal", 6, 0.3, 7.6, 31, 1.25, -6.9, { rx: -0.36, phys: MATS.metal });
    S.box("dark", 6, 2.6, 0.3, 31, 1.3, -10.6);
    // platform + stairs
    S.box("dark", 6, 3, 6, 33, 1.5, 9); S.box("hazard", 6, 0.02, 0.3, 33, 3.01, 5.85, { collide: false, uv: 2 });
    for (let i = 0; i < 10; i++) S.box("metal", 1.4, 0.3 * (i + 1), 0.42, 29.3, 0.15 * (i + 1), 10.5 - i * 0.42);
    // railing
    S.box("glowO", 6, 0.05, 0.05, 33, 4.0, 6.05, { collide: false }); for (let i = 0; i < 6; i++) S.box("metal", 0.05, 1, 0.05, 30.2 + i * 1.1, 3.5, 6.05, { collide: false });
    // stack zone
    S.box("glowC", 6, 0.01, 0.06, 17, 0.01, -10, { collide: false }); S.box("glowC", 6, 0.01, 0.06, 17, 0.01, -4, { collide: false });
    S.box("glowC", 0.06, 0.01, 6, 14, 0.01, -7, { collide: false }); S.box("glowC", 0.06, 0.01, 6, 20, 0.01, -7, { collide: false });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(6, 0.03, 6), new THREE.MeshBasicMaterial({ color: 0x46e6ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    bar.position.set(17, 2.5, -7); g.scene.add(bar); this.decor(bar); bar.userData.zone = "sandbox"; this.stackBar = bar;
    this.plane(sign("SKYSCRAPER", "STACK ANYTHING ABOVE THE LINE (2.5 m) FOR 3 s"), 2.4, 0.6, V(17, 3.3, -11.84), 0);
    for (let i = 0; i < 8; i++) this.P("crate", 15 + (i % 4) * 0.7, 0.32 + Math.floor(i / 4) * 0.64, -5.2 - (i % 2) * 0.05);
    for (let i = 0; i < 6; i++) this.P("cinder", 18.5, 0.1 + i * 0.2, -5 - (i % 2) * 0.05, (i % 2) * 0.1);
    for (let i = 0; i < 6; i++) this.P("plank", 21.5, 0.02 + i * 0.04, -8.5, Math.PI / 2);
    for (let i = 0; i < 12; i++) this.P("brick", 22.5 + (i % 3) * 0.24, 0.035 + Math.floor(i / 3) * 0.075, -6);
    // dominoes (S-curve)
    this.dominoes = [];
    for (let i = 0; i < 26; i++) {
      const t = i / 25, x = 14.5 + t * 12, z = 7 + Math.sin(t * Math.PI * 2) * 2.4;
      const dx = 12, dz = Math.cos(t * Math.PI * 2) * 2.4 * Math.PI * 2;
      const yaw = Math.atan2(dx, dz);
      this.dominoes.push(this.P("domino", x, 0.245, z, yaw));
    }
    this.plane(sign("DOMINO EFFECT", "TOPPLE THE LAST ONE"), 1.8, 0.45, V(20.5, 2.6, 11.84), Math.PI);
    // see-saw
    S.box("dark", 0.5, 0.5, 0.5, 24, 0.25, 1.8, { rx: 0, ry: Math.PI / 4 });
    const plank = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 0.55), M.wood); plank.castShadow = plank.receiveShadow = true;
    plank.position.set(24, 0.56, 1.8); g.scene.add(plank);
    const pe = { kind: "prop", mesh: plank, mass: 25, grabbable: true, jointed: true, sound: "wood", def: { name: "seesaw" } };
    g.physics.createBody(pe, { pos: plank.position, colliders: [RAPIER.ColliderDesc.cuboid(2.1, 0.05, 0.275).setMass(25)], mat: MATS.wood, mass: 25, angDamp: 0.3 });
    const fa = g.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(24, 0.56, 1.8));
    const sd = RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    g.physics.world.createImpulseJoint(sd, fa, pe.body, true).setLimits(-0.26, 0.26);
    this.P("bowling_ball", 22.3, 0.85, 1.8); this.P("cardboard", 25.6, 0.85, 1.8);
    // wrecking ball
    const wb = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 7.6), M.dark); pole.position.y = 3.8; wb.add(pole);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), M.dark); wb.add(ball);
    wb.traverse((m) => (m.castShadow = true));
    wb.position.set(27, 1.3, -1.8); g.scene.add(wb);
    const we = { kind: "prop", mesh: wb, mass: 90, grabbable: true, jointed: true, sound: "metal", def: { name: "wrecking ball" } };
    g.physics.createBody(we, { pos: wb.position, colliders: [RAPIER.ColliderDesc.ball(0.5).setMass(90), RAPIER.ColliderDesc.cylinder(3.8, 0.03).setTranslation(0, 3.8, 0).setMass(2)], mat: MATS.heavyMetal, mass: 90, angDamp: 0.05, linDamp: 0.02 });
    const wa = g.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(27, 9.9, -1.8));
    g.physics.world.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 8.6, z: 0 }), wa, we.body, true);
    for (let i = 0; i < 10; i++) this.P("crate", 29.2 + (i % 3) * 0.66, 0.32 + Math.floor(i / 3) * 0.64, 0.5, 0); // target tower
    // bounce pad & low-g zone
    S.cyl("dark", 1.0, 0.1, 20, 0.05, 1.5, { seg: 32 }); S.cyl("glowG", 0.9, 0.02, 20, 0.11, 1.5, { seg: 32, collide: false });
    this.plane(sign("LAUNCH PAD", "", { fg: "#50ff8a" }), 1.2, 0.3, V(20, 0.6, 2.6), 0).visible = true;
    this.bouncePad = { x: 20, z: 1.5, r: 0.95 };
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 9.6, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x46a8ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    lg.position.set(31, 4.8, -0.5); g.scene.add(lg); lg.userData.zone = "sandbox"; this.decor(lg); this.lowGMesh = lg;
    S.geo("glowC", new THREE.TorusGeometry(2.6, 0.03, 6, 64), mat4([31, 0.02, -0.5], [Math.PI / 2, 0, 0]));
    this.lowG = { x: 31, z: -0.5, r: 2.6 };
    this.plane(sign("LOW-G CHAMBER", "15% GRAVITY", { fg: "#46a8ff" }), 1.6, 0.4, V(35.84, 3, -0.5), -Math.PI / 2);
    for (let i = 0; i < 3; i++) this.P(["beach_ball", "duck", "tire"][i], 31 + (i - 1) * 0.8, 0.5, -0.5);
    // glass panes in frames
    for (let i = 0; i < 3; i++) {
      const x = 22.5 + i * 1.6, z = -10.6;
      S.box("dark", 1.2, 0.1, 0.2, x, 0.05, z); S.box("dark", 0.06, 1.5, 0.2, x - 0.56, 0.75, z, { collide: false }); S.box("dark", 0.06, 1.5, 0.2, x + 0.56, 0.75, z, { collide: false });
      this.P("glass_pane", x, 0.76, z);
    }
    // more toys
    this.P("bowling_ball", 15, 0.15, 2); this.P("beach_ball", 16, 0.3, -1); this.P("tire", 17, 0.16, 3, 0, { flat: true }); this.P("tire", 17.05, 0.47, 3.05, 0.3, { flat: true });
    this.P("explosive_barrel", 34.5, 0.45, -3); this.P("barrel", 34.5, 0.3, -1.6); this.P("barrel", 33.6, 0.3, -2.2);
    for (let i = 0; i < 5; i++) this.P("cone", 14 + i * 1.2, 0.36, 10.8);
    this.P("watermelon", 30.8, 3.2, 9); this.P("watermelon", 31.6, 3.2, 9.4); this.P("monitor", 34.5, 3.25, 10.5, -1.6);
    this.buildSpawner(V(15.6, 0, -1.5), V(13.0, 0, -1.5), [["crate", "CRATE", 0xc48a4a], ["bowling_ball", "BOWL", 0x7a3aaa], ["cardboard", "BOX", 0xb68b57], ["domino", "DOMINO", 0x222222], ["cinder", "BLOCK", 0x999999], ["glass_pane", "GLASS", 0x9fd4c0]], 1);
    S.zone = "hub";
  }

  /* ---------------- LAB ---------------- */
  buildLab() {
    const g = this.game, S = this.S, I = g.interact, M = this.M;
    S.zone = "lab";
    this.room(-34, -10, -12, 10, 4.2, { doors: [{ side: "e", at: 0, w: 2.4, h: 2.8 }, { side: "w", at: 0, w: 3, h: 2.7 }], floor: "labFloor", wall: "labWall", ceil: "labWall", lights: "labLight", lightGrid: 5 });
    // fallen ceiling panels & debris, pipes
    S.box("labWall", 1.2, 0.04, 0.6, -20, 0.3, 3, { rx: 0.4, rz: 0.2 }); S.box("labWall", 1.2, 0.04, 0.6, -27, 0.05, -6, { ry: 0.6 });
    for (const z of [-9.5, 9.5]) S.cyl("rust", 0.12, 22, -23, 3.8, z, { rz: Math.PI / 2, collide: false });
    S.cyl("rust", 0.08, 20, -33.6, 3.6, 0, { rx: Math.PI / 2, collide: false });
    // double hinged doors in the corridor
    I.hingedDoor(V(-12, 0, -1.2), 0, 1.18, 2.7, { mat: M.dark, limits: [-1.6, 1.6], sound: "metal", spring: 3 });
    I.hingedDoor(V(-12, 0, 1.2), Math.PI, 1.18, 2.7, { mat: M.dark, limits: [-1.6, 1.6], sound: "metal", spring: 3 });
    // lab benches with drawers
    const deskM = M.metal;
    const benches = [[-17, -5], [-17, 5], [-24, -5], [-24, 5]];
    benches.forEach(([x, z], bi) => {
      S.box("metal", 3.0, 0.06, 1.0, x, 0.93, z, { phys: MATS.metal }); S.box("dark", 0.06, 0.9, 1.0, x - 1.47, 0.45, z); S.box("dark", 0.06, 0.9, 1.0, x + 1.47, 0.45, z);
      // drawer cabinet on one side
      S.box("dark", 0.66, 0.9, 0.04, x + 1.1, 0.45, z - 0.48); S.box("dark", 0.04, 0.9, 1.0, x + 0.76, 0.45, z);
      for (let k = 0; k < 2; k++) {
        const isCode = bi === 3 && k === 1;
        I.drawer(V(x + 1.1, 0.62 - k * 0.32, z + 0.02), 0, 0.6, 0.24, 0.9, { mat: deskM, contents: isCode ? (mesh) => {
          const note = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.15), new THREE.MeshStandardMaterial({ map: canvasTex(256, 180, (c) => { c.fillStyle = "#efe8d2"; c.fillRect(0, 0, 256, 180); c.fillStyle = "#2a2a6a"; c.font = "bold 26px cursive, sans-serif"; c.fillText("Vault 07 code", 20, 50); c.font = "bold 54px monospace"; c.fillText("0 7 2 4", 20, 125); c.font = "18px sans-serif"; c.fillText("don't tell the TEDs", 60, 165); }) }));
          note.rotation.x = -Math.PI / 2; note.position.set(0, -0.1, 0); mesh.add(note);
        } : null });
      }
      // stuff on the bench
      this.P("beaker", x - 1.0, 1.04, z + 0.2); this.P("beaker", x - 0.8, 1.04, z - 0.1); this.P("bottle", x - 0.5, 1.1, z + 0.25);
      this.P(bi % 2 ? "monitor" : "mug", x, bi % 2 ? 1.18 : 1.02, z, Math.PI * (z < 0 ? 0 : 1));
      if (bi === 0) this.P("plant", x + 0.9, 1.4, z);
    });
    this.P("lab_chair", -18, 0.32, -3.8); this.P("lab_chair", -23, 0.32, 3.8, 0.4); this.P("lab_chair", -26, 0.32, 0, 1.2);
    for (let i = 0; i < 4; i++) S.box("dark", 0.9, 2.1, 0.8, -30.5 + i * 1.0, 1.05, -9.4);
    for (let i = 0; i < 3; i++) { const sr = g.assets.has("server_rack") ? g.assets.instance("server_rack") : null; if (sr) { sr.position.set(-30.5 + i * 1.0, 2.55, -9.35); sr.scale.setScalar(0.62); g.scene.add(sr); sr.userData.zone = "lab"; this.decor(sr); } }
    this.P("crate", -32.5, 0.32, 8.8); this.P("crate", -32.4, 0.95, 8.8, 0.4); this.P("toolbox", -14, 0.2, -9); this.P("extinguisher", -12.6, 0.3, 3.2);
    this.P("cardboard", -29.5, 0.2, 7.5); this.P("cardboard", -30, 0.2, 8.2, 0.3); this.P("cardboard", -29.8, 0.58, 7.8, 0.8);
    this.P("flashlight", -14.2, 0.97, 1.8);
    S.box("wood", 1.8, 0.05, 0.6, -14.2, 0.92, 2.3); S.box("dark", 1.8, 0.9, 0.05, -14.2, 0.45, 2.58);
    // whiteboard with hints
    this.plane(canvasTex(1024, 512, (c) => {
      c.fillStyle = "#e8ece6"; c.fillRect(0, 0, 1024, 512); c.fillStyle = "#1a3a8a"; c.font = "bold 44px cursive, sans-serif";
      c.fillText("Exp. 44: structural resonance", 30, 70); c.fillStyle = "#333"; c.font = "32px cursive, sans-serif";
      c.fillText("- west wall is hollow?? sounds weird when hit", 30, 150); c.fillText("- a big hammer would settle it", 30, 210);
      c.fillText("- TED-03 shut down after the incident.", 30, 290); c.fillText("  Mender should bring it back.", 30, 340);
      c.fillStyle = "#c22"; c.fillText("LIGHTS: switch by the door", 30, 430);
    }), 2.6, 1.3, V(-20, 2.2, 9.84), Math.PI, false);
    // light switch
    I.button(V(-12.6, 1.4, 1.75), V(1, 0, 0), { color: 0xffd34d, radius: 0.035, toggle: true, on: false, label: "LIGHTS", onPress: (on) => { this.labLightsOn = on; g.audio.play("clack", V(-12.6, 1.4, 1.75)); } });
    this.labLightsOn = false;
    // secret brick wall at x = -34, z -1.5..1.5
    this.bricks = [];
    const bw = 0.6, bh = 0.3;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5 + (r % 2); c++) {
      const off = r % 2 ? -bw / 2 : 0;
      let z0 = -1.5 + c * bw + off, z1 = z0 + bw; z0 = Math.max(-1.5, z0); z1 = Math.min(1.5, z1);
      if (z1 - z0 < 0.05) continue;
      const w = z1 - z0, cz = (z0 + z1) / 2, cy = bh / 2 + r * bh;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, bh - 0.008, w - 0.008), M.brick); m.castShadow = m.receiveShadow = true;
      m.position.set(-34, cy, cz); g.scene.add(m);
      const be = { kind: "brick", mesh: m, mass: 6, grabbable: false, sound: "stone" };
      g.physics.createBody(be, { type: "fixed", pos: m.position, colliders: [RAPIER.ColliderDesc.cuboid(0.14, bh / 2 - 0.004, w / 2 - 0.004).setMass(6)], mat: MATS.stone });
      be.onShot = (hit, dir, dmg) => this.hitWall(dmg, hit.point);
      this.bricks.push(be);
    }
    this.wallHp = 160; this.wallBroken = false;
    // the disabled TED lies here (spawned by main once NPCs load)
    // secret room
    S.zone = "secret";
    this.room(-42, -3, -34, 3, 3, { skip: ["e"], floor: "dark", wall: "dark", ceil: "dark", lights: "purple", lightGrid: 3 });
    S.box("gold", 0.8, 1.0, 0.8, -40, 0.5, 0); S.box("purple", 0.85, 0.04, 0.85, -40, 1.0, 0, { collide: false });
    this.plane(sign("YOU FOUND IT", "THE CHAOS ROOM — EST. NEVER", { fg: "#c58bff", bg: "#160a22" }), 2.2, 0.55, V(-41.84, 2.0, 0), Math.PI / 2);
    this.P("golden_duck", -40, 1.15, 0, 0.5);
    this.P("golden_blaster", -38.4, 0.2, -2.0, 0.3);
    S.zone = "hub";
  }
  hitWall(dmg, p) {
    if (this.wallBroken) return;
    this.wallHp -= dmg;
    this.game.audio.play("stone", p, { vol: 1, rate: 0.6 });
    this.game.fx.burst(p, 0x9a6a5a, 10, 1.5, 0.02);
    if (this.wallHp <= 0) {
      this.wallBroken = true;
      for (const b of this.bricks) {
        b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        b.kind = "prop"; b.grabbable = true; b.def = { name: "brick" };
        b.colliders.forEach((c) => { c.setCollisionGroups(GROUPS.prop); c.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS); c.setContactForceEventThreshold(200); });
        this.game.physics.dynamic.add(b);
        const t = tv(b.body.translation());
        b.body.applyImpulse({ x: -(1 + Math.random() * 3) * 6, y: Math.random() * 6, z: (t.z - p.z) * 6 }, true);
      }
      this.game.audio.play("crunch", p, { vol: 1.5, rate: 0.5 });
      this.game.audio.play("boom", p, { vol: 0.6, rate: 1.6 });
      this.game.fx.smoke(p, 30, 0x8a7a6a, 0.3);
      this.game.noise(p, 1.6, "break");
    }
  }

  /* ---------------- VAULT + TUNNEL ---------------- */
  buildVaultTunnel() {
    const g = this.game, S = this.S, I = g.interact, M = this.M;
    S.zone = "vault";
    this.room(-8, 9, -3, 14, 3.2, { skip: ["n"], floor: "dark", wall: "metal", ceil: "dark", lights: "lightWarm", lightGrid: 2.5 });
    S.box("gold", 1.4, 0.8, 0.6, -5.5, 0.4, 13.3);
    this.P("radio", -5.5, 0.92, 13.3, 0);
    this.plane(sign("PARTY PROTOCOL", "TURN IT ON NEAR A TED (TRIGGER)", { fg: "#ffd34d" }), 1.6, 0.4, V(-5.5, 2.0, 13.84), Math.PI);
    for (let i = 0; i < 4; i++) this.P("watermelon", -7.4, 0.18 + i * 0.001, 10 + i * 0.4);
    this.P("crate", -3.6, 0.32, 10); this.P("bowling_ball", -3.6, 0.75, 10);
    S.zone = "tunnel";
    const tz0 = 9, tz1 = 38;
    S.box("floor", 4, 0.3, tz1 - tz0, 0, -0.15, (tz0 + tz1) / 2);
    S.box("concrete", 4.6, 0.3, tz1 - tz0, 0, 4.15, (tz0 + tz1) / 2, { uv: 0.4 });
    S.box("concrete", 0.3, 4, tz1 - tz0, -2.15, 2, (tz0 + tz1) / 2); S.box("concrete", 0.3, 4, tz1 - tz0, 2.15, 2, (tz0 + tz1) / 2);
    for (let z = tz0 + 1.5; z < tz1; z += 3) { S.box("lightWarm", 0.3, 0.05, 1.4, 0, 3.97, z, { collide: false }); S.box("dark", 4, 0.25, 0.25, 0, 3.85, z + 0.9, { collide: false }); }
    S.box("glowO", 0.04, 0.04, tz1 - tz0, -1.97, 0.15, (tz0 + tz1) / 2, { collide: false }); S.box("glowO", 0.04, 0.04, tz1 - tz0, 1.97, 0.15, (tz0 + tz1) / 2, { collide: false });
    S.box("hazard", 4, 0.012, 0.6, 0, 0.006, tz1 - 2, { collide: false, uv: 1 });
    this.P("cone", -1.2, 0.36, 20); this.P("cone", 1.1, 0.36, 26); this.P("barrel", 1.5, 0.3, 14);
    // blast door + lever
    this.blast = I.slidingDoor(V(0, 2, 38), 0, 4.1, 4, { mat: M.rust, auto: false, slide: V(0, 1, 0), speed: 0.45, sound: "servo", locked: false });
    this.blast.dist = 3.9;
    I.lever(V(1.72, 1.0, 34.5), -Math.PI / 2, () => { I.setSlider(this.blast, true); g.audio.play("servo", V(0, 3, 38), { vol: 1, ref: 6 }); g.toast("BLAST DOOR OPEN", "Outdoor test range unlocked"); });
    this.plane(sign("BLAST DOOR", "PULL LEVER TO OPEN"), 1.4, 0.35, V(1.99, 2.2, 34.5), -Math.PI / 2);
    S.zone = "hub";
  }

  /* ---------------- OUTDOOR ---------------- */
  buildOutdoor() {
    const g = this.game, S = this.S, I = g.interact, M = this.M;
    S.zone = "outdoor";
    // ground
    const gr = new THREE.PlaneGeometry(110, 100, 60, 60); gr.rotateX(-Math.PI / 2);
    const p = gr.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const edge = Math.max(0, Math.abs(x) - 40) + Math.max(0, Math.abs(z) - 40); p.setY(i, edge * edge * 0.04 + Math.sin(x * 0.3) * Math.cos(z * 0.27) * 0.04 * Math.min(1, edge)); }
    gr.computeVertexNormals();
    S.geo("ground", gr, mat4([0, 0, 84]), { worldUV: 0.25 });
    this.game.physics.addStatic(RAPIER.ColliderDesc.cuboid(60, 0.5, 55).setTranslation(0, -0.5, 84), null, MATS.stone);
    // canyon walls (rock)
    const rocks = [];
    for (let i = 0; i < 26; i++) { const a = i / 26; rocks.push([-48 + a * 96, 128 + Math.sin(i * 1.7) * 2]); }
    for (let i = 0; i < 12; i++) { rocks.push([-49, 40 + i * 8]); rocks.push([49, 40 + i * 8]); }
    for (let i = 0; i < 10; i++) { rocks.push([-46 + i * 3.6, 38]); rocks.push([46 - i * 3.6, 38]); }
    rocks.forEach(([x, z], i) => {
      const geo = displace(new THREE.IcosahedronGeometry(5 + (i % 3), 2), 2.2, 0.25, i * 3.1);
      geo.scale(1, 2 + (i % 4) * 0.4, 1);
      S.geo("rock", geo, mat4([x, 3, z], [0, i, 0]), { worldUV: 0.2 });
    });
    for (const [x, z, w, d] of [[0, 131, 110, 2], [-51, 84, 2, 100], [51, 84, 2, 100], [-27, 37.5, 46, 2], [27, 37.5, 46, 2]]) this.game.physics.addStatic(RAPIER.ColliderDesc.cuboid(w / 2, 12, d / 2).setTranslation(x, 12, z), null, MATS.stone);
    // bunker facade
    S.box("concrete", 9, 7, 2, -6.5, 3.5, 38.7); S.box("concrete", 9, 7, 2, 6.5, 3.5, 38.7); S.box("concrete", 4, 3, 2, 0, 5.5, 38.7);
    S.box("hazard", 4.4, 0.3, 0.1, 0, 4.15, 39.75, { collide: false, uv: 1 });
    this.plane(sign("SECTOR 7 — OUTDOOR TEST RANGE", "ALL EXPERIMENTS MUST BE LOGGED"), 5, 1.25, V(0, 5.6, 39.72), 0);
    // bowling lane
    S.box("lane", 1.5, 0.08, 24, -28, 0.04, 60, { phys: MATS.wood, uv: 0.5 });
    S.box("dark", 0.15, 0.25, 24, -28.85, 0.12, 60); S.box("dark", 0.15, 0.25, 24, -27.15, 0.12, 60);
    S.box("dark", 2, 1.2, 0.3, -28, 0.6, 72.6);
    this.pinSpots = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c <= r; c++) this.pinSpots.push(V(-28 + (c - r / 2) * 0.3, 0.27, 68.5 + r * 0.26));
    this.pins = this.pinSpots.map((s) => this.P("bowling_pin", s.x, s.y, s.z, 0));
    this.P("bowling_ball", -28.6, 0.2, 49.2); this.P("bowling_ball", -27.4, 0.2, 49.2);
    S.box("dark", 0.6, 0.9, 0.6, -26.3, 0.45, 49);
    I.button(V(-26.3, 0.9, 49), V(0, 1, 0), { color: 0x38d070, radius: 0.06, label: "RESET", onPress: () => this.resetPins() });
    this.plane(sign("STRIKE!", "KNOCK ALL 10 PINS DOWN WITH ONE ROLL"), 2.4, 0.6, V(-28, 2.0, 72.4), Math.PI);
    // big ramp + kicker
    S.box("metal", 4, 0.3, 9, 8, 1.4, 70, { rx: -0.32, phys: MATS.metal }); S.box("dark", 4, 2.9, 0.3, 8, 1.45, 74.3);
    // watchtower
    S.box("dark", 4, 4, 4, -12, 2, 100); S.box("hazard", 4, 0.02, 0.3, -12, 4.01, 97.85, { collide: false, uv: 1 });
    for (let i = 0; i < 13; i++) S.box("metal", 1.2, 0.3 * (i + 1), 0.35, -14.6, 0.15 * (i + 1), 93.5 + i * 0.35);
    // explosive barrel yard
    for (let i = 0; i < 7; i++) this.P("explosive_barrel", 16 + (i % 4) * 0.9, 0.45 + Math.floor(i / 4) * 0.9, 88);
    for (let i = 0; i < 6; i++) this.P("barrel", 19 + (i % 3) * 0.75, 0.3, 92 + Math.floor(i / 3) * 0.8);
    // tire stack & cones slalom
    for (let i = 0; i < 5; i++) this.P("tire", -6, 0.16 + i * 0.31, 60, i * 0.4, { flat: true });
    for (let i = 0; i < 8; i++) this.P("cone", 2 + (i % 2) * 1.5, 0.36, 50 + i * 2.5);
    for (let i = 0; i < 6; i++) this.P("crate", 12 + (i % 2) * 0.66, 0.32 + Math.floor(i / 2) * 0.64, 60);
    this.P("watermelon", 13, 0.2, 58); this.P("monitor", -4, 0.25, 72); this.P("cardboard", -2, 0.2, 75);
    // catapult
    this.buildCatapult(V(26, 0, 58));
    S.zone = "hub";
  }
  buildCatapult(base) {
    const g = this.game, S = this.S, I = g.interact, M = this.M;
    S.box("dark", 1.6, 0.8, 1.0, base.x, 0.4, base.z);
    S.box("metal", 0.12, 1.2, 0.12, base.x - 0.6, 1.0, base.z, { collide: false }); S.box("metal", 0.12, 1.2, 0.12, base.x + 0.6, 1.0, base.z, { collide: false });
    const arm = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 4.2), M.wood); beam.position.z = 0.9; arm.add(beam);
    const cup = new THREE.Group(); const cm = M.dark;
    for (const [w, h, d, x, y, z] of [[0.9, 0.06, 0.9, 0, 0.05, 2.75], [0.9, 0.35, 0.05, 0, 0.2, 2.3], [0.9, 0.35, 0.05, 0, 0.2, 3.2], [0.05, 0.35, 0.9, -0.45, 0.2, 2.75], [0.05, 0.35, 0.9, 0.45, 0.2, 2.75]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cm); m.position.set(x, y, z); cup.add(m); }
    arm.add(cup); arm.traverse((m) => (m.castShadow = true));
    const pivot = base.clone().add(V(0, 1.45, 0));
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3).premultiply(qy(Math.PI)); // bucket end resting low
    arm.position.copy(pivot); arm.quaternion.copy(q0); g.scene.add(arm);
    const e = { kind: "prop", mesh: arm, mass: 40, grabbable: false, jointed: true, sound: "wood", def: { name: "catapult" } };
    const descs = [RAPIER.ColliderDesc.cuboid(0.15, 0.07, 2.1).setTranslation(0, 0, 0.9).setMass(30), RAPIER.ColliderDesc.cuboid(0.45, 0.03, 0.45).setTranslation(0, 0.05, 2.75).setMass(4)];
    for (const [w, h, d, x, y, z] of [[0.45, 0.175, 0.025, 0, 0.2, 2.3], [0.45, 0.175, 0.025, 0, 0.2, 3.2], [0.025, 0.175, 0.45, -0.45, 0.2, 2.75], [0.025, 0.175, 0.45, 0.45, 0.2, 2.75]]) descs.push(RAPIER.ColliderDesc.cuboid(w, h, d).setTranslation(x, y, z).setMass(1));
    g.physics.createBody(e, { pos: pivot, quat: q0, colliders: descs, mat: MATS.wood, mass: 40, angDamp: 0.4 });
    const anc = g.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x, pivot.y, pivot.z).setRotation(q0));
    const d = RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const j = g.physics.world.createImpulseJoint(d, anc, e.body, true);
    j.setLimits(-1.9, 0.05);
    S.box("dark", 0.5, 1.0, 0.5, base.x + 2, 0.5, base.z - 1.5);
    I.button(V(base.x + 2, 1.0, base.z - 1.5), V(0, 1, 0), { color: 0xff3a2a, radius: 0.07, label: "FIRE!", onPress: () => {
      // whip the arm up; the limit stop flings whatever is in the bucket, gravity brings it back down
      const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q0).multiplyScalar(-9);
      e.body.setAngvel(ax, true);
      for (const p of g.props.list) if (p.body && p.mesh.position.distanceTo(pivot) < 4) p.body.wakeUp();
      g.audio.play("whoosh", pivot, { vol: 1, rate: 0.6 }); g.audio.play("clack", pivot, { vol: 1, rate: 0.5 });
    } });
    this.plane(sign("CATAPULT", "LOAD THE BUCKET · PRESS FIRE"), 1.6, 0.4, V(base.x + 2, 1.6, base.z - 1.24), Math.PI);
    this.P("watermelon", base.x, 1.08, base.z - 2.65, 0, { sleep: false }); this.P("crate", base.x - 1.5, 0.32, base.z - 2.5);
  }

  resetPins() {
    const g = this.game;
    this.pins.forEach((p) => { if (!p.dead) g.props.remove(p); });
    this.pins = this.pinSpots.map((s) => g.props.spawn("bowling_pin", s, qy(0), { sleep: true }));
    g.challenges.bowlReset();
  }

  /* ---------------- zones, gravity, lighting ---------------- */
  gravityAt(p) {
    const L = this.lowG;
    if (Math.hypot(p.x - L.x, p.z - L.z) < L.r && p.y < 9.5) return 0.15;
    return 1;
  }
  physicsStep(dt) {
    const g = this.game, gy = g.physics.gravityY, L = this.lowG, B = this.bouncePad;
    for (const e of g.physics.dynamic) {
      const b = e.body; if (!b || b.isSleeping() || (b.gravityScale && b.gravityScale() === 0)) continue;
      const t = b.translation();
      if (Math.hypot(t.x - L.x, t.z - L.z) < L.r && t.y < 9.5) { const m = b.mass(); b.applyImpulse({ x: 0, y: -gy * 0.85 * m * dt, z: 0 }, true); }
      if (Math.hypot(t.x - B.x, t.z - B.z) < B.r && t.y < 0.7) { const v = b.linvel(); if (v.y < 6) { b.setLinvel({ x: v.x, y: 9.5, z: v.z }, true); g.audio.play("rubber", tv(t), { vol: 0.6, rate: 0.6 }); } }
    }
    // the player bounces too
    const f = g.player.feet;
    if (Math.hypot(f.x - B.x, f.z - B.z) < B.r && f.y < 0.4 && g.player.vy <= 0.1) { g.player.bounce(9.5); g.audio.play("rubber", f, { vol: 0.8, rate: 0.5 }); }
  }

  updateVisibility(playerZone) {
    const see = new Set(SEES[playerZone] || Object.keys(ZONES));
    this.visibleZones = see;
    for (const [z, grp] of Object.entries(this.zoneGroups)) grp.visible = see.has(z);
    for (const m of this.decorList || []) m.visible = see.has(m.userData.zone || "hub");
    for (const e of this.game.props.list) if (e.mesh && e.body) { const t = e.body.translation(); e.mesh.visible = see.has(zoneAt(t)); }
    return see;
  }
}
