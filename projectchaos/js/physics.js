// Rapier physics wrapper: world, collision groups, entity registry, impact events.
import * as THREE from "three";

export let RAPIER = null;

// Collision group bits
export const G = {
  STATIC: 1, PROP: 2, PLAYER: 4, HAND: 8, NPC: 16, RAGDOLL: 32, HELD: 64, DEBRIS: 128, PROJ: 256, TRIGGER: 512,
};
const ALL = 0xffff;
export const GROUPS = {
  static: grp(G.STATIC, ALL),
  prop: grp(G.PROP, G.STATIC | G.PROP | G.PLAYER | G.HAND | G.NPC | G.RAGDOLL | G.HELD | G.DEBRIS | G.PROJ),
  held: grp(G.HELD, G.STATIC | G.PROP | G.NPC | G.RAGDOLL | G.DEBRIS | G.HELD | G.PROJ),
  player: grp(G.PLAYER, G.STATIC | G.PROP | G.NPC),
  hand: grp(G.HAND, G.PROP | G.RAGDOLL | G.DEBRIS),
  npc: grp(G.NPC, G.PROP | G.HELD | G.PLAYER | G.PROJ | G.DEBRIS),
  ragdoll: grp(G.RAGDOLL, G.STATIC | G.PROP | G.HELD | G.HAND | G.DEBRIS | G.PROJ),
  ragdollHeld: grp(G.RAGDOLL, G.STATIC | G.PROP | G.HELD | G.DEBRIS | G.PROJ),
  debris: grp(G.DEBRIS, G.STATIC | G.PROP | G.HELD | G.HAND | G.RAGDOLL | G.DEBRIS),
  proj: grp(G.PROJ, G.STATIC | G.PROP | G.HELD | G.NPC | G.RAGDOLL | G.DEBRIS),
  none: grp(0, 0),
};
export function grp(member, filter) { return ((member & 0xffff) << 16) | (filter & 0xffff); }

// Physical material presets: friction, restitution, sound family
export const MATS = {
  wood: { friction: 0.6, restitution: 0.15, sound: "wood" },
  metal: { friction: 0.45, restitution: 0.2, sound: "metal" },
  heavyMetal: { friction: 0.5, restitution: 0.08, sound: "metal" },
  plastic: { friction: 0.5, restitution: 0.3, sound: "plastic" },
  rubber: { friction: 0.9, restitution: 0.6, sound: "rubber" },
  glass: { friction: 0.3, restitution: 0.1, sound: "glass" },
  stone: { friction: 0.75, restitution: 0.05, sound: "stone" },
  fruit: { friction: 0.7, restitution: 0.1, sound: "soft" },
  foam: { friction: 0.8, restitution: 0.35, sound: "soft" },
  robot: { friction: 0.6, restitution: 0.1, sound: "plastic" },
};

const _v = new THREE.Vector3();

export class Physics {
  async init() {
    const mod = await import("rapier");
    RAPIER = mod.default || mod;
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.integrationParameters.numSolverIterations = 4;
    this.events = new RAPIER.EventQueue(true);
    this.byCollider = new Map(); // collider handle -> entity
    this.dynamic = new Set(); // entities with dynamic bodies and meshes to sync
    this.prevVel = new Map();
    this.onImpact = null;
    this.gravityY = -9.81;
    this.time = 0;
  }

  setGravity(y) { this.gravityY = y; this.world.gravity = { x: 0, y, z: 0 }; for (const e of this.dynamic) e.body.wakeUp(); }

  register(collider, ent) { this.byCollider.set(collider.handle, ent); }
  entOf(collider) { return collider ? this.byCollider.get(collider.handle) : null; }

  // Create a body + colliders for an entity. opts: type, pos, quat, colliders[{desc}], linDamp, angDamp, ccd, groups, mat, events
  createBody(ent, opts) {
    const R = RAPIER;
    let bd = opts.type === "fixed" ? R.RigidBodyDesc.fixed() : opts.type === "kinematic" ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
    const p = opts.pos || _v.set(0, 0, 0);
    bd.setTranslation(p.x, p.y, p.z);
    if (opts.quat) bd.setRotation({ x: opts.quat.x, y: opts.quat.y, z: opts.quat.z, w: opts.quat.w });
    if (opts.linDamp != null) bd.setLinearDamping(opts.linDamp);
    if (opts.angDamp != null) bd.setAngularDamping(opts.angDamp);
    if (opts.ccd) bd.setCcdEnabled(true);
    if (opts.gravityScale != null) bd.setGravityScale(opts.gravityScale);
    const body = this.world.createRigidBody(bd);
    ent.body = body;
    ent.colliders = [];
    const mat = opts.mat || MATS.plastic;
    for (const cd of opts.colliders) {
      cd.setFriction(mat.friction).setRestitution(mat.restitution);
      cd.setCollisionGroups(opts.groups ?? GROUPS.prop);
      if (opts.events !== false && opts.type !== "fixed") {
        cd.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
        cd.setContactForceEventThreshold(opts.forceThreshold ?? Math.max(4, (opts.mass || 1) * 9.81 * 3));
      }
      const c = this.world.createCollider(cd, body);
      this.register(c, ent);
      ent.colliders.push(c);
    }
    if (opts.type !== "fixed" && opts.type !== "kinematic" && ent.mesh) this.dynamic.add(ent);
    return body;
  }

