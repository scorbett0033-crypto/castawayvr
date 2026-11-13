// Cheap pooled effects: CPU particles (one draw call), tracers, beams, decals, flash light.
import * as THREE from "three";
import { softDot } from "./textures.js";

const MAX = 900;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 0, 1);

export class FX {
  constructor(scene) {
    this.scene = scene;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.size = new Float32Array(MAX);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale;
        void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*scale/max(0.05,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t=texture2D(map,gl_PointCoord); if(t.a<0.02) discard; gl_FragColor=vec4(vC*t.a, t.a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.parts.push({ life: 0, max: 1, v: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color(), s: 0.02, drag: 0, grav: 1, additive: true });
    this.next = 0;
    // tracers
    this.tracers = [];
    const tg = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, -0.5);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, life: 0 });
    }
    // decals
    this.decals = [];
    const dTex = softDot("20,16,12");
    const dMat = new THREE.MeshBasicMaterial({ map: dTex, color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 40; i++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), dMat); d.visible = false; scene.add(d); this.decals.push(d); }
    this.decalIdx = 0;
    this.light = new THREE.PointLight(0xffaa55, 0, 8, 2);
    scene.add(this.light);
    this.lightLife = 0;
  }

  emit(p, v, color, size, life, grav = 1, drag = 0.5) {
    const q = this.parts[this.next]; this.next = (this.next + 1) % MAX;
    q.p.copy(p); q.v.copy(v); q.c.set(color); q.s = size; q.life = q.max = life; q.grav = grav; q.drag = drag;
  }
  sparks(p, n = null, count = 16, color = 0xffd27a) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.5 + Math.random() * 3.5);
      if (n) _v.addScaledVector(n, 2);
      this.emit(p, _v, color, 0.012 + Math.random() * 0.01, 0.25 + Math.random() * 0.35, 1, 1);
    }
  }
  burst(p, color, count = 20, speed = 2, size = 0.02, grav = 1) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.emit(p, _v, color, size * (0.6 + Math.random() * 0.8), 0.5 + Math.random() * 0.6, grav, 1.2);
    }
  }
  smoke(p, count = 20, color = 0x554a40, size = 0.25) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).multiplyScalar(1.2);
      this.emit(_v.clone().multiplyScalar(0.3).add(p), _v, color, size * (0.6 + Math.random()), 1.2 + Math.random(), -0.08, 1.5);
    }
  }
  flash(p, color = 0xffaa55, intensity = 6, life = 0.08) {
    this.light.position.copy(p); this.light.color.set(color); this.light.intensity = intensity; this.lightLife = life; this.lightMax = life; this.lightPeak = intensity;
  }
  tracer(a, b, color = 0x66f0ff, width = 0.006, life = 0.07) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const len = a.distanceTo(b);
    t.m.position.copy(a); t.m.lookAt(b); t.m.scale.set(width, width, len);
    t.m.material.color.set(color); t.m.material.opacity = 0.9; t.m.visible = true; t.life = t.max = life;
  }
  // a beam that persists while called every frame
  beam(a, b, color, width = 0.012) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const len = a.distanceTo(b);
    t.m.position.copy(a); t.m.lookAt(b); t.m.scale.set(width * (0.8 + Math.random() * 0.4), width * (0.8 + Math.random() * 0.4), len);
    t.m.material.color.set(color); t.m.material.opacity = 0.65; t.m.visible = true; t.life = t.max = 0.02;
  }
  decal(p, n, target = null) {
    const d = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    if (d.parent !== this.scene) d.parent.remove(d);
    this.scene.add(d);
    d.position.copy(p).addScaledVector(n, 0.003);
    d.quaternion.setFromUnitVectors(_up, n);
    d.rotateZ(Math.random() * 6);
    d.scale.setScalar(0.6 + Math.random() * 0.6);
    d.visible = true;
    if (target) target.attach(d); // stick to moving props
  }

  update(dt) {
    const P = this.pos, C = this.col, S = this.size;
    for (let i = 0; i < MAX; i++) {
      const q = this.parts[i];
      if (q.life > 0) {
        q.life -= dt;
        q.v.y -= 9.8 * q.grav * dt;
        q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        if (q.p.y < 0.005 && q.grav > 0) { q.p.y = 0.005; q.v.y *= -0.3; q.v.x *= 0.6; q.v.z *= 0.6; }
        const k = Math.max(0, q.life / q.max);
        P[i * 3] = q.p.x; P[i * 3 + 1] = q.p.y; P[i * 3 + 2] = q.p.z;
        C[i * 3] = q.c.r * k; C[i * 3 + 1] = q.c.g * k; C[i * 3 + 2] = q.c.b * k;
        S[i] = q.s * (q.grav < 0 ? 2 - k : 1);
      } else if (S[i] !== 0) { S[i] = 0; }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; t.m.material.opacity = 0.9 * Math.max(0, t.life / t.max); if (t.life <= 0) t.m.visible = false; }
    if (this.lightLife > 0) { this.lightLife -= dt; this.light.intensity = this.lightPeak * Math.max(0, this.lightLife / this.lightMax); }
  }
}
