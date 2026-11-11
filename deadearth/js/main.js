// READY PLAYER 2 — VR arena shooter.
// Nova Hub lobby (benches, armory, wardrobe, arena portal) + the dead-Earth arena.
import * as THREE from "three";
import { generateTextures, canvasTex } from "./textures.js";
import { Wind } from "./sky.js";
import { makeHand, outfitFor } from "./avatar.js";
import { Human, loadHumanAssets, ensureModel } from "./human.js";
import { WEAPONS, weaponById, buildGun, GunState, makeWeaponMaterials } from "./weapons.js";
import { buildLobby } from "./lobby.js";
import { buildWasteland, ARENA_R } from "./wasteland.js";
import { EnemyManager } from "./enemies.js";
import { FX } from "./fx.js";
import { Sfx } from "./audio.js";
import { save, persist, addCoins, trySpend, onSave } from "./save.js";
import { ShopPanel, WardrobePanel, WristHUD, Panel, makeLaser } from "./ui.js";
import { Loot } from "./loot.js";
import { makeWarp } from "./warp.js";

const $ = (id) => document.getElementById(id);
const loadBar = $("loadbar"), loadTxt = $("loadtxt");

/* ================= renderer / camera / rig ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
renderer.xr.setFoveation(0.6);
$("app").appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 2000);
const rig = new THREE.Group();
rig.add(camera);
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* camera-attached overlays (hurt vignette + fade) */
function cameraShell(color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uAmt: { value: 0 }, uEdge: { value: color === 0 ? 0 : 1 } },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 uColor; uniform float uAmt, uEdge; varying vec3 vP; void main(){ float e = smoothstep(0.15, 1.0, 1.0 + vP.z / 0.25); float a = mix(1.0, e, uEdge) * uAmt; gl_FragColor = vec4(uColor, a); }",
  }));
  m.renderOrder = 999; m.frustumCulled = false;
  camera.add(m);
  return m.material.uniforms.uAmt;
}
const hurtAmt = cameraShell(0x9a0000);
const fadeAmt = cameraShell(0x000000);

/* ================= game state ================= */
const sfx = new Sfx();
const fx = new FX();
let T, WM, lobby, waste, enemies, shop, wardrobe, stakePanel, wrist, playerAvatar;
let mode = "loading";
let scene = null;
const surfaceWind = new Wind(5.5, 0.7);
const player = { hp: 100, regenT: 0, seated: null, dead: false, extractT: 0, beaconT: 0, kills: 0, runCoins: 0, carried: 0, stake: 0, stakeSel: 0, moving: false,
  wound: null, bleedT: 0, ammoBleedT: 0, bandages: 2, medkits: 1, healHold: 0 };
const loot = new Loot();
const START_ROUNDS = 150;
const STAKES = [50, 100, 250, 500, 1000];
const gunStates = new Map();
let gun = null, gunState = null, gunId = null;
const gunCache = new Map();
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
let fade = { t: 0, dir: 0, then: null };

/* ================= XR hands ================= */
const hands = { left: null, right: null };
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.7 });
for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(controller, grip);
  const hand = { controller, grip, source: null, prev: [], laser: makeLaser(), glove: null, carryMag: null, turnReady: true };
  controller.add(hand.laser);
  controller.addEventListener("connected", (e) => {
    hand.source = e.data;
    const side = e.data.handedness === "left" ? -1 : 1;
    hand.side = e.data.handedness;
    if (!hand.glove) {
      hand.glove = makeHand(side, handSkin(save.look));
      hand.glove.rotation.set(0.2, 0, (Math.PI / 2) * side);
      hand.glove.position.set(0, -0.01, 0.04);
      grip.add(hand.glove);
    }
    if (e.data.handedness === "left" || e.data.handedness === "right") hands[e.data.handedness] = hand;
  });
  controller.addEventListener("disconnected", () => { if (hand.side) hands[hand.side] = null; hand.source = null; });
}
// first-person hands use your character's skin tone
function handSkin(look) {
  const o = outfitFor(look), f = look.body === "female";
  return o.rig === "meshy" ? (f ? 0xe5c4ad : 0xc9a48e) : (f ? 0xdcb49c : 0xc49a80);
}
function retintHands(look) { for (const h of [hands.left, hands.right]) h?.glove?.userData.setSkin?.(handSkin(look)); }
function pad(hand) { return hand && hand.source && hand.source.gamepad; }
function btn(hand, i) { const g = pad(hand); return !!(g && g.buttons[i] && g.buttons[i].pressed); }
function btnVal(hand, i) { const g = pad(hand); return g && g.buttons[i] ? g.buttons[i].value : 0; }
function pressed(hand, i) { return btn(hand, i) && !hand.prev[i]; }
function stick(hand) {
  const g = pad(hand); if (!g) return [0, 0];
  const a = g.axes;
  const x = a.length >= 4 ? a[2] : a[0] || 0, y = a.length >= 4 ? a[3] : a[1] || 0;
  return [Math.abs(x) > 0.15 ? x : 0, Math.abs(y) > 0.15 ? y : 0];
}
function latchButtons() { for (const h of [hands.left, hands.right]) { const g = pad(h); if (g) h.prev = g.buttons.map((b) => b.pressed); } }
function haptic(hand, intensity, ms) {
  const g = pad(hand);
  const a = g && (g.hapticActuators?.[0] || g.vibrationActuator);
  try { if (a?.pulse) a.pulse(intensity, ms); else if (a?.playEffect) a.playEffect("dual-rumble", { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity }); } catch { /* not supported */ }
}

/* ================= desktop controls ================= */
const keys = {};
let yaw = 0, pitch = 0, mouseDown = false, mouseClicked = false, thirdPerson = false;
addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyV") thirdPerson = !thirdPerson;
  if (e.code === "KeyE") desktopUse();
  if (e.code === "KeyR" && mode === "surface" && gunState?.startTimedReload()) { sfx.magOut(); gun.userData.mag.visible = false; }
  if (/^Digit[1-6]$/.test(e.code)) { const w = WEAPONS[+e.code.slice(5) - 1]; if (w && save.weapons.includes(w.id)) equip(w.id); }
  if (e.code === "KeyL" && mode === "surface") goLobby("Extracted.");
  if (e.code === "KeyG" && mode === "surface") flickCollect();
});
addEventListener("keyup", (e) => (keys[e.code] = false));
renderer.domElement.addEventListener("mousedown", (e) => {
  sfx.init();
  if (document.pointerLockElement !== renderer.domElement) { renderer.domElement.requestPointerLock?.(); return; }
  if (e.button === 0) { mouseDown = true; mouseClicked = true; }
});
addEventListener("mouseup", () => (mouseDown = false));
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== renderer.domElement || renderer.xr.isPresenting) return;
  yaw -= e.movementX * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.45, 1.45);
});
addEventListener("wheel", (e) => {
  if (mode !== "surface") return;
  const owned = WEAPONS.filter((w) => save.weapons.includes(w.id));
  const i = owned.findIndex((w) => w.id === gunId);
  equip(owned[(i + (e.deltaY > 0 ? 1 : owned.length - 1)) % owned.length].id);
});

