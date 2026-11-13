// TED units: original test androids (modelled & rigged with Meshy).
// Animated with a mixer while standing; switch to a jointed Rapier ragdoll when
// knocked over, grabbed, shot or blasted, then blend back up with the Arise clip.
// They hear noises, flee gunfire, put their hands up at gunpoint, wave back,
// dance to the radio, get annoyed when poked, and can be broken and repaired.
import * as THREE from "three";
import * as SkeletonUtils from "./vendor/utils/SkeletonUtils.js";
import { RAPIER, GROUPS, G, grp, MATS, tv, tq } from "./physics.js";
import { zoneAt } from "./world.js";

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const HEIGHT = 1.78;

// ragdoll parts: [name, boneFrom, boneTo, radius, mass, driven bone]
const PARTS = [
  ["pelvis", "Hips", "Spine01", 0.13, 10, "Hips"],
  ["chest", "Spine01", "neck", 0.15, 12, "Spine01"],
  ["head", "Head", "head_end", 0.11, 4, "Head"],
  ["lUp", "LeftArm", "LeftForeArm", 0.05, 2.5, "LeftArm"],
  ["lFore", "LeftForeArm", "LeftHand", 0.045, 2, "LeftForeArm"],
  ["rUp", "RightArm", "RightForeArm", 0.05, 2.5, "RightArm"],
  ["rFore", "RightForeArm", "RightHand", 0.045, 2, "RightForeArm"],
  ["lThigh", "LeftUpLeg", "LeftLeg", 0.075, 4, "LeftUpLeg"],
  ["lShin", "LeftLeg", "LeftFoot", 0.06, 3, "LeftLeg"],
  ["rThigh", "RightUpLeg", "RightLeg", 0.075, 4, "RightUpLeg"],
  ["rShin", "RightLeg", "RightFoot", 0.06, 3, "RightLeg"],
];
// [partA, partB, joint bone, type]
const JOINTS = [
  ["pelvis", "chest", "Spine01", "ball"], ["chest", "head", "Head", "ball"],
  ["chest", "lUp", "LeftArm", "ball"], ["lUp", "lFore", "LeftForeArm", "ball"],
  ["chest", "rUp", "RightArm", "ball"], ["rUp", "rFore", "RightForeArm", "ball"],
  ["pelvis", "lThigh", "LeftUpLeg", "ball"], ["lThigh", "lShin", "LeftLeg", "knee"],
  ["pelvis", "rThigh", "RightUpLeg", "ball"], ["rThigh", "rShin", "RightLeg", "knee"],
];

/* ---------------- face screen ---------------- */
function drawFace(ctx, mood, blink, t) {
  const W = 256, H = 128;
  ctx.clearRect(0, 0, W, H);
  if (mood === "off") return;
  const col = { angry: "#ff4a3a", scared: "#9fd8ff", love: "#ff6ad5", dizzy: "#ffd34d", hurt: "#ffb04a" }[mood] || "#46f0ff";
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.shadowColor = col; ctx.shadowBlur = 18;
  const ex = [78, 178], ey = 60;
  for (let i = 0; i < 2; i++) {
    const x = ex[i], s = i ? 1 : -1;
    ctx.beginPath();
    if (blink && !["dizzy", "love", "off"].includes(mood)) { ctx.moveTo(x - 22, ey); ctx.lineTo(x + 22, ey); ctx.stroke(); continue; }
    switch (mood) {
      case "happy": ctx.arc(x, ey + 12, 22, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); break;
      case "surprised": ctx.arc(x, ey, 22, 0, 7); ctx.stroke(); break;
      case "scared": ctx.arc(x + Math.sin(t * 40) * 2, ey + 4, 11, 0, 7); ctx.fill(); break;
      case "angry": ctx.moveTo(x - 24, ey - 14 * s * -1 - 2); ctx.lineTo(x + 24, ey + 14 * s * -1 - 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, ey + 14, 8, 0, 7); ctx.fill(); break;
      case "dizzy": for (let k = 0; k < 2; k++) { ctx.moveTo(x - 18, ey - 18 + k * 36); ctx.lineTo(x + 18, ey + 18 - k * 36); } ctx.stroke(); break;
      case "love": { ctx.save(); ctx.translate(x, ey); const p = 1 + Math.sin(t * 8) * 0.12; ctx.scale(p, p); ctx.moveTo(0, 16); ctx.bezierCurveTo(-30, -6, -12, -28, 0, -10); ctx.bezierCurveTo(12, -28, 30, -6, 0, 16); ctx.fill(); ctx.restore(); break; }
      case "sleepy": ctx.moveTo(x - 20, ey + 6); ctx.lineTo(x + 20, ey + 6); ctx.stroke(); break;
      case "hurt": ctx.moveTo(x - 20, ey - 10); ctx.lineTo(x + 20, ey); ctx.lineTo(x - 20, ey + 10); ctx.stroke(); break;
      case "curious": ctx.ellipse(x, ey, i ? 16 : 22, i ? 16 : 24, 0, 0, 7); ctx.fill(); break;
      default: ctx.roundRect ? ctx.roundRect(x - 16, ey - 20, 32, 40, 12) : ctx.rect(x - 16, ey - 20, 32, 40); ctx.fill();
    }
  }
  if (mood === "scared" || mood === "surprised") { ctx.beginPath(); ctx.arc(128, 108, 8, 0, 7); ctx.lineWidth = 5; ctx.stroke(); }
  if (mood === "happy" || mood === "love") { ctx.beginPath(); ctx.arc(128, 96, 16, 0.2, Math.PI - 0.2); ctx.lineWidth = 6; ctx.stroke(); }
}

