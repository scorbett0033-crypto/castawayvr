// PROJECT CHAOS — a VR physics sandbox for Meta Quest (WebXR).
import * as THREE from "three";
import { Physics, GROUPS, G, grp, tv } from "./physics.js";
import { Audio } from "./audio.js";
import { generateTextures } from "./textures.js";
import { Assets } from "./assets.js";
import { Props } from "./props.js";
import { FX } from "./fx.js";
import { Player } from "./player.js";
import { Interaction } from "./interaction.js";
import { Weapons } from "./weapons.js";
import { NPCs } from "./npc.js";
import { Interactables } from "./interactables.js";
import { UI } from "./ui.js";
import { World, zoneAt, ZONES } from "./world.js";
import { Challenges } from "./challenges.js";
import { prepareHandAsset } from "./hands.js";

const $ = (id) => document.getElementById(id);
const bar = $("bar").firstElementChild, status = $("status");
const progress = (f, msg) => { bar.style.width = `${Math.round(f * 100)}%`; status.textContent = msg; };
const SAVE_KEY = "projectchaos.v1";
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

const DEFAULT_SETTINGS = { locomotion: "both", turn: "snap45", turnSpeed: 2.4, vignette: true, shadows: true, volume: 0.65, heightOffset: 0 };

const game = {
  time: 0, dt: 0.016, timeScale: 1, stats: {},
  save: { done: {} }, settings: { ...DEFAULT_SETTINGS },
};
window.PC = game; // handy for debugging in the console

function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); game.save.done = s.done || {}; Object.assign(game.settings, s.settings || {}); } catch { /* storage unavailable */ }
}
game.persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ done: game.save.done, settings: game.settings })); } catch { /* ignore */ } };
game.saveSettings = game.persist;