/* ================= weapons ================= */
function equip(id) {
  if (gun) gun.parent?.remove(gun);
  gunId = id;
  if (!gunCache.has(id)) gunCache.set(id, buildGun(id, WM));
  gun = gunCache.get(id);
  if (!gunStates.has(id)) gunStates.set(id, new GunState(weaponById(id)));
  gunState = gunStates.get(id);
  gun.userData.mag.visible = !gunState.magOut;
  gun.userData.setAmmo(gunState.ammo, gunState.def.mag);
  if (mode === "surface") scene.add(gun);
  if (hands.left?.carryMag) { hands.left.carryMag.parent?.remove(hands.left.carryMag); hands.left.carryMag = null; }
  if (gunState.magOut && gunState.reloadT <= 0) giveLeftMag();
  sfx.click();
}
function giveLeftMag() {
  const L = hands.left;
  if (!L || !renderer.xr.isPresenting) return;
  const m = gun.userData.magBuilder();
  m.position.set(0, -0.02, -0.02); m.rotation.set(0, 0, 0); m.visible = true;
  L.grip.add(m); L.carryMag = m;
}
const dropped = [];
function ejectMag() {
  if (!gunState || gunState.magOut || gunState.reloadT > 0) return;
  gunState.magOut = true;
  const m = gun.userData.magBuilder();
  gun.userData.mag.getWorldPosition(m.position);
  gun.getWorldQuaternion(m.quaternion);
  m.userData.vel = new THREE.Vector3(0, -1, 0); m.userData.life = 6;
  scene.add(m); dropped.push(m);
  gun.userData.mag.visible = false;
  gunState.ammo = 0;
  gun.userData.setAmmo(0, gunState.def.mag);
  sfx.magOut();
  haptic(hands.right, 0.4, 40);
  giveLeftMag();
}

const raycaster = new THREE.Raycaster();
const shotDir = new THREE.Vector3(), muzzleW = new THREE.Vector3();
function fire() {
  const def = gunState.def;
  gunState.fire();
  gun.userData.setAmmo(gunState.ammo, def.mag);
  const muzzle = gun.userData.muzzle;
  muzzle.getWorldPosition(muzzleW);
  // aim ray: VR = barrel, desktop = screen centre
  const origin = new THREE.Vector3(), baseDir = new THREE.Vector3();
  if (renderer.xr.isPresenting) { origin.copy(muzzleW); baseDir.set(0, 0, -1).applyQuaternion(gunAimQuat); }
  else { camera.getWorldPosition(origin); camera.getWorldDirection(baseDir); }
  const spread = THREE.MathUtils.degToRad(def.spread * (1 + gunState.bloom * 1.5)) * (twoHanded ? 0.6 : 1);
  let gotKill = false, hitSomething = false;
  for (let p = 0; p < def.pellets; p++) {
    shotDir.copy(baseDir);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const ortho1 = tmpV.set(0, 1, 0).cross(shotDir).normalize(), ortho2 = tmpV2.crossVectors(shotDir, ortho1);
    shotDir.addScaledVector(ortho1, Math.cos(a) * r).addScaledVector(ortho2, Math.sin(a) * r).normalize();
    const world = waste.raycastWorld(origin, shotDir, def.range);
    const worldDist = world ? world.dist : def.range;
    const hits = enemies.raycast(origin, shotDir, worldDist);
    let end = origin.clone().addScaledVector(shotDir, worldDist);
    let stopped = false;
    for (const h of hits) {
      if (h.bolt) { if (!h.bolt.dead) { enemies.destroyBolt(h.bolt); addReward(5, h.point); } end = h.point; stopped = !def.pierce; if (stopped) break; continue; }
      const wasDead = h.enemy.dead;
      const reward = enemies.damage(h.enemy, def.dmg * (h.weak ? 2.5 : 1), h.point, shotDir);
      hitSomething = true;
      if (!wasDead && h.enemy.dead) {
        gotKill = true; player.kills++; save.stats.kills++;
        if (h.enemy.kind === "rival") toast(`Raider ${h.enemy.name} is down — flick your wrist and look at it to pull in their coins${renderer.xr.isPresenting ? "" : " (G)"}.`);
      }
      if (reward) addReward(reward, h.point);
      if (!def.pierce) { end = h.point; stopped = true; break; }
    }
    if (!stopped && world) {
      if (world.surface === "metal") { fx.sparks(world.point, world.normal, 10); if (Math.random() < 0.3) sfx.ricochet(); }
      else if (world.surface === "soft") fx.dust(world.point, world.normal);
      else { fx.dust(world.point, world.normal); fx.sparks(world.point, world.normal, 4, 0xd0a070); }
      if (world.surface !== "soft") fx.decal(world.point, world.normal);
    }
    if (def.id === "lancer") fx.rail(muzzleW, end);
    else if (p % 3 === 0) fx.tracer(muzzleW, end, def.id === "dmr" ? 0xffe8c0 : 0xffc080);
  }
  if (hitSomething) sfx.hit();
  fx.muzzle(muzzle);
  fx.flash(muzzleW, def.id === "lancer" ? 0x60f0ff : 0xffb060, def.id === "shotgun" ? 0.9 : 0.5);
  if (def.id !== "lancer") {
    const ej = gun.userData.eject.getWorldPosition(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(gun.quaternion);
    fx.casing(ej, right.multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 1.8, 0)));
  }
  sfx.gun(def.sound);
  haptic(hands.right, Math.min(1, 0.35 + def.recoil * 3), def.id === "shotgun" || def.id === "dmr" || def.id === "lancer" ? 90 : 35);
  if (twoHanded) haptic(hands.left, 0.3, 30);
  if (!renderer.xr.isPresenting) pitch += def.recoil * 0.25;
  if (gotKill) haptic(hands.right, 0.8, 60);
}

/* floating "+25 ¢" rewards */
const popTexCache = new Map();
const pops = [];
function addReward(n, pos, label = "") {
  player.carried += n; player.runCoins += n; sfx.coin();
  const key = label ? `+${n} ¢ ${label}` : `+${n} ¢`;
  if (!popTexCache.has(key)) popTexCache.set(key, canvasTex(512, 96, (ctx) => {
    ctx.font = "800 56px Segoe UI, Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 8; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText(key, 256, 48);
    ctx.fillStyle = "#ffd25a"; ctx.fillText(key, 256, 48);
  }));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: popTexCache.get(key), depthTest: false, transparent: true, toneMapped: false }));
  s.position.copy(pos); s.scale.set(2.4, 0.45, 1); s.renderOrder = 50; s.userData.life = 1.4;
  scene.add(s); pops.push(s);
}