export class NPCs {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.cc = game.physics.world.createCharacterController(0.02);
    this.cc.enableAutostep(0.3, 0.1, false);
    this.cc.enableSnapToGround(0.3);
    this.cc.setMaxSlopeClimbAngle(0.8);
    this.ccFilter = (c) => { const e = game.physics.entOf(c); return !(e && (e.kind === "prop" || e.kind === "debris") && e.mass < 20); };
  }
  init(gltf) {
    this.tpl = gltf.scene;
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = c;
    this.tpl.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  spawn(pos, zone, opts = {}) {
    if (!this.tpl) return null;
    const n = new TED(this, pos, zone, opts);
    this.list.push(n);
    return n;
  }
  update(dt) {
    const see = this.game.world.visibleZones;
    for (const n of this.list) {
      // TEDs in rooms you can't see think at a quarter rate
      const vis = !see || n.rag || see.has(zoneAt(n.pos));
      n.acc = (n.acc || 0) + dt;
      if (vis || (this.frame = (this.frame || 0) + 1) % 4 === 0) { n.update(Math.min(n.acc, 0.1)); n.acc = 0; }
    }
  }
  postPhysics() { for (const n of this.list) if (n.rag && !n.rag.asleep) n.driveBones(); }
  hear(pos, loud, kind) { for (const n of this.list) n.hear(pos, loud, kind); }
  reset() { for (const n of this.list) n.reset(); }
}