/* ================= renderer & scene ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
renderer.xr.setFramebufferScaleFactor(1.0);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e12);
scene.fog = new THREE.Fog(0x0b0e12, 30, 90);
game.scene = scene; game.renderer = renderer;

const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x3a3530, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2e0, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = sun.shadow.camera.bottom = -9; sun.shadow.camera.right = sun.shadow.camera.top = 9;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// a small procedural environment map so metals and plastics have something to reflect
function makeEnv() {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const col = []; const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 10; const c = new THREE.Color().setHSL(0.58, 0.15, 0.08 + Math.max(0, y) * 0.5); if (y < 0) c.setRGB(0.12, 0.11, 0.1); col.push(c.r, c.g, c.b); }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 1), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.position.set(Math.cos(i) * 6, 7, Math.sin(i) * 6); m.lookAt(0, 0, 0); s.add(m); }
  const env = pm.fromScene(s, 0.04).texture; pm.dispose();
  return env;
}
scene.environment = makeEnv();

// sky dome for the outdoor range
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sunDir: { value: new THREE.Vector3(0.4, 0.55, 0.7).normalize() } },
  vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
  fragmentShader: `varying vec3 vD; uniform vec3 sunDir;
    void main(){ float h = max(vD.y, 0.0);
      vec3 col = mix(vec3(0.93,0.78,0.6), vec3(0.32,0.55,0.86), pow(h, 0.55));
      col = mix(col, vec3(0.62,0.5,0.4), clamp(-vD.y*4.0,0.,1.));
      float s = max(dot(vD, sunDir), 0.0); col += vec3(1.0,0.85,0.6) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
      gl_FragColor = vec4(col, 1.0); }`,
}));
sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);

// zone lighting presets
const LIGHT = {
  hub: { sky: 0xdfeaf5, gnd: 0x3a3836, hi: 1.25, dir: 1.1, dcol: 0xf2f6ff, d: [0.3, 1, 0.2], bg: 0x0b0e12, fog: [40, 110] },
  training: { sky: 0xe8e4dc, gnd: 0x35322e, hi: 1.1, dir: 1.0, dcol: 0xfff2dc, d: [0.1, 1, 0.3], bg: 0x0b0e12, fog: [40, 100] },
  sandbox: { sky: 0xf0ece6, gnd: 0x3c3a36, hi: 1.3, dir: 1.2, dcol: 0xfff6e8, d: [0.25, 1, -0.2], bg: 0x0b0e12, fog: [50, 120] },
  lab: { sky: 0x9fb89a, gnd: 0x1a1d18, hi: 0.32, dir: 0.18, dcol: 0xbfe8b0, d: [0.1, 1, 0.1], bg: 0x050706, fog: [8, 40] },
  labOn: { sky: 0xd8ecd2, gnd: 0x2a2d28, hi: 1.0, dir: 0.8, dcol: 0xe8ffe0, d: [0.1, 1, 0.1], bg: 0x0b0e0c, fog: [30, 80] },
  secret: { sky: 0xb48aff, gnd: 0x2a1840, hi: 0.9, dir: 0.6, dcol: 0xd0a0ff, d: [0.2, 1, 0], bg: 0x0a0612, fog: [20, 60] },
  vault: { sky: 0xffe6b0, gnd: 0x3a3020, hi: 1.1, dir: 0.9, dcol: 0xffe0a0, d: [0.2, 1, 0.1], bg: 0x0b0a08, fog: [20, 60] },
  tunnel: { sky: 0xffd8a8, gnd: 0x2a2620, hi: 0.75, dir: 0.6, dcol: 0xffd8a0, d: [0.1, 1, 0.4], bg: 0x0b0e12, fog: [30, 120] },
  outdoor: { sky: 0xbcd6f2, gnd: 0x8a7458, hi: 1.25, dir: 2.6, dcol: 0xfff0d8, d: [0.4, 0.55, 0.7], bg: 0xbfd2e6, fog: [80, 330] },
};
LIGHT.ncorr = LIGHT.training; LIGHT.ecorr = LIGHT.sandbox; LIGHT.wcorr = LIGHT.hub;
let curLight = { ...LIGHT.hub };
const tmpC = new THREE.Color();
function updateLighting(dt, zone) {
  let L = LIGHT[zone] || LIGHT.hub;
  if (zone === "lab" && game.world.labLightsOn) L = LIGHT.labOn;
  const k = Math.min(1, dt * 3);
  hemi.color.lerp(tmpC.set(L.sky), k); hemi.groundColor.lerp(tmpC.set(L.gnd), k);
  curLight.hi += (L.hi - curLight.hi) * k; curLight.dir += (L.dir - curLight.dir) * k;
  let flick = 1;
  if (zone === "lab" && !game.world.labLightsOn) flick = Math.random() < 0.04 ? 0.3 : 1;
  hemi.intensity = curLight.hi * flick;
  sun.intensity = curLight.dir * flick; sun.color.lerp(tmpC.set(L.dcol), k);
  scene.background.lerp(tmpC.set(L.bg), k); scene.fog.color.copy(scene.background);
  scene.fog.near += (L.fog[0] - scene.fog.near) * k; scene.fog.far += (L.fog[1] - scene.fog.far) * k;
  sky.visible = zone === "outdoor" || zone === "tunnel";
  // shadow frustum follows the player
  const f = game.player.feet;
  _v.set(...L.d).normalize();
  sun.position.set(f.x + _v.x * 18, f.y + _v.y * 18, f.z + _v.z * 18);
  sun.target.position.set(f.x, f.y, f.z);
  const wl = game.world.M.labLight.color; wl.setScalar(game.world.labLightsOn ? 1 : Math.random() < 0.05 ? 0.1 : 0.35);
}
game.applyShadows = () => { sun.castShadow = !!game.settings.shadows; };

/* ================= game services ================= */
game.toast = (a, b = "", col) => game.ui.notify(a, b, col);
game.noise = (pos, loud, kind) => game.npcs.hear(pos, loud, kind);
game.setGravity = (y) => { game.physics.setGravity(y); game.toast(y === 0 ? "ZERO GRAVITY" : y > -5 ? "MOON GRAVITY" : "EARTH GRAVITY"); };
game.freezeAll = () => { for (const e of game.physics.dynamic) if (e.body && !e.heldBy?.length) { e.body.setLinvel({ x: 0, y: 0, z: 0 }, false); e.body.setAngvel({ x: 0, y: 0, z: 0 }, false); e.body.sleep(); } game.toast("MOTION FROZEN"); };
game.clearDebris = () => { for (const r of [...game.props.records]) { r.pieces.forEach((p) => game.props.removePiece(p)); game.props.records.delete(r); } for (const d of [...game.weapons.darts]) game.weapons.removeDart(d); game.weapons.darts.length = 0; game.toast("Debris cleared"); };
game.secretFound = () => {};
function inFront(dist = 0.9, up = -0.1) {
  const P = game.player, head = P.headWorld(new THREE.Vector3());
  const yaw = P.xr ? P.headYaw() : P.yaw;
  return head.add(new THREE.Vector3(-Math.sin(yaw) * dist, up, -Math.cos(yaw) * dist));
}
game.spawnInFront = (type) => {
  const p = inFront(0.9, -0.15);
  const hit = game.physics.ray(game.player.headWorld(new THREE.Vector3()), p.clone().sub(game.player.headWorld(new THREE.Vector3())).normalize(), 0.9, grp(0xffff, G.STATIC));
  if (hit) p.copy(hit.point).addScaledVector(hit.normal, 0.4);
  const e = game.props.spawn(type, p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), game.player.yaw), { spawned: true });
  if (e) { game.audio.play("servo", p, { vol: 0.3, rate: 2 }); game.fx.burst(p, 0x46e6ff, 18, 1, 0.015, 0); }
};
game.spawnTed = (pos) => {
  if (game.npcs.list.length >= 12) { game.toast("TED LIMIT REACHED", "12 units max"); return; }
  const z = zoneAt(pos), r = ZONES[z];
  const zone = [Math.max(r[0] + 1, pos.x - 6), Math.max(r[1] + 1, pos.z - 6), Math.min(r[2] - 1, pos.x + 6), Math.min(r[3] - 1, pos.z + 6)];
  const n = game.npcs.spawn(pos.clone().setY(Math.max(0, pos.y - 0.1)), zone, { yaw: game.player.yaw + Math.PI });
  if (n) { game.audio.chirp(pos, "happy"); game.fx.burst(pos.clone().setY(1), 0x46e6ff, 30, 1.5, 0.02, 0); }
};
game.spawnTedInFront = () => { const p = inFront(1.6, 0); p.y = game.player.feet.y; game.spawnTed(p); };