/* ================= wounds: bleeding coins and ammo ================= */
// where the wound is: on the chest, under the head, facing the way you look
function woundPos() {
  const f = camera.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize();
  return headW.clone().add(new THREE.Vector3(0, -0.48, 0)).addScaledVector(f, 0.14);
}
// drip `n` coins out of the wound (they're yours: grab them and press them back in)
function bleed(n, dir) {
  const coins = Math.min(player.carried, n * (player.wound?.bad ? 3 : 2));
  if (coins <= 0) return;
  player.carried -= coins;
  const f = camera.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize();
  loot.spillCoins(woundPos(), coins, "self", { maxN: n, speed: 0.6, up: 0.6, dir: f.multiplyScalar(0.9) });
}
let lastCoinSfx = 0;
function coinIn(c) {
  player.carried += c.value; player.runCoins += c.value;
  const now = performance.now(); if (now - lastCoinSfx > 60) { sfx.coin(); lastCoinSfx = now; }
}
// put coins back: they fly into the wound
function returnToWound(coins) {
  if (!coins.length) return;
  loot.fly(coins, () => woundPos(), coinIn, 0.03);
}
// flick your wrist and look at it: every dropped coin nearby flies to your wrist
const flick = { t: -9, q: new THREE.Quaternion(), has: false };
function flickCollect() {
  const coins = loot.near(headW, 14, "drop");
  if (!coins.length) { toast("No dropped coins nearby."); return; }
  const L = hands.left, xr = renderer.xr.isPresenting;
  const target = xr && L ? L.grip : () => camera.localToWorld(new THREE.Vector3(-0.15, -0.25, -0.35));
  loot.fly(coins, target, (c) => { coinIn(c); if (xr && L) haptic(L, 0.15, 10); }, 0.02);
  sfx.coin();
}
const woundW = new THREE.Vector3(), gripW = new THREE.Vector3();
function updateWounds(dt, xr, L, R) {
  if (player.dead) return;
  const w = player.wound;
  if (w) {
    player.bleedT -= dt;
    if (player.bleedT <= 0) { player.bleedT = w.bad ? 0.45 : 1.1; bleed(1); }
    if (w.bad && GunState.pool) {
      player.ammoBleedT -= dt;
      if (player.ammoBleedT <= 0) {
        player.ammoBleedT = 3.5;
        const r = Math.min(GunState.pool.rounds, 12);
        if (r > 0) { GunState.pool.rounds -= r; loot.dropAmmo(woundPos(), r); }
      }
      player.hp = Math.max(1, player.hp - dt * 0.8); // a bad wound slowly weakens you
    }
  }
  woundW.copy(woundPos());
  // VR: squeeze the left grip near your coins to scoop them up, then press them into the wound
  if (xr && L && !twoHanded) {
    L.grip.getWorldPosition(gripW);
    if (btn(L, 1)) {
      const near = loot.near(gripW, 0.16, "self");
      if (near.length) { loot.hold(near, L.grip); haptic(L, 0.3, 20); }
      const held = loot.heldBy(L.grip);
      if (held.length && gripW.distanceTo(woundW) < 0.22) { loot.take(held); held.forEach(coinIn); haptic(L, 0.6, 40); }
    } else if (loot.heldBy(L.grip).length) loot.release(L.grip);
    // wrist flick (fast twist) then look at the watch = pull dropped coins in
    const q = L.grip.getWorldQuaternion(tmpQ);
    if (flick.has) { const ang = 2 * Math.acos(Math.min(1, Math.abs(flick.q.dot(q)))); if (ang / Math.max(dt, 1e-3) > 7) flick.t = clock.elapsedTime; }
    flick.q.copy(q); flick.has = true;
    if (clock.elapsedTime - flick.t < 0.8) {
      const toWrist = gripW.clone().sub(headW).normalize(), fwd = camera.getWorldDirection(new THREE.Vector3());
      const face = new THREE.Vector3(0, 0, 1).applyQuaternion(wrist.mesh.getWorldQuaternion(new THREE.Quaternion()));
      if (fwd.dot(toWrist) > 0.85 && face.dot(toWrist.clone().negate()) > 0.4 && loot.near(headW, 14, "drop").length) { flick.t = -9; flickCollect(); }
    }
  }
  // patch it up: hold X (VR) or H (desktop) — bandage for a light wound, medkit for a bad one
  const holding = xr ? btn(L, 4) : !!keys.KeyH;
  if (w && holding) {
    player.healHold += dt;
    if (player.healHold > 1.2) {
      player.healHold = 0;
      if (w.bad) {
        if (player.medkits > 0) { player.medkits--; player.wound = null; player.hp = Math.min(100, player.hp + 40); toast("Medkit applied — the bleeding stopped."); sfx.click(); }
        else if (player.bandages > 0) { player.bandages--; w.bad = false; toast("A bandage won't close this — it's slowed down. You need a medkit."); sfx.click(); }
        else { toast("No medkits or bandages left!"); sfx.deny(); }
      } else if (player.bandages > 0) { player.bandages--; player.wound = null; toast("Bandaged — the bleeding stopped."); sfx.click(); }
      else if (player.medkits > 0) { player.medkits--; player.wound = null; player.hp = Math.min(100, player.hp + 40); toast("Used a medkit — the bleeding stopped."); sfx.click(); }
      else { toast("No bandages left!"); sfx.deny(); }
    }
  } else player.healHold = 0;
  // ammo boxes: grab them (left grip in VR, E on desktop)
  if (xr && L && btn(L, 1) && !twoHanded) takeAmmo(gripW, 0.22);
  // desktop hint
  if (!xr) {
    const mine = loot.near(headW, 3, "self").length;
    if (w) desktopPrompt = `${w.bad ? "BLEEDING BADLY" : "BLEEDING"} — ${mine ? "E: pick up your coins · " : ""}hold H: ${w.bad ? "medkit" : "bandage"}${player.healHold > 0 ? " " + Math.round(player.healHold / 1.2 * 100) + "%" : ""}`;
    else if (mine) desktopPrompt = "E: pick up your coins and put them back";
    else if (loot.boxes.some((b) => b.mesh.position.distanceTo(headW) < 2.4)) desktopPrompt = "E: pick up the ammo";
    else if (loot.near(headW, 14, "drop").length) desktopPrompt = "G: flick your wrist to pull the dropped coins in";
  }
}

function hurtPlayer(dmg, dir, src) {
  const R = hands.right, L = hands.left;
  if (player.dead) return;
  player.hp -= dmg; player.regenT = 4; hurtAmt.value = Math.min(1, hurtAmt.value + 0.6);
  sfx.hurt(); haptic(R, 0.9, 120); haptic(L, 0.9, 120);
  // every hit opens (or worsens) a wound that bleeds coins; a hard hit spurts some straight away
  const bad = dmg >= 18 || (!!player.wound && dmg >= 8);
  if (!player.wound) { player.wound = { bad }; player.bleedT = 0.4; toast(bad ? "Badly wounded! You're bleeding coins and ammo — grab them back, then use a medkit." : "You're bleeding coins — grab them back and press them into the wound, then bandage it."); }
  else if (bad && !player.wound.bad) { player.wound.bad = true; toast("The wound is bad now — you need a medkit."); }
  if (player.hp > 0) bleed(bad ? 4 : 1, dir);
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true;
    const lost = player.carried;
    let msg;
    // everything you carried spills out: coins and every round of ammo
    const p = woundPos();
    if (lost > 0) loot.spillCoins(p, lost, "drop", { maxN: 45, speed: 2.2, up: 2 });
    if (GunState.pool?.rounds) { loot.dropAmmo(p, GunState.pool.rounds); GunState.pool.rounds = 0; }
    gunStates.forEach((g) => (g.ammo = 0));
    if (src && src.kind === "rival") {
      enemies.creditKiller(src, lost);
      const wrist = enemies.wristOf(src);
      if (wrist) setTimeout(() => loot.fly(loot.near(p, 6, "drop"), wrist, () => {}), 900); // the killer flicks them in
      msg = `${src.name} killed you and took your ${lost} ¢ and all your ammo.`;
    } else msg = `Killed by ${src ? src.name : "the wasteland"}. Your ${lost} ¢ and your ammo are lost in the ash.`;
    player.carried = 0; player.wound = null;
    toast(msg);
    setTimeout(() => goLobby(msg), 3000);
  }

}