class TED {
  constructor(sys, pos, zone, opts) {
    this.sys = sys; this.game = sys.game;
    this.home = pos.clone(); this.zone = zone; this.opts = opts;
    const root = SkeletonUtils.clone(sys.tpl);
    this.root = root;
    this.bones = {};
    root.traverse((o) => { if (o.isBone) this.bones[o.name] = o; if (o.isSkinnedMesh) this.skin = o; });
    // scale to height
    root.updateMatrixWorld(true);
    const top = this.bones.head_end.getWorldPosition(new THREE.Vector3()).y;
    const s = HEIGHT / Math.max(0.5, top);
    root.scale.setScalar(s);
    this.game.scene.add(root);
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [k, c] of Object.entries(sys.clips)) this.actions[k] = this.mixer.clipAction(c);
    for (const k of ["hit", "gunshotReact", "standUp", "wave", "shrug", "angry"]) if (this.actions[k]) { this.actions[k].setLoop(THREE.LoopOnce, 1); this.actions[k].clampWhenFinished = true; }
    this.cur = null;
    // face screen on the visor
    const c = document.createElement("canvas"); c.width = 256; c.height = 128;
    this.faceCtx = c.getContext("2d"); this.faceTex = new THREE.CanvasTexture(c); this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mood = "neutral"; this.moodUntil = 0; this.blinkAt = 2; this.faceDirty = true;
    this.attachFace();
    // physics capsule
    this.ent = { kind: "npc", npc: this, grabbable: true, mass: 50, sound: "plastic", kinVel: new THREE.Vector3() };
    this.game.physics.createBody(this.ent, { type: "kinematic", pos: pos.clone().add(new THREE.Vector3(0, 0.9, 0)), colliders: [RAPIER.ColliderDesc.capsule(0.6, 0.24)], groups: GROUPS.npc, events: true, mat: MATS.robot, mass: 50 });
    this.body = this.ent.body; this.collider = this.ent.colliders[0];
    this.pos = pos.clone(); this.yaw = opts.yaw ?? Math.random() * 6.28;
    this.hp = 100; this.state = "idle"; this.stateT = 0; this.timer = 1 + Math.random() * 3;
    this.target = null; this.lookTarget = null; this.lookYaw = 0; this.lookPitch = 0;
    this.annoy = 0; this.waveCD = 0; this.aimT = 0; this.voiceCD = 0;
    this.rag = null;
    this.play("idle", 0);
    if (opts.disabled) { this.place(); this.mixer.update(0.01); this.root.updateMatrixWorld(true); this.ragdoll(null); this.disable(); }
  }

  attachFace() {
    const head = this.bones.Head, front = this.bones.headfront;
    this.root.updateMatrixWorld(true);
    const hp = head.getWorldPosition(new THREE.Vector3());
    const neckY = this.bones.neck.getWorldPosition(new THREE.Vector3()).y;
    // measure the helmet from the mesh itself (bind pose): centre it on the front of the visor
    const box = new THREE.Box3(), v = new THREE.Vector3(), pos = this.skin.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) { this.skin.getVertexPosition(i, v).applyMatrix4(this.skin.matrixWorld); if (v.y > neckY + 0.04 && Math.abs(v.x - hp.x) < 0.2 && Math.abs(v.z - hp.z) < 0.25) box.expandByPoint(v); }
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const w = Math.min(0.17, sz.x * 0.55);
    this.face.scale.setScalar(w / 0.2);
    const want = new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y - sz.y * 0.02, box.max.z + 0.004), new THREE.Quaternion(), new THREE.Vector3(w / 0.2, w / 0.2, 1));
    void front;
    this.root.updateMatrixWorld(true);
    const local = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(want);
    local.decompose(this.face.position, this.face.quaternion, this.face.scale);
    head.add(this.face);
  }

  setMood(m, dur = 2.5) { if (this.mood !== m) { this.mood = m; this.faceDirty = true; } this.moodUntil = this.game.time + dur; }
  say(mood) { if (this.voiceCD > 0) return; this.voiceCD = 0.7; this.game.audio.chirp(this.headPos(_v3), mood); }
  headPos(out) { return this.bones.Head.getWorldPosition(out); }
  chestPos(out) { return this.bones.Spine01.getWorldPosition(out); }

  play(name, fade = 0.25, speed = 1) {
    const a = this.actions[name]; if (!a) return 0;
    if (this.cur === a && a.isRunning()) return a.getClip().duration;
    a.reset(); a.timeScale = speed; a.setEffectiveWeight(1); a.play();
    if (this.cur && this.cur !== a) this.cur.crossFadeTo(a, fade, false);
    this.cur = a; this.curName = name;
    return a.getClip().duration / speed;
  }

  setState(s, t = 0) { this.state = s; this.stateT = 0; this.timer = t; }

  place() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + 0.86, z: this.pos.z });
  }

  /* ---------------- perception ---------------- */
  hear(pos, loud, kind) {
    if (this.rag || this.state === "disabled") return;
    const d = pos.distanceTo(this.pos);
    if (d > loud * 22) return;
    const scary = kind === "gunshot" || kind === "explosion" || kind === "blast" || (kind === "break" && d < 3);
    if (this.state === "dance" && !scary) return;
    if (scary && d < loud * 12) {
      this.fleeFrom = pos.clone();
      if (d < 3.5 && Math.random() < 0.5) { this.setState("cower", 2.5 + Math.random() * 2); this.play("cower", 0.2); }
      else { this.setState("flee", 2.5 + Math.random() * 1.5); this.pickFleeTarget(); }
      this.setMood("scared", 4); this.say("scared");
    } else if (this.state === "idle" || this.state === "walk") {
      this.lookTarget = pos.clone(); this.setState("look", 1.6 + Math.random() * 1.5);
      this.play(Math.random() < 0.5 ? "lookAround" : "idle2", 0.3);
      this.setMood("curious", 2); if (Math.random() < 0.6) this.say("curious");
    }
  }

  // other entity hit the standing TED
  impact(other, speed) {
    if (this.rag || this.state === "disabled") return;
    const m = Math.min(other.mass || 1, 60);
    const mom = m * speed;
    const p = other.body ? tv(other.body.translation()) : this.chestPos(new THREE.Vector3());
    if (mom > 9 || (other.def?.melee && speed > 3.5)) {
      const dir = _v.subVectors(this.pos, p).setY(0).normalize();
      this.damage(Math.min(40, mom * 0.9));
      this.ragdoll(p, dir.multiplyScalar(Math.min(mom * 0.5, 60)).add(new THREE.Vector3(0, 6, 0)));
      if (other.def?.bonk) this.game.audio.play("metalHeavy", p, { vol: 1, rate: 1.8 });
    } else if (mom > 1.2) this.flinch(p, mom > 4 ? "hit" : "gunshotReact");
  }
  poked(p) { if (!this.rag && this.state !== "disabled") this.flinch(p, "gunshotReact"); }
  flinch(p, clip) {
    this.annoy++;
    this.lookTarget = p.clone();
    this.setMood(this.annoy > 3 ? "angry" : "hurt", 3);
    this.say(this.annoy > 3 ? "angry" : "hurt");
    if (this.annoy > 3 && this.state !== "angry") { this.setState("angry", this.play("angry", 0.15)); this.annoy = 1; return; }
    this.setState("react", this.play(clip, 0.1) * 0.9);
  }
  shot(point, dir, impulse, damage) {
    this.damage(damage);
    this.ragdoll(point, dir.clone().multiplyScalar(impulse * 3.5).add(new THREE.Vector3(0, 2, 0)));
  }
  partShot(part, point, dir, impulse, damage) { this.damage(damage); this.rag && (this.rag.lastHit = this.game.time); this.setMood("hurt", 2); }
  blast(from, dir, strength) {
    const d = _v.subVectors(this.pos, from); d.y = 0; const dist = d.length(); d.normalize();
    const s = strength * Math.max(0.2, 1 - dist / 6);
    this.damage(s * 0.6);
    this.ragdoll(from, d.multiplyScalar(s * 3).add(new THREE.Vector3(0, s * 1.4, 0)));
  }
  damage(n) {
    this.hp -= n;
    if (this.hp <= 0 && this.state !== "disabled") { this.hp = 0; this.pendingDisable = true; }
  }

  /* ---------------- ragdoll ---------------- */
  grabbedAt(point, any = false) {
    if (!this.rag) this.ragdoll(null);
    let best = null, bd = Infinity;
    for (const p of Object.values(this.rag.parts)) { const d = tv(p.body.translation()).distanceTo(point); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  ragdoll(hitPoint, impulse = null) {
    const g = this.game;
    if (this.rag) {
      if (impulse && hitPoint) { const p = this.nearestPart(hitPoint); p.body.applyImpulseAtPoint(impulse, hitPoint, true); }
      this.rag.still = 0; this.rag.t = 0;
      return;
    }
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const q0i = q0.clone().invert();
    const W = (name) => this.bones[name].getWorldPosition(new THREE.Vector3());
    const parts = {};
    const vel = this.state === "walk" ? new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(1) : new THREE.Vector3();
    for (const [name, a, b, r, mass, drive] of PARTS) {
      const pa = W(a), pb = W(b);
      if (name === "lFore" || name === "rFore") pb.sub(pa).multiplyScalar(1.35).add(pa); // include the hand
      if (name === "head") { pa.lerp(pb, 0.05); }
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      const len = pa.distanceTo(pb);
      const dirLocal = pb.clone().sub(pa).normalize().applyQuaternion(q0i);
      const cd = name === "head" ? RAPIER.ColliderDesc.ball(r) : RAPIER.ColliderDesc.capsule(Math.max(0.02, len / 2 - r * 0.6), r);
      if (name !== "head") { const cq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirLocal); cd.setRotation(cq); }
      cd.setMass(mass);
      const descs = [cd];
      if (name === "lShin" || name === "rShin") {
        const foot = W(name === "lShin" ? "LeftToeBase" : "RightToeBase"), ankle = pb;
        const fm = foot.clone().add(ankle).multiplyScalar(0.5).sub(mid).applyQuaternion(q0i);
        descs.push(RAPIER.ColliderDesc.cuboid(0.05, 0.04, 0.09).setTranslation(fm.x, fm.y - 0.02, fm.z + 0.03).setMass(0.6));
      }
      const ent = { kind: "ragdoll", npc: this, grabbable: true, mass, sound: "plastic", part: name };
      g.physics.createBody(ent, { pos: mid, quat: q0, colliders: descs, groups: GROUPS.ragdoll, mat: MATS.robot, linDamp: 0.25, angDamp: 1.6, mass, forceThreshold: mass * 30 });
      ent.body.setLinvel(vel, true);
      const bone = this.bones[drive];
      const bq = bone.getWorldQuaternion(new THREE.Quaternion());
      ent.boneOff = q0i.clone().multiply(bq);
      ent.bone = bone;
      if (drive === "Hips") ent.posOff = bone.getWorldPosition(new THREE.Vector3()).sub(mid).applyQuaternion(q0i);
      parts[name] = ent;
    }
    for (const [a, b, bone, type] of JOINTS) {
      const J = W(bone);
      const A = parts[a], B = parts[b];
      const a1 = J.clone().sub(tv(A.body.translation())).applyQuaternion(q0i), a2 = J.clone().sub(tv(B.body.translation())).applyQuaternion(q0i);
      let data;
      if (type === "knee") { data = RAPIER.JointData.revolute(a1, a2, { x: 1, y: 0, z: 0 }); data.knee = true; }
      else data = RAPIER.JointData.spherical(a1, a2);
      const jt = g.physics.world.createImpulseJoint(data, A.body, B.body, true);
      if (data.knee) jt.setLimits(-0.05, 2.4);
    }
    this.rag = { parts, t: 0, still: 0, held: false };
    this.skin.frustumCulled = false;
    g.physics.setGroups(this.ent, GROUPS.none);
    this.mixer.stopAllAction(); this.cur = null;
    if (hitPoint && impulse) this.nearestPart(hitPoint).body.applyImpulseAtPoint(impulse, hitPoint, true);
    if (this.state !== "disabled") { this.setMood("dizzy", 99); this.say("hurt"); }
    this.setState("ragdoll");
    g.stats.ragdolls = (g.stats.ragdolls || 0) + 1;
    g.onRagdoll && g.onRagdoll(this);
  }
  nearestPart(p) { let best = null, bd = Infinity; for (const e of Object.values(this.rag.parts)) { const d = tv(e.body.translation()).distanceTo(p); if (d < bd) { bd = d; best = e; } } return best; }
  launched() { if (this.rag) { this.rag.t = 0; this.rag.still = 0; } }
  throwRagdoll(v) { if (!this.rag) return; for (const p of Object.values(this.rag.parts)) { const lv = tv(p.body.linvel()); p.body.setLinvel(lv.lerp(v, 0.5), true); } }

  driveBones() {
    const R = this.rag;
    for (const [name] of PARTS) {
      const e = R.parts[name], bone = e.bone;
      const bq = tq(e.body.rotation(), _q).multiply(e.boneOff);
      bone.parent.updateWorldMatrix(true, false);
      bone.parent.getWorldQuaternion(_q2);
      bone.quaternion.copy(_q2.invert().multiply(bq));
      if (e.posOff) {
        const p = _v.copy(e.posOff).applyQuaternion(tq(e.body.rotation(), _q2)).add(tv(e.body.translation(), _v2));
        bone.position.copy(bone.parent.worldToLocal(p));
      }
      bone.updateMatrixWorld(true);
    }
  }

  unragdoll() {
    const g = this.game, R = this.rag;
    const pel = tv(R.parts.pelvis.body.translation()), head = tv(R.parts.head.body.translation());
    const fl = tv(R.parts.lShin.body.translation()).add(tv(R.parts.rShin.body.translation())).multiplyScalar(0.5);
    const chestQ = tq(R.parts.chest.body.rotation());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(chestQ);
    const faceUp = fwd.y > 0;
    const dir = faceUp ? fl.clone().sub(head) : head.clone().sub(fl);
    dir.y = 0; if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    this.yaw = Math.atan2(dir.x, dir.z);
    // capture the ragdoll pose to blend from
    const snap = {};
    for (const [k, b] of Object.entries(this.bones)) snap[k] = [b.quaternion.clone(), b.position.clone()];
    for (const p of Object.values(R.parts)) { g.interaction.forceRelease(p); g.physics.remove(p); p.dead = true; }
    this.rag = null;
    // find the floor under the pelvis
    const hit = g.physics.ray(new THREE.Vector3(pel.x, pel.y + 0.5, pel.z), new THREE.Vector3(0, -1, 0), 4, grp(0xffff, G.STATIC));
    this.pos.set(pel.x, hit ? hit.point.y : Math.max(0, pel.y - 0.2), pel.z);
    this.place();
    this.body.setTranslation({ x: this.pos.x, y: this.pos.y + 0.86, z: this.pos.z }, true);
    g.physics.setGroups(this.ent, GROUPS.npc);
    this.skin.frustumCulled = true;
    this.blend = { snap, t: 0, dur: faceUp ? 0.35 : 0.7 };
    if (faceUp) { this.setState("getup", this.play("standUp", 0) - 0.15); }
    else { this.play("idle", 0); this.setState("getup", 0.9); }
    this.setMood("sleepy", 1.5);
  }

  disable() {
    this.state = "disabled"; this.pendingDisable = false;
    this.setMood("off", 1e9);
    this.game.audio.play("spark", this.chestPos(_v), { vol: 0.8 });
    this.game.fx.sparks(this.chestPos(_v), null, 30, 0x9fe8ff);
    this.game.fx.smoke(this.chestPos(_v), 6, 0x333333, 0.15);
  }
  repair(dt) {
    if (this.state !== "disabled" && this.hp >= 100) return;
    this.hp = Math.min(100, this.hp + 45 * dt);
    if (Math.random() < 0.3) this.game.fx.emit(this.chestPos(_v), new THREE.Vector3((Math.random() - 0.5), 1, (Math.random() - 0.5)), 0x5dff9a, 0.02, 0.6, -0.1, 1);
    if (this.state === "disabled" && this.hp >= 100) {
      this.state = "ragdoll"; this.rag && (this.rag.still = 1.5); this.rag && (this.rag.t = 10);
      this.setMood("happy", 4); this.say("happy");
      this.game.onNpcRepaired && this.game.onNpcRepaired(this);
    }
  }

  reset() {
    if (this.rag) this.unragdoll();
    this.pos.copy(this.home); this.hp = 100; this.annoy = 0;
    this.blend = null; this.place(); this.body.setTranslation({ x: this.pos.x, y: this.pos.y + 0.86, z: this.pos.z }, true);
    this.setState("idle", 2); this.play("idle", 0); this.setMood("neutral", 1);
  }

  /* ---------------- brain ---------------- */
  pickTarget() {
    const z = this.zone, g = this.game;
    for (let i = 0; i < 8; i++) {
      const t = new THREE.Vector3(THREE.MathUtils.lerp(z[0], z[2], Math.random()), this.pos.y, THREE.MathUtils.lerp(z[1], z[3], Math.random()));
      const d = _v.subVectors(t, this.pos); const len = d.length(); if (len < 1.5) continue;
      const hit = g.physics.ray(_v2.copy(this.pos).setY(this.pos.y + 0.6), d.setY(0).normalize(), len, grp(0xffff, G.STATIC | G.PROP));
      if (!hit) return t;
    }
    return null;
  }
  pickFleeTarget() {
    const away = _v.subVectors(this.pos, this.fleeFrom).setY(0).normalize();
    const z = this.zone;
    this.target = this.pos.clone().addScaledVector(away, 6);
    this.target.x = THREE.MathUtils.clamp(this.target.x, z[0], z[2]); this.target.z = THREE.MathUtils.clamp(this.target.z, z[1], z[3]);
  }

  moveToward(t, speed, dt) {
    const d = _v.subVectors(t, this.pos); d.y = 0;
    const dist = d.length();
    if (dist < 0.4) return true;
    const want = Math.atan2(d.x, d.z);
    let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += THREE.MathUtils.clamp(dy, -4 * dt, 4 * dt);
    const fwd = Math.abs(dy) < 1.2 ? speed : speed * 0.2;
    const mv = _v2.set(Math.sin(this.yaw) * fwd * dt, -0.3 * dt, Math.cos(this.yaw) * fwd * dt);
    this.sys.cc.computeColliderMovement(this.collider, mv, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, grp(0xffff, G.STATIC | G.PROP | G.PLAYER | G.NPC), this.sys.ccFilter);
    const m = this.sys.cc.computedMovement();
    this.pos.x += m.x; this.pos.y += m.y; this.pos.z += m.z;
    if (Math.hypot(m.x, m.z) < fwd * dt * 0.25) { this.stuck = (this.stuck || 0) + dt; if (this.stuck > 1.2) { this.stuck = 0; return true; } } else this.stuck = 0;
    this.ent.kinVel.set(m.x / dt, 0, m.z / dt);
    return false;
  }

  facePoint(p, dt, rate = 3) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += THREE.MathUtils.clamp(dy, -rate * dt, rate * dt);
    return Math.abs(dy);
  }

  update(dt) {
    const g = this.game;
    this.voiceCD -= dt; this.waveCD -= dt;
    this.ent.kinVel.set(0, 0, 0);
    if (this.pendingDisable) { if (!this.rag) this.ragdoll(null); this.disable(); }
    // face screen
    if (g.time > this.moodUntil && !["off", "dizzy"].includes(this.mood)) { if (this.mood !== "neutral") { this.mood = "neutral"; this.faceDirty = true; } }
    this.blinkAt -= dt;
    const blink = this.blinkAt < 0.12 && this.blinkAt > 0;
    if (this.blinkAt < 0) this.blinkAt = 2 + Math.random() * 4;
    if (this.faceDirty || blink !== this.lastBlink || ["love", "scared"].includes(this.mood)) {
      drawFace(this.faceCtx, this.mood, blink, g.time); this.faceTex.needsUpdate = true; this.faceDirty = false; this.lastBlink = blink;
    }
    if (this.rag) return this.updateRagdoll(dt);
    if (this.state === "disabled") return;
    const P = g.player, head = P.headWorld(_v3);
    const distP = head.distanceTo(this.pos);
    this.stateT += dt;
    // music → dance
    const music = g.weapons.musicSources().find((m) => m.distanceTo(this.pos) < 10);
    if (music && !["dance", "flee", "cower", "angry", "react", "getup"].includes(this.state)) { this.setState("dance", 6); this.play(Math.random() < 0.5 ? "dance" : "dance2", 0.4); this.setMood("love", 6); this.say("dance"); g.onDance && g.onDance(this); }
    // being aimed at → hands up
    const aimed = this.aimedAt();
    if (aimed && !["flee", "cower", "react", "getup", "dance", "angry"].includes(this.state)) { this.aimT += dt; if (this.aimT > 0.35 && this.state !== "handsUp") { this.setState("handsUp", 1); this.play("cheer", 0.25, 0.35); this.setMood("scared", 2); this.say("scared"); } }
    else this.aimT = 0;
    // wave-back
    if (this.waveCD <= 0 && ["idle", "walk", "look"].includes(this.state) && distP < 8) {
      if (this.playerWaving() || (distP < 2.3 && Math.random() < dt * 0.25)) { this.waveCD = 8; this.lookTarget = head.clone(); this.setState("wave", this.play("wave", 0.25)); this.setMood("happy", 3); this.say("happy"); g.onWave && g.onWave(this); }
    }
    // slap detection (hands are kinematic, so test them directly)
    for (const h of Object.values(P.hands)) {
      if (!h.active || h.held) continue;
      const sp = h.vel.length();
      if (sp < 2.8) continue;
      const lp = _v.copy(h.pos); const dy = THREE.MathUtils.clamp(lp.y - this.pos.y, 0.2, 1.7);
      if (Math.hypot(lp.x - this.pos.x, lp.z - this.pos.z) < 0.32 && lp.y - this.pos.y > 0 && lp.y - this.pos.y < 1.9) {
        if (sp > 5.5) { this.ragdoll(lp, h.vel.clone().multiplyScalar(3)); h.haptic(0.8, 50); g.audio.impact("plastic", lp, sp, 2); }
        else if (this.state !== "react") { this.flinch(lp, "hit"); h.haptic(0.5, 30); g.audio.impact("plastic", lp, sp, 1); }
        void dy;
        break;
      }
    }
    switch (this.state) {
      case "idle":
        if (this.curName !== "idle" && this.curName !== "idle2") this.play("idle", 0.3);
        if (distP < 3 && this.stateT > 0.5) this.lookTarget = head.clone(); else if (this.stateT > 2) this.lookTarget = null;
        if ((this.timer -= dt) <= 0) { const t = this.pickTarget(); if (t) { this.target = t; this.setState("walk", 12); this.play("walk", 0.3); } else this.timer = 2; }
        break;
      case "walk":
        if (this.curName !== "walk") this.play("walk", 0.3);
        this.lookTarget = distP < 4 ? head.clone() : null;
        if (!this.target || this.moveToward(this.target, 0.95, dt) || (this.timer -= dt) <= 0) { this.setState("idle", 2 + Math.random() * 4); this.play(Math.random() < 0.7 ? "idle" : "idle2", 0.4); }
        break;
      case "flee":
        if (this.curName !== "flee") this.play("flee", 0.2);
        if (this.moveToward(this.target, 3.1, dt) || (this.timer -= dt) <= 0) { this.setState("cower", 2 + Math.random() * 2); this.play("cower", 0.3); }
        break;
      case "look":
        if (this.lookTarget) this.facePoint(this.lookTarget, dt, 2.2);
        if ((this.timer -= dt) <= 0) { if (Math.random() < 0.35) this.setState("react", this.play("shrug", 0.3)); else { this.setState("idle", 1 + Math.random() * 3); this.play("idle", 0.4); } }
        break;
      case "wave":
        this.facePoint(head, dt, 3);
        if ((this.timer -= dt) <= 0) { this.setState("idle", 1.5); this.play("idle", 0.4); }
        break;
      case "handsUp":
        this.facePoint(head, dt, 3); this.lookTarget = head.clone();
        if (!aimed) { this.timer -= dt; if (this.timer <= 0) { this.setState("idle", 2); this.play("idle", 0.4); this.setMood("neutral", 1); } } else this.timer = 1;
        break;
      case "dance":
        if (!music) { this.timer -= dt; if (this.timer <= 0) { this.setState("idle", 2); this.play("idle", 0.5); } } else this.timer = 1.5;
        this.lookTarget = null;
        break;
      case "cower": case "react": case "angry": case "getup":
        if (this.state === "angry") { this.facePoint(head, dt, 2); this.lookTarget = head.clone(); }
        if ((this.timer -= dt) <= 0) { this.setState("idle", 1 + Math.random() * 2); this.play("idle", 0.35); if (this.state !== "angry") this.annoy = Math.max(0, this.annoy - 1); }
        break;
    }
    this.place();
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    if (this.blend) this.applyBlend(dt);
    this.headLook(dt);
  }

  applyBlend(dt) {
    const B = this.blend;
    B.t += dt;
    const k = Math.min(1, B.t / B.dur), s = k * k * (3 - 2 * k);
    // the snapshot was in ragdoll space; root was moved/rotated, so only blend joint rotations
    for (const [name, [q]] of Object.entries(B.snap)) {
      const b = this.bones[name]; if (!b || name === "Hips") continue;
      b.quaternion.slerpQuaternions(q, b.quaternion.clone(), s);
    }
    if (k >= 1) this.blend = null;
    this.root.updateMatrixWorld(true);
  }

  headLook(dt) {
    let ty = 0, tp = 0;
    if (this.lookTarget && !["dance", "flee", "cower", "getup"].includes(this.state)) {
      const hp = this.headPos(_v);
      const d = _v2.subVectors(this.lookTarget, hp);
      ty = Math.atan2(d.x, d.z) - this.yaw; ty = Math.atan2(Math.sin(ty), Math.cos(ty));
      tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      if (Math.abs(ty) > 1.4) { ty = 0; tp = 0; }
    }
    const k = 1 - Math.exp(-dt * 6);
    this.lookYaw += (THREE.MathUtils.clamp(ty, -1.1, 1.1) - this.lookYaw) * k;
    this.lookPitch += (THREE.MathUtils.clamp(tp, -0.5, 0.5) - this.lookPitch) * k;
    if (Math.abs(this.lookYaw) < 0.01 && Math.abs(this.lookPitch) < 0.01) return;
    const head = this.bones.Head;
    head.getWorldQuaternion(_q);
    const right = _v.set(1, 0, 0).applyQuaternion(this.root.quaternion);
    _q2.setFromAxisAngle(_v2.set(0, 1, 0), this.lookYaw).multiply(new THREE.Quaternion().setFromAxisAngle(right, -this.lookPitch));
    const wq = _q2.multiply(_q);
    head.parent.getWorldQuaternion(_q);
    head.quaternion.copy(_q.invert().multiply(wq));
    head.updateMatrixWorld(true);
  }

  aimedAt() {
    const W = this.game.weapons;
    for (const h of Object.values(this.game.player.hands)) {
      const gun = W.heldWeapon(h);
      if (!gun || !["blaster", "dart", "grav"].includes(gun.weapon.type)) continue;
      const mz = new THREE.Vector3(), dir = new THREE.Vector3();
      W.muzzle(gun, mz, dir);
      const c = this.chestPos(_v);
      const to = _v2.subVectors(c, mz); const along = to.dot(dir);
      if (along < 0.5 || along > 12) continue;
      const perp = to.addScaledVector(dir, -along).length();
      if (perp < 0.45) return true;
    }
    return false;
  }
  playerWaving() {
    const P = this.game.player, head = P.headWorld(_v);
    for (const h of Object.values(P.hands)) {
      if (!h.active || h.held || h.pos.y < head.y - 0.1) continue;
      if (Math.abs(h.vel.x) + Math.abs(h.vel.z) > 1.3 && Math.abs(h.vel.y) < 1.2) return true;
    }
    return false;
  }

  updateRagdoll(dt) {
    const R = this.rag;
    R.t += dt;
    const pel = R.parts.pelvis.body;
    const v = tv(pel.linvel()).length();
    const held = Object.values(R.parts).some((p) => p.heldBy?.length) || Object.values(R.parts).some((p) => p.body.gravityScale && p.body.gravityScale() === 0);
    if (v < 0.35 && !held) R.still += dt; else R.still = 0;
    const p = tv(pel.translation());
    this.pos.set(p.x, this.pos.y, p.z);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y - 30, z: p.z }); // park the capsule out of the way
    if (p.y < -15) { this.reset(); return; }
    // let a resting ragdoll sleep (and stop driving bones) until something touches it
    const parts = Object.values(R.parts);
    if (R.still > 1.5 && !held && !R.asleep) { parts.forEach((q) => q.body.sleep()); R.asleep = true; }
    if (R.asleep && parts.some((q) => !q.body.isSleeping())) { R.asleep = false; R.still = 0; }
    if (this.state === "disabled") return;
    if (R.t > 2.2 && R.still > 1.1) this.unragdoll();
  }
}
