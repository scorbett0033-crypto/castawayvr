// Physical buttons & switches (pressed by your fingertip), keypads, hinged doors,
// sliding doors, drawers, levers and pop-up range targets.
import * as THREE from "three";
import { RAPIER, GROUPS, MATS, tv, tq } from "./physics.js";
import { canvasTex } from "./textures.js";

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export function labelTex(text, { w = 256, h = 64, bg = "rgba(10,14,18,0.85)", fg = "#ffd28a", font = "bold 30px sans-serif" } = {}) {
  return canvasTex(w, h, (c) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = font; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, w / 2, h / 2 + 2); });
}

export class Interactables {
  constructor(game) {
    this.game = game;
    this.buttons = []; this.sliders = []; this.levers = []; this.targets = []; this.doors = [];
    this.pickables = []; // meshes desktop can click
    this.mat = {
      base: new THREE.MeshStandardMaterial({ color: 0x23282d, metalness: 0.6, roughness: 0.45 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.85, roughness: 0.35 }),
      handle: new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 1, roughness: 0.25 }),
    };
  }

  /* ---------- buttons ---------- */
  // pos: centre of the base, normal: direction the button faces
  button(pos, normal, { color = 0xff4a2a, radius = 0.045, label = null, onPress, toggle = false, on = false, parent = null } = {}) {
    const g = new THREE.Group();
    g.position.copy(pos); g.quaternion.setFromUnitVectors(UP, normal.clone().normalize());
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.35, radius * 1.45, 0.02, 24), this.mat.base); base.position.y = 0.01;
    const capMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: on ? 0.9 : 0.35, roughness: 0.4 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.025, 24), capMat); cap.position.y = 0.032;
    g.add(base, cap);
    if (label) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(radius * 4.2, radius * 1.05), new THREE.MeshBasicMaterial({ map: labelTex(label), transparent: true }));
      l.position.set(0, 0.0205, radius * 2.0); l.rotation.x = -Math.PI / 2; g.add(l);
    }
    (parent || this.game.scene).add(g);
    const b = { g, cap, capMat, radius, onPress, toggle, on, latched: false, depth: 0, normal: normal.clone().normalize(), pos: pos.clone() };
    cap.userData.interact = () => this.fire(b);
    this.pickables.push(cap);
    this.buttons.push(b);
    return b;
  }
  fire(b) {
    if (b.toggle) { b.on = !b.on; b.capMat.emissiveIntensity = b.on ? 0.9 : 0.35; }
    this.game.audio.play("click", b.pos, { vol: 0.7 });
    b.pressAnim = 0.15;
    b.onPress && b.onPress(b.on, b);
  }

  keypad(pos, normal, code, onOpen) {
    const g = new THREE.Group();
    g.position.copy(pos); g.lookAt(_v.copy(pos).add(normal));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.025), this.mat.base); g.add(plate);
    const disp = document.createElement("canvas"); disp.width = 256; disp.height = 64;
    const dt = new THREE.CanvasTexture(disp); dt.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), new THREE.MeshBasicMaterial({ map: dt })); screen.position.set(0, 0.11, 0.0135); g.add(screen);
    this.game.scene.add(g);
    g.updateMatrixWorld(true);
    const state = { entry: "", open: false };
    const draw = (msg, col = "#46f0ff") => { const c = disp.getContext("2d"); c.fillStyle = "#020a0c"; c.fillRect(0, 0, 256, 64); c.fillStyle = col; c.font = "bold 40px monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(msg, 128, 34); dt.needsUpdate = true; };
    draw("----");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"];
    keys.forEach((k, i) => {
      const lx = ((i % 3) - 1) * 0.055, ly = 0.04 - Math.floor(i / 3) * 0.05;
      const wp = new THREE.Vector3(lx, ly, 0.0125).applyMatrix4(g.matrixWorld);
      const b = this.button(wp, normal, { color: k === "OK" ? 0x38d070 : k === "C" ? 0xff5040 : 0x9aa7b0, radius: 0.019, onPress: () => {
        if (state.open) return;
        if (k === "C") state.entry = "";
        else if (k === "OK") {
          if (state.entry === code) { state.open = true; draw("OPEN", "#5dff8a"); this.game.audio.play("ok", pos); onOpen && onOpen(); return; }
          draw("DENIED", "#ff5040"); this.game.audio.play("err", pos); state.entry = ""; setTimeout(() => !state.open && draw("----"), 900); return;
        } else if (state.entry.length < 4) state.entry += k;
        this.game.audio.play("beep", pos, { vol: 0.5, rate: 0.8 + i * 0.03 });
        draw(state.entry.padEnd(4, "-"));
      } });
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: labelTex(k, { w: 64, h: 64, bg: "rgba(0,0,0,0)", fg: "#0b0e10", font: "bold 34px sans-serif" }), transparent: true }));
      lab.position.set(0, 0.046, 0); lab.rotation.x = -Math.PI / 2; b.g.add(lab);
    });
    return state;
  }

  /* ---------- hinged door (dynamic, on a revolute joint) ---------- */
  hingedDoor(hinge, yaw, width, height, { mat, thickness = 0.05, limits = [-1.75, 1.75], mass = 22, sound = "wood", label = null, spring = 4 } = {}) {
    const g = this.game, q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const mesh = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), mat); panel.position.set(width / 2, height / 2, 0); panel.castShadow = panel.receiveShadow = true;
    mesh.add(panel);
    for (const s of [1, -1]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 10), this.mat.handle); h.position.set(width - 0.09, 1.0, s * (thickness / 2 + 0.045)); mesh.add(h);
      for (const yy of [-0.05, 0.05]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.045), this.mat.handle); arm.position.set(width - 0.09, 1.0 + yy, s * (thickness / 2 + 0.022)); mesh.add(arm); }
    }
    if (label) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: labelTex(label), transparent: true })); l.position.set(width / 2, 1.65, thickness / 2 + 0.003); mesh.add(l); const l2 = l.clone(); l2.position.z *= -1; l2.rotation.y = Math.PI; mesh.add(l2); }
    mesh.position.copy(hinge); mesh.quaternion.copy(q);
    g.scene.add(mesh);
    const ent = { kind: "door", mesh, jointed: true, grabbable: true, mass, sound };
    const cd = RAPIER.ColliderDesc.cuboid(width / 2 - 0.01, height / 2 - 0.01, thickness / 2).setTranslation(width / 2, height / 2 + 0.005, 0).setMass(mass);
    g.physics.createBody(ent, { pos: hinge, quat: q, colliders: [cd], mat: MATS[sound === "wood" ? "wood" : "metal"], linDamp: 0.5, angDamp: 2.5, mass });
    const anchor = g.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hinge.x, hinge.y, hinge.z).setRotation(q));
    const data = RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const j = g.physics.world.createImpulseJoint(data, anchor, ent.body, true);
    j.setLimits(limits[0], limits[1]);
    if (spring) j.configureMotorPosition(0, spring, spring * 0.6);
    ent.joint = j;
    this.doors.push(ent);
    return ent;
  }

  /* ---------- sliding door (kinematic) ---------- */
  slidingDoor(center, yaw, width, height, { mat, auto = true, open = false, slide = null, speed = 1.6, sound = "servo", locked = false, label = null } = {}) {
    const g = this.game, q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const mesh = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.12), mat); panel.castShadow = panel.receiveShadow = true; mesh.add(panel);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.08, 0.125), new THREE.MeshStandardMaterial({ color: 0xffb21a, emissive: 0x442200 })); stripe.position.y = -height * 0.1; mesh.add(stripe);
    if (label) for (const s of [1, -1]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: labelTex(label), transparent: true })); l.position.set(0, height * 0.25, s * 0.064); if (s < 0) l.rotation.y = Math.PI; mesh.add(l); }
    mesh.position.copy(center); mesh.quaternion.copy(q);
    g.scene.add(mesh);
    const ent = { kind: "slider", mesh };
    g.physics.createBody(ent, { type: "kinematic", pos: center, quat: q, colliders: [RAPIER.ColliderDesc.cuboid(width / 2, height / 2, 0.06)], groups: GROUPS.static, events: false, mat: MATS.metal });
    const d = { ent, mesh, closed: center.clone(), dir: slide || new THREE.Vector3(1, 0, 0).applyQuaternion(q), dist: width * 0.98, t: open ? 1 : 0, want: open ? 1 : 0, auto, speed, sound, locked };
    this.sliders.push(d);
    return d;
  }
  setSlider(d, open) { if (d.locked && open) return; if (d.want !== (open ? 1 : 0)) { d.want = open ? 1 : 0; this.game.audio.play(d.sound, d.closed, { vol: 0.7, ref: 3 }); } }

  /* ---------- drawer (dynamic, prismatic) ---------- */
  drawer(pos, yaw, w, h, d, { mat, contents = null } = {}) {
    const g = this.game, q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const mesh = new THREE.Group(), t = 0.012;
    const parts = [[w, t, d, 0, -h / 2 + t / 2, 0], [t, h, d, -w / 2 + t / 2, 0, 0], [t, h, d, w / 2 - t / 2, 0, 0], [w, h, t, 0, 0, -d / 2 + t / 2], [w + 0.02, h + 0.02, 0.018, 0, 0, d / 2]];
    const descs = [];
    for (const [a, b, c, x, y, z] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; mesh.add(m);
      descs.push(RAPIER.ColliderDesc.cuboid(a / 2, b / 2, c / 2).setTranslation(x, y, z).setMass(0.6));
    }
    const hd = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.02, 0.025), this.mat.handle); hd.position.set(0, h * 0.15, d / 2 + 0.03); mesh.add(hd);
    descs.push(RAPIER.ColliderDesc.cuboid(w * 0.2, 0.012, 0.014).setTranslation(0, h * 0.15, d / 2 + 0.03).setMass(0.1));
    mesh.position.copy(pos); mesh.quaternion.copy(q);
    g.scene.add(mesh);
    const ent = { kind: "door", mesh, jointed: true, grabbable: true, mass: 3, sound: "wood" };
    g.physics.createBody(ent, { pos, quat: q, colliders: descs, mat: MATS.wood, linDamp: 3, angDamp: 5, mass: 3 });
    const anchor = g.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z).setRotation(q));
    const data = RAPIER.JointData.prismatic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    g.physics.world.createImpulseJoint(data, anchor, ent.body, true).setLimits(0, d * 0.8);
    if (contents) contents(mesh);
    return ent;
  }

  /* ---------- lever ---------- */
  lever(pos, yaw, onPull) {
    const g = this.game, q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.12), this.mat.base); base.position.copy(pos); base.quaternion.copy(q); g.scene.add(base);
    const mesh = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 10), this.mat.metal); arm.position.y = 0.22; mesh.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff3a2a, roughness: 0.4 })); knob.position.y = 0.46; mesh.add(knob);
    mesh.traverse((m) => (m.castShadow = true));
    const pivot = pos.clone().add(new THREE.Vector3(0, 0.05, 0.07).applyQuaternion(q));
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.45); // leans back against its stop
    const q0 = q.clone().multiply(tilt);
    mesh.position.copy(pivot); mesh.quaternion.copy(q0); g.scene.add(mesh);
    const ent = { kind: "door", mesh, jointed: true, grabbable: true, mass: 2, sound: "metal" };
    g.physics.createBody(ent, { pos: pivot, quat: q0, colliders: [RAPIER.ColliderDesc.capsule(0.22, 0.03).setTranslation(0, 0.24, 0).setMass(1.5), RAPIER.ColliderDesc.ball(0.05).setTranslation(0, 0.46, 0).setMass(0.5)], mat: MATS.metal, angDamp: 3, mass: 2 });
    const anchor = g.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x, pivot.y, pivot.z).setRotation(q0));
    const data = RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const j = g.physics.world.createImpulseJoint(data, anchor, ent.body, true);
    j.setLimits(0, 0.95); // toggle: once pulled past vertical, gravity takes it to the far stop // spring back up; a firm pull overcomes it
    const L = { ent, q0, onPull, fired: false, j };
    this.levers.push(L);
    knob.userData.interact = () => { if (!L.fired) { ent.body.applyImpulseAtPoint(new THREE.Vector3(0, 0, 6).applyQuaternion(q0), tv(ent.body.translation()).add(new THREE.Vector3(0, 0.46, 0)), true); } };
    this.pickables.push(knob);
    return L;
  }

  /* ---------- pop-up target ---------- */
  target(pos, yaw, onHit) {
    const g = this.game, q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.2), this.mat.base); base.position.copy(pos).add(new THREE.Vector3(0, 0.04, 0)); base.quaternion.copy(q); g.scene.add(base);
    const mesh = new THREE.Group();
    const tex = canvasTex(256, 320, (c) => {
      c.fillStyle = "#f2efe6"; c.fillRect(0, 0, 256, 320);
      c.fillStyle = "#16191c"; c.beginPath(); c.arc(128, 70, 46, 0, 7); c.fill(); c.fillRect(56, 120, 144, 200);
      for (const [r, col] of [[80, "#ff3a2a"], [56, "#f2efe6"], [32, "#ff3a2a"], [12, "#f2efe6"]]) { c.fillStyle = col; c.beginPath(); c.arc(128, 200, r, 0, 7); c.fill(); }
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.03), [this.mat.metal, this.mat.metal, this.mat.metal, this.mat.metal, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), this.mat.metal]);
    plate.position.y = 0.36; plate.castShadow = true; mesh.add(plate);
    const pivot = pos.clone().add(new THREE.Vector3(0, 0.08, 0));
    mesh.position.copy(pivot); mesh.quaternion.copy(q); g.scene.add(mesh);
    const ent = { kind: "target", mesh, mass: 3, sound: "metal" };
    g.physics.createBody(ent, { pos: pivot, quat: q, colliders: [RAPIER.ColliderDesc.cuboid(0.225, 0.3, 0.015).setTranslation(0, 0.36, 0).setMass(3)], mat: MATS.metal, angDamp: 1, mass: 3 });
    const anchor = g.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x, pivot.y, pivot.z).setRotation(q));
    const data = RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const j = g.physics.world.createImpulseJoint(data, anchor, ent.body, true);
    j.setLimits(-1.6, 0.05);
    const T = { ent, j, up: true, onHit, q0: q };
    ent.onShot = () => this.knockTarget(T);
    this.setTarget(T, false);
    this.targets.push(T);
    return T;
  }
  setTarget(T, up) { T.up = up; T.j.configureMotorPosition(up ? 0 : -1.55, 260, 26); T.ent.body.wakeUp(); }
  knockTarget(T) { if (!T.up) return; this.setTarget(T, false); this.game.audio.play("metal", tv(T.ent.body.translation()), { vol: 0.8, rate: 1.3 }); T.onHit && T.onHit(T); }

  /* ---------- update ---------- */
  update(dt) {
    const g = this.game, hands = Object.values(g.player.hands).filter((h) => h.active);
    const tips = hands.map((h) => ({ h, p: h.fingertip(new THREE.Vector3()), palm: h.pos }));
    for (const b of this.buttons) {
      let depth = 0;
      for (const t of tips) {
        for (const p of [t.p, t.palm]) {
          _v.subVectors(p, b.pos);
          const along = _v.dot(b.normal);
          const lat = _v.addScaledVector(b.normal, -along).length();
          if (lat < b.radius * 1.15 && along < 0.06 && along > -0.03) depth = Math.max(depth, Math.min(0.018, 0.045 - along));
        }
      }
      if (b.pressAnim > 0) { b.pressAnim -= dt; depth = Math.max(depth, 0.016); }
      b.depth = depth;
      b.cap.position.y = 0.032 - Math.max(0, depth);
      if (depth > 0.012 && !b.latched) { b.latched = true; if (!(b.pressAnim > 0)) { this.fire(b); for (const t of tips) if (_v2.subVectors(t.p, b.pos).length() < 0.1) t.h.haptic(0.5, 30); } }
      if (depth < 0.004) b.latched = false;
    }
    const head = g.player.headWorld(_v2);
    for (const d of this.sliders) {
      if (d.auto && !d.locked) { const near = head.distanceTo(d.closed) < 2.8 || g.npcs.list.some((n) => !n.rag && n.pos.distanceTo(d.closed) < 2.2); this.setSlider(d, near); }
      if (d.t !== d.want) {
        d.t = d.want > d.t ? Math.min(1, d.t + dt * d.speed) : Math.max(0, d.t - dt * d.speed);
        const k = d.t * d.t * (3 - 2 * d.t);
        const p = _v.copy(d.closed).addScaledVector(d.dir, d.dist * k);
        d.ent.body.setNextKinematicTranslation(p); d.mesh.position.copy(p);
      }
    }
    for (const L of this.levers) {
      if (L.fired) continue;
      _q.copy(L.q0).invert().multiply(tq(L.ent.body.rotation()));
      const ang = 2 * Math.atan2(_q.x, _q.w);
      if (ang > 0.75) { L.fired = true; this.game.audio.play("clack", tv(L.ent.body.translation()), { vol: 1, rate: 0.7 }); L.onPull && L.onPull(); }
    }
  }

  // desktop click: raycast against the small interactive meshes
  pick(ray) {
    const hits = ray.intersectObjects(this.pickables, false);
    if (hits.length && hits[0].distance < 3) { hits[0].object.userData.interact(); return true; }
    return false;
  }
}