/* ================= transitions ================= */
function startFade(then) { fade = { t: 0, dir: 1, then }; }
function placeRig(pos, yawAngle) {
  rig.position.copy(pos);
  rig.rotation.set(0, renderer.xr.isPresenting ? yawAngle : 0, 0);
  yaw = yawAngle; pitch = 0;
}
function setScene(s) {
  scene = s;
  s.add(rig);
  fx.attach(s);
  if (playerAvatar) s.add(playerAvatar.root);
}
function enterLobby(msg) {
  mode = "lobby";
  if (gun) gun.parent?.remove(gun);
  enemies.clear();
  enemies.active = false;
  dropped.forEach((m) => m.parent?.remove(m)); dropped.length = 0;
  pops.forEach((p) => p.parent?.remove(p)); pops.length = 0;
  if (hands.left?.carryMag) { hands.left.carryMag.parent?.remove(hands.left.carryMag); hands.left.carryMag = null; }
  loot.clear(); GunState.pool = null; player.wound = null;
  setScene(lobby.scene);
  placeRig(lobby.spawn.pos, lobby.spawn.yaw);
  lobby.closeDoor();
  player.hp = 100; player.dead = false; player.seated = null;
  gunStates.forEach((g) => { g.ammo = g.def.mag; g.magOut = false; g.reloadT = 0; });
  fx.heightAt = () => 0;
  player.carried = 0; player.stake = 0; player.stakeSel = 0; lobby.setArmed(false);
  if (save.coins < STAKES[0]) { addCoins(100); msg = (msg ? msg + "  " : "") + "Hub grant: +100 ¢ so you can play again."; }
  shop.redraw(); wardrobe.redraw(); stakePanel.redraw();
  toast(msg || "Welcome to Nova Hub.");
  playerAvatar.resetSim();
}
function enterSurface() {
  mode = "surface";
  wardrobe.resetTryOn();
  setScene(waste.scene);
  placeRig(waste.spawn.pos, 0);
  fx.heightAt = waste.heightAt;
  player.hp = 100; player.dead = false; player.seated = null; player.kills = 0; player.runCoins = 0; player.extractT = 0; player.beaconT = 0;
  player.wound = null; player.bleedT = 0; player.ammoBleedT = 0; player.bandages = 2; player.medkits = 1; player.healHold = 0;
  GunState.pool = { rounds: START_ROUNDS };
  gunStates.forEach((g) => { g.ammo = g.def.mag; g.magOut = false; g.reloadT = 0; });
  loot.attach(waste.scene, waste.heightAt);
  enemies.onSpill = (p, coins, dir) => loot.spillCoins(p, coins, "drop", { maxN: Math.min(30, Math.ceil(coins / 5)), dir: dir.clone().multiplyScalar(0.6) });
  save.stats.runs++; persist();
  equip(save.equipped);
  enemies.startRun();
  playerAvatar.resetSim();
  enemies.playerStake = player.stake;
  toast(`Dead Earth arena. ${player.stake} ¢ at stake — kill raiders to take theirs, extract to bank it.`);
}
function goLobby(msg) {
  if (fade.dir) return;
  if (enemies.wave > save.stats.bestWave) { save.stats.bestWave = enemies.wave; persist(); }
  let summary;
  if (player.dead) summary = msg;
  else {
    const bank = player.carried;
    addCoins(bank);
    summary = `${msg} Banked ${bank} ¢ (stake ${player.stake} ¢, profit ${bank - player.stake >= 0 ? "+" : ""}${bank - player.stake} ¢). ${player.kills} kills.`;
  }
  player.carried = 0;
  startFade(() => enterLobby(summary));
}
// walking through the blue portal: pay the stake, then go to the arena
let portalCooldown = 0;
function tryPortal() {
  if (fade.dir || portalCooldown > 0) return;
  portalCooldown = 1.5;
  const st = player.stakeSel;
  if (!st) { sfx.deny(); toast("Insert a coin stake at the portal terminal first."); return pushBack(); }
  if (!trySpend(st)) { sfx.deny(); toast(`You need ${st} ¢ for that stake.`); return pushBack(); }
  player.stake = st; player.carried = st;
  sfx.portal();
  startFade(() => enterSurface());
}
function pushBack() { rig.position.z += 0.9; }

/* ================= HUD (desktop) ================= */
let toastT = 0;
function toast(s) { $("toast").textContent = s; $("toast").style.opacity = 1; toastT = 4; if (wrist) wrist.set({ msg: s.slice(0, 28) }); }
function updateDomHud(dt) {
  toastT -= dt; if (toastT < 0) $("toast").style.opacity = 0;
  const hud = $("hud");
  if (renderer.xr.isPresenting || mode === "loading") { hud.style.display = "none"; return; }
  hud.style.display = "block";
  $("hp").style.width = player.hp + "%";
  $("hp").style.background = player.hp > 35 ? "#4fe08f" : "#ff4a3a";
  $("coins").textContent = mode === "surface" ? `${player.carried.toLocaleString()} ¢ at risk` : `${save.coins.toLocaleString()} ¢`;
  $("ammo").textContent = mode === "surface" && gunState ? `${gunState.def.name}  ${gunState.reloadT > 0 ? "RELOADING" : gunState.ammo + " / " + gunState.def.mag}  ·  ${GunState.pool ? GunState.pool.rounds : "∞"} spare  ·  bandages ${player.bandages}  medkits ${player.medkits}` : "";
  $("wave").textContent = mode === "surface" ? (enemies.wave === 0 || enemies.remaining() === 0 ? `WAVE ${enemies.wave + 1} INCOMING…` : `WAVE ${enemies.wave} · ${enemies.remaining()} hostiles`) : player.seated ? "Seated — press E to stand" : "";
  $("prompt").textContent = desktopPrompt;
  $("cross").style.display = document.pointerLockElement ? "block" : "none";
}
let desktopPrompt = "";

