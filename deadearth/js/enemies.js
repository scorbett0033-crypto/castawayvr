// Hostile machines that still roam the dead world.
//  - Scav Drone: hovers, strafes, charges and fires slow plasma bolts you can dodge (or shoot down)
//  - Stalker: four-legged walker with procedural IK gait that lunges at you
import * as THREE from "three";
import { Builder, mat4, placeBetween, rand } from "./utils.js";
import { HAIR_STYLES, HAIR_COLORS, OUTFITS, FACES } from "./avatar.js";
import { Human, modelReady } from "./human.js";
import { buildGun, WEAPONS } from "./weapons.js";
import { canvasTex } from "./textures.js";

const RIVAL_NAMES = ["Vex", "Kade", "Rook", "Nyx", "Juno", "Saber", "Mara", "Dax", "Ivo", "Rhea", "Kestrel", "Orin", "Talon", "Lyra", "Zane", "Echo"];

const UP = new THREE.Vector3(0, 1, 0);

export class EnemyManager {
  constructor(scene, T, world, fx, sfx, WM, wind) {
    this.scene = scene; this.world = world; this.fx = fx; this.sfx = sfx; this.T = T; this.WM = WM; this.wind = wind;
    this.playerStake = 100;
    this.list = []; this.bolts = [];
    this.wave = 0; this.toSpawn = []; this.spawnT = 0; this.breakT = 3; this.active = false;
    this.M = {
      hull: new THREE.MeshStandardMaterial({ map: T.painted.map, normalMap: T.painted.normalMap, roughnessMap: T.painted.roughnessMap, color: 0x4a4f52, metalness: 0.7, roughness: 1 }),
      dark: new THREE.MeshStandardMaterial({ map: T.gunmetal.map, roughnessMap: T.gunmetal.roughnessMap, color: 0x888888, metalness: 0.9, roughness: 1 }),
      rust: new THREE.MeshStandardMaterial({ ...T.rustBare, metalness: 0.6, roughness: 1 }),
      warn: new THREE.MeshStandardMaterial({ map: T.painted.map, color: 0xb8861c, metalness: 0.4, roughness: 0.8 }),
      cable: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 }),
    };
    this.boltGeo = new THREE.SphereGeometry(0.09, 10, 8).scale(1, 1, 3.2);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false });
    this.boltGlow = new THREE.SpriteMaterial({ map: fx.glowTex, color: 0xff6a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  }

  /* ---------- models ---------- */
  makeDrone() {
    const g = new THREE.Group();
    const B = new Builder();
    B.add("hull", new THREE.SphereGeometry(0.34, 20, 14), mat4([0, 0, 0], [0, 0, 0], [1, 0.55, 1.25]));
    B.add("dark", new THREE.CylinderGeometry(0.36, 0.3, 0.1, 20), mat4([0, -0.05, 0], [0, 0, 0], [1, 1, 1.2]));
    B.add("warn", new THREE.BoxGeometry(0.5, 0.05, 0.2), mat4([0, 0.17, -0.1]));
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = Math.cos(a) * 0.55, z = Math.sin(a) * 0.55;
      B.add("dark", new THREE.BoxGeometry(0.5, 0.04, 0.07), mat4([x * 0.55, 0.02, z * 0.55], [0, -a, 0]));
      B.add("dark", new THREE.TorusGeometry(0.2, 0.02, 6, 24), mat4([x, 0.03, z], [Math.PI / 2, 0, 0]));
      B.cyl("hull", 0.04, 0.05, 0.08, 10, [x, 0.03, z]);
    }
    B.cyl("dark", 0.035, 0.04, 0.4, 10, [0, -0.15, 0.3], [Math.PI / 2, 0, 0]);
    B.add("rust", new THREE.BoxGeometry(0.12, 0.1, 0.2), mat4([0, -0.15, 0.1]));
    B.cyl("cable", 0.01, 0.01, 0.3, 4, [0.15, 0.1, -0.35], [0.4, 0, 0.3]);
    const body = B.build(this.M);
    g.add(body);
    const props = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.04), this.M.dark);
      p.position.set(Math.cos(a) * 0.55, 0.07, Math.sin(a) * 0.55);
      g.add(p); props.push(p);
    }
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 2.5 });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), eyeMat);
    eye.position.set(0, 0.0, 0.4); g.add(eye);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.glowTex, color: 0xff3010, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(0.5); glow.position.copy(eye.position); g.add(glow);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { g, props, eyeMat, glow };
  }
  makeStalker() {
    const g = new THREE.Group();
    const B = new Builder();
    B.add("hull", new THREE.BoxGeometry(0.9, 0.32, 1.3), mat4([0, 0, 0]));
    B.add("dark", new THREE.BoxGeometry(0.7, 0.22, 1.1), mat4([0, -0.2, 0]));
    B.add("warn", new THREE.BoxGeometry(0.92, 0.06, 0.25), mat4([0, 0.12, -0.45]));
    B.add("rust", new THREE.BoxGeometry(0.5, 0.2, 0.4), mat4([0, 0.24, -0.25]));
    for (let i = 0; i < 6; i++) B.add("dark", new THREE.BoxGeometry(0.6, 0.04, 0.05), mat4([0, 0.36, -0.42 + i * 0.07]));
    B.add("hull", new THREE.BoxGeometry(0.46, 0.28, 0.42), mat4([0, 0.05, 0.75]));
    B.add("dark", new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), mat4([0.18, 0.0, 0.95], [Math.PI / 2, 0, 0]));
    B.add("dark", new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), mat4([-0.18, 0.0, 0.95], [Math.PI / 2, 0, 0]));
    for (const [x, z] of [[0.45, 0.5], [-0.45, 0.5], [0.45, -0.5], [-0.45, -0.5]]) B.add("dark", new THREE.SphereGeometry(0.11, 10, 8), mat4([x, 0, z]));
    const body = B.build(this.M);
    g.add(body);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x001a1a, emissive: 0xff3a10, emissiveIntensity: 2.2 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), coreMat);
    core.position.set(0, 0.06, 0.97); g.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.glowTex, color: 0xff4010, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(0.6); glow.position.copy(core.position); g.add(glow);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // legs: two segments each, world-space
    const legs = [];
    const segGeo = new THREE.CylinderGeometry(0.055, 0.04, 1, 8);
    const hips = [[0.45, 0.5], [-0.45, 0.5], [0.45, -0.5], [-0.45, -0.5]];
    hips.forEach(([x, z], i) => {
      const a = new THREE.Mesh(segGeo, this.M.dark), b = new THREE.Mesh(segGeo, this.M.hull);
      const foot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), this.M.rust);
      [a, b, foot].forEach((m) => { m.castShadow = true; this.scene.add(m); });
      legs.push({ hip: new THREE.Vector3(x, 0, z), rest: new THREE.Vector3(x * 2.0, 0, z * 1.3), foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, a, b, footM: foot, group: i === 0 || i === 3 ? 0 : 1 });
    });
    return { g, legs, coreMat, glow, core };
  }

  /* ---------- waves ---------- */
  startRun() { this.clear(); this.wave = 0; this.breakT = 4; this.active = true; }
  clear() {
    for (const e of this.list) this.remove(e);
    this.list = [];
    for (const b of this.bolts) { this.scene.remove(b.mesh); }
    this.bolts = []; this.toSpawn = [];
  }
  remove(e) {
    if (e.kind === "rival") { this.scene.remove(e.av.root); this.scene.remove(e.gun); this.scene.remove(e.tag); return; }
    this.scene.remove(e.g);
    if (e.legs) e.legs.forEach((l) => { this.scene.remove(l.a); this.scene.remove(l.b); this.scene.remove(l.footM); });
  }
  nextWave() {
    this.wave++;
    const n = this.wave;
    const drones = 1 + Math.floor(n / 2), stalkers = Math.floor(n / 3), rivals = 1 + n;
    this.toSpawn = [];
    for (let i = 0; i < rivals; i++) this.toSpawn.push("rival");
    for (let i = 0; i < drones; i++) this.toSpawn.push("drone");
    for (let i = 0; i < stalkers; i++) this.toSpawn.push("stalker");
    this.toSpawn.sort(() => Math.random() - 0.5);
    this.spawnT = 0.5;
    this.sfx.wave();
  }
  spawnRival(x, z) {
    const fits = ["m_combat", "m_ranger", "f_combat", "m_hoodie", "f_leather", "m_denim", "f_hoodie", "m_base_black", "f_base_olive", "m_base_navy", "f_base_black"]
      .map((id) => OUTFITS.find((o) => o.id === id)).filter((o) => o && modelReady(o.model));
    const fit = fits[Math.floor(Math.random() * fits.length)] || OUTFITS[0];
    const look = {
      body: fit.body, outfit: fit.id,
      face: (() => { const fs = FACES.filter((f) => f.body === fit.body && modelReady(f.id)); return Math.random() < 0.6 && fs.length ? fs[Math.floor(Math.random() * fs.length)].id : "own"; })(),
      hair: fit.rig === "meshy" ? ["bald", "crop", "mohawk", "dreads", "ponytail", "crop"][Math.floor(Math.random() * 6)]
        : Math.random() < 0.7 ? "natural" : HAIR_STYLES[2 + Math.floor(Math.random() * (HAIR_STYLES.length - 2))].id,
      hairColor: Math.random() < 0.7 ? "natural" : HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)].id,
      cloth: ["none", "none", "scarf", "cloak", "duster"][Math.floor(Math.random() * 5)],
      mask: Math.random() < 0.5 ? "respirator" : "none",
    };
    const av = new Human(this.T, look, { quality: 0.35 });
    av.holdingGun = true; av.headYaw = 0;
    av.root.position.set(x, this.world.heightAt(x, z), z);
    av.groundY = av.root.position.y;
    this.scene.add(av.root);
    const pool = WEAPONS.filter((w) => w.id !== "lancer" && (w.price <= 600 + this.wave * 500));
    const wdef = pool[Math.floor(Math.random() * pool.length)];
    const gun = buildGun(wdef.id, this.WM);
    gun.traverse((o) => { if (o.material && o.material.stencilWrite) o.visible = false; }); // no reticles on bots
    this.scene.add(gun);
    const name = RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)];
    const stakes = [50, 100, 100, 250, 250, 500, 1000].filter((v) => v <= this.playerStake * 2.5 + 50);
    const stake = stakes[Math.floor(Math.random() * stakes.length)];
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    tag.scale.set(1.1, 0.27, 1);
    this.scene.add(tag);
    const e = { kind: "rival", av, gun, wdef, name, stake, tag, hp: 100 + this.wave * 6, dead: false, deathT: 0, reward: stake, goal: new THREE.Vector3(x, 0, z), repathT: 0, fireT: rand(1.5, 3), burst: 0, shotT: 0, yaw: 0, fallT: 0, src: { kind: "rival", name: "Raider " + name } };
    this.updateTag(e);
    this.list.push(e);
    return e;
  }
  updateTag(e) {
    const tex = canvasTex(512, 128, (ctx) => {
      ctx.fillStyle = "rgba(10,6,6,0.65)"; ctx.fillRect(0, 18, 512, 92);
      ctx.font = "800 46px Segoe UI, Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#ff6a5a"; ctx.fillText(`RAIDER ${e.name.toUpperCase()}`, 256, 50);
      ctx.font = "700 34px Segoe UI, Arial"; ctx.fillStyle = "#ffcf5a"; ctx.fillText(`carrying ${e.stake} ¢`, 256, 92);
    });
    if (e.tag.material.map) e.tag.material.map.dispose();
    e.tag.material.map = tex; e.tag.material.needsUpdate = true;
  }
  spawn(kind, player) {
    const a = Math.random() * Math.PI * 2, r = rand(38, 60);
    if (kind === "rival") { const rr = rand(28, 45); return this.spawnRival(player.x + Math.cos(a) * rr, player.z + Math.sin(a) * rr); }
    const x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
    const gy = this.world.heightAt(x, z);
    const hpMul = 1 + (this.wave - 1) * 0.12;
    if (kind === "drone") {
      const m = this.makeDrone();
      m.g.position.set(x, gy + rand(4, 8), z);
      this.scene.add(m.g);
      this.list.push({ kind, ...m, hp: 60 * hpMul, r: 0.45, vel: new THREE.Vector3(), orbit: a, orbitDir: Math.random() < 0.5 ? 1 : -1, dist: rand(9, 18), alt: rand(2.2, 5.5), fireT: rand(2, 4), charge: 0, dead: false, deathT: 0, reward: 25, spin: 0 });
    } else {
      const m = this.makeStalker();
      m.g.position.set(x, gy + 0.85, z);
      this.scene.add(m.g);
      const e = { kind, ...m, hp: 150 * hpMul, r: 0.75, vel: new THREE.Vector3(), atkT: 0, lunge: 0, dead: false, deathT: 0, reward: 50, yaw: 0, stepT: 0 };
      e.g.updateMatrixWorld();
      for (const l of e.legs) { const w = l.rest.clone().applyMatrix4(e.g.matrixWorld); w.y = this.world.heightAt(w.x, w.z); l.foot.copy(w); l.from.copy(w); l.to.copy(w); }
      this.list.push(e);
    }
  }
  remaining() { return this.list.filter((e) => !e.dead).length + this.toSpawn.length; }

  /* ---------- hit testing (analytic spheres) ---------- */
  raycast(origin, dir, maxDist) {
    const hits = [];
    const oc = new THREE.Vector3();
    for (const e of this.list) {
      if (e.dead) continue;
      let parts;
      if (e.kind === "rival") {
        const J = e.av.j, w = (j, y = 0) => j.localToWorld(new THREE.Vector3(0, y, 0));
        parts = [[w(J.head), 0.13, true], [w(J.chest, 0.02), 0.21, false], [w(J.spine, 0.05), 0.2, false], [w(J.hips), 0.2, false], [w(J.kneeL), 0.13, false], [w(J.kneeR), 0.13, false], [w(J.hipL, -0.22), 0.11, false], [w(J.hipR, -0.22), 0.11, false]];
      } else parts = e.kind === "drone"
        ? [[e.g.position, 0.42, false]]
        : [[e.g.position, 0.72, false], [e.core.getWorldPosition(new THREE.Vector3()), 0.16, true]];
      for (const [c, r, weak] of parts) {
        oc.subVectors(origin, c);
        const b = oc.dot(dir), cc = oc.lengthSq() - r * r, disc = b * b - cc;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < maxDist) hits.push({ enemy: e, dist: t, point: origin.clone().addScaledVector(dir, t), weak });
      }
    }
    for (const bolt of this.bolts) {
      oc.subVectors(origin, bolt.mesh.position);
      const b = oc.dot(dir), cc = oc.lengthSq() - 0.25 * 0.25, disc = b * b - cc;
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < maxDist) hits.push({ bolt, dist: t, point: origin.clone().addScaledVector(dir, t) }); }
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }
  // returns coins awarded if killed (rivals drop the stake they carry)
  damage(e, amount, point, dir) {
    if (e.dead) return 0;
    e.hp -= amount;
    if (e.kind === "rival") { this.fx.sparks(point, dir.clone().negate(), 8, 0xc02818); e.repathT = 0; }
    else this.fx.sparks(point, dir.clone().negate(), 10, 0xffc070);
    if (e.kind === "drone") e.vel.addScaledVector(dir, 2.5);
    if (e.hp <= 0) { this.kill(e, dir); return e.reward; }
    return 0;
  }
  destroyBolt(bolt) { this.fx.sparks(bolt.mesh.position, UP, 14, 0xffa040); this.scene.remove(bolt.mesh); bolt.dead = true; }
  kill(e, dir) {
    e.dead = true; e.deathT = 0;
    if (e.kind === "rival") { e.tag.visible = false; e.av.speed = 0; e.av.holdingGun = false; e.animDeath = e.av.die(); if (!e.animDeath) e.av.frozen = true; this.sfx.hurt(); return; }
    const p = e.g.position.clone();
    this.fx.explosion(p, e.kind === "drone" ? 1 : 1.5);
    this.sfx.explode(0, e.kind === "drone" ? 0.8 : 1.1);
    if (e.kind === "drone") { e.vel.addScaledVector(dir, 3).add(new THREE.Vector3(0, 2, 0)); }
    (e.eyeMat || e.coreMat).emissiveIntensity = 0;
    e.glow.visible = false;
  }

  /* ---------- update ---------- */
  // player: { head: Vector3, feet: Vector3 }; onHurt(dmg, fromDir)
  update(dt, t, player, onHurt) {
    if (!this.active) return;
    // wave flow
    if (this.toSpawn.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawn(this.toSpawn.pop(), player.feet); this.spawnT = rand(0.8, 2.2); }
    } else if (!this.list.some((e) => !e.dead)) {
      this.breakT -= dt;
      if (this.breakT <= 0) { this.nextWave(); this.breakT = 7; }
    }
    const H = this.world.heightAt;
    const tmp = new THREE.Vector3(), to = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead && e.kind === "rival") {
        e.deathT += dt;
        const k = Math.min(1, e.deathT / 0.7);
        if (!e.animDeath) e.av.root.rotation.x = -k * k * Math.PI / 2; // no death clip: topple stiffly
        e.gun.position.y = Math.max(H(e.gun.position.x, e.gun.position.z) + 0.05, e.gun.position.y - dt * 3);
        e.gun.rotation.z = Math.min(Math.PI / 2, e.gun.rotation.z + dt * 4);
        e.av.update(dt, this.wind.vec);
        if (e.deathT > 9) { this.remove(e); this.list.splice(i, 1); }
        continue;
      }
      if (e.dead) {
        e.deathT += dt;
        if (e.kind === "drone") {
          e.vel.y -= 9.8 * dt; e.g.position.addScaledVector(e.vel, dt);
          e.g.rotation.x += dt * 4; e.g.rotation.z += dt * 6;
          if (Math.random() < 0.6) this.fx.smoke(e.g.position, 0.5);
          const gy = H(e.g.position.x, e.g.position.z);
          if (e.g.position.y < gy + 0.2 && !e.crashed) { e.crashed = true; e.g.position.y = gy + 0.2; e.vel.set(0, 0, 0); this.fx.explosion(e.g.position, 0.8); this.sfx.explode(0, 0.6); }
          if (e.crashed) e.vel.set(0, 0, 0), (e.g.position.y = gy + 0.15);
        } else {
          e.g.position.y = Math.max(H(e.g.position.x, e.g.position.z) + 0.25, e.g.position.y - dt * 1.5);
          e.g.rotation.z = Math.min(0.4, e.g.rotation.z + dt * 0.5);
          if (Math.random() < 0.3) this.fx.smoke(e.g.position, 0.7);
          this.updateLegs(e, dt, true);
        }
        if (e.deathT > 6) { this.remove(e); this.list.splice(i, 1); }
        continue;
      }
      if (e.kind === "rival") this.updateRival(e, dt, t, player, H, tmp, onHurt);
      else if (e.kind === "drone") this.updateDrone(e, dt, t, player, H, tmp, to);
      else this.updateStalker(e, dt, t, player, H, tmp, to, onHurt);
    }
    // plasma bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (b.dead) { this.bolts.splice(i, 1); continue; }
      b.life -= dt;
      const prev = b.mesh.position.clone();
      b.mesh.position.addScaledVector(b.vel, dt);
      // swept test against player's head + torso
      const hitHead = segDist(prev, b.mesh.position, player.head) < 0.22;
      const torso = player.head.clone(); torso.y -= 0.55;
      const hitBody = segDist(prev, b.mesh.position, torso) < 0.3;
      if (hitHead || hitBody) { onHurt(12 + this.wave * 0.5, b.vel.clone().normalize(), { kind: "drone", name: "a scav drone" }); this.destroyBolt(b); this.bolts.splice(i, 1); continue; }
      const gy = H(b.mesh.position.x, b.mesh.position.z);
      if (b.mesh.position.y < gy || b.life <= 0) { this.fx.sparks(b.mesh.position, UP, 8, 0xff8030); this.scene.remove(b.mesh); this.bolts.splice(i, 1); continue; }
      // near-miss whoosh
      if (!b.whoosh && b.mesh.position.distanceTo(player.head) < 1.6) { b.whoosh = true; this.sfx.plasma(0); }
    }
  }
  updateRival(e, dt, t, player, H, tmp, onHurt) {
    const av = e.av, root = av.root;
    tmp.subVectors(player.feet, root.position); tmp.y = 0;
    const dist = tmp.length();
    // pick a new firing position around the player every few seconds
    e.repathT -= dt;
    if (e.repathT <= 0) {
      const cur = Math.atan2(root.position.z - player.feet.z, root.position.x - player.feet.x);
      const a = cur + rand(-0.9, 0.9), r = rand(9, 22);
      e.goal.set(player.feet.x + Math.cos(a) * r, 0, player.feet.z + Math.sin(a) * r);
      e.repathT = rand(2.2, 4.5);
    }
    const gx = e.goal.x - root.position.x, gz = e.goal.z - root.position.z, gd = Math.hypot(gx, gz);
    const speed = gd > 0.6 ? (dist > 26 ? 3.6 : 2.5) : 0;
    if (speed) { root.position.x += (gx / gd) * speed * dt; root.position.z += (gz / gd) * speed * dt; }
    for (const c of this.world.colliders) {
      const p = root.position, r = 0.35;
      if (p.x > c.x0 - r && p.x < c.x1 + r && p.z > c.z0 - r && p.z < c.z1 + r) {
        const dx0 = p.x - (c.x0 - r), dx1 = c.x1 + r - p.x, dz0 = p.z - (c.z0 - r), dz1 = c.z1 + r - p.z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) p.x = c.x0 - r; else if (m === dx1) p.x = c.x1 + r; else if (m === dz0) p.z = c.z0 - r; else p.z = c.z1 + r;
        e.repathT = Math.min(e.repathT, 0.3);
      }
    }
    root.position.y = H(root.position.x, root.position.z);
    av.groundY = root.position.y;
    // always face the player (strafe-walking)
    const want = Math.atan2(tmp.x, tmp.z);
    let dy = want - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += THREE.MathUtils.clamp(dy, -dt * 5, dt * 5);
    root.rotation.y = e.yaw;
    av.speed = speed;
    av.aimAt = player.head;
    av.update(dt, this.wind.vec);
    // gun in the right hand, aimed at the player's head
    av.j.handR.getWorldPosition(e.gun.position);
    e.gun.lookAt(player.head); e.gun.rotateY(Math.PI);
    e.tag.position.set(root.position.x, root.position.y + 2.2, root.position.z);
    // burst fire with line-of-sight checks
    e.fireT -= dt;
    if (e.burst > 0) {
      e.shotT -= dt;
      if (e.shotT <= 0) { this.rivalShot(e, player, onHurt, dist); e.burst--; e.shotT = Math.max(0.09, 60 / e.wdef.rpm); }
    } else if (e.fireT <= 0 && dist < 45) {
      e.burst = e.wdef.auto ? Math.floor(rand(3, 7)) : Math.floor(rand(1, 4));
      e.fireT = rand(1.4, 3.0) - Math.min(0.8, this.wave * 0.06);
      e.shotT = 0;
    }
  }
  rivalShot(e, player, onHurt, dist) {
    const muzzle = e.gun.userData.muzzle.getWorldPosition(new THREE.Vector3());
    const toHead = player.head.clone().sub(muzzle);
    const d = toHead.length(); toHead.normalize();
    const block = this.world.raycastWorld(muzzle, toHead, d);
    this.fx.flash(muzzle, 0xffb060, 0.4, 3);
    this.sfx.gun(e.wdef.sound, Math.max(0.15, Math.min(0.7, 6 / (dist + 1))));
    if (block && block.dist < d - 0.4) { this.fx.tracer(muzzle, block.point); this.fx.dust(block.point, block.normal); return; }
    const p = THREE.MathUtils.clamp(0.52 - dist * 0.012 + this.wave * 0.015, 0.12, 0.62) * (player.moving ? 0.7 : 1) * (e.wdef.pellets > 1 && dist > 15 ? 0.4 : 1);
    if (Math.random() < p) {
      onHurt(Math.min(22, e.wdef.dmg * (e.wdef.pellets > 1 ? 3 : 0.45) + this.wave * 0.4), toHead, e.src);
      this.fx.tracer(muzzle, player.head.clone().addScaledVector(toHead, -0.3));
    } else {
      const miss = player.head.clone().add(new THREE.Vector3(rand(-0.7, 0.7), rand(-0.4, 0.6), rand(-0.7, 0.7))).addScaledVector(toHead, 20);
      this.fx.tracer(muzzle, miss);
      if (Math.random() < 0.5) this.sfx.whiz();
    }
  }
  // a rival who kills the player pockets the coins
  creditKiller(src, coins) {
    const e = this.list.find((x) => x.src === src);
    if (e && !e.dead) { e.stake += coins; this.updateTag(e); }
  }
  updateDrone(e, dt, t, player, H, tmp, to) {
    e.orbit += e.orbitDir * dt * 0.35;
    if (Math.random() < dt * 0.15) e.orbitDir *= -1;
    to.set(player.feet.x + Math.cos(e.orbit) * e.dist, 0, player.feet.z + Math.sin(e.orbit) * e.dist);
    to.y = Math.max(H(to.x, to.z) + 1.8, player.feet.y + e.alt + Math.sin(t * 1.3 + e.orbit) * 0.6);
    tmp.subVectors(to, e.g.position);
    e.vel.addScaledVector(tmp, dt * 1.2).multiplyScalar(1 - dt * 0.9);
    if (e.vel.length() > 7) e.vel.setLength(7);
    e.g.position.addScaledVector(e.vel, dt);
    const gy = H(e.g.position.x, e.g.position.z) + 1.2;
    if (e.g.position.y < gy) e.g.position.y = gy;
    // face the player, bank into motion
    tmp.subVectors(player.head, e.g.position);
    const yaw = Math.atan2(tmp.x, tmp.z);
    e.g.rotation.set(THREE.MathUtils.clamp(e.vel.z * 0.05, -0.4, 0.4), yaw, THREE.MathUtils.clamp(-e.vel.x * 0.05, -0.4, 0.4), "YXZ");
    e.props.forEach((p, k) => (p.rotation.y += dt * (40 + k)));
    // attack cycle: charge then fire
    e.fireT -= dt;
    if (e.fireT < 0.6 && e.charge === 0) { e.charge = 1; this.sfx.charge(0); }
    e.eyeMat.emissiveIntensity = e.charge ? 2.5 + (0.6 - Math.max(0, e.fireT)) * 12 : 2.5;
    e.glow.scale.setScalar(e.charge ? 0.5 + (0.6 - Math.max(0, e.fireT)) * 2 : 0.5);
    if (e.fireT <= 0) {
      e.charge = 0; e.fireT = rand(2.4, 4.2) - Math.min(1.2, this.wave * 0.08);
      const muzzle = e.g.localToWorld(new THREE.Vector3(0, -0.15, 0.55));
      const aim = player.head.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(-0.4, 0.3), rand(-0.5, 0.5)));
      const vel = aim.sub(muzzle).normalize().multiplyScalar(13 + this.wave * 0.4);
      const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
      const glow = new THREE.Sprite(this.boltGlow); glow.scale.setScalar(0.8); mesh.add(glow);
      mesh.position.copy(muzzle); mesh.lookAt(muzzle.clone().add(vel));
      this.scene.add(mesh);
      this.bolts.push({ mesh, vel, life: 6 });
      this.fx.flash(muzzle, 0xff6020);
    }
  }
  updateStalker(e, dt, t, player, H, tmp, to, onHurt) {
    tmp.subVectors(player.feet, e.g.position); tmp.y = 0;
    const dist = tmp.length();
    const want = Math.atan2(tmp.x, tmp.z);
    let dy = want - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += THREE.MathUtils.clamp(dy, -dt * 2.2, dt * 2.2);
    let speed = dist > 2.0 ? 2.6 + this.wave * 0.08 : 0;
    e.atkT -= dt;
    if (dist < 2.6 && e.atkT <= 0 && e.lunge <= 0) { e.lunge = 0.7; e.atkT = 1.8; this.sfx.charge(0); }
    if (e.lunge > 0) {
      e.lunge -= dt;
      speed = e.lunge < 0.35 ? 9 : -0.8; // wind up, then dash
      if (e.lunge < 0.3 && e.lunge + dt >= 0.3 && dist < 2.4) onHurt(20 + this.wave, tmp.clone().normalize(), { kind: "stalker", name: "a stalker" });
    }
    const fwd = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    e.vel.lerp(fwd.multiplyScalar(speed), Math.min(1, dt * 4));
    e.g.position.x += e.vel.x * dt; e.g.position.z += e.vel.z * dt;
    // world collision (AABBs) for the body
    for (const c of this.world.colliders) {
      const p = e.g.position, r = 0.7;
      if (p.x > c.x0 - r && p.x < c.x1 + r && p.z > c.z0 - r && p.z < c.z1 + r) {
        const dx0 = p.x - (c.x0 - r), dx1 = c.x1 + r - p.x, dz0 = p.z - (c.z0 - r), dz1 = c.z1 + r - p.z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) p.x = c.x0 - r; else if (m === dx1) p.x = c.x1 + r; else if (m === dz0) p.z = c.z0 - r; else p.z = c.z1 + r;
      }
    }
    // body height follows feet average + bob
    let avg = 0; e.legs.forEach((l) => (avg += l.foot.y)); avg /= 4;
    const target = Math.max(avg, H(e.g.position.x, e.g.position.z)) + 0.85 + Math.sin(t * 9) * 0.03 * Math.min(1, e.vel.length());
    e.g.position.y += (target - e.g.position.y) * Math.min(1, dt * 8);
    const pitch = (H(e.g.position.x + fwd.x, e.g.position.z + fwd.z) - H(e.g.position.x - fwd.x, e.g.position.z - fwd.z)) * -0.25;
    e.g.rotation.set(pitch + (e.lunge > 0.35 ? 0.15 : 0), e.yaw, 0, "YXZ");
    e.coreMat.emissiveIntensity = e.lunge > 0 ? 5 : 2.2;
    this.updateLegs(e, dt, false);
  }
  updateLegs(e, dt, dead) {
    e.g.updateMatrixWorld();
    const H = this.world.heightAt;
    const hipW = new THREE.Vector3(), ideal = new THREE.Vector3(), knee = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3();
    const moving = e.vel.length();
    const anyStepping = [0, 1].map((gidx) => e.legs.some((l) => l.group === gidx && l.t < 1));
    for (const l of e.legs) {
      hipW.copy(l.hip).applyMatrix4(e.g.matrixWorld);
      if (!dead) {
        ideal.copy(l.rest).applyMatrix4(e.g.matrixWorld).addScaledVector(e.vel, 0.25);
        ideal.y = H(ideal.x, ideal.z);
        if (l.t >= 1 && l.foot.distanceTo(ideal) > 0.55 && !anyStepping[1 - l.group]) {
          l.from.copy(l.foot); l.to.copy(ideal); l.t = 0;
        }
        if (l.t < 1) {
          l.t = Math.min(1, l.t + dt * (4 + moving * 0.8));
          l.foot.lerpVectors(l.from, l.to, l.t);
          l.foot.y += Math.sin(l.t * Math.PI) * 0.25;
          if (l.t >= 1 && Math.random() < 0.3) this.sfx.step();
        }
      }
      // 2-bone IK with the knee pushed upward/outward
      const A = 0.75, Bl = 0.85;
      dir.subVectors(l.foot, hipW);
      let d = dir.length();
      d = Math.min(d, A + Bl - 0.01);
      dir.normalize();
      const cosA = THREE.MathUtils.clamp((A * A + d * d - Bl * Bl) / (2 * A * d), -1, 1);
      up.copy(UP).addScaledVector(dir, -UP.dot(dir));
      const out = hipW.clone().sub(e.g.position); out.y = 0; out.normalize().multiplyScalar(0.6);
      up.add(out).normalize();
      knee.copy(hipW).addScaledVector(dir, A * cosA).addScaledVector(up, A * Math.sqrt(1 - cosA * cosA));
      const footP = hipW.clone().addScaledVector(dir, d);
      placeBetween(l.a, hipW, knee);
      placeBetween(l.b, knee, footP);
      l.footM.position.copy(footP); l.footM.position.y += 0.06; l.footM.rotation.set(Math.PI, 0, 0);
    }
  }
}

function segDist(a, b, p) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / (ab.lengthSq() || 1), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}
