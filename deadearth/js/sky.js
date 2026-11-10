// Dusty dead-planet sky dome + global wind field.
import * as THREE from "three";
import { noise1 } from "./utils.js";

export function makeSky({
  sunDir = new THREE.Vector3(-0.55, 0.22, -0.8).normalize(),
  top = new THREE.Color(0x3f4652),
  horizon = new THREE.Color(0xb58c66),
  ground = new THREE.Color(0x5a4636),
  sunColor = new THREE.Color(0xffd8a8),
  radius = 900,
} = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: sunDir.clone() },
      uTop: { value: top }, uHorizon: { value: horizon }, uGround: { value: ground },
      uSunColor: { value: sunColor }, uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // pin to far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uTop, uHorizon, uGround, uSunColor; uniform float uTime;
      varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=n(p)*a; p*=2.03; a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(y,0.,1.), 0.45));
        col = mix(col, uGround, smoothstep(0.0, -0.12, y));
        // thick dust haze near horizon
        col = mix(col, uHorizon*1.05, exp(-abs(y)*9.0)*0.6);
        float sd = max(dot(d, normalize(uSun)), 0.0);
        // dim sun disk filtered through dust + wide glow
        col += uSunColor * (smoothstep(0.9994, 0.9998, sd) * 2.2 + pow(sd, 18.0) * 0.45 + pow(sd, 3.0) * 0.12);
        // high streaky ash clouds
        if (y > 0.0) {
          vec2 uv = d.xz / (y + 0.12);
          float c = fbm(uv * vec2(0.9, 2.6) + vec2(uTime*0.004, 0.0));
          c = smoothstep(0.45, 0.85, c) * smoothstep(0.0, 0.25, y);
          vec3 cc = mix(uHorizon*0.75, uSunColor*0.9, pow(sd, 6.0));
          col = mix(col, cc, c * 0.55);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.update = (t, camPos) => { mat.uniforms.uTime.value = t; if (camPos) mesh.position.copy(camPos); };
  return mesh;
}

// The shattered moon: a big fractured sphere with drifting fragments.
export function makeBrokenMoon(rockSet) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: rockSet.map, normalMap: rockSet.normalMap, roughness: 1, color: 0xd9d0c6, emissive: 0x6a5a4c, emissiveIntensity: 0.55, fog: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff6a2a, fog: false });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(60, 5), mat);
  // carve a missing chunk by squashing vertices on one side
  const p = core.geometry.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.x + v.y * 0.4 > 32) v.multiplyScalar(0.72 + Math.sin(v.y * 0.4) * 0.03);
    v.multiplyScalar(1 + Math.sin(v.x * 0.21) * Math.cos(v.z * 0.17) * 0.03);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  core.geometry.computeVertexNormals();
  g.add(core);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(46, 1.2, 6, 40), glow);
  seam.rotation.set(0.4, 1.1, 0.2);
  seam.position.set(18, 6, 0);
  seam.scale.set(0.5, 1, 1);
  g.add(seam);
  const frags = [];
  for (let i = 0; i < 26; i++) {
    const r = 3 + Math.random() * 11;
    const f = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    const a = Math.random() * Math.PI * 2;
    f.position.set(60 + Math.random() * 70, Math.sin(a) * 50, Math.cos(a) * 50 + (Math.random() - 0.5) * 30);
    f.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    f.userData.spin = (Math.random() - 0.5) * 0.02;
    frags.push(f); g.add(f);
  }
  g.userData.update = (t) => { frags.forEach((f) => { f.rotation.y += f.userData.spin; }); g.rotation.z = Math.sin(t * 0.01) * 0.02; };
  return g;
}

/* ---------- Wind ----------
   A slowly turning prevailing wind with gusts. Avatars (hair/cloth),
   dust, tumbleweeds and the audio wind bed all read from this. */
export class Wind {
  constructor(base = 4, angle = 0.6) {
    this.base = base; this.angle = angle;
    this.vec = new THREE.Vector3();
    this.gust = 0;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const t = this.t;
    const g = noise1(t * 0.25, 1) * 0.5 + noise1(t * 0.9, 2) * 0.3 + noise1(t * 2.3, 3) * 0.2;
    this.gust = Math.max(0, 0.65 + g * 0.9);
    const a = this.angle + noise1(t * 0.05, 4) * 0.6;
    const s = this.base * this.gust;
    this.vec.set(Math.cos(a) * s, noise1(t * 0.7, 5) * s * 0.08, Math.sin(a) * s);
  }
}
