// Loading sequence: a warp through a light tunnel in three phases, driven by load progress.
//  A) HUD tunnel: receding cyan frames, HUD arcs left/right, red scan-line walls
//  B) light-speed: red / cyan / white streaks rushing past, glowing panels above and below
//  C) fluid warp: swirling cyan-teal-blue flow with pink filaments and a bright core, then a white flash
// Drawn on a sphere around the viewer so it works on a flat screen and inside a headset.
import * as THREE from "three";

const FRAG = /* glsl */ `
uniform float uTime, uPhase, uFlash;
varying vec3 vDir;
float h1(float n){ return fract(sin(n) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float fwd = -d.z;
  vec2 p = d.xy / max(fwd, 0.06);          // project around the forward axis
  float r = length(p), a = atan(p.y, p.x);
  float t = uTime;
  vec3 col = vec3(0.0);

  // ---- A: HUD tunnel ----
  float wA = 1.0 - smoothstep(0.7, 1.3, uPhase);
  if (wA > 0.0) {
    vec3 c = vec3(0.01, 0.05, 0.07);
    float q = max(abs(p.x) * 0.55, abs(p.y));
    float z = 1.0 / max(q, 0.02) + t * 2.4;
    float fr = smoothstep(0.455, 0.49, abs(fract(z * 0.35) - 0.5));
    c += vec3(0.12, 0.75, 0.95) * fr * smoothstep(0.03, 0.35, q) * 0.9;
    float side = smoothstep(0.9, 1.4, abs(p.x) / max(abs(p.y), 0.01));
    float scan = smoothstep(0.82, 0.9, fract(p.y / max(abs(p.x), 0.01) * 16.0 + h1(floor(z * 3.0)) * 0.25));
    c += vec3(0.95, 0.07, 0.05) * side * scan * smoothstep(0.35, 1.6, abs(p.x));
    c += vec3(0.5, 0.02, 0.02) * side * smoothstep(0.6, 2.5, abs(p.x)) * 0.35;
    for (int k = 0; k < 3; k++) {
      float R = 0.42 + float(k) * 0.4;
      float ring = 1.0 - smoothstep(0.0, 0.012 * (1.0 + float(k)), abs(r - R));
      float dirk = (k == 1) ? -1.0 : 1.0;
      float seg = step(0.5, abs(cos(a))) * step(0.28, fract(a * 0.95 + t * 0.06 * dirk + float(k) * 0.3));
      c += vec3(0.3, 1.0, 0.95) * ring * seg * 0.9;
    }
    float fl = smoothstep(0.6, 0.95, abs(p.y) / max(abs(p.x), 0.01));
    float pz = 1.0 / max(abs(p.y), 0.02) + t * 3.2;
    c += vec3(0.1, 0.55, 0.75) * fl * step(0.82, fract(pz * 0.5)) * smoothstep(0.06, 0.4, abs(p.y)) * 0.7;
    c += vec3(1.0, 0.95, 0.9) * pow(max(0.0, 1.0 - r * 7.0), 3.0) * 2.0;   // the point of light ahead
    col += c * wA;
  }

  // ---- B: light speed ----
  float wB = smoothstep(0.7, 1.2, uPhase) * (1.0 - smoothstep(1.8, 2.3, uPhase));
  if (wB > 0.0) {
    vec3 c = vec3(0.005, 0.01, 0.035);
    float lanes = 150.0, fa = (a / 6.2832 + 0.5) * lanes;
    float id = floor(fa), rnd = h1(id * 7.13 + 1.7);
    float z = 1.0 / max(r, 0.01);
    float s = fract(z * 0.12 * (0.6 + rnd) - t * (2.5 + rnd * 3.5) + rnd * 9.0);
    float streak = smoothstep(0.7, 1.0, s) * smoothstep(0.02, 0.4, r) * (0.25 + 0.75 * step(0.55, rnd));
    vec3 sc = rnd < 0.45 ? vec3(1.0, 0.14, 0.1) : (rnd < 0.86 ? vec3(0.2, 0.7, 1.0) : vec3(1.0));
    float thin = 1.0 - smoothstep(0.0, 0.45, abs(fract(fa) - 0.5));
    c += sc * streak * thin * 1.8;
    float fl = smoothstep(0.7, 1.0, abs(p.y) / (abs(p.x) + 0.25));
    float pz = 1.0 / max(abs(p.y), 0.02) + t * 6.0;
    c += vec3(0.1, 0.45, 0.8) * fl * step(0.72, fract(pz * 0.4)) * 0.6;
    c += vec3(1.0, 0.45, 0.35) * pow(max(0.0, 1.0 - r * 2.4), 3.0) * 1.4;
    col += c * wB;
  }

  // ---- C: fluid warp ----
  float wC = smoothstep(1.8, 2.4, uPhase);
  if (wC > 0.0) {
    float z = 1.0 / max(r, 0.02);
    vec2 uv = vec2(abs(a) * 1.6, z * 0.55 - t * 1.9); // mirrored angle: no seam where it wraps
    vec2 w = vec2(fbm(uv * 1.2 + t * 0.2), fbm(uv * 1.2 + 5.2 - t * 0.17));
    float f = fbm(uv + w * 2.3);
    vec3 c = mix(vec3(0.0, 0.1, 0.42), vec3(0.0, 0.72, 1.0), smoothstep(0.25, 0.75, f));
    c = mix(c, vec3(0.08, 0.88, 0.72), smoothstep(0.55, 0.9, w.x) * 0.6);
    float fil = smoothstep(0.46, 0.495, abs(fract(f * 7.0) - 0.5));
    c += vec3(1.0, 0.2, 0.55) * fil * 0.9 * smoothstep(0.5, 0.65, w.y);
    c += vec3(0.85, 0.97, 1.0) * pow(max(0.0, 1.0 - r * 1.5), 2.5) * 1.6;
    col += c * wC;
  }
  col *= mix(0.15, 1.0, smoothstep(-0.6, 0.25, fwd));    // dimmer behind you
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeWarp() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uPhase: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: FRAG,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 24), mat);
  mesh.frustumCulled = false;
  const state = { progress: 0, phase: 0, finishing: false, flash: 0, done: false, onDone: null };
  return {
    mesh, state,
    setProgress(p) { state.progress = Math.max(state.progress, p); },
    finish(cb) { state.finishing = true; state.onDone = cb; },
    // call every frame while loading: phase follows progress (0..1 -> 0..2.4), never jumps
    update(dt, t, camPos) {
      mesh.position.copy(camPos);
      const target = state.finishing ? 3.0 : Math.min(2.4, state.progress * 2.6);
      state.phase += Math.min(dt * (state.finishing ? 0.75 : 0.6), Math.max(0, target - state.phase)); // the full sequence always plays (~4 s minimum)
      if (state.finishing && state.phase >= 2.95) {
        state.flash = Math.min(1, state.flash + dt * 2.2);
        if (state.flash >= 1 && !state.done) { state.done = true; state.onDone && state.onDone(); }
      }
      mat.uniforms.uTime.value = t;
      mat.uniforms.uPhase.value = state.phase;
      mat.uniforms.uFlash.value = state.flash;
    },
  };
}
