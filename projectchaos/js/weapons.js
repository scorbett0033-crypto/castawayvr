// Fictional weapons & gadgets with hands-on reloading:
// eject the magazine (A/X), pull a fresh one from your hip pouch, push it into the
// grip; the foam pistol also needs its slide racked with the other hand.
import * as THREE from "three";
import { RAPIER, GROUPS, G, grp, MATS, tv, tq } from "./physics.js";
import { canvasTex } from "./textures.js";

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const HIT_GROUPS = grp(0xffff, G.STATIC | G.PROP | G.NPC | G.RAGDOLL | G.DEBRIS | G.HELD);

export class Weapons {
  constructor(game) {
    this.game = game;
    this.guns = new Set();
    this.mags = new Set();
    this.radios = new Set();
    this.darts = [];
    this.spot = new THREE.SpotLight(0xfff0d0, 0, 22, 0.42, 0.45, 1.6);
    this.spot.target.position.set(0, 0, -1);
    this.spot.add(this.spot.target);
    game.scene.add(this.spot);
    this.flashOwner = null;
    this.dartGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.055, 8); this.dartGeo.rotateX(Math.PI / 2);
    this.tipGeo = new THREE.SphereGeometry(0.0075, 8, 6);
  }

  /* ---------- lifecycle ---------- */
  attach(ent) {
    const d = ent.def;
    if (d.weapon) {
      const W = (ent.weapon = { def: d.weapon, type: d.weapon.type, cool: 0, cocked: true, ready: 0, mag: null, gravHeld: null, on: false });
      if (d.weapon.magwell && d.weapon.mag) {
        const magEnt = this.game.props.defs[d.weapon.mag];
        const m = magEnt.build();
        const axis = _v.subVectors(d.weapon.grip, d.weapon.magwell).normalize();
        m.quaternion.setFromUnitVectors(_up, axis);
        m.position.copy(d.weapon.magwell).addScaledVector(axis, 0.035);
        ent.mesh.add(m);
        W.magMesh = m; W.magAxis = axis.clone();
        W.mag = { ammo: d.weapon.cap };
      }
      if (d.weapon.display) {
        const c = document.createElement("canvas"); c.width = 128; c.height = 64;
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
        p.position.copy(d.weapon.grip).add(new THREE.Vector3(0, 0.075, 0.02)); p.rotation.x = -0.5;
        ent.mesh.add(p);
        W.display = { c, t, last: null };
        this.drawAmmo(ent);
      }
      this.guns.add(ent);
    }
    if (d.mag) { ent.magAmmo = ent.magAmmo ?? (this.game.props.defs[d.mag === "energy_cell" ? "volt_blaster" : "toy_pistol"].weapon.cap); this.mags.add(ent); }
    if (d.radio) { ent.radioOn = false; this.radios.add(ent); }
  }
  detach(ent) {
    this.guns.delete(ent); this.mags.delete(ent); this.radios.delete(ent);
    if (ent.radioLoop) { ent.radioLoop.stop(); ent.radioLoop = null; }
    if (this.flashOwner === ent) { this.spot.intensity = 0; this.game.scene.add(this.spot); this.flashOwner = null; }
  }

  drawAmmo(ent) {
    const W = ent.weapon, D = W.display; if (!D) return;
    const txt = W.def.infinite ? "∞" : W.mag ? String(W.mag.ammo) : "--";
    const st = txt + (W.ready > 0 ? "c" : "");
    if (D.last === st) return; D.last = st;
    const x = D.c.getContext("2d");
    x.clearRect(0, 0, 128, 64);
    x.fillStyle = "rgba(0,20,26,0.85)"; x.fillRect(0, 0, 128, 64);
    const col = !W.mag && !W.def.infinite ? "#ff5a4a" : W.ready > 0 ? "#ffd04a" : "#5af0ff";
    x.fillStyle = col; x.font = "bold 44px monospace"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(W.ready > 0 ? "···" : txt, 64, 34);
    D.t.needsUpdate = true;
  }

  heldWeapon(h) { const e = h.held?.ent; return e && !h.held.pulling && e.weapon ? e : null; }
  otherHand(h) { const H = this.game.player.hands; return h === H.left ? H.right : H.left; }

  onGrab(h, ent) {
    if (ent.weapon?.type === "flashlight") this.setFlash(ent, true);
    if (ent.def?.squeak) this.game.audio.play("beep", tv(ent.body.translation()), { vol: 0.25, rate: 0.8 });
  }
  onRelease(h, ent) {
    const W = ent.weapon;
    if (W?.gravHeld) this.dropGrav(W);
    if (h.racking) h.racking = null;
  }

  // Hip pouch: hands you a fresh magazine that fits the gun in your other hand
  pouchMag(h) {
    const gun = this.heldWeapon(this.otherHand(h));
    const type = gun?.weapon.def.mag;
    if (!type) return null;
    const loose = [...this.mags].filter((m) => m.spawned && !m.heldBy?.length);
    if (loose.length > 10) this.game.props.remove(loose[0]);
    const m = this.game.props.spawn(type, h.pos.clone(), h.quat.clone(), { spawned: true });
    this.game.audio.play("clack", h.pos, { vol: 0.4, rate: 1.4 });
    return m;
  }

  // Grab the toy pistol's slide with your free hand and pull it back
  tryRack(h) {
    for (const g of this.guns) {
      if (g.weapon.type !== "dart" || !g.heldBy?.length || g.heldBy.includes(h)) continue;
      const sp = g.mesh.localToWorld(_v.copy(g.weapon.def.slide));
      if (sp.distanceTo(h.pos) < 0.09) {
        h.racking = { gun: g, start: this.slideCoord(g, h.pos), done: false };
        h.haptic(0.2, 20);
        return true;
      }
    }
    return false;
  }
  slideCoord(g, p) { return _v2.copy(p).sub(g.mesh.position).applyQuaternion(_q.copy(g.mesh.quaternion).invert()).z; }

  /* ---------- per-frame ---------- */
  update(dt) {
    const game = this.game, P = game.player;
    for (const h of Object.values(P.hands)) {
      // slide racking
      if (h.racking) {
        const R = h.racking;
        if (!h.gripDown() || R.gun.dead) { h.racking = null; }
        else {
          const z = this.slideCoord(R.gun, h.pos);
          h.model.userData.setFingers(0.7, 0.6, 0.5);
          if (!R.done && z - R.start > 0.03) { R.done = true; R.gun.weapon.cocked = true; game.audio.play("rack", tv(R.gun.body.translation()), { vol: 0.8 }); h.haptic(0.6, 40); for (const o of R.gun.heldBy) o.haptic(0.6, 40); }
        }
      }
      const gun = this.heldWeapon(h);
      if (!gun) {
        // trigger on a held radio toggles it
        const e = h.held?.ent;
        if (e?.def?.radio && h.triggerPressed()) this.toggleRadio(e);
        continue;
      }
      if (gun.heldBy[0] !== h) continue; // the primary hand operates the weapon
      const W = gun.weapon;
      W.cool -= dt;
      if (W.ready > 0) { W.ready -= dt; if (W.ready <= 0) this.drawAmmo(gun); }
      const eject = h.pressed("a") || (P.desktop && !P.xr && P.desktopReload && !this._rLatch);
      if (P.desktop && !P.xr) this._rLatch = P.desktopReload;
      switch (W.type) {
        case "blaster":
          if (h.triggerDown() && W.cool <= 0) { if (h.triggerPressed() || W.auto) this.fireBlaster(gun, h); }
          if (eject) { this.eject(gun); if (P.desktop && !P.xr) this.autoReload(gun); }
          break;
        case "dart":
          if (h.triggerPressed() && W.cool <= 0) this.fireDart(gun, h);
          if (eject) { this.eject(gun); if (P.desktop && !P.xr) this.autoReload(gun); }
          break;
        case "grav": this.updateGrav(gun, h, dt); break;
        case "mender": this.updateMender(gun, h, dt); break;
        case "flashlight": if (h.triggerPressed()) this.setFlash(gun, !W.on); break;
      }
    }
    // magazines near an empty magwell slide in
    for (const m of this.mags) {
      if (m.dead || !m.body) continue;
      const mp = tv(m.body.translation(), _v);
      for (const g of this.guns) {
        const W = g.weapon;
        if (W.mag || W.def.mag !== m.def.mag || W.def.infinite || this.game.time < (W.ejectedAt || -9) + 0.7 || this.game.time < (m.noInsertUntil || 0)) continue;
        const well = g.mesh.localToWorld(_v2.copy(W.def.magwell));
        if (well.distanceTo(mp) < (m.heldBy?.length ? 0.075 : 0.05)) { this.insert(g, m); break; }
      }
    }
    if (this.flashOwner && !this.flashOwner.dead) { this.flashOwner.mesh.updateMatrixWorld(); }
    // radios
    for (const r of this.radios) if (r.radioLoop && r.body) r.radioLoop.setPos(tv(r.body.translation(), _v));
    // dart housekeeping
    while (this.darts.length > 36) this.removeDart(this.darts.shift());
  }

  // physics-rate work (grav-lift holding)
  step(dt) {
    for (const g of this.guns) {
      const W = g.weapon;
      if (W.type !== "grav" || !W.gravHeld) continue;
      const t = W.gravHeld;
      if (t.dead || !t.body) { W.gravHeld = null; continue; }
      const mz = g.mesh.localToWorld(_v.copy(W.def.muzzle));
      const dir = _v2.set(0, 0, -1).applyQuaternion(g.mesh.quaternion);
      const target = mz.addScaledVector(dir, 0.9 + (t.size || 0.4) * 0.8);
      const b = t.body, pos = tv(b.translation()), vel = tv(b.linvel());
      const want = target.sub(pos).divideScalar(dt).multiplyScalar(0.25);
      if (want.length() > 20) want.setLength(20);
      const acc = want.sub(vel).divideScalar(dt);
      const maxA = 2600 / Math.max(1, b.mass());
      if (acc.length() > maxA) acc.setLength(maxA);
      vel.addScaledVector(acc, dt);
      b.setLinvel(vel, true);
      const w = tv(b.angvel()).multiplyScalar(0.9); b.setAngvel(w, true);
    }
  }

  /* ---------- firing ---------- */
  muzzle(gun, outP, outD) {
    gun.mesh.localToWorld(outP.copy(gun.weapon.def.muzzle));
    outD.set(0, 0, -1).applyQuaternion(gun.mesh.quaternion);
    // desktop: converge the shot on whatever is under the crosshair
    const P = this.game.player;
    if (P.desktop && !P.xr && gun.heldBy?.includes(P.hands.right)) {
      const h = P.hands.right;
      const hit = this.game.physics.ray(h.aimPos, h.aimDir, 60, HIT_GROUPS, gun.body);
      const tgt = hit ? hit.point : _v2.copy(h.aimPos).addScaledVector(h.aimDir, 60);
      outD.subVectors(tgt, outP).normalize();
    }
  }
  dry(gun, h) { this.game.audio.play("click", tv(gun.body.translation()), { vol: 0.5, rate: 0.7 }); h.haptic(0.1, 15); gun.weapon.cool = 0.25; }

  fireBlaster(gun, h) {
    const W = gun.weapon, game = this.game;
    if (!W.def.infinite && (!W.mag || W.mag.ammo <= 0 || W.ready > 0)) return this.dry(gun, h);
    if (!W.def.infinite) W.mag.ammo--;
    W.cool = W.def.rate;
    const mz = new THREE.Vector3(), dir = new THREE.Vector3();
    this.muzzle(gun, mz, dir);
    const hit = game.physics.ray(mz, dir, 90, HIT_GROUPS, gun.body);
    const end = hit ? hit.point : mz.clone().addScaledVector(dir, 90);
    const col = W.def.infinite ? 0xffd34d : 0x5af0ff;
    game.fx.tracer(mz, end, col, 0.007, 0.08);
    game.fx.flash(mz, col, 3, 0.06);
    game.fx.sparks(mz, dir, 6, col);
    game.audio.play("zap", mz, { vol: 0.9, rate: W.def.infinite ? 0.8 : 1 });
    game.noise(mz, 1.0, "gunshot");
    h.haptic(0.7, 45);
    h.held.recoil = (h.held.recoil || 0) + 0.12;
    gun.body.applyImpulse({ x: -dir.x * 0.6, y: 0.2, z: -dir.z * 0.6 }, true);
    if (hit) this.applyHit(hit, dir, 7, 26, col);
    this.drawAmmo(gun);
  }

  applyHit(hit, dir, impulse, damage, col = 0xffd27a) {
    const game = this.game, e = hit.ent;
    game.fx.sparks(hit.point, hit.normal, 14, col);
    if (!e) return;
    if (e.kind === "static" || e.kind === "brick") game.fx.decal(hit.point, hit.normal);
    if (e.body && e.body.isDynamic && e.body.isDynamic()) e.body.applyImpulseAtPoint({ x: dir.x * impulse, y: dir.y * impulse, z: dir.z * impulse }, hit.point, true);
    if (e.kind === "prop") { game.props.damage(e, damage, dir); if (e.def?.breakable?.kind !== "explode" && e.mesh && !e.dead && e.def?.model) game.fx.decal(hit.point, hit.normal, e.mesh); }
    if (e.kind === "npc") e.npc.shot(hit.point, dir, impulse, damage);
    if (e.kind === "ragdoll") e.npc?.partShot(e, hit.point, dir, impulse, damage);
    if (e.onShot) e.onShot(hit, dir, damage);
    game.audio.impact(e.sound || "metal", hit.point, 3, 0.5);
  }

  fireDart(gun, h) {
    const W = gun.weapon, game = this.game;
    if (!W.mag || W.mag.ammo <= 0) return this.dry(gun, h);
    if (!W.cocked) { this.dry(gun, h); return; }
    W.mag.ammo--;
    W.cool = W.def.rate;
    const mz = new THREE.Vector3(), dir = new THREE.Vector3();
    this.muzzle(gun, mz, dir);
    mz.addScaledVector(dir, 0.03);
    const mesh = new THREE.Group();
    const M = game.props.M;
    mesh.add(new THREE.Mesh(this.dartGeo, M.foam));
    const tip = new THREE.Mesh(this.tipGeo, M.foamTip); tip.position.z = -0.03; tip.scale.set(1, 1, 1.4); mesh.add(tip);
    mesh.position.copy(mz); mesh.quaternion.copy(gun.mesh.quaternion);
    game.scene.add(mesh);
    const dart = { kind: "dart", mesh, mass: 0.006, grabbable: true, sound: "soft" };
    const cd = RAPIER.ColliderDesc.capsule(0.022, 0.0075).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }).setMass(0.006);
    game.physics.createBody(dart, { pos: mz, quat: gun.mesh.quaternion, colliders: [cd], groups: GROUPS.proj, mat: MATS.foam, ccd: true, linDamp: 0.05, angDamp: 0.6, forceThreshold: 0.02, mass: 0.006 });
    const gv = tv(gun.body.linvel());
    dart.body.setLinvel({ x: dir.x * 21 + gv.x, y: dir.y * 21 + gv.y, z: dir.z * 21 + gv.z }, true);
    dart.born = game.time;
    this.darts.push(dart);
    game.audio.play("pop", mz, { vol: 0.8 });
    game.noise(mz, 0.35, "pop");
    h.haptic(0.35, 25);
    h.held.recoil = (h.held.recoil || 0) + 0.05;
    // the dart counts as a "hit" on targets and makes TEDs flinch via impact events
  }
  dartImpact(dart, other, speed) {
    if (dart.stuck || speed < 7) return;
    const game = this.game;
    if (other.kind === "npc") other.npc.poked(tv(dart.body.translation()));
    if (other.kind === "target" || other.onShot) other.onShot && other.onShot({ point: tv(dart.body.translation()), ent: other }, new THREE.Vector3(), 5);
    if (other.kind === "static" && Math.random() < 0.6) {
      // suction cup sticks to walls
      dart.stuck = true;
      const b = dart.body, v = tv(b.linvel());
      if (v.lengthSq() > 0.01) { const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), v.normalize().negate()); b.setRotation(q, true); }
      b.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      game.audio.play("pop", tv(b.translation()), { vol: 0.4, rate: 1.6 });
    }
  }
  removeDart(d) { this.game.interaction.forceRelease(d); this.game.physics.remove(d); this.game.scene.remove(d.mesh); d.dead = true; }

  /* ---------- magazines ---------- */
  eject(gun) {
    const W = gun.weapon;
    if (!W.mag) return;
    const game = this.game;
    const well = gun.mesh.localToWorld(new THREE.Vector3().copy(W.def.magwell).addScaledVector(W.magAxis, -0.02));
    const q = gun.mesh.quaternion.clone().multiply(W.magMesh.quaternion);
    const m = game.props.spawn(W.def.mag, well, q, { spawned: true });
    m.magAmmo = W.mag.ammo; m.noInsertUntil = game.time + 1.2; W.ejectedAt = game.time;
    const gv = tv(gun.body.linvel());
    const down = W.magAxis.clone().negate().applyQuaternion(gun.mesh.quaternion).multiplyScalar(1.4);
    m.body.setLinvel({ x: gv.x + down.x, y: gv.y + down.y, z: gv.z + down.z }, true);
    W.mag = null; W.magMesh.visible = false;
    if (W.type === "dart") W.cocked = false;
    game.audio.play("clack", well, { vol: 0.8 });
    for (const h of gun.heldBy || []) h.haptic(0.4, 30);
    this.drawAmmo(gun);
  }
  insert(gun, mag) {
    const W = gun.weapon, game = this.game;
    W.mag = { ammo: mag.magAmmo ?? W.def.cap };
    const hands = [...(mag.heldBy || []), ...(gun.heldBy || [])];
    game.props.remove(mag);
    W.magMesh.visible = true;
    const p = tv(gun.body.translation());
    game.audio.play("click", p, { vol: 1 });
    if (W.type === "blaster") { W.ready = 0.55; game.audio.play("charge", p, { vol: 0.35, rate: 1.6 }); }
    hands.forEach((h) => h.haptic(0.6, 35));
    this.drawAmmo(gun);
    game.onReload && game.onReload(gun);
  }
  autoReload(gun) {
    const W = gun.weapon;
    W.mag = { ammo: W.def.cap }; W.magMesh.visible = true; W.cocked = true;
    this.game.audio.play("click", tv(gun.body.translation()), { vol: 1 });
    if (W.type === "dart") setTimeout(() => this.game.audio.play("rack", null, { vol: 0.6 }), 250);
    this.drawAmmo(gun);
  }

  /* ---------- grav-lift ---------- */
  updateGrav(gun, h, dt) {
    const W = gun.weapon, game = this.game;
    const mz = new THREE.Vector3(), dir = new THREE.Vector3();
    this.muzzle(gun, mz, dir);
    if (h.triggerDown()) {
      if (!W.gravHeld && !W.gravTried) {
        W.gravTried = true;
        const hit = game.physics.ray(mz, dir, 12, grp(0xffff, G.STATIC | G.PROP | G.DEBRIS | G.RAGDOLL | G.NPC), gun.body);
        let t = hit?.ent;
        if (t?.kind === "npc") t = t.npc.grabbedAt(hit.point, true);
        if (t && t.body && (t.kind === "prop" || t.kind === "debris" || t.kind === "ragdoll" || t.kind === "dart") && !t.heldBy?.length && !t.jointed) {
          W.gravHeld = t; t.body.setGravityScale(0, true); t.body.wakeUp();
          game.audio.play("charge", mz, { vol: 0.4, rate: 2 });
          W.hum = game.audio.loop("gravHum", mz, 0.25);
        } else game.audio.play("err", mz, { vol: 0.2 });
      }
      if (W.gravHeld) {
        const tp = tv(W.gravHeld.body.translation());
        game.fx.beam(mz, tp, 0x4db8ff, 0.01);
        W.hum?.setPos(mz);
        h.haptic(0.08, 16);
      }
    } else { W.gravTried = false; if (W.gravHeld) this.dropGrav(W); }
    if (h.pressed("a")) {
      if (W.gravHeld) {
        const t = W.gravHeld, m = t.body.mass(), sp = Math.min(30, 900 / Math.max(m, 1));
        this.dropGrav(W);
        t.body.setLinvel({ x: dir.x * sp, y: dir.y * sp, z: dir.z * sp }, true);
        if (t.kind === "ragdoll") t.npc?.launched();
        t.thrownAt = game.time; t.thrownFrom = h.pos.clone();
        game.audio.play("boom", mz, { vol: 0.35, rate: 2.2 });
      } else {
        // repulsor blast
        game.audio.play("boom", mz, { vol: 0.3, rate: 2.6 });
        game.fx.burst(mz.clone().addScaledVector(dir, 0.3), 0x4db8ff, 30, 4, 0.02, 0);
        game.physics.overlapBall(mz.clone().addScaledVector(dir, 2.2), 2.4, grp(0xffff, G.PROP | G.DEBRIS | G.RAGDOLL | G.NPC), (c, e) => {
          if (!e || e === gun || e.heldBy?.length) return;
          if (e.kind === "npc") { e.npc.blast(mz, dir, 18); return; }
          if (!e.body?.isDynamic?.()) return;
          const bp = tv(e.body.translation());
          const to = bp.clone().sub(mz); const d = to.length(); to.normalize();
          if (to.dot(dir) < 0.5) return;
          const s = Math.min(e.body.mass() * 9, 45) * (1 - d / 5);
          if (s > 0) e.body.applyImpulse({ x: (dir.x * 0.6 + to.x * 0.4) * s, y: (dir.y * 0.6 + to.y * 0.4) * s + s * 0.15, z: (dir.z * 0.6 + to.z * 0.4) * s }, true);
        });
        game.noise(mz, 0.7, "blast");
        h.haptic(0.8, 60);
      }
    }
  }
  dropGrav(W) {
    const t = W.gravHeld; W.gravHeld = null;
    if (t && t.body && !t.dead) t.body.setGravityScale(1, true);
    if (W.hum) { W.hum.stop(); W.hum = null; }
  }

  /* ---------- mender ---------- */
  updateMender(gun, h, dt) {
    const W = gun.weapon, game = this.game;
    const mz = new THREE.Vector3(), dir = new THREE.Vector3();
    this.muzzle(gun, mz, dir);
    let target = null;
    if (h.triggerDown()) {
      const hit = game.physics.ray(mz, dir, 12, grp(0xffff, G.STATIC | G.PROP | G.DEBRIS | G.RAGDOLL | G.NPC), gun.body);
      const end = hit ? hit.point : mz.clone().addScaledVector(dir, 12);
      game.fx.beam(mz, end, 0x4dff8a, 0.008);
      if (Math.random() < 0.5) game.fx.emit(end, new THREE.Vector3((Math.random() - 0.5), Math.random() + 0.3, (Math.random() - 0.5)), 0x6dffa0, 0.015, 0.5, -0.1, 1);
      if (!W.loop) W.loop = game.audio.loop("heal", mz, 0.15);
      W.loop.setPos(mz);
      h.haptic(0.06, 16);
      const e = hit?.ent;
      // keep the lock on an object that's mid-rebuild while you aim roughly at it
      const R = W.repairing && W.repairing.repair > 0 && game.props.records.has(W.repairing) ? W.repairing : null;
      const locked = R && (e?.record === R || _v.subVectors(R.pos, mz).normalize().dot(dir) > 0.75);
      if (locked) { target = R; game.props.repairStep(R, dt); game.fx.beam(mz, R.pos, 0x4dff8a, 0.01); }
      else if (e?.kind === "debris" && e.record) { target = e.record; game.props.repairStep(e.record, dt); }
      else if (e?.kind === "prop" && e.maxHp && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + 80 * dt);
      else if (e?.kind === "npc" || e?.kind === "ragdoll") e.npc?.repair(dt);
      else if (e?.repairable) e.repairable(dt);
    } else if (W.loop) { W.loop.stop(); W.loop = null; }
    if (W.repairing && W.repairing !== target) game.props.cancelRepair(W.repairing);
    W.repairing = target;
  }

  /* ---------- flashlight & radio ---------- */
  setFlash(ent, on) {
    const W = ent.weapon;
    W.on = on;
    const lens = ent.mesh.getObjectByName("lens");
    if (on) {
      if (this.flashOwner && this.flashOwner !== ent) { this.flashOwner.weapon.on = false; const l = this.flashOwner.mesh.getObjectByName("lens"); if (l) l.material.emissiveIntensity = 0; }
      this.flashOwner = ent;
      ent.mesh.add(this.spot);
      this.spot.position.set(0, 0, -0.14);
      this.spot.intensity = 18;
    } else if (this.flashOwner === ent) { this.spot.intensity = 0; }
    if (lens) lens.material.emissiveIntensity = on ? 3 : 0;
    this.game.audio.play("click", tv(ent.body.translation()), { vol: 0.5, rate: 1.3 });
  }

  toggleRadio(r) {
    const game = this.game;
    r.radioOn = !r.radioOn;
    const dial = r.mesh.getObjectByName("dial");
    if (r.radioOn) { r.radioLoop = game.audio.loop("music", tv(r.body.translation()), 0.55, 2.5); if (dial) dial.visible = true; game.onRadio && game.onRadio(r, true); }
    else { r.radioLoop?.stop(); r.radioLoop = null; if (dial) dial.visible = false; }
    game.audio.play("click", tv(r.body.translation()), { vol: 0.6 });
  }
  musicSources() { return [...this.radios].filter((r) => r.radioOn && r.body).map((r) => tv(r.body.translation())); }
}