/* ================= player movement ================= */
const headW = new THREE.Vector3();
function headLocalYaw() { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ"); return e.y; }
function collide(px, pz, r, list) {
  for (const c of list) {
    if (px > c.x0 - r && px < c.x1 + r && pz > c.z0 - r && pz < c.z1 + r) {
      const dx0 = px - (c.x0 - r), dx1 = c.x1 + r - px, dz0 = pz - (c.z0 - r), dz1 = c.z1 + r - pz;
      const m = Math.min(dx0, dx1, dz0, dz1);
      if (m === dx0) px = c.x0 - r; else if (m === dx1) px = c.x1 + r; else if (m === dz0) pz = c.z0 - r; else pz = c.z1 + r;
    }
  }
  return [px, pz];
}
function world() { return mode === "lobby" ? lobby : waste; }
function moveAndCollide(dx, dz) {
  const W = world();
  camera.getWorldPosition(headW);
  let nx = headW.x + dx, nz = headW.z + dz;
  [nx, nz] = collide(nx, nz, 0.28, W.colliders);
  if (W.bounds) { nx = THREE.MathUtils.clamp(nx, W.bounds.x0, W.bounds.x1); nz = THREE.MathUtils.clamp(nz, W.bounds.z0, W.bounds.z1); }
  if (mode === "surface") {
    const d = Math.hypot(nx, nz);
    if (d > ARENA_R) { nx *= ARENA_R / d; nz *= ARENA_R / d; if (toastT < 0) toast("The ash storm is too thick beyond here."); }
  }
  rig.position.x += nx - headW.x; rig.position.z += nz - headW.z;
  rig.position.y = W.heightAt(nx, nz);
}
function sitOn(seat) {
  player.seated = seat; seat.taken = true;
  if (!renderer.xr.isPresenting) { yaw = seat.yaw + Math.PI; pitch = -0.05; }
  sfx.click();
}
function standUp() {
  const s = player.seated; if (!s) return;
  s.taken = false; player.seated = null;
  const fwd = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
  camera.getWorldPosition(headW);
  const target = s.pos.clone().addScaledVector(fwd, 0.7);
  rig.position.x += target.x - headW.x; rig.position.z += target.z - headW.z; rig.position.y = 0;
}
function updateSeated(dt) {
  const s = player.seated;
  if (renderer.xr.isPresenting) {
    // keep the real head over the seat, at seated eye height, facing the bench direction once
    if (!s.aligned) { rig.rotation.y = s.yaw + Math.PI - headLocalYaw(); s.aligned = true; rig.updateMatrixWorld(); }
    camera.getWorldPosition(headW);
    const fwd = tmpV.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
    if (!s.placed) { rig.position.x += s.pos.x + fwd.x * 0.05 - headW.x; rig.position.z += s.pos.z + fwd.z * 0.05 - headW.z; s.placed = true; }
    const wantY = THREE.MathUtils.clamp(s.pos.y + 0.78 - camera.position.y, -0.9, 0.4);
    rig.position.y += (wantY - rig.position.y) * Math.min(1, dt * 6);
  } else {
    rig.position.set(s.pos.x, 0, s.pos.z);
    camera.position.set(0, s.pos.y + 0.75, 0);
  }
}

/* ================= interaction (lobby) ================= */
let interactables = [];
function pickInteract(origin, dir, far = 6) {
  raycaster.set(origin, dir); raycaster.far = far;
  const hits = raycaster.intersectObjects(interactables, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.interact && !o.userData.bench && !o.userData.weaponId) o = o.parent;
    if (o) return { ...h, target: o };
    if (h.object === lobby.glass) continue;
    return null;
  }
  return null;
}
function activate(hit) {
  const o = hit.target;
  if (o.userData.interact) { o.userData.interact.select(hit); return; }
  if (o.userData.weaponId) { shop.sel = o.userData.weaponId; shop.redraw(); sfx.click(); return; }
  if (o.userData.bench) {
    let best = null, bd = 1.3;
    for (const s of lobby.seats) { if (s.taken) continue; const d = s.pos.distanceTo(hit.point); if (d < bd) { bd = d; best = s; } }
    if (best) { best.aligned = false; best.placed = false; sitOn(best); } else sfx.deny();
  }
}
const lastHover = new Set();
function updateHover(hits) {
  const now = new Set();
  for (const h of hits) if (h && h.target.userData.interact) { h.target.userData.interact.hover(h); now.add(h.target.userData.interact); }
  for (const p of lastHover) if (!now.has(p)) p.hover(null);
  lastHover.clear(); now.forEach((p) => lastHover.add(p));
}
function takeAmmo(p, r) {
  const got = loot.pickupAmmo(p, r);
  if (got && GunState.pool) { GunState.pool.rounds += got; toast(`+${got} rounds`); sfx.magIn(); }
}
function desktopUse() {
  if (mode === "surface") { returnToWound(loot.near(headW, 3, "self")); takeAmmo(headW, 2.4); return; }
  if (mode !== "lobby") return;
  if (player.seated) { standUp(); return; }
  const o = camera.getWorldPosition(new THREE.Vector3()), d = camera.getWorldDirection(new THREE.Vector3());
  const h = pickInteract(o, d, 4);
  if (h) activate(h);
}