// Explosions: impulse, damage (chain reactions!), ragdolls, noise
const pendingBlasts = [];
game.explode = (pos, power = 1) => {
  const fx = game.fx;
  fx.flash(pos, 0xffa040, 30 * power, 0.35);
  fx.burst(pos, 0xffb040, 60, 7, 0.05, 0.3); fx.burst(pos, 0xff4010, 30, 4, 0.08, 0.2);
  fx.smoke(pos, 30, 0x3a3430, 0.45);
  game.noise(pos, 2.5, "explosion");
  game.onExplode && game.onExplode();
  const R = 5.5 * power;
  game.physics.overlapBall(pos, R, grp(0xffff, G.PROP | G.DEBRIS | G.RAGDOLL | G.NPC | G.HELD), (c, e) => {
    if (!e) return;
    if (e.kind === "npc") { e.npc.blast(pos, null, 20 * power); return; }
    if (!e.body || !e.body.isDynamic()) return;
    const t = tv(e.body.translation()); const d = t.distanceTo(pos); const dir = t.sub(pos).normalize();
    const s = Math.min(e.body.mass() * 14, 140) * (1 - d / R) * power;
    e.body.applyImpulse({ x: dir.x * s, y: dir.y * s + s * 0.5, z: dir.z * s }, true);
    if (e.kind === "prop" && e.def?.breakable && !e.breaking) pendingBlasts.push({ e, dmg: 120 * (1 - d / R), at: game.time + 0.08 + Math.random() * 0.15 });
  });
  const pd = game.player.feet.distanceTo(pos);
  if (pd < 4) { game.player.vy = Math.max(game.player.vy, 4 * (1 - pd / 4)); for (const h of Object.values(game.player.hands)) h.haptic(1, 200); }
};

