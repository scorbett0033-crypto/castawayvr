// Pooled visual effects: muzzle flashes, tracers, sparks, smoke, explosions,
// bullet-hole decals, ejected brass and rail beams.
import * as THREE from "three";
import { softDot, canvasTex } from "./textures.js";

export class FX {
  constructor() {
    this.root = new THREE.Group();
    this.glowTex = softDot("255,255,255");
    this.heightAt = null;
    /* sparks: one Points cloud */
    this.SP = 500;
    const sg = new THREE.BufferGeometry();
    this.spPos = new Float32Array(this.SP * 3); this.spCol = new Float32Array(this.SP * 3);
    this.spVel = new Float32Array(this.SP * 3); this.spLife = new Float32Array(this.SP);
    for (let i = 0; i < this.SP; i++) this.spPos[i * 3 + 1] = -9999;
    sg.setAttribute("position", new THREE.BufferAttribute(this.spPos, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(this.spCol, 3));
    this.sparksPts = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.045, map: this.glowTex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.sparksPts.frustumCulled = false;
    this.root.add(this.sparksPts);
    this.spIdx = 0;
    /* smoke sprites */
    const smokeTex = canvasTex(128, 128, (ctx) => {
      for (let i = 0; i < 14; i++) {
        const x = 40 + Math.random() * 48, y = 40 + Math.random() * 48, r = 20 + Math.random() * 30;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      }
    });
    this.smokes = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x4a443e, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.userData = { life: 0, max: 1, vel: new THREE.Vector3(), grow: 1 };
      this.root.add(s); this.smokes.push(s);
    }
    this.smIdx = 0;
    /* flashes */
    this.flashes = [];
    for (let i = 0; i < 10; i++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      f.visible = false; f.userData.life = 0;
      this.root.add(f); this.flashes.push(f);
    }
    this.flIdx = 0;
    this.light = new THREE.PointLight(0xffa860, 0, 14, 2);
    this.root.add(this.light);
    this.lightT = 0;
    /* muzzle star (crossed quads) */
    const starTex = canvasTex(128, 128, (ctx) => {
      ctx.translate(64, 64);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        const g = ctx.createLinearGradient(0, 0, 60, 0);
        g.addColorStop(0, "rgba(255,240,200,1)"); g.addColorStop(1, "rgba(255,140,40,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(60 * (0.6 + Math.random() * 0.4), 0); ctx.lineTo(0, 6); ctx.fill();
      }
    });
    const starMat = new THREE.MeshBasicMaterial({ map: starTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.muzzleStar = new THREE.Group();
    for (let i = 0; i < 2; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), starMat); q.rotation.y = (i * Math.PI) / 2; this.muzzleStar.add(q); }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 8, 1, true), starMat);
    cone.rotation.x = -Math.PI / 2; cone.position.z = -0.1; this.muzzleStar.add(cone);
    this.muzzleStar.visible = false; this.muzzleT = 0;
    /* tracers */
    const trMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    const trGeo = new THREE.BoxGeometry(0.012, 0.012, 1); trGeo.translate(0, 0, -0.5);
    this.tracers = [];
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(trGeo, trMat.clone()); m.visible = false; m.userData = { life: 0, speed: 0, len: 0, max: 0 }; this.root.add(m); this.tracers.push(m); }
    this.trIdx = 0;
    /* beam (rail) */
    const bm = new THREE.MeshBasicMaterial({ color: 0x60f0ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    const bg = new THREE.CylinderGeometry(0.03, 0.03, 1, 8, 1, true); bg.translate(0, 0.5, 0); bg.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(bg, bm); this.beam.visible = false; this.beamT = 0;
    const bg2 = bg.clone(); this.beamCore = new THREE.Mesh(bg2, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.beamCore.scale.set(0.3, 0.3, 1); this.beam.add(this.beamCore);
    this.root.add(this.beam);
    /* decals */
    const holeTex = canvasTex(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
      g.addColorStop(0, "rgba(10,8,6,1)"); g.addColorStop(0.25, "rgba(20,16,12,0.95)"); g.addColorStop(0.5, "rgba(40,32,24,0.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
    const decMat = new THREE.MeshStandardMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1 });
    const decGeo = new THREE.PlaneGeometry(0.09, 0.09);
    this.decals = [];
    for (let i = 0; i < 90; i++) { const d = new THREE.Mesh(decGeo, decMat); d.visible = false; this.root.add(d); this.decals.push(d); }
    this.dcIdx = 0;
    /* brass */
    const casGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6);
    const casMat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 });
    this.casings = [];
    for (let i = 0; i < 30; i++) { const c = new THREE.Mesh(casGeo, casMat); c.visible = false; c.userData = { vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, bounced: 0 }; this.root.add(c); this.casings.push(c); }
    this.csIdx = 0;
    /* debris chunks */
    const debGeo = new THREE.BoxGeometry(0.08, 0.05, 0.1);
    const debMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.8, roughness: 0.5 });
    this.debris = [];
    for (let i = 0; i < 40; i++) { const d = new THREE.Mesh(debGeo, debMat); d.visible = false; d.castShadow = true; d.userData = { vel: new THREE.Vector3(), life: 0 }; this.root.add(d); this.debris.push(d); }
    this.dbIdx = 0;
    this.onCasing = null;
  }
  attach(scene) { scene.add(this.root); }

  sparks(pos, normal, n = 12, color = 0xffb060) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.spIdx = (this.spIdx + 1) % this.SP, o = i * 3;
      this.spPos[o] = pos.x; this.spPos[o + 1] = pos.y; this.spPos[o + 2] = pos.z;
      const s = 2 + Math.random() * 5;
      this.spVel[o] = (normal.x + (Math.random() - 0.5) * 1.6) * s;
      this.spVel[o + 1] = (normal.y + Math.random() * 0.8) * s;
      this.spVel[o + 2] = (normal.z + (Math.random() - 0.5) * 1.6) * s;
      this.spLife[i] = 0.25 + Math.random() * 0.45;
      this.spCol[o] = c.r; this.spCol[o + 1] = c.g; this.spCol[o + 2] = c.b;
    }
  }
  smoke(pos, size = 0.6, color = 0x4a443e, life = 2.2, up = 0.8) {
    const s = this.smokes[this.smIdx = (this.smIdx + 1) % this.smokes.length];
    s.visible = true; s.position.copy(pos);
    s.material.color.setHex(color);
    s.userData.life = s.userData.max = life * (0.7 + Math.random() * 0.6);
    s.userData.vel.set((Math.random() - 0.5) * 0.4, up * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.4);
    s.userData.size = size;
    s.material.rotation = Math.random() * 6;
  }
  dust(pos, normal) { for (let i = 0; i < 2; i++) this.smoke(pos.clone().addScaledVector(normal, 0.1), 0.35, 0x9a8470, 1.1, 0.3); this.sparks(pos, normal, 6, 0x8a7560); }
  flash(pos, color = 0xffb060, size = 0.6, light = 6) {
    const f = this.flashes[this.flIdx = (this.flIdx + 1) % this.flashes.length];
    f.visible = true; f.position.copy(pos); f.material.color.setHex(color); f.scale.setScalar(size); f.userData.life = 0.06; f.userData.size = size;
    this.light.position.copy(pos); this.light.color.setHex(color); this.light.intensity = light; this.lightT = 0.06;
  }
  muzzle(obj) {
    if (this.muzzleStar.parent !== obj) obj.add(this.muzzleStar);
    this.muzzleStar.visible = true; this.muzzleStar.rotation.z = Math.random() * 6;
    this.muzzleStar.scale.setScalar(0.8 + Math.random() * 0.5);
    this.muzzleT = 0.045;
  }
  tracer(from, to, color = 0xffd9a0) {
    const t = this.tracers[this.trIdx = (this.trIdx + 1) % this.tracers.length];
    const d = to.clone().sub(from), len = d.length();
    t.visible = true; t.position.copy(from); t.lookAt(to);
    t.material.color.setHex(color);
    t.userData.len = Math.min(len, 3); t.userData.max = len; t.userData.travel = 0; t.userData.speed = 380;
    t.userData.dir = d.normalize(); t.userData.origin = from.clone();
    t.scale.set(1, 1, t.userData.len);
  }
  rail(from, to) {
    this.beam.visible = true; this.beam.position.copy(from); this.beam.lookAt(to);
    this.beam.scale.set(1, 1, from.distanceTo(to)); this.beamT = 0.35;
    for (let k = 0; k < 12; k++) this.sparks(from.clone().lerp(to, k / 12), new THREE.Vector3(0, 1, 0), 3, 0x70f0ff);
  }
  decal(point, normal) {
    const d = this.decals[this.dcIdx = (this.dcIdx + 1) % this.decals.length];
    d.visible = true; d.position.copy(point).addScaledVector(normal, 0.005);
    d.lookAt(point.clone().add(normal)); d.rotateZ(Math.random() * 6);
    d.scale.setScalar(0.7 + Math.random() * 0.6);
  }
  casing(pos, vel) {
    const c = this.casings[this.csIdx = (this.csIdx + 1) % this.casings.length];
    c.visible = true; c.position.copy(pos);
    c.userData.vel.copy(vel); c.userData.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.userData.life = 3; c.userData.bounced = 0;
  }
  explosion(pos, size = 1) {
    this.flash(pos, 0xffa040, 4 * size, 40 * size);
    this.sparks(pos, new THREE.Vector3(0, 0.5, 0), 60, 0xffb050);
    for (let i = 0; i < 8; i++) this.smoke(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * 0.5, (Math.random() - 0.5) * size)), 1.2 * size, i < 3 ? 0x6a4a30 : 0x2e2a26, 3, 1.4);
    for (let i = 0; i < 8; i++) {
      const d = this.debris[this.dbIdx = (this.dbIdx + 1) % this.debris.length];
      d.visible = true; d.position.copy(pos);
      d.userData.vel.set((Math.random() - 0.5) * 9, 3 + Math.random() * 6, (Math.random() - 0.5) * 9);
      d.userData.life = 4;
    }
  }
  update(dt, cameraPos) {
    // sparks
    for (let i = 0; i < this.SP; i++) {
      if (this.spLife[i] <= 0) continue;
      const o = i * 3;
      this.spLife[i] -= dt;
      this.spVel[o + 1] -= 9.8 * dt;
      this.spPos[o] += this.spVel[o] * dt; this.spPos[o + 1] += this.spVel[o + 1] * dt; this.spPos[o + 2] += this.spVel[o + 2] * dt;
      if (this.spLife[i] <= 0) this.spPos[o + 1] = -9999;
      const f = Math.max(0, this.spLife[i] * 2);
      this.spCol[o] *= 0.97; this.spCol[o + 1] *= 0.94; this.spCol[o + 2] *= 0.9;
      if (f <= 0) { this.spCol[o] = this.spCol[o + 1] = this.spCol[o + 2] = 0; }
    }
    this.sparksPts.geometry.attributes.position.needsUpdate = true;
    this.sparksPts.geometry.attributes.color.needsUpdate = true;
    for (const s of this.smokes) {
      if (!s.visible) continue;
      const u = s.userData; u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      const k = 1 - u.life / u.max;
      s.position.addScaledVector(u.vel, dt);
      s.scale.setScalar(u.size * (0.6 + k * 2.2));
      s.material.opacity = Math.sin(Math.min(1, k * 1.0) * Math.PI) * 0.75;
    }
    for (const f of this.flashes) { if (!f.visible) continue; f.userData.life -= dt; if (f.userData.life <= 0) f.visible = false; }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) this.light.intensity = 0; }
    if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) this.muzzleStar.visible = false; }
    for (const t of this.tracers) {
      if (!t.visible) continue;
      const u = t.userData;
      u.travel += u.speed * dt;
      if (u.travel > u.max) { t.visible = false; continue; }
      t.position.copy(u.origin).addScaledVector(u.dir, u.travel);
      t.scale.z = Math.min(u.len, u.max - u.travel + 0.01);
    }
    if (this.beamT > 0) {
      this.beamT -= dt;
      const k = Math.max(0, this.beamT / 0.35);
      this.beam.material.opacity = k; this.beamCore.material.opacity = k;
      this.beam.scale.x = this.beam.scale.y = 1 + (1 - k) * 3;
      if (this.beamT <= 0) this.beam.visible = false;
    }
    const H = this.heightAt || (() => 0);
    for (const c of this.casings) {
      if (!c.visible) continue;
      const u = c.userData; u.life -= dt;
      if (u.life <= 0) { c.visible = false; continue; }
      u.vel.y -= 9.8 * dt;
      c.position.addScaledVector(u.vel, dt);
      c.rotation.x += u.spin.x * dt; c.rotation.y += u.spin.y * dt; c.rotation.z += u.spin.z * dt;
      const gy = H(c.position.x, c.position.z) + 0.005;
      if (c.position.y < gy) {
        c.position.y = gy;
        if (u.vel.y < -0.5 && u.bounced < 2) { u.bounced++; if (this.onCasing && cameraPos && c.position.distanceTo(cameraPos) < 4) this.onCasing(); }
        u.vel.y = Math.abs(u.vel.y) * 0.3; u.vel.x *= 0.5; u.vel.z *= 0.5; u.spin.multiplyScalar(0.5);
      }
    }
    for (const d of this.debris) {
      if (!d.visible) continue;
      const u = d.userData; u.life -= dt;
      if (u.life <= 0) { d.visible = false; continue; }
      u.vel.y -= 9.8 * dt; d.position.addScaledVector(u.vel, dt);
      d.rotation.x += dt * 5; d.rotation.y += dt * 3;
      const gy = H(d.position.x, d.position.z) + 0.03;
      if (d.position.y < gy) { d.position.y = gy; u.vel.y = Math.abs(u.vel.y) * 0.25; u.vel.x *= 0.6; u.vel.z *= 0.6; }
    }
  }
}