/* ================= main loop ================= */
const clock = new THREE.Clock();
let extractHold = 0;
const gunAimQuat = new THREE.Quaternion();
let twoHanded = false;
const foreW = new THREE.Vector3(), rightW = new THREE.Vector3(), leftW = new THREE.Vector3();
const lookM = new THREE.Matrix4();

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;
  if (mode === "loading" || warpActive) {
    warp.setProgress((parseFloat(loadBar.style.width) || 0) / 100);
    warp.update(dt, t, camera.getWorldPosition(tmpV));
    renderer.render(loadScene, camera); return;
  }
  const xr = renderer.xr.isPresenting;
  const R = hands.right, L = hands.left;

  /* ---- locomotion ---- */
  if (player.seated) {
    updateSeated(dt);
    if (xr) { const [sx, sy] = stick(L); if (Math.hypot(sx, sy) > 0.6) standUp(); }
  } else if (!player.dead) {
    let mx = 0, mz = 0, speed = 0;
    if (xr) {
      const [sx, sy] = stick(L);
      if (sx || sy) {
        camera.getWorldDirection(tmpV); tmpV.y = 0; tmpV.normalize();
        const rx = -tmpV.z, rz = tmpV.x;
        speed = btn(L, 3) ? 4.6 : 2.8;
        mx = (tmpV.x * -sy + rx * sx) * speed * dt; mz = (tmpV.z * -sy + rz * sx) * speed * dt;
      }
      // snap turn around the head
      const [tx] = stick(R);
      if (R) {
        if (Math.abs(tx) > 0.7 && R.turnReady) {
          R.turnReady = false;
          camera.getWorldPosition(headW);
          const ang = tx > 0 ? -Math.PI / 6 : Math.PI / 6;
          rig.rotation.y += ang;
          rig.updateMatrixWorld();
          camera.getWorldPosition(tmpV);
          rig.position.x += headW.x - tmpV.x; rig.position.z += headW.z - tmpV.z;
        } else if (Math.abs(tx) < 0.3) R.turnReady = true;
      }
    } else {
      camera.position.set(0, 1.68, 0);
      const f = tmpV.set(-Math.sin(yaw), 0, -Math.cos(yaw)), r = tmpV2.set(Math.cos(yaw), 0, -Math.sin(yaw));
      let ix = 0, iz = 0;
      if (keys.KeyW) { ix += f.x; iz += f.z; } if (keys.KeyS) { ix -= f.x; iz -= f.z; }
      if (keys.KeyD) { ix += r.x; iz += r.z; } if (keys.KeyA) { ix -= r.x; iz -= r.z; }
      const l = Math.hypot(ix, iz);
      speed = keys.ShiftLeft ? 5 : 3.2;
      if (l > 0) { mx = (ix / l) * speed * dt; mz = (iz / l) * speed * dt; } else speed = 0;
    }
    moveAndCollide(mx, mz);
    playerAvatar.speed = (mx || mz) ? speed : 0;
  }
  if (!xr) camera.rotation.set(pitch, yaw, 0, "YXZ");
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(headW);

  /* ---- mode logic ---- */
  desktopPrompt = "";
  if (mode === "lobby") {
    const hits = [];
    for (const h of [R, L]) {
      if (!h) continue;
      h.laser.visible = xr;
      if (!xr) continue;
      h.controller.getWorldPosition(tmpV); h.controller.getWorldDirection(tmpV2).negate();
      const hit = pickInteract(tmpV, tmpV2);
      h.laser.userData.set(hit ? hit.distance : 2.5, !!hit);
      hits.push(hit);
      if (pressed(h, 0)) {
        if (hit) { activate(hit); haptic(h, 0.3, 20); }
        else if (player.seated) standUp();
      }
      if (h.glove) h.glove.userData.setCurl(Math.max(btnVal(h, 0), btnVal(h, 1)));
    }
    if (!xr) {
      const o = camera.getWorldPosition(new THREE.Vector3()), d = camera.getWorldDirection(new THREE.Vector3());
      const hit = pickInteract(o, d, 4);
      hits.push(hit);
      if (hit) desktopPrompt = hit.target.userData.bench ? "E — sit on bench" : "Click — use";
      if (mouseClicked && hit && !hit.target.userData.bench) activate(hit);
    }
    updateHover(hits);
    lobby.setDisplay(shop.sel, WM);
    portalCooldown = Math.max(0, portalCooldown - dt);
    const P = lobby.portal.pos;
    if (!player.seated && Math.abs(headW.x - P.x) < 1.0 && headW.z < P.z + 0.25 && headW.z > P.z - 0.6) tryPortal();
    if (!player.seated && Math.hypot(headW.x - P.x, headW.z - P.z) < 3.5 && !desktopPrompt) desktopPrompt = player.stakeSel ? `Walk into the portal — ${player.stakeSel} ¢ stake` : "Choose a stake at the terminal";
    lobby.update(dt, t);
  } else if (mode === "surface") {
    surfaceWind.update(dt);
    /* gun pose */
    if (xr && R) {
      R.grip.getWorldPosition(rightW);
      R.controller.getWorldQuaternion(gunAimQuat);
      twoHanded = false;
      if (L && gunState.def.twoHand !== undefined && gun.userData.fore && btn(L, 1)) {
        L.grip.getWorldPosition(leftW);
        gun.position.copy(rightW); gun.quaternion.copy(gunAimQuat); gun.updateMatrixWorld();
        gun.userData.fore.getWorldPosition(foreW);
        if (leftW.distanceTo(foreW) < 0.25 || L.wasSupporting) {
          twoHanded = leftW.distanceTo(rightW) > 0.12;
          if (twoHanded) {
            tmpV.set(0, 1, 0).applyQuaternion(gunAimQuat);
            lookM.lookAt(rightW, leftW, tmpV);
            gunAimQuat.setFromRotationMatrix(lookM);
            const f = gun.userData.fore.position;
            gunAimQuat.multiply(tmpQ.setFromAxisAngle(tmpV.set(1, 0, 0), -Math.atan2(f.y, -f.z)));
          }
        }
      }
      if (L) L.wasSupporting = twoHanded;
      gun.position.copy(rightW);
      gun.quaternion.copy(gunAimQuat);
      if (R.glove) R.glove.userData.setCurl(0.85);
      if (L?.glove) L.glove.userData.setCurl(Math.max(btnVal(L, 1), twoHanded ? 1 : 0));
      if (L?.glove) L.glove.visible = true;
      if (R.laser) R.laser.visible = false; if (L?.laser) L.laser.visible = false;
    } else {
      twoHanded = false;
      const off = thirdPerson ? new THREE.Vector3(0.25, -0.2, -0.5) : new THREE.Vector3(0.16, -0.17, -0.34);
      gun.position.copy(off).applyQuaternion(camera.getWorldQuaternion(tmpQ)).add(headW);
      gun.quaternion.copy(tmpQ);
      gunAimQuat.copy(tmpQ);
    }
    gun.visible = xr || !thirdPerson;
    // recoil kick (visual)
    const k = gunState.kick * gunState.def.recoil * (twoHanded ? 0.5 : 1);
    gun.rotateX(k * 1.6); gun.translateZ(k * 0.25);
    const pump = gun.userData.pump;
    if (pump) pump.position.z = -0.32 + Math.sin(Math.min(1, (0.45 - gunState.pumpT) / 0.45) * Math.PI) * 0.09 * (gunState.pumpT > 0 ? 1 : 0);
    /* firing */
    const r = gunState.update(dt);
    if (r === "reloaded") { gun.userData.mag.visible = true; gun.userData.setAmmo(gunState.ammo, gunState.def.mag); sfx.magIn(); if (L?.carryMag) { L.carryMag.parent?.remove(L.carryMag); L.carryMag = null; } }
    const trig = xr ? btn(R, 0) : mouseDown && !!document.pointerLockElement;
    const trigPressed = xr ? pressed(R, 0) : mouseClicked && !!document.pointerLockElement;
    if (!player.dead && gunState && (trigPressed || (trig && gunState.def.auto))) {
      if (gunState.canFire() && (gunState.pumpT <= 0)) fire();
      else if (trigPressed && (gunState.ammo === 0 || gunState.magOut)) { sfx.dry(); if (!gunState.hasReserve()) toast("Out of ammo — pick up ammo boxes off the ground."); else if (!xr && gunState.startTimedReload()) { sfx.magOut(); gun.userData.mag.visible = false; } }
    }
    /* VR reload: A ejects; bring the fresh mag (left hand) to the magwell. A again = auto reload. B = switch. */
    if (xr && R && !player.dead) {
      if (pressed(R, 4)) { if (gunState.magOut && gunState.reloadT <= 0) { gunState.startTimedReload(); } else ejectMag(); }
      if (pressed(R, 5)) { const owned = WEAPONS.filter((w) => save.weapons.includes(w.id)); const i = owned.findIndex((w) => w.id === gunId); equip(owned[(i + 1) % owned.length].id); }
      if (L?.carryMag && gunState.magOut && gunState.reloadT <= 0) {
        L.carryMag.getWorldPosition(leftW);
        gun.userData.magwell.getWorldPosition(foreW);
        if (leftW.distanceTo(foreW) < 0.11) {
          gunState.insertMag();
          L.carryMag.parent?.remove(L.carryMag); L.carryMag = null;
          gun.userData.mag.visible = true; gun.userData.setAmmo(gunState.ammo, gunState.def.mag);
          sfx.magIn(); haptic(R, 0.6, 50); haptic(L, 0.6, 50);
        }
      }
    }
    /* extraction: hold Y, or stand on the beacon */
    const holdY = xr ? btn(L, 5) : false;
    extractHold = holdY ? extractHold + dt : 0;
    const onBeacon = Math.hypot(headW.x - waste.beaconPos.x, headW.z - waste.beaconPos.z) < 1.3;
    player.beaconT = onBeacon && enemies.wave > 0 ? player.beaconT + dt : 0;
    const extract = Math.max(extractHold / 1.5, player.beaconT / 2.5);
    if (onBeacon && enemies.wave > 0) desktopPrompt = "Hold position on the beacon to extract…";
    if (extract >= 1) goLobby("Extracted safely.");
    /* enemies */
    const feet = new THREE.Vector3(headW.x, rig.position.y, headW.z);
    enemies.update(dt, t, { head: headW, feet, moving: playerAvatar.speed > 0 }, hurtPlayer);
    if (player.regenT > 0) player.regenT -= dt; else if (!player.wound) player.hp = Math.min(100, player.hp + dt * 6);
    updateWounds(dt, xr, L, R);
    waste.update(dt, t, headW, surfaceWind.vec);
    sfx.setAmbience("surface", surfaceWind.gust);
    wrist.set({ hp: Math.round(player.hp), coins: save.coins, risk: player.carried, wave: enemies.wave, left: enemies.remaining(), extract: Math.min(1, extract),
      msg: player.wound ? (player.wound.bad ? `BLEEDING BADLY · medkits ${player.medkits}` : `BLEEDING · bandages ${player.bandages}`) : `ammo ${GunState.pool ? GunState.pool.rounds : "∞"} · ✚${player.bandages} ✚✚${player.medkits}` });
    loot.update(dt);
    for (let i = dropped.length - 1; i >= 0; i--) {
      const m = dropped[i]; m.userData.life -= dt;
      m.userData.vel.y -= 9.8 * dt; m.position.addScaledVector(m.userData.vel, dt); m.rotation.x += dt * 3;
      const gy = waste.heightAt(m.position.x, m.position.z) + 0.03;
      if (m.position.y < gy) { m.position.y = gy; m.userData.vel.set(0, 0, 0); }
      if (m.userData.life <= 0) { scene.remove(m); dropped.splice(i, 1); }
    }
  }
  if (mode === "lobby") sfx.setAmbience("lobby", 0);

  /* ---- wrist HUD on the left hand ---- */
  if (xr && L) {
    if (wrist.mesh.parent !== L.grip) { L.grip.add(wrist.mesh); wrist.mesh.position.set(0.0, 0.035, 0.09); wrist.mesh.rotation.set(-Math.PI / 2.4, 0, 0); }
    wrist.mesh.visible = true;
    if (mode === "lobby") wrist.set({ hp: 100, coins: save.coins, risk: -1, wave: 0, left: 0, extract: 0 });
  } else wrist.mesh.visible = false;

  /* ---- own avatar (desktop third-person view) ---- */
  const showAvatar = !xr && thirdPerson;
  playerAvatar.root.visible = showAvatar;
  if (showAvatar) {
    playerAvatar.root.position.set(rig.position.x, rig.position.y, rig.position.z);
    playerAvatar.groundY = rig.position.y;
    playerAvatar.root.rotation.y = yaw + Math.PI;
    playerAvatar.setPose(player.seated ? "sit" : "stand");
    if (player.seated) { playerAvatar.root.position.set(player.seated.pos.x, 0, player.seated.pos.z); playerAvatar.root.rotation.y = player.seated.yaw; }
    playerAvatar.holdingGun = mode === "surface";
    playerAvatar.headYaw = 0;
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(2.6);
    camera.position.set(back.x + Math.cos(yaw) * 0.5, (player.seated ? 1.2 : 1.68) + 0.35, back.z - Math.sin(yaw) * 0.5);
    playerAvatar.update(dt, mode === "surface" ? surfaceWind.vec : tmpV.set(0.4, 0, 0.3));
  }

  /* ---- effects, fades, overlays ---- */
  fx.update(dt, headW);
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.userData.life -= dt; p.position.y += dt * 0.7; p.material.opacity = Math.min(1, p.userData.life); if (p.userData.life <= 0) { scene.remove(p); pops.splice(i, 1); } }
  hurtAmt.value = Math.max(player.dead ? 0.8 : 0, hurtAmt.value - dt * 0.9);
  if (fade.dir) {
    fade.t += dt * fade.dir * 1.8;
    if (fade.dir > 0 && fade.t >= 1) { fade.t = 1; fade.dir = -1; const fn = fade.then; fade.then = null; fn && fn(); }
    if (fade.dir < 0 && fade.t <= 0) { fade.t = 0; fade.dir = 0; }
  }
  fadeAmt.value = fade.t;
  updateDomHud(dt);
  mouseClicked = false;
  latchButtons();
  renderer.render(scene, camera);
}

