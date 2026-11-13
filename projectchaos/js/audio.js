// Fully synthesized, positional sound. All buffers are generated at startup —
// impacts per material, weapons, UI, ambience and an original radio tune.
import * as THREE from "three";
import { mulberry32 } from "./utils.js";

const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();

export class Audio {
  constructor() { this.ctx = null; this.buf = {}; this.volume = 0.9; this.voices = 0; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.sr = this.ctx.sampleRate;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp).connect(this.ctx.destination);
    this.build();
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  /* ---------------- synthesis helpers ---------------- */
  mk(dur, fn) {
    const n = Math.max(1, Math.floor(dur * this.sr)), b = this.ctx.createBuffer(1, n, this.sr), d = b.getChannelData(0);
    fn(d, n, this.sr);
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] /= peak;
    return b;
  }
  modes(dur, list, { click = 0.3, noiseLP = 0.2, seed = 1 } = {}) {
    // list: [freq, amp, decay]
    const rnd = mulberry32(seed);
    return this.mk(dur, (d, n, sr) => {
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr; let s = 0;
        for (const [f, a, k] of list) s += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t / k);
        const nz = rnd() * 2 - 1; lp += (nz - lp) * noiseLP;
        s += lp * click * Math.exp(-t / 0.012);
        d[i] = s;
      }
    });
  }
  noiseBurst(dur, { lp = 0.1, decay = 0.1, grains = 0, seed = 2, hp = 0 } = {}) {
    const rnd = mulberry32(seed);
    return this.mk(dur, (d, n, sr) => {
      let l = 0, h = 0, prev = 0;
      const gs = []; for (let g = 0; g < grains; g++) gs.push([Math.floor(rnd() * n * 0.8), 0.3 + rnd()]);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const nz = rnd() * 2 - 1;
        l += (nz - l) * lp;
        let s = l;
        if (hp) { h = s - prev; prev = s; s = h * hp + s * (1 - hp); }
        let env = Math.exp(-t / decay);
        for (const [gi, ga] of gs) { const dt = (i - gi) / sr; if (dt >= 0 && dt < 0.03) env += ga * Math.exp(-dt / 0.006); }
        d[i] = s * env;
      }
    });
  }

  build() {
    const B = this.buf;
    B.wood = this.modes(0.25, [[180, 1, 0.05], [420, 0.6, 0.03], [690, 0.4, 0.02], [1150, 0.2, 0.012]], { click: 0.9, noiseLP: 0.25, seed: 3 });
    B.metal = this.modes(1.0, [[523, 0.8, 0.35], [1307, 0.6, 0.25], [2213, 0.45, 0.18], [3471, 0.3, 0.12], [161, 0.4, 0.08]], { click: 0.6, noiseLP: 0.6, seed: 4 });
    B.metalHeavy = this.modes(1.2, [[118, 1, 0.3], [233, 0.7, 0.45], [409, 0.5, 0.35], [761, 0.35, 0.25], [1213, 0.2, 0.18]], { click: 0.5, noiseLP: 0.2, seed: 5 });
    B.plastic = this.modes(0.14, [[310, 0.6, 0.02], [1180, 0.5, 0.015], [2020, 0.35, 0.01]], { click: 1.2, noiseLP: 0.5, seed: 6 });
    B.rubber = this.modes(0.16, [[95, 1, 0.05], [190, 0.4, 0.03]], { click: 0.4, noiseLP: 0.08, seed: 7 });
    B.glass = this.modes(0.5, [[2480, 0.6, 0.12], [4110, 0.4, 0.08], [6120, 0.25, 0.05], [1630, 0.3, 0.1]], { click: 0.5, noiseLP: 0.7, seed: 8 });
    B.stone = this.noiseBurst(0.22, { lp: 0.06, decay: 0.05, seed: 9 });
    B.soft = this.modes(0.18, [[80, 1, 0.05], [140, 0.4, 0.03]], { click: 0.6, noiseLP: 0.05, seed: 10 });
    B.flesh = B.soft;
    B.shatter = this.mk(1.0, (d, n, sr) => {
      const rnd = mulberry32(11);
      for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * Math.exp(-i / sr / 0.08) * 0.8;
      for (let g = 0; g < 70; g++) {
        const st = Math.floor(Math.pow(rnd(), 1.6) * n * 0.85), f = 2000 + rnd() * 6000, a = 0.2 + rnd() * 0.5, k = 0.01 + rnd() * 0.05;
        for (let i = st; i < n && i < st + sr * 0.15; i++) { const t = (i - st) / sr; d[i] += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t / k); }
      }
    });
    B.crunch = this.noiseBurst(0.6, { lp: 0.35, decay: 0.12, grains: 26, seed: 12 });
    B.splat = this.mk(0.5, (d, n, sr) => {
      const rnd = mulberry32(13); let l = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; l += ((rnd() * 2 - 1) - l) * 0.12; d[i] = l * Math.exp(-t / 0.12) + Math.sin(2 * Math.PI * (90 - t * 80) * t) * Math.exp(-t / 0.06); }
    });
    B.zap = this.mk(0.32, (d, n, sr) => {
      const rnd = mulberry32(14); let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, f = 2400 * Math.exp(-t * 14) + 160; ph += f / sr; const saw = (ph % 1) * 2 - 1; d[i] = (saw * 0.7 + (rnd() * 2 - 1) * 0.3 * Math.exp(-t / 0.03)) * Math.exp(-t / 0.09); }
    });
    B.pop = this.mk(0.12, (d, n, sr) => {
      const rnd = mulberry32(15);
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (420 - t * 2000) * t) * Math.exp(-t / 0.02) + (rnd() * 2 - 1) * Math.exp(-t / 0.006) * 0.8; }
    });
    B.boom = this.mk(2.2, (d, n, sr) => {
      const rnd = mulberry32(16); let l = 0, l2 = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; l += ((rnd() * 2 - 1) - l) * 0.08; l2 += (l - l2) * 0.2; d[i] = l2 * 3 * Math.exp(-t / 0.5) + Math.sin(2 * Math.PI * (55 - t * 20) * t) * Math.exp(-t / 0.35) * 0.9 + (rnd() * 2 - 1) * Math.exp(-t / 0.02) * 0.6; }
    });
    B.click = this.modes(0.08, [[1800, 0.7, 0.01], [3200, 0.5, 0.006]], { click: 1.5, noiseLP: 0.8, seed: 17 });
    B.clack = this.modes(0.15, [[620, 0.8, 0.03], [1400, 0.6, 0.02], [2600, 0.3, 0.01]], { click: 1.2, noiseLP: 0.6, seed: 18 });
    B.rack = this.mk(0.28, (d, n, sr) => {
      const rnd = mulberry32(19);
      for (let i = 0; i < n; i++) { const t = i / sr; const a = Math.exp(-t / 0.01) + (t > 0.13 ? Math.exp(-(t - 0.13) / 0.012) : 0); d[i] = (rnd() * 2 - 1) * a * 0.8 + Math.sin(2 * Math.PI * 900 * t) * a * 0.4; }
    });
    B.charge = this.mk(0.9, (d, n, sr) => {
      let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, f = 260 * Math.pow(5, t / 0.9); ph += f / sr; d[i] = Math.sin(2 * Math.PI * ph) * 0.6 * Math.min(1, t * 20) * (1 - t / 0.95) + Math.sin(4 * Math.PI * ph) * 0.2; }
    });
    B.beep = this.modes(0.12, [[1320, 0.8, 0.04]], { click: 0, seed: 20 });
    B.ok = this.mk(0.5, (d, n, sr) => { for (let i = 0; i < n; i++) { const t = i / sr, f = t < 0.12 ? 880 : t < 0.24 ? 1175 : 1568; d[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-((t % 0.12)) / 0.09) * 0.7; } });
    B.err = this.mk(0.35, (d, n, sr) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (((t * 140) % 1) < 0.5 ? 1 : -1) * 0.4 * (1 - t / 0.36); } });
    B.servo = this.mk(1.1, (d, n, sr) => {
      const rnd = mulberry32(21); let l = 0, ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; l += ((rnd() * 2 - 1) - l) * 0.05; ph += (95 + 30 * Math.sin(t * 6)) / sr; const env = Math.min(1, t * 8) * Math.min(1, (1.1 - t) * 6); d[i] = (l * 1.5 + Math.sin(2 * Math.PI * ph) * 0.5 + Math.sin(4 * Math.PI * ph) * 0.2) * env; }
    });
    B.creak = this.mk(0.7, (d, n, sr) => {
      let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, f = 140 + 60 * Math.sin(t * 9) + 40 * Math.sin(t * 23); ph += f / sr; const p = ph % 1; d[i] = (p < 0.12 ? 1 : -0.14) * Math.sin(Math.PI * t / 0.7) * 0.6; }
    });
    B.whoosh = this.noiseBurst(0.35, { lp: 0.15, decay: 0.12, seed: 22 });
    B.hum = this.mk(2.0, (d, n, sr) => {
      const rnd = mulberry32(23); let l = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; l += ((rnd() * 2 - 1) - l) * 0.02; d[i] = Math.sin(2 * Math.PI * 50 * t) * 0.5 + Math.sin(2 * Math.PI * 100 * t) * 0.25 + Math.sin(2 * Math.PI * 150 * t) * 0.08 + l * 1.2; }
    });
    B.wind = this.mk(4.0, (d, n, sr) => {
      const rnd = mulberry32(24); let l = 0, l2 = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; l += ((rnd() * 2 - 1) - l) * 0.03; l2 += (l - l2) * 0.3; d[i] = l2 * (0.6 + 0.4 * Math.sin(2 * Math.PI * t / 4)); }
    });
    B.gravHum = this.mk(1.0, (d, n, sr) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 110 * t) * 0.5 + Math.sin(2 * Math.PI * 221 * t + Math.sin(2 * Math.PI * 4 * t) * 2) * 0.35 + Math.sin(2 * Math.PI * 333 * t) * 0.1; } });
    B.heal = this.mk(1.0, (d, n, sr) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 660 * t + Math.sin(2 * Math.PI * 8 * t) * 3) * 0.4 + Math.sin(2 * Math.PI * 990 * t) * 0.2; } });
    B.spark = this.noiseBurst(0.25, { lp: 0.9, decay: 0.03, grains: 8, seed: 25, hp: 0.9 });
    B.music = this.makeMusic();
  }

  // An original 16-bar chiptune loop (120 bpm) for the facility radio.
  makeMusic() {
    const bpm = 118, beat = 60 / bpm, bars = 8, dur = bars * 4 * beat;
    const rnd = mulberry32(777);
    const scale = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic + octave
    const root = 220;
    const chords = [0, -4, 3, -2, 0, -4, 5, -2];
    const melody = [];
    for (let s = 0; s < bars * 8; s++) melody.push(rnd() < 0.72 ? scale[Math.floor(rnd() * scale.length)] : null);
    return this.mk(dur, (d, n, sr) => {
      const r2 = mulberry32(5);
      for (let i = 0; i < n; i++) {
        const t = i / sr, b = t / beat, bar = Math.floor(b / 4) % bars, inBeat = b % 1, eighth = Math.floor(b * 2), inE = (b * 2) % 1;
        const ch = chords[bar];
        // bass: root on eighths, octave bounce
        const bf = root / 2 * Math.pow(2, (ch + (eighth % 2 ? 12 : 0)) / 12);
        const bass = (((t * bf) % 1) < 0.5 ? 1 : -1) * 0.18 * Math.exp(-inE * 2.2);
        // lead
        const m = melody[eighth % melody.length];
        let lead = 0;
        if (m != null) { const lf = root * 2 * Math.pow(2, (m + ch) / 12); const ph = (t * lf) % 1; lead = (ph < 0.25 ? 1 : -1) * 0.11 * Math.exp(-inE * 3) + Math.sin(2 * Math.PI * lf * t) * 0.05; }
        // drums
        const kick = (Math.floor(b) % 2 === 0) ? Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-inBeat * 30)) * inBeat * beat) * Math.exp(-inBeat * 9) * 0.5 : 0;
        const snare = (Math.floor(b) % 2 === 1) ? (r2() * 2 - 1) * Math.exp(-inBeat * 14) * 0.25 : 0;
        const hat = (r2() * 2 - 1) * Math.exp(-inE * 40) * 0.06;
        d[i] = bass + lead + kick + snare + hat;
      }
    });
  }

  /* ---------------- playback ---------------- */
  updateListener(cam) {
    if (!this.ctx) return;
    cam.getWorldPosition(_p);
    _f.set(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    _u.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(_p.x, t, 0.02); L.positionY.setTargetAtTime(_p.y, t, 0.02); L.positionZ.setTargetAtTime(_p.z, t, 0.02);
      L.forwardX.setTargetAtTime(_f.x, t, 0.02); L.forwardY.setTargetAtTime(_f.y, t, 0.02); L.forwardZ.setTargetAtTime(_f.z, t, 0.02);
      L.upX.setTargetAtTime(_u.x, t, 0.02); L.upY.setTargetAtTime(_u.y, t, 0.02); L.upZ.setTargetAtTime(_u.z, t, 0.02);
    } else { L.setPosition(_p.x, _p.y, _p.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
  }

  panner(pos, ref = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = "equalpower"; p.distanceModel = "inverse"; p.refDistance = ref; p.rolloffFactor = 1.1; p.maxDistance = 80;
    if (pos) { if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z); }
    return p;
  }

  play(name, pos = null, { vol = 1, rate = 1, ref = 1.2 } = {}) {
    if (!this.ctx || !this.buf[name] || this.voices > 40) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[name];
    s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    let node = s.connect(g);
    if (pos) node = node.connect(this.panner(pos, ref));
    node.connect(this.master);
    this.voices++;
    s.onended = () => { this.voices--; };
    s.start();
  }

  impact(family, pos, speed, mass = 1) {
    const vol = Math.min(1, Math.max(0.03, (speed - 0.3) / 5)) * Math.min(1.4, 0.45 + Math.sqrt(mass) * 0.25);
    const rate = Math.min(1.8, Math.max(0.5, 1.25 / Math.pow(mass + 0.3, 0.18))) * (0.93 + Math.random() * 0.14);
    const name = family === "metal" && mass > 8 ? "metalHeavy" : family;
    this.play(name, pos, { vol, rate });
  }

  loop(name, pos = null, vol = 0.5, ref = 2) {
    if (!this.ctx || !this.buf[name]) return null;
    const s = this.ctx.createBufferSource(); s.buffer = this.buf[name]; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = vol;
    const p = pos ? this.panner(pos, ref) : null;
    let node = s.connect(g); if (p) node = node.connect(p); node.connect(this.master);
    s.start();
    return {
      gain: g, src: s,
      setVol: (v) => g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1),
      setPos: (q) => { if (!p) return; if (p.positionX) { p.positionX.value = q.x; p.positionY.value = q.y; p.positionZ.value = q.z; } else p.setPosition(q.x, q.y, q.z); },
      setRate: (r) => (s.playbackRate.value = r),
      stop: () => { try { s.stop(); } catch { /* already stopped */ } },
    };
  }

  // Original robot "voice": short chirp phrases whose contour depends on mood.
  chirp(pos, mood = "neutral") {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.01;
    const p = this.panner(pos, 1.5);
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    const o = this.ctx.createOscillator();
    o.type = mood === "angry" ? "sawtooth" : mood === "hurt" ? "triangle" : "square";
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = mood === "angry" ? 1400 : 2600;
    o.connect(f).connect(g).connect(p).connect(this.master);
    const notes = { neutral: 3, happy: 4, scared: 7, angry: 4, hurt: 2, curious: 3, dance: 5 }[mood] || 3;
    const base = { neutral: 520, happy: 640, scared: 900, angry: 220, hurt: 700, curious: 560, dance: 600 }[mood] || 500;
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const len = mood === "scared" ? 0.05 : 0.07 + Math.random() * 0.06;
      let fr = base * (0.8 + Math.random() * 0.5);
      if (mood === "happy" || mood === "dance") fr *= 1 + i * 0.12;
      if (mood === "hurt") fr *= 1 - i * 0.3;
      if (mood === "curious" && i === notes - 1) fr *= 1.5;
      o.frequency.setValueAtTime(fr, t);
      o.frequency.exponentialRampToValueAtTime(fr * (mood === "hurt" ? 0.6 : 1.15), t + len);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      t += len + 0.02;
    }
    o.start(t0); o.stop(t + 0.05);
  }
}
