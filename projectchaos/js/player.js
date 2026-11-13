// Player rig: XR controllers / hand tracking / desktop input, physical hands,
// collision-aware room-scale + smooth locomotion, snap/smooth turn, teleport, jump.
import * as THREE from "three";
import { RAPIER, GROUPS, G, grp } from "./physics.js";
import { makeHand } from "./hands.js";

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
// Hand model frame: fingers -Z, back of hand +Y, thumb toward the index side.
// WebXR grip space: -Z along the handle (forward), +X out of the back of a right hand / palm of a left hand,
// so the right hand is rolled -90° (back to +X, thumb up) and the left +90°; the palm wraps the handle.
const HAND_OFFSET = (side) => new THREE.Matrix4().compose(new THREE.Vector3(0.028 * side, -0.012, 0.035), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, (-Math.PI / 2) * side)), new THREE.Vector3(1, 1, 1));
const BTN = { trigger: 0, grip: 1, stick: 3, a: 4, b: 5 };

export class Hand {
  constructor(game, side) {
    this.game = game;
    this.side = side; this.sign = side === "left" ? -1 : 1;
    this.grip = new THREE.Object3D(); // pose source (rig space in XR)
    this.aim = new THREE.Object3D();
    this.source = null;
    this.model = makeHand(this.sign);
    this.visual = new THREE.Group(); this.visual.add(this.model);
    game.scene.add(this.visual);
    this.offset = HAND_OFFSET(this.sign);
    this.in = { trigger: 0, grip: 0, a: false, b: false, stick: false, sx: 0, sy: 0, thumbTouch: false, triggerTouch: false };
    this.prev = { ...this.in };
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); // palm world pose
    this.aimPos = new THREE.Vector3(); this.aimQuat = new THREE.Quaternion(); this.aimDir = new THREE.Vector3(0, 0, -1);
    this.vel = new THREE.Vector3(); this.angVel = new THREE.Vector3();
    this.hist = [];
    this.lastPos = new THREE.Vector3(); this.lastQuat = new THREE.Quaternion();
    this.held = null; this.active = false; this.tracked = false;
    this.overrideVisual = null; // world matrix while holding something
    this.noCollideUntil = 0;
    const ent = { kind: "hand", hand: this, mass: 1.5, kinVel: this.vel, sound: "flesh" };
    this.ent = ent;
    game.physics.createBody(ent, { type: "kinematic", pos: new THREE.Vector3(0, -10, 0), colliders: [RAPIER.ColliderDesc.ball(0.042)], groups: GROUPS.hand, events: false, mat: { friction: 0.9, restitution: 0, sound: "flesh" } });
    this.body = ent.body;
    this.collides = true;
  }
  pressed(k) { return this.in[k] && !this.prev[k]; }
  released(k) { return !this.in[k] && this.prev[k]; }
  gripDown() { return this.in.grip > 0.6; }
  gripPressed() { return this.in.grip > 0.6 && this.prev.grip <= 0.6; }
  gripReleased() { return this.in.grip < 0.35 && this.prev.grip >= 0.35; }
  triggerDown() { return this.in.trigger > 0.55; }
  triggerPressed() { return this.in.trigger > 0.55 && this.prev.trigger <= 0.55; }
  triggerReleased() { return this.in.trigger < 0.4 && this.prev.trigger >= 0.4; }
  haptic(intensity, ms) {
    const gp = this.source?.gamepad;
    const a = gp && (gp.hapticActuators?.[0] || gp.vibrationActuator);
    try { if (a?.pulse) a.pulse(intensity, ms); else if (a?.playEffect) a.playEffect("dual-rumble", { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity }); } catch { /* unsupported */ }
  }
  fingertip(out) { return this.model.userData.indexTip.getWorldPosition(out); }
  setCollide(on) {
    if (on === this.collides) return;
    this.collides = on;
    this.game.physics.setGroups(this.ent, on ? GROUPS.hand : GROUPS.none);
  }
}

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = new THREE.Group();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 600);
    this.camera.position.set(0, 1.65, 0);
    this.rig.add(this.camera);
    game.scene.add(this.rig);
    this.hands = { left: new Hand(game, "left"), right: new Hand(game, "right") };
    this.feet = new THREE.Vector3(0, 0, 3);
    this.vy = 0; this.grounded = true; this.yaw = 0;
    this.xr = false; this.desktop = false;
    this.turnReady = true; this.sprint = false;
    this.gravityScale = 1;
    // body (kinematic character controller)
    const ent = { kind: "player", mass: 75 };
    game.physics.createBody(ent, { type: "kinematic", pos: new THREE.Vector3(0, 0.65, 3), colliders: [RAPIER.ColliderDesc.capsule(0.43, 0.2)], groups: GROUPS.player, events: false, mat: { friction: 0, restitution: 0 } });
    this.body = ent.body; this.collider = ent.colliders[0];
    this.cc = game.physics.world.createCharacterController(0.02);
    this.cc.setUp({ x: 0, y: 1, z: 0 });
    this.cc.enableAutostep(0.32, 0.12, false);
    this.cc.enableSnapToGround(0.25);
    this.cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.cc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.cc.setApplyImpulsesToDynamicBodies(true);
    if (this.cc.setCharacterMass) this.cc.setCharacterMass(75);
    this.ccFilter = (c) => { const e = game.physics.entOf(c); return !(e && e.kind === "prop" && (e.mass < 15 || e.heldBy)); };
    // teleport arc
    const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
    this.arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9 }));
    this.arc.frustumCulled = false; this.arc.visible = false; game.scene.add(this.arc);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.visible = false; game.scene.add(this.marker);
    this.teleTarget = null; this.teleHand = null;
    // fade sphere + comfort vignette
    this.fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false }));
    this.fadeMesh.renderOrder = 999; this.camera.add(this.fadeMesh);
    this.fade = 0; this.fadeTo = 0; this.fadeThen = null;
    const vt = document.createElement("canvas"); vt.width = vt.height = 128; const vc = vt.getContext("2d");
    const gr = vc.createRadialGradient(64, 64, 22, 64, 64, 64); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)"); vc.fillStyle = gr; vc.fillRect(0, 0, 128, 128);
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vt), transparent: true, opacity: 0, depthTest: false }));
    this.vignette.position.z = -0.2; this.vignette.renderOrder = 998; this.camera.add(this.vignette);
    // desktop state
    this.keys = {}; this.pitch = 0; this.mouse = { l: false, r: false, wheel: 0 };
    this.belt = new THREE.Group(); game.scene.add(this.belt);
  }

  /* ---------------- XR setup ---------------- */
  initXR(renderer) {
    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i), xrHand = renderer.xr.getHand(i);
      this.rig.add(ctrl, grip, xrHand);
      const slot = { ctrl, grip, xrHand, hand: null };
      ctrl.addEventListener("connected", (e) => {
        const side = e.data.handedness === "left" ? "left" : "right";
        const h = this.hands[side];
        slot.hand = h; h.source = e.data; h.xrGrip = grip; h.xrAim = ctrl; h.xrHand = e.data.hand ? xrHand : null; h.active = true;
      });
      ctrl.addEventListener("disconnected", () => { if (slot.hand) { slot.hand.active = false; slot.hand.source = null; } });
    }
  }

  /* ---------------- desktop ---------------- */
  initDesktop(dom) {
    this.desktop = true;
    const R = this.hands.right;
    R.active = true;
    this.hands.left.visual.visible = false;
    this.deskHand = new THREE.Object3D(); this.deskHand.position.set(0.16, -0.2, -0.42); this.camera.add(this.deskHand);
    this.deskDist = 0.42;
    addEventListener("keydown", (e) => { this.keys[e.code] = true; if (e.code === "Tab") e.preventDefault(); });
    addEventListener("keyup", (e) => { this.keys[e.code] = false; });
    dom.addEventListener("mousedown", (e) => {
      if (!document.pointerLockElement && !this.game.ui.menuOpen) { dom.requestPointerLock(); return; }
      if (e.button === 0) this.mouse.l = true; if (e.button === 2) this.mouse.r = true;
    });
    addEventListener("mouseup", (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0022; this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.5, 1.5);
    });
    addEventListener("wheel", (e) => { this.mouse.wheel += Math.sign(e.deltaY); });
  }

  readDesktop(dt) {
    const R = this.hands.right, k = this.keys;
    R.prev = { ...R.in };
    this.rig.rotation.y = this.yaw;
    this.camera.rotation.set(this.pitch, 0, 0, "YXZ");
    this.camera.position.y = k.ControlLeft || k.KeyC ? 1.0 : 1.65;
    if (this.mouse.wheel) { this.deskDist = THREE.MathUtils.clamp(this.deskDist - this.mouse.wheel * 0.06, 0.3, 1.6); this.mouse.wheel = 0; }
    this.deskHand.position.set(0.16, -0.2 + (this.deskDist - 0.42) * 0.25, -this.deskDist);
    R.in.trigger = this.mouse.l ? 1 : 0;
    R.in.grip = this.mouse.r || k.KeyE ? 1 : 0;
    R.in.a = !!k.KeyF; R.in.b = false;
    R.in.thumbTouch = true; R.in.triggerTouch = this.mouse.l;
    this.desktopMenu = !!k.Tab; this.desktopReload = !!k.KeyR; this.desktopThrow = !!k.KeyQ;
  }

  readXRHand(h) {
    h.prev = { ...h.in };
    const gp = h.source?.gamepad;
    if (gp) {
      const b = gp.buttons, ax = gp.axes;
      h.in.trigger = b[0]?.value || 0; h.in.grip = b[1]?.value || 0;
      h.in.stick = !!b[3]?.pressed; h.in.a = !!b[4]?.pressed; h.in.b = !!b[5]?.pressed;
      h.in.sx = ax.length >= 4 ? ax[2] : ax[0] || 0; h.in.sy = ax.length >= 4 ? ax[3] : ax[1] || 0;
      h.in.triggerTouch = !!b[0]?.touched || h.in.trigger > 0.05;
      h.in.thumbTouch = !!(b[3]?.touched || b[4]?.touched || b[5]?.touched || b[6]?.touched);
      h.tracked = false;
    } else if (h.xrHand) {
      // hand tracking: pinch = trigger, fist = grip
      const J = h.xrHand.joints;
      const tt = J["thumb-tip"], it = J["index-finger-tip"];
      if (tt && it) {
        const d = tt.position.distanceTo(it.position);
        h.in.trigger = THREE.MathUtils.clamp(1 - (d - 0.012) / 0.03, 0, 1);
        const curl = (name) => {
          const a = J[`${name}-metacarpal`], b = J[`${name}-phalanx-proximal`], c = J[`${name}-phalanx-intermediate`] || J[`${name}-phalanx-distal`], t = J[`${name}-tip`];
          if (!a || !b || !c || !t) return 0;
          _v.subVectors(b.position, a.position).normalize(); _v2.subVectors(t.position, c.position).normalize();
          return THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(_v.dot(_v2), -1, 1)) / 2.2, 0, 1);
        };
        h.curls = [curl("thumb"), curl("index"), curl("middle"), curl("ring"), curl("pinky")];
        h.in.grip = (h.curls[2] + h.curls[3] + h.curls[4]) / 3 > 0.55 ? 1 : 0;
        h.tracked = true;
      }
      h.in.sx = h.in.sy = 0;
    }
  }

  /* ---------------- per-frame ---------------- */
  update(dt) {
    const g = this.game;
    if (this.desktop && !this.xr) this.readDesktop(dt);
    else for (const h of Object.values(this.hands)) this.readXRHand(h);
    this.updateHandPoses(dt);
    this.locomotion(dt);
    this.updateHandPoses(0); // re-evaluate after the rig moved
    this.updateBelt(dt);
    this.updateFade(dt);
  }

  updateHandPoses(dt) {
    const g = this.game;
    this.rig.updateMatrixWorld(true);
    for (const h of Object.values(this.hands)) {
      if (!h.active) { h.visual.visible = false; continue; }
      let src = null;
      if (this.xr) {
        if (h.xrHand && h.tracked && h.xrHand.joints.wrist) {
          const w = h.xrHand.joints.wrist; w.updateWorldMatrix(true, false);
          _m.copy(w.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.045));
          src = _m;
        } else if (h.xrGrip) { h.xrGrip.updateWorldMatrix(true, false); src = _m.copy(h.xrGrip.matrixWorld).multiply(h.offset); }
        if (h.xrAim) { h.xrAim.updateWorldMatrix(true, false); h.xrAim.matrixWorld.decompose(h.aimPos, h.aimQuat, _v); }
      } else {
        this.deskHand.updateWorldMatrix(true, false);
        src = _m.copy(this.deskHand.matrixWorld).multiply(h.offset);
        this.camera.getWorldPosition(h.aimPos); this.camera.getWorldQuaternion(h.aimQuat);
      }
      if (!src) continue;
      src.decompose(h.pos, h.quat, _v);
      h.aimDir.set(0, 0, -1).applyQuaternion(h.aimQuat);
      if (dt > 0) {
        // velocity estimate (world, includes locomotion)
        _v.subVectors(h.pos, h.lastPos).divideScalar(Math.max(dt, 1e-3));
        h.hist.push(_v.clone()); if (h.hist.length > 6) h.hist.shift();
        h.vel.copy(_v);
        _q.copy(h.lastQuat).invert().premultiply(h.quat);
        if (_q.w < 0) { _q.x *= -1; _q.y *= -1; _q.z *= -1; _q.w *= -1; }
        const ang = 2 * Math.acos(Math.min(1, _q.w)), s = Math.sqrt(1 - _q.w * _q.w);
        if (s > 1e-4) h.angVel.set(_q.x / s, _q.y / s, _q.z / s).multiplyScalar(ang / dt); else h.angVel.set(0, 0, 0);
        h.lastPos.copy(h.pos); h.lastQuat.copy(h.quat);
        h.body.setNextKinematicTranslation(h.pos);
        h.setCollide(!h.held && g.time > h.noCollideUntil && !g.ui.menuOpen);
      }
      // visual
      h.visual.visible = true;
      if (h.overrideVisual) h.overrideVisual.decompose(h.visual.position, h.visual.quaternion, _v);
      else { h.visual.position.copy(h.pos); h.visual.quaternion.copy(h.quat); }
      // fingers
      const ud = h.model.userData;
      if (h.held && h.held.pose) ud.setFingers(...h.held.pose);
      else if (h.tracked && h.curls) ud.setFingers(...h.curls);
      else {
        const pointing = !h.in.triggerTouch;
        ud.setFingers(h.in.thumbTouch ? 0.55 + h.in.grip * 0.4 : 0.05 + h.in.grip * 0.3, pointing ? 0.02 : 0.25 + h.in.trigger * 0.75, 0.1 + h.in.grip * 0.9);
      }
      ud.update(dt);
    }
  }

  headWorld(out) { return this.camera.getWorldPosition(out); }
  headYaw() { _v.set(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(_q2)); return Math.atan2(-_v.x, -_v.z); }

  locomotion(dt) {
    const g = this.game, S = g.settings, L = this.hands.left, Rh = this.hands.right;
    let mx = 0, mz = 0, speed = 2.6;
    const menu = g.ui.menuOpen;
    if (this.desktop && !this.xr) {
      const k = this.keys;
      mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0); mz = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
      if (k.ShiftLeft) speed = 4.6;
      if (k.Space && this.grounded) this.jump();
    } else {
      if (!menu && S.locomotion !== "teleport") { mx = L.in.sx; mz = L.in.sy; }
      if (L.pressed("stick")) this.sprint = !this.sprint;
      if (Math.hypot(mx, mz) < 0.15) { mx = mz = 0; this.sprint = false; }
      if (this.sprint) speed = 4.6;
      if (Rh.pressed("b") && this.grounded && !menu) this.jump();
      // turning
      const tx = Rh.in.sx;
      if (S.turn === "smooth") { if (Math.abs(tx) > 0.2) this.yaw -= tx * S.turnSpeed * dt; }
      else {
        if (Math.abs(tx) > 0.65 && this.turnReady) { this.yaw -= Math.sign(tx) * (S.turn === "snap30" ? Math.PI / 6 : Math.PI / 4); this.turnReady = false; g.audio.play("click", null, { vol: 0.15 }); }
        if (Math.abs(tx) < 0.3) this.turnReady = true;
      }
      this.rig.rotation.y = this.yaw;
      // teleport aiming: right stick forward (or left stick in teleport mode)
      const teleHand = S.locomotion !== "smooth" && Rh.in.sy < -0.6 ? Rh : S.locomotion === "teleport" && L.in.sy < -0.6 ? L : null;
      if (teleHand && !menu) this.aimTeleport(teleHand);
      else if (this.teleHand) { if (this.teleTarget) this.teleport(this.teleTarget); this.teleHand = null; this.teleTarget = null; this.arc.visible = this.marker.visible = false; }
    }
    // direction relative to head yaw
    const hy = this.desktop && !this.xr ? this.yaw : this.headYaw();
    const c = Math.cos(hy), s = Math.sin(hy);
    const move = _v.set(mx * c + mz * s, 0, -mx * s + mz * c);
    if (move.lengthSq() > 1) move.normalize();
    move.multiplyScalar(speed);
    this.moving = move.length();
    // gravity / zones
    const zoneG = g.world?.gravityAt ? g.world.gravityAt(this.feet) : 1;
    this.vy += g.physics.gravityY * zoneG * dt;
    if (this.vy < -30) this.vy = -30;
    // head-follow (room scale) + stick move + vertical
    this.camera.updateMatrix();
    const hl = this.camera.position; // rig-local head
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const headX = this.rig.position.x + hl.x * cy + hl.z * sy, headZ = this.rig.position.z - hl.x * sy + hl.z * cy;
    const want = _v2.set(headX - this.feet.x + move.x * dt, this.vy * dt, headZ - this.feet.z + move.z * dt);
    if (Math.hypot(want.x, want.z) > 1.2) { want.x = 0; want.z = 0; this.feet.x = headX; this.feet.z = headZ; } // recover from big jumps
    this.cc.computeColliderMovement(this.collider, want, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, grp(0xffff, G.STATIC | G.PROP | G.NPC), this.ccFilter);
    const m = this.cc.computedMovement();
    this.feet.x += m.x; this.feet.y += m.y; this.feet.z += m.z;
    this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    if (m.y < want.y * 0.5 && this.vy > 0) this.vy = 0; // bonked head
    if (this.feet.y < -20) this.respawn();
    this.body.setNextKinematicTranslation({ x: this.feet.x, y: this.feet.y + 0.65, z: this.feet.z });
    // rig follows the body so the head stays above the collider
    this.rig.position.set(this.feet.x - (hl.x * cy + hl.z * sy), this.feet.y + (this.xr ? S.heightOffset : 0), this.feet.z - (-hl.x * sy + hl.z * cy));
    // comfort vignette
    const vig = this.xr && S.vignette ? Math.min(0.85, this.moving / 4 + (S.turn === "smooth" && Math.abs(Rh.in.sx) > 0.2 ? 0.5 : 0)) : 0;
    this.vignette.material.opacity += (vig - this.vignette.material.opacity) * Math.min(1, dt * 8);
  }

  jump() { this.vy = 4.3; this.grounded = false; }
  bounce(v) { this.vy = v; }

  aimTeleport(hand) {
    this.teleHand = hand;
    const P = this.arc.geometry.attributes.position;
    const p = _v.copy(hand.aimPos), v = _v2.copy(hand.aimDir).multiplyScalar(8);
    let hit = null, n = 0;
    const prev = new THREE.Vector3();
    for (let i = 0; i < 48; i++) {
      P.setXYZ(i, p.x, p.y, p.z); n = i;
      if (hit) { P.setXYZ(i, hit.point.x, hit.point.y, hit.point.z); continue; }
      prev.copy(p);
      v.y -= 9.8 * 0.035; p.addScaledVector(v, 0.035);
      const d = new THREE.Vector3().subVectors(p, prev), len = d.length();
      const r = this.game.physics.ray(prev, d.normalize(), len, grp(0xffff, G.STATIC | G.PROP));
      if (r) hit = r;
    }
    P.needsUpdate = true;
    const ok = hit && hit.normal.y > 0.7;
    this.arc.visible = true;
    this.arc.material.color.set(ok ? 0x66e0ff : 0xff5544);
    this.marker.visible = !!ok;
    if (ok) { this.marker.position.copy(hit.point).add(new THREE.Vector3(0, 0.02, 0)); this.teleTarget = hit.point.clone(); } else this.teleTarget = null;
  }

  teleport(p, yaw = null) {
    this.doFade(() => {
      // held objects come along through the teleport
      const delta = new THREE.Vector3().subVectors(p, this.feet);
      for (const h of Object.values(this.hands)) {
        const e = h.held && !h.held.pulling && h.held.mode === "free" ? h.held.ent : null;
        if (e?.body && e.heldBy[0] === h) { const t = e.body.translation(); e.body.setTranslation({ x: t.x + delta.x, y: t.y + delta.y, z: t.z + delta.z }, true); }
      }
      this.feet.copy(p);
      this.camera.updateMatrix();
      if (yaw != null) this.yaw = yaw - (this.xr ? this.headYaw() - this.yaw : 0);
      const hl = this.camera.position, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      this.rig.rotation.y = this.yaw;
      this.rig.position.set(p.x - (hl.x * cy + hl.z * sy), p.y, p.z - (-hl.x * sy + hl.z * cy));
      this.body.setTranslation({ x: p.x, y: p.y + 0.65, z: p.z }, true);
      this.vy = 0;
      for (const h of Object.values(this.hands)) h.hist.length = 0;
    });
  }
  respawn() { this.teleport(new THREE.Vector3(0, 0.05, 3), 0); }

  doFade(then) { this.fadeTo = 1; this.fadeThen = then; }
  updateFade(dt) {
    const m = this.fadeMesh.material;
    if (this.fadeTo === 1) { m.opacity = Math.min(1, m.opacity + dt * 9); if (m.opacity >= 1) { this.fadeThen && this.fadeThen(); this.fadeThen = null; this.fadeTo = 0; } }
    else m.opacity = Math.max(0, m.opacity - dt * 5);
    this.fadeMesh.visible = m.opacity > 0.01;
  }

  // Ammo pouches on your hips: they follow your body yaw
  updateBelt(dt) {
    const head = this.headWorld(_v);
    const y = this.desktop && !this.xr ? this.yaw : this.headYaw();
    if (this.beltYaw == null) this.beltYaw = y;
    let d = y - this.beltYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 0.6) this.beltYaw += d - Math.sign(d) * 0.6;
    this.beltYaw += d * Math.min(1, dt * 2);
    this.belt.position.set(head.x, Math.max(this.feet.y + 0.55, head.y - 0.62), head.z);
    this.belt.rotation.y = this.beltYaw;
  }
  hipPoint(side, out) { this.belt.updateMatrixWorld(); return out.set(side === "left" ? -0.2 : 0.2, 0, 0.04).applyMatrix4(this.belt.matrixWorld); }
}