/* ================= boot ================= */
const loadScene = new THREE.Scene();
loadScene.background = new THREE.Color(0x000000);
const warp = makeWarp();
loadScene.add(warp.mesh);
let warpActive = true;
renderer.setAnimationLoop(frame);

async function boot() {
  T = await generateTextures((p, name) => { loadBar.style.width = Math.round(p * 70) + "%"; loadTxt.textContent = `Weathering ${name}…`; });
  await new Promise((r) => setTimeout(r, 0));
  WM = makeWeaponMaterials(T);
  loadTxt.textContent = "Loading people…";
  const preload = ["base_bm", "base_bf", "base_bm_lo", "base_bf_lo", "Male_Adult_11", "Female_Adult_08", "Business_Male_01", "Medical_Female_01", "Male_Adult_16", "Female_Adult_17", "Male_Adult_08",
    "Military_Male_01", "Military_Male_02", "Military_Female_01", "Male_Adult_20", "Female_Adult_04", outfitFor(save.look).model];
  await loadHumanAssets(preload, (p) => { loadBar.style.width = Math.round(70 + p * 8) + "%"; });
  for (const n of ["Male_Adult_10", "Male_Adult_12", "Female_Adult_12", "Female_Adult_01"]) ensureModel(n); // rest stream in the background
  loadTxt.textContent = "Building Nova Hub…"; loadBar.style.width = "78%";
  await new Promise((r) => setTimeout(r, 0));
  lobby = buildLobby(renderer, T, sfx, WM);
  loadTxt.textContent = "Scorching the surface…"; loadBar.style.width = "88%";
  await new Promise((r) => setTimeout(r, 0));
  waste = buildWasteland(renderer, T);
  enemies = new EnemyManager(waste.scene, T, waste, fx, sfx, WM, surfaceWind);
  fx.onCasing = () => sfx.casing();

  // terminals
  shop = new ShopPanel(sfx, (kind, id) => { if (kind === "buy") toast(`Purchased ${weaponById(id).name}.`); if (kind === "equip" || kind === "buy") toast(`${weaponById(id).name} equipped.`); });
  shop.mesh.position.set(9.05, 1.62, -1.6); shop.mesh.rotation.set(0, -Math.PI / 2, 0); shop.mesh.rotateX(-0.12);
  lobby.scene.add(shop.mesh);
  const shopFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 1.58), new THREE.MeshStandardMaterial({ color: 0x23282c, metalness: 0.6, roughness: 0.5 }));
  shopFrame.position.set(9.12, 1.62, -1.6); shopFrame.rotation.z = -0.12; lobby.scene.add(shopFrame);
  playerAvatar = new Human(T, save.look, { quality: 1 });
  wardrobe = new WardrobePanel(sfx, (look, committed) => {
    lobby.preview.setLook(look); lobby.preview.resetSim();
    if (committed) { playerAvatar.setLook(look); retintHands(look); toast("Look saved. Press V on desktop to see yourself in third person."); }
  });
  wardrobe.mesh.position.set(-11.0, 1.55, -1.3); wardrobe.mesh.rotation.y = Math.PI / 2 - 0.35;
  lobby.scene.add(wardrobe.mesh);
  lobby.preview.setLook(save.look);
  stakePanel = new Panel(1.0, 0.62, 800, 496);
  stakePanel.draw = function (ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0a1e33"); g.addColorStop(1, "#05101e");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#4fb8ff"; ctx.lineWidth = 5; ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#6fd0ff"; ctx.font = "800 40px Segoe UI, Arial"; ctx.fillText("ARENA STAKE", W / 2, 52);
    ctx.font = "500 21px Segoe UI, Arial"; ctx.fillStyle = "#cfe8ff";
    ctx.fillText("Put coins in to enter. A raider who kills you takes them,", W / 2, 96);
    ctx.fillText("plus everything you carry. Kill raiders to take theirs.", W / 2, 124);
    STAKES.forEach((v, i) => {
      const x = 40 + i * 146, y = 156, w = 132, h = 96;
      const ok = save.coins >= v, sel = player.stakeSel === v;
      const hov = this.button("s" + v, x, y, w, h, ok ? () => { player.stakeSel = v; lobby.setArmed(true); sfx.coin(); toast(`${v} ¢ stake ready. Walk through the blue portal.`); } : () => sfx.deny());
      ctx.fillStyle = sel ? "#2f9cff" : hov && ok ? "#1d4a73" : ok ? "#13314f" : "#1a1f26"; ctx.fillRect(x, y, w, h);
      if (sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h); }
      ctx.fillStyle = ok ? (sel ? "#04101c" : "#ffcf5a") : "#5a6470"; ctx.font = "800 34px Segoe UI, Arial"; ctx.fillText(`${v}`, x + w / 2, y + 42);
      ctx.font = "600 18px Segoe UI, Arial"; ctx.fillText("coins", x + w / 2, y + 74);
    });
    ctx.font = "600 22px Segoe UI, Arial"; ctx.fillStyle = "#9fb7cc";
    ctx.fillText(`Your coins: ${save.coins} ¢   ·   Weapon: ${weaponById(save.equipped).name}`, W / 2, 300);
    ctx.fillText(`Best wave ${save.stats.bestWave}  ·  Total kills ${save.stats.kills}`, W / 2, 334);
    ctx.fillStyle = player.stakeSel ? "#2f9cff" : "#1a2a3a"; ctx.fillRect(40, 372, W - 80, 88);
    ctx.fillStyle = player.stakeSel ? "#04101c" : "#6f8396"; ctx.font = "800 30px Segoe UI, Arial";
    ctx.fillText(player.stakeSel ? `STAKE ${player.stakeSel} ¢  —  WALK INTO THE PORTAL ▸` : "PICK A STAKE ABOVE", W / 2, 416);
  };
  stakePanel.redraw();
  {
    const P = lobby.portal.pos;
    stakePanel.mesh.position.set(P.x + 2.4, 1.45, P.z + 0.6);
    stakePanel.mesh.rotation.y = -0.45;
    lobby.scene.add(stakePanel.mesh);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.7, 0.04), new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.3 }));
    back.position.copy(stakePanel.mesh.position).add(new THREE.Vector3(Math.sin(-0.45) * -0.025, 0, Math.cos(-0.45) * -0.025)); back.rotation.y = -0.45;
    lobby.scene.add(back);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.15, 12), back.material); post.position.set(back.position.x, 0.575, back.position.z - 0.02); lobby.scene.add(post);
    lobby.colliders.push({ x0: post.position.x - 0.3, x1: post.position.x + 0.3, z0: post.position.z - 0.3, z1: post.position.z + 0.3 });
  }
  wrist = new WristHUD();
  interactables = [shop.mesh, wardrobe.mesh, stakePanel.mesh, lobby.benches, lobby.glass, ...lobby.rackGuns].filter(Boolean);
  onSave(() => { shop.redraw(); wardrobe.redraw(); stakePanel.redraw(); });

  // compile shaders up front to avoid hitches
  loadTxt.textContent = "Warming up shaders…"; loadBar.style.width = "96%";
  await new Promise((r) => setTimeout(r, 0));
  equip(save.equipped);
  waste.scene.add(gun); renderer.compile(waste.scene, camera); waste.scene.remove(gun);
  renderer.compile(lobby.scene, camera);
  enterLobby("Welcome to Nova Hub. Sit, shop, dress up — then stake coins at the blue portal.");
  loadBar.style.width = "100%"; loadTxt.textContent = "Entering…";
  // rush through the warp into a white flash, then fade into the hub
  await new Promise((res) => warp.finish(res));
  warpActive = false;
  const ld = $("loading"); ld.classList.add("flashout"); setTimeout(() => (ld.style.display = "none"), 900);
  initVR();
}

