// Grabbing, holding, two-handed carrying, throwing and force-pulling.
// Held objects stay fully physical: every physics step we compute the force the
// hand would need to keep the object at the hand target and clamp it by the
// hand's strength. Light things track 1:1, heavy things lag, sag and need two hands.
import * as THREE from "three";
import { RAPIER, GROUPS, G, grp, tv, tq } from "./physics.js";

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const GRAB_GROUPS = grp(0xffff, G.PROP | G.DEBRIS | G.RAGDOLL | G.NPC | G.HELD);
const HAND_STRENGTH = 750; // newtons per hand
const REACH = 0.075;

export class Interaction {
  constructor(game) {
    this.game = game;
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 24), new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    this.reticle.renderOrder = 990; this.reticle.visible = false;
    game.scene.add(this.reticle);
    this.heldEnts = new Set();
  }

  isGrabbable(e) { return e && e.grabbable && !e.dead; }

  /* ---------- per frame input ---------- */
  update(dt) {
    const g = this.game, P = g.player;
    this.reticle.visible = false;
    for (const h of Object.values(P.hands)) {
      if (!h.active) continue;
      const H = h.held;
      if (H && H.pulling) { this.updatePull(h, dt); continue; }
      if (!H && h.gripPressed() && !g.ui.pointerActive(h)) this.tryGrab(h);
      else if (H && (h.gripReleased() || (g.player.desktop && !g.player.xr && !h.gripDown()))) this.release(h, true);
      if (!h.held && !h.gripDown() && g.player.xr && !g.ui.menuOpen) this.hover(h);
    }
    // desktop throw
    if (P.desktop && !P.xr && P.desktopThrow && P.hands.right.held && !this._qLatch) { this.release(P.hands.right, true, true); this._qLatch = true; }
    if (!P.desktopThrow) this._qLatch = false;
    // restore collision groups after a release once clear of the player
    for (const e of this.heldEnts) {
      if (e.heldBy?.length) continue;
      if (g.time > e.restoreAt) { this.heldEnts.delete(e); if (!e.dead && e.body) g.physics.setGroups(e, e.baseGroups ?? GROUPS.prop); }
    }
  }

  hover(h) {
    if (this.nearest(h)) return;
    const r = this.game.physics.ray(h.aimPos, h.aimDir, 8, grp(0xffff, G.STATIC | G.PROP | G.DEBRIS | G.RAGDOLL | G.NPC));
    if (r && this.isGrabbable(r.ent) && (r.ent.mass ?? 1) <= 30 && !r.ent.jointed && !r.ent.heldBy?.length) {
      this.reticle.visible = true; this.reticle.position.copy(r.point); this.reticle.lookAt(this.game.player.headWorld(_v));
      h.pullTarget = r.ent;
    } else h.pullTarget = null;
  }

  nearest(h) {
    const w = this.game.physics.world;
    const pr = w.projectPoint(h.pos, true, undefined, GRAB_GROUPS, undefined, undefined, (c) => this.isGrabbable(this.game.physics.entOf(c)));
    if (!pr) return null;
    const d = pr.isInside ? 0 : _v.set(pr.point.x, pr.point.y, pr.point.z).distanceTo(h.pos);
    if (d > REACH) return null;
    return { ent: this.game.physics.entOf(pr.collider), point: pr.isInside ? h.pos.clone() : new THREE.Vector3(pr.point.x, pr.point.y, pr.point.z) };
  }

  tryGrab(h) {
    const g = this.game, P = g.player;
    if (g.weapons.tryRack(h)) return;
    // ammo pouch on the hip
    if (P.xr) {
      for (const side of ["left", "right"]) {
        if (P.hipPoint(side, _v).distanceTo(h.pos) < 0.2) { const mag = g.weapons.pouchMag(h); if (mag) { this.grab(h, mag, mag.mesh.position.clone(), true); return; } }
      }
    }
    if (P.desktop && !P.xr) {
      const r = g.physics.ray(h.aimPos, h.aimDir, 3.2, grp(0xffff, G.STATIC | G.PROP | G.DEBRIS | G.RAGDOLL | G.NPC));
      if (r && this.isGrabbable(r.ent)) {
        let ent = r.ent;
        if (ent.kind === "npc") { ent = ent.npc.grabbedAt(r.point); if (!ent) return; }
        if (ent.jointed || ent.kind === "ragdoll") { h.deskDist = r.dist; this.grab(h, ent, r.point, false); }
        else this.grab(h, ent, r.point, true);
        return;
      }
      g.audio.play("click", null, { vol: 0.1, rate: 0.6 });
      return;
    }
    const n = this.nearest(h);
    if (n) {
      let ent = n.ent;
      if (ent.kind === "npc") { ent = ent.npc.grabbedAt(n.point); if (!ent) return; }
      this.grab(h, ent, n.point, false);
      return;
    }
    if (h.pullTarget && !h.pullTarget.dead) this.startPull(h, h.pullTarget);
  }

  startPull(h, ent) {
    if (ent.kind === "npc") return;
    const b = ent.body, p = tv(b.translation());
    const T = THREE.MathUtils.clamp(p.distanceTo(h.pos) / 9, 0.3, 0.75);
    const gy = this.game.physics.gravityY;
    const v = _v.subVectors(h.pos, p).divideScalar(T); v.y -= 0.5 * gy * T;
    b.setLinvel(v, true); b.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: 0 }, true);
    h.held = { ent, pulling: true, t: 0 };
    this.game.audio.play("whoosh", p, { vol: 0.5, rate: 1.4 });
    h.haptic(0.3, 40);
  }
  updatePull(h, dt) {
    const H = h.held; H.t += dt;
    if (!h.gripDown() || H.ent.dead || H.t > 1.4) { h.held = null; return; }
    const p = tv(H.ent.body.translation());
    if (p.distanceTo(h.pos) < 0.32) { h.held = null; this.grab(h, H.ent, p, true); }
  }

  /* ---------- grab / release ---------- */
  grab(h, ent, point, snap) {
    const g = this.game;
    if (h.held) this.release(h, false);
    if (ent.onGrab && ent.onGrab(h) === false) return;
    const b = ent.body;
    if (!b) return;
    b.wakeUp();
    const bp = tv(b.translation()), bq = tq(b.rotation());
    const H = { ent, mode: ent.jointed || ent.kind === "ragdoll" ? "joint" : "free", recoil: 0 };
    const wdef = ent.def?.weapon;
    if (H.mode === "joint") {
      H.localPoint = point.clone().sub(bp).applyQuaternion(bq.clone().invert());
      if (ent.kind === "ragdoll") g.physics.setGroups(ent, GROUPS.ragdollHeld);
    } else {
      if (wdef && !ent.heldBy?.length) {
        // weapons snap into the hand: grip on the palm, barrel along your aim
        _q.copy(h.quat).invert().multiply(h.aimQuat);
        H.relQuat = _q.clone();
        H.relPos = wdef.grip.clone().applyQuaternion(H.relQuat).negate();
        H.weapon = true;
      } else if (snap && !ent.heldBy?.length) {
        // pulled / pouch objects land centred in the palm, keeping their current orientation
        H.relQuat = h.quat.clone().invert().multiply(bq);
        const lift = Math.min(0.12, (ent.size || 0.2) * 0.3);
        H.relPos = new THREE.Vector3(0, -lift, -0.02);
      } else {
        H.relQuat = h.quat.clone().invert().multiply(bq);
        H.relPos = bp.clone().sub(h.pos).applyQuaternion(h.quat.clone().invert());
      }
      if (!ent.heldBy?.length) {
        b.setGravityScale(0, true);
        if (ent.kind === "debris" || ent.kind === "prop") { ent.baseGroups = ent.kind === "debris" ? GROUPS.debris : ent.baseGroups ?? GROUPS.prop; g.physics.setGroups(ent, GROUPS.held); }
      }
    }
    // hand pose relative to the object, so the visual hand sticks to it
    _m.compose(bp, bq, _s); _m2.compose(h.pos, h.quat, _s);
    if (H.weapon) { _v.copy(H.relPos).applyQuaternion(h.quat).add(h.pos); _q.copy(h.quat).multiply(H.relQuat); _m.compose(_v, _q, _s); }
    H.handRel = _m.clone().invert().multiply(_m2);
    const sz = ent.size || 0.3;
    const c = THREE.MathUtils.clamp(1.05 - sz * 0.9, 0.35, 0.9);
    H.pose = H.weapon ? [0.75, 0.35, 0.95, 0.95, 0.95] : [Math.min(0.9, c + 0.1), c, c, c, c];
    h.held = H;
    ent.heldBy = ent.heldBy || [];
    ent.heldBy.push(h);
    this.heldEnts.add(ent);
    ent.lastHeld = g.time;
    h.haptic(0.35, 30);
    g.audio.impact(ent.sound || "plastic", bp, 1.2, Math.min(ent.mass || 1, 3) * 0.4);
    g.weapons.onGrab(h, ent);
    g.onGrab && g.onGrab(h, ent);
  }

  release(h, doThrow = true, deskThrow = false) {
    const H = h.held; if (!H) return;
    h.held = null; h.overrideVisual = null;
    if (H.pulling) return;
    const ent = H.ent, g = this.game;
    h.noCollideUntil = g.time + 0.3;
    ent.heldBy = (ent.heldBy || []).filter((x) => x !== h);
    g.weapons.onRelease(h, ent);
    if (ent.dead || !ent.body) return;
    const b = ent.body;
    if (ent.heldBy.length) {
      // re-anchor the remaining hand to the current pose to avoid a snap
      const o = ent.heldBy[0], oh = o.held;
      if (oh && oh.mode === "free" && !oh.weapon) { const bq = tq(b.rotation()); oh.relQuat = o.quat.clone().invert().multiply(bq); oh.relPos = tv(b.translation()).sub(o.pos).applyQuaternion(o.quat.clone().invert()); }
      return;
    }
    if (H.mode === "free") {
      b.setGravityScale(1, true);
      ent.restoreAt = g.time + 0.35;
      if (doThrow) {
        const m = b.mass();
        if (deskThrow) {
          const sp = Math.min(16, 70 / Math.max(0.4, m));
          b.setLinvel({ x: h.aimDir.x * sp, y: h.aimDir.y * sp + 1.5, z: h.aimDir.z * sp }, true);
          g.audio.play("whoosh", h.pos, { vol: 0.6 });
        } else if (h.hist.length >= 3) {
          // average the last few frames of hand velocity, scaled by how hard the arm can push this mass
          _v.set(0, 0, 0); const n = Math.min(4, h.hist.length);
          for (let i = h.hist.length - n; i < h.hist.length; i++) _v.add(h.hist[i]);
          _v.divideScalar(n);
          const k = THREE.MathUtils.clamp(14 / Math.max(m, 1), 0.25, 1.2);
          const cur = tv(b.linvel());
          _v.multiplyScalar(k).lerp(cur, 1 - Math.min(1, k));
          b.setLinvel(_v, true);
          const av = h.angVel.clone().multiplyScalar(THREE.MathUtils.clamp(3 / m, 0.1, 1));
          b.setAngvel(av, true);
          if (_v.length() > 3.5) g.audio.play("whoosh", h.pos, { vol: Math.min(1, _v.length() / 10) });
        }
      }
      ent.thrownFrom = h.pos.clone(); ent.thrownAt = g.time;
    } else if (ent.kind === "ragdoll") {
      ent.restoreAt = g.time + 0.3; ent.baseGroups = GROUPS.ragdoll;
      if (doThrow && h.hist.length >= 3) { _v.set(0, 0, 0); for (const v of h.hist.slice(-3)) _v.add(v); _v.divideScalar(3); ent.npc?.throwRagdoll(_v); }
    }
    ent.onRelease && ent.onRelease(h);
  }

  forceRelease(ent) {
    for (const h of Object.values(this.game.player.hands)) if (h.held && h.held.ent === ent) { h.held = null; h.overrideVisual = null; }
    if (ent) ent.heldBy = [];
  }

  /* ---------- physics drive (each physics step) ---------- */
  step(dt) {
    const done = new Set();
    for (const h of Object.values(this.game.player.hands)) {
      const H = h.held;
      if (!H || H.pulling || done.has(H.ent)) continue;
      const ent = H.ent;
      if (ent.dead || !ent.body) { h.held = null; continue; }
      done.add(ent);
      if (H.mode === "joint") { for (const hh of ent.heldBy) this.driveJoint(hh, dt); continue; }
      this.driveFree(ent, dt);
    }
  }

  target(h, outP, outQ) {
    const H = h.held;
    outQ.copy(h.quat).multiply(H.relQuat);
    if (H.recoil) outQ.multiply(_q2.setFromAxisAngle(_v3.set(1, 0, 0), H.recoil));
    outP.copy(H.relPos).applyQuaternion(h.quat).add(h.pos);
  }

  driveFree(ent, dt) {
    const hands = ent.heldBy.filter((h) => h.held && h.held.mode === "free");
    if (!hands.length) return;
    const P = new THREE.Vector3(), Q = new THREE.Quaternion();
    this.target(hands[0], P, Q);
    let strength = HAND_STRENGTH * (ent.def?.tight ? 3 : 1);
    if (hands.length > 1) {
      const P2 = new THREE.Vector3(), Q2 = new THREE.Quaternion();
      this.target(hands[1], P2, Q2);
      // align the grab-to-grab axis with the hand-to-hand axis
      const a = hands[0].held.relPos.clone().negate().applyQuaternion(hands[0].held.relQuat.clone().invert());
      const b = hands[1].held.relPos.clone().negate().applyQuaternion(hands[1].held.relQuat.clone().invert());
      const objAxis = b.sub(a);
      if (objAxis.lengthSq() > 0.01) {
        const pred = objAxis.clone().applyQuaternion(Q).normalize();
        const actual = _v.subVectors(hands[1].pos, hands[0].pos).normalize();
        Q.premultiply(_q.setFromUnitVectors(pred, actual));
        // keep the primary hand's grab point where it is, pivoting around it
        const ga = hands[0].held.relPos.clone().negate().applyQuaternion(hands[0].held.relQuat.clone().invert());
        P.copy(hands[0].pos).sub(ga.applyQuaternion(Q));
        const gb = hands[1].held.relPos.clone().negate().applyQuaternion(hands[1].held.relQuat.clone().invert());
        P.lerp(_v2.copy(hands[1].pos).sub(gb.applyQuaternion(Q)), 0.5);
      } else P.lerp(P2, 0.5);
      strength *= 2;
    }
    const b = ent.body;
    const m = b.mass();
    const pos = tv(b.translation()), vel = tv(b.linvel());
    const gy = this.game.physics.gravityY;
    // desktop: carry at the hand point regardless of lag
    const dv = _v.subVectors(P, pos).divideScalar(dt).multiplyScalar(0.62);
    if (dv.length() > 30) dv.setLength(30);
    const acc = _v2.subVectors(dv, vel).divideScalar(dt);
    acc.y -= gy; // the hand must also hold the weight up
    const maxA = strength / m;
    if (acc.length() > maxA) acc.setLength(maxA);
    vel.addScaledVector(acc, dt); vel.y += gy * dt;
    b.setLinvel(vel, true);
    // angular
    const q = tq(b.rotation());
    _q.copy(Q).multiply(q.invert());
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const ang = 2 * Math.acos(Math.min(1, _q.w)), s = Math.sqrt(Math.max(0, 1 - _q.w * _q.w));
    const want = s > 1e-5 ? _v.set(_q.x / s, _q.y / s, _q.z / s).multiplyScalar((ang / dt) * 0.55) : _v.set(0, 0, 0);
    if (want.length() > 40) want.setLength(40);
    const w = tv(b.angvel());
    const r = Math.max(0.08, (ent.size || 0.3) * 0.45);
    const maxDw = ((strength * 0.16) / (m * r * r)) * dt;
    const d = want.sub(w);
    if (d.length() > maxDw) d.setLength(maxDw);
    b.setAngvel(w.add(d), true);
    // too heavy / snagged: let go
    const err = P.distanceTo(pos);
    if (err > 0.55 && this.game.time - ent.lastHeld > 0.9) { ent.snag = (ent.snag || 0) + dt; if (ent.snag > 0.25) { for (const h of [...ent.heldBy]) this.release(h, false); ent.snag = 0; } }
    else ent.snag = 0;
  }

  driveJoint(h, dt) {
    const H = h.held, ent = H.ent, b = ent.body;
    const pos = tv(b.translation()), q = tq(b.rotation());
    const p = H.localPoint.clone().applyQuaternion(q).add(pos);
    const P = this.game.player;
    const handP = P.desktop && !P.xr ? _v3.copy(h.aimPos).addScaledVector(h.aimDir, h.deskDist ?? 1) : h.pos;
    const lin = tv(b.linvel()), w = tv(b.angvel());
    const vp = lin.add(w.clone().cross(_v.subVectors(p, pos)));
    const desired = _v2.subVectors(handP, p).divideScalar(dt).multiplyScalar(0.35);
    const dv = desired.sub(vp);
    const mEff = Math.min(b.mass(), 30) * (ent.kind === "ragdoll" ? 1.2 : 0.5);
    const imp = dv.multiplyScalar(mEff);
    const lim = HAND_STRENGTH * 1.4 * dt;
    if (imp.length() > lim) imp.setLength(lim);
    if (ent.kind === "ragdoll") imp.y -= this.game.physics.gravityY * dt * Math.min(b.mass(), 8); // support the held limb
    b.applyImpulseAtPoint(imp, p, true);
    const err = handP.distanceTo(p);
    if (err > (ent.kind === "ragdoll" ? 0.7 : 0.45)) { H.snag = (H.snag || 0) + dt; if (H.snag > 0.2) this.release(h, false); } else H.snag = 0;
    H.worldPoint = p;
  }

  // After physics: glue the visual hand onto the held object
  postPhysics() {
    for (const h of Object.values(this.game.player.hands)) {
      const H = h.held;
      h.overrideVisual = null;
      if (!H || H.pulling || !H.ent.body) continue;
      if (H.weapon) H.pose[1] = 0.3 + h.in.trigger * 0.45;
      const b = H.ent.body;
      if (H.mode === "joint") continue;
      _m.compose(tv(b.translation(), _v), tq(b.rotation(), _q), _s).multiply(H.handRel);
      _v2.setFromMatrixPosition(_m);
      if (_v2.distanceTo(h.pos) < 0.25) { h.overrideVisual = _m.clone(); h.overrideVisual.decompose(h.visual.position, h.visual.quaternion, _v3); }
      if (H.recoil) H.recoil *= Math.exp(-this.game.dt * 14);
    }
  }
}