  setGroups(ent, groups) { for (const c of ent.colliders || []) c.setCollisionGroups(groups); }

  remove(ent) {
    if (!ent.body) return;
    for (const c of ent.colliders || []) this.byCollider.delete(c.handle);
    this.world.removeRigidBody(ent.body);
    this.dynamic.delete(ent);
    this.prevVel.delete(ent);
    ent.body = null;
    ent.colliders = [];
  }

  // Fixed (static) collider without an entity mesh — used by the world builder.
  addStatic(desc, ent = null, mat = MATS.stone) {
    if (!this._staticBody) this._staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    desc.setFriction(mat.friction).setRestitution(mat.restitution).setCollisionGroups(GROUPS.static);
    const c = this.world.createCollider(desc, this._staticBody);
    this.register(c, ent || { kind: "static", mat });
    return c;
  }

  step(dt) {
    // remember pre-step velocities for impact speed estimates
    for (const e of this.dynamic) {
      if (!e.body || e.body.isSleeping()) continue;
      const v = e.body.linvel();
      let pv = this.prevVel.get(e);
      if (!pv) { pv = new THREE.Vector3(); this.prevVel.set(e, pv); }
      pv.set(v.x, v.y, v.z);
    }
    this.world.timestep = dt;
    this.world.step(this.events);
    this.time += dt;
    this.events.drainContactForceEvents((ev) => {
      const c1 = this.world.getCollider(ev.collider1()), c2 = this.world.getCollider(ev.collider2());
      const a = this.entOf(c1), b = this.entOf(c2);
      if (!a || !b) return;
      const va = this.prevVel.get(a), vb = this.prevVel.get(b);
      const d = ev.maxForceDirection();
      _v.set(0, 0, 0);
      if (va) _v.add(va);
      if (vb) _v.sub(vb);
      if (a.kinVel) _v.add(a.kinVel);
      if (b.kinVel) _v.sub(b.kinVel);
      // relative speed along the contact force direction (closing speed)
      const n = Math.hypot(d.x, d.y, d.z) || 1;
      const speed = Math.abs((_v.x * d.x + _v.y * d.y + _v.z * d.z) / n);
      if (speed < 0.35) return;
      this.onImpact && this.onImpact(a, b, speed, ev.totalForceMagnitude());
    });
  }

  sync() {
    for (const e of this.dynamic) {
      const b = e.body;
      if (!b || !e.mesh) continue;
      if (b.isSleeping() && e._synced) continue;
      const t = b.translation(), r = b.rotation();
      e.mesh.position.set(t.x, t.y, t.z);
      e.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      e._synced = true;
    }
  }

  // Ray cast returning {ent, collider, point, normal, dist}
  ray(origin, dir, maxDist, groups = grp(0xffff, G.STATIC | G.PROP | G.NPC | G.RAGDOLL | G.HELD | G.DEBRIS), excludeBody = null, predicate = null) {
    const r = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(r, maxDist, true, undefined, groups, undefined, excludeBody || undefined, predicate || undefined);
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi;
    return {
      collider: hit.collider, ent: this.entOf(hit.collider), dist: toi,
      point: new THREE.Vector3(origin.x + dir.x * toi, origin.y + dir.y * toi, origin.z + dir.z * toi),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    };
  }

  // All entities whose colliders overlap a ball
  overlapBall(center, radius, groups, cb) {
    const shape = new RAPIER.Ball(radius);
    this.world.intersectionsWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, shape, (c) => { cb(c, this.entOf(c)); return true; }, undefined, groups);
  }
}

// Helpers to read Rapier vectors into THREE
export const tv = (v, out = new THREE.Vector3()) => out.set(v.x, v.y, v.z);
export const tq = (q, out = new THREE.Quaternion()) => out.set(q.x, q.y, q.z, q.w);