async function initVR() {
  const btnEl = $("vrBtn"), overlay = $("overlay");
  overlay.style.display = "flex";
  $("desk").onclick = () => { sfx.init(); overlay.style.display = "none"; renderer.domElement.requestPointerLock?.(); };
  if (!navigator.xr || !(await navigator.xr.isSessionSupported("immersive-vr").catch(() => false))) {
    btnEl.textContent = "VR headset not detected"; btnEl.disabled = true; return;
  }
  btnEl.disabled = false; btnEl.textContent = "ENTER VR";
  btnEl.onclick = async () => {
    sfx.init();
    const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
    await renderer.xr.setSession(session);
    overlay.style.display = "none";
    camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
    rig.rotation.y = yaw;
    session.addEventListener("end", () => { overlay.style.display = "flex"; rig.rotation.set(0, 0, 0); });
  };
}

boot().catch((e) => { console.error(e); loadTxt.textContent = "Failed to start: " + e.message; });

// small debug handle (handy for testing from the browser console)
window.__deadEarth = {
  get mode() { return mode; }, rig, camera, player, keys,
  look(y, p = 0) { yaw = y; pitch = p; },
  surface() { player.stake = player.carried = 100; enterSurface(); }, lobby() { enterLobby(); }, portal(v) { player.stakeSel = v; portalCooldown = 0; tryPortal(); }, get stakePanel() { return stakePanel; },
  third(v) { thirdPerson = v; }, get avatar() { return playerAvatar; }, hurt(d, src) { hurtPlayer(d, new THREE.Vector3(0, 0, 1), src || null); }, get loot() { return loot; }, flick() { flickCollect(); }, use() { desktopUse(); },
  sitNearest() { const s = lobby.seats.find((x) => !x.taken); if (s) { s.aligned = s.placed = false; sitOn(s); } },
  stand() { standUp(); },
  get enemies() { return enemies; }, get save() { return save; }, get lobbyWorld() { return lobby; }, get wardrobe() { return wardrobe; },
  fire() { if (gunState && gunState.canFire()) fire(); }, equip(id) { equip(id); }, renderer,
};