// Contact impacts → sound, damage, NPC reactions
const impactCD = new Map();
function onImpact(a, b, speed, force) {
  const t = game.time;
  const key = (a.body?.handle ?? 0) * 7919 + (b.body?.handle ?? 0);
  const last = impactCD.get(key) || 0;
  const dyn = (e) => e.body && e.body.isDynamic && e.body.isDynamic();
  const ma = dyn(a) ? a.mass || 1 : 1e6, mb = dyn(b) ? b.mass || 1 : 1e6;
  // darts & targets
  if (a.kind === "dart") game.weapons.dartImpact(a, b, speed); else if (b.kind === "dart") game.weapons.dartImpact(b, a, speed);
  for (const [x, y] of [[a, b], [b, a]]) {
    if (x.kind === "target" && speed > 2.5 && (y.mass || 0) > 0.05) { const T = game.interact.targets.find((q) => q.ent === x); T && game.interact.knockTarget(T); }
    if (x.kind === "npc") x.npc.impact(y, speed);
    if (x.kind === "ragdoll" && speed > 6 && y.kind !== "ragdoll") x.npc.damage(speed * 1.5);
    if (x.kind === "brick" && dyn(y) && y.mass * speed > 30) game.world.hitWall(y.mass * speed * 0.8, tv(y.body.translation()));
    if (x.kind === "prop" && x.def?.breakable) {
      const mEff = ma < 1e5 && mb < 1e5 ? (ma * mb) / (ma + mb) : Math.min(ma, mb);
      const dmg = 0.5 * mEff * speed * speed;
      const minJ = x.def.breakable.kind === "glass" ? 1.5 : x.def.breakable.hp * 0.12;
      if (dmg > minJ) game.props.damage(x, dmg, null);
    }
  }
  if (t - last < 0.07) return;
  impactCD.set(key, t);
  // sound from the lighter / more interesting body
  const src = a.sound === "glass" || b.sound === "glass" ? (a.sound === "glass" ? a : b) : ma <= mb ? a : b;
  const other = src === a ? b : a;
  if (!src.body) return;
  const p = tv(src.body.translation());
  const m = Math.min(ma, mb) > 1e5 ? 1 : Math.min(ma, mb);
  if (src.sound) game.audio.impact(src.sound, p, speed, m);
  if (other.sound && other.kind !== "static" && other.sound !== src.sound && speed > 1.5) game.audio.impact(other.sound, p, speed * 0.6, Math.min(other.mass || 1, 30));
  if (m * speed > 45) game.noise(p, Math.min(1.2, m * speed / 120), "impact");
  for (const e of [a, b]) if (e.heldBy?.length) for (const h of e.heldBy) h.haptic(Math.min(1, speed / 6), 25);
}

/* ================= boot ================= */
async function boot() {
  loadSave();
  progress(0.02, "Starting physics engine…");
  game.physics = new Physics(); await game.physics.init();
  game.physics.onImpact = onImpact;
  game.audio = new Audio();
  progress(0.08, "Generating materials…");
  game.T = await generateTextures((f, n) => progress(0.08 + f * 0.3, `Generating materials… ${n}`));
  progress(0.4, "Loading models…");
  game.assets = new Assets();
  const models = ["volt_blaster", "toy_pistol", "grav_gun", "mender", "wrench", "frying_pan", "sledgehammer", "crate", "barrel", "explosive_barrel", "cone", "extinguisher", "monitor", "watermelon", "duck", "tire", "toolbox", "lab_chair", "bowling_pin", "server_rack", "plant", "ted", "hand"];
  await game.assets.load(models, "./models", (f, n) => progress(0.4 + f * 0.45, `Loading models… ${n}`));
  progress(0.87, "Building the facility…");
  await new Promise((r) => setTimeout(r, 0));
  if (game.assets.gltf.hand) prepareHandAsset(game.assets.gltf.hand);
  game.fx = new FX(scene);
  game.interact = new Interactables(game);
  game.props = new Props(game);
  game.player = new Player(game);
  game.weapons = new Weapons(game);
  game.interaction = new Interaction(game);
  game.npcs = new NPCs(game);
  game.ui = new UI(game);
  game.world = new World(game);
  game.challenges = new Challenges(game);
  game.secretFound = (id) => game.challenges.complete(id);
  game.world.build();
  if (game.assets.gltf.ted) {
    game.npcs.init(game.assets.gltf.ted);
    const N = game.npcs;
    N.spawn(new THREE.Vector3(-3, 0, -3), [-7.5, -7.5, 7.5, 7.5], { yaw: 0.6 });
    N.spawn(new THREE.Vector3(3.5, 0, 2), [-7.5, -7.5, 7.5, 7.5], { yaw: -2 });
    N.spawn(new THREE.Vector3(-4, 0, -13.5), [-6.5, -14.8, 6.5, -12.5], { yaw: 3.1 });
    N.spawn(new THREE.Vector3(18, 0, -1), [14, -10, 34, 10], { yaw: 1 });
    N.spawn(new THREE.Vector3(-20.5, 0, 0.4), [-31, -8, -14, 8], { yaw: -1.2, disabled: true });
    N.spawn(new THREE.Vector3(-8, 0, 55), [-20, 45, 25, 110], { yaw: 3 });
    N.spawn(new THREE.Vector3(10, 0, 78), [-20, 45, 25, 110], { yaw: 2 });
  }
  game.challenges.drawBoard();
  game.player.feet.set(0, 0.02, 3);
  game.player.respawn();
  game.applyShadows();
  progress(1, "Ready.");
  const vrBtn = $("vrBtn"), deskBtn = $("deskBtn");
  deskBtn.disabled = false;
  if (navigator.xr && (await navigator.xr.isSessionSupported("immersive-vr").catch(() => false))) { vrBtn.disabled = false; }
  else { vrBtn.textContent = "VR not available"; }
  vrBtn.onclick = startVR;
  deskBtn.onclick = startDesktop;
  game.player.initXR(renderer);
  renderer.setAnimationLoop(frame);
}

async function startVR() {
  game.audio.init(); game.audio.setVolume(game.settings.volume);
  try {
    const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] });
    await renderer.xr.setSession(session);
    try { renderer.xr.setFoveation(0.5); } catch { /* optional */ }
    game.player.xr = true;
    $("overlay").classList.add("hidden"); $("crosshair").style.display = "none"; $("dhud").style.display = "none";
    startAmbience();
    session.addEventListener("end", () => { game.player.xr = false; $("overlay").classList.remove("hidden"); $("vrBtn").textContent = "Re-enter VR"; });
  } catch (e) { status.textContent = "Could not start VR: " + e.message; }
}
function startDesktop() {
  game.audio.init(); game.audio.setVolume(game.settings.volume);
  game.player.initDesktop(renderer.domElement);
  $("overlay").classList.add("hidden"); $("crosshair").style.display = "block"; $("dhud").style.display = "block";
  renderer.domElement.requestPointerLock?.();
  startAmbience();
}
let amb = null, wind = null;
function startAmbience() { if (amb) return; amb = game.audio.loop("hum", null, 0.05); wind = game.audio.loop("wind", null, 0); }

addEventListener("resize", () => { if (renderer.xr.isPresenting) return; game.player && (game.player.camera.aspect = innerWidth / innerHeight, game.player.camera.updateProjectionMatrix()); renderer.setSize(innerWidth, innerHeight); });

/* ================= frame loop ================= */
const clock = new THREE.Clock();
let zone = "hub", visT = 0, stepAcc = 0;
const raycaster = new THREE.Raycaster();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!game.paused) update(dt);
  game.audio.updateListener(game.player.camera);
  renderer.render(scene, game.debugCam || game.player.camera);
}
// deterministic stepping for automated tests: PC.paused = true; PC.step(60)
game.step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) update(dt); };
function update(dt) {
  game.dt = dt; game.time += dt;
  const P = game.player;
  P.update(dt);
  game.ui.update(dt);
  if (!game.ui.menuOpen || !P.xr) game.interaction.update(dt);
  if (!game.ui.menuOpen) game.weapons.update(dt);
  game.interact.update(dt);
  // desktop: click buttons / levers with the mouse when nothing is held
  if (P.desktop && !P.xr && !game.ui.menuOpen && P.mouse.l && !P._lLatch && !P.hands.right.held) {
    raycaster.setFromCamera({ x: 0, y: 0 }, P.camera); game.interact.pick(raycaster);
  }
  P._lLatch = P.mouse.l;
  game.npcs.update(dt);
  // physics: fixed-size substeps scaled by the time dial
  const sdt = dt * game.timeScale;
  const n = Math.max(1, Math.ceil(sdt / (1 / 72) - 0.01));
  const h = sdt / n;
  for (let i = 0; i < n; i++) {
    game.interaction.step(h);
    game.weapons.step(h);
    game.world.physicsStep(h);
    game.physics.step(h);
  }
  for (let i = pendingBlasts.length - 1; i >= 0; i--) { const b = pendingBlasts[i]; if (game.time >= b.at) { pendingBlasts.splice(i, 1); if (!b.e.dead) game.props.damage(b.e, b.dmg); } }
  game.physics.sync();
  game.npcs.postPhysics();
  game.interaction.postPhysics();
  game.challenges.update(dt);
  game.fx.update(dt);
  // zones: visibility + lighting + ambience
  zone = zoneAt(P.feet);
  if ((visT -= dt) <= 0) { visT = 0.3; game.world.updateVisibility(zone); }
  updateLighting(dt, zone);
  if (amb) { amb.setVol(zone === "outdoor" ? 0.0 : 0.05); wind.setVol(zone === "outdoor" ? 0.18 : zone === "tunnel" ? 0.05 : 0); }
  if (game.world.holo) game.world.holo.rotation.y += dt * 0.3;
}

boot().catch((e) => { console.error(e); status.textContent = "Failed to start: " + e.message; });
