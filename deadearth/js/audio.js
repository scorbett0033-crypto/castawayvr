// Fully synthesized sound: gunshots, plasma bolts, explosions, UI, ambience.
export class Sfx {
  constructor() { this.ctx = null; this.master = null; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }
  now() { return this.ctx.currentTime; }
  noise(dur, { type = "lowpass", freq = 2000, q = 0.7, gain = 1, attack = 0.002, decay = dur, pan = 0, freqEnd = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    let out = src.connect(f).connect(g);
    if (p) { p.pan.value = pan; out = out.connect(p); }
    out.connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }
  tone(freq, dur, { type = "sine", gain = 0.3, freqEnd = null, attack = 0.005, pan = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    let out = o.connect(g);
    if (p) { p.pan.value = pan; out = out.connect(p); }
    out.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  gun(kind) {
    switch (kind) {
      case "pistol": this.noise(0.25, { freq: 3200, freqEnd: 300, gain: 0.9 }); this.tone(140, 0.12, { type: "triangle", gain: 0.5, freqEnd: 50 }); break;
      case "smg": this.noise(0.14, { freq: 3800, freqEnd: 500, gain: 0.6 }); this.tone(170, 0.07, { type: "triangle", gain: 0.35, freqEnd: 60 }); break;
      case "shotgun": this.noise(0.55, { freq: 2200, freqEnd: 120, gain: 1.2 }); this.tone(90, 0.3, { type: "sine", gain: 0.9, freqEnd: 35 }); this.noise(0.12, { type: "bandpass", freq: 1400, q: 4, gain: 0.25, delay: 0.32 }); this.noise(0.1, { type: "bandpass", freq: 1800, q: 5, gain: 0.25, delay: 0.42 }); break;
      case "rifle": this.noise(0.3, { freq: 4200, freqEnd: 260, gain: 0.9 }); this.tone(120, 0.12, { type: "triangle", gain: 0.55, freqEnd: 45 }); break;
      case "dmr": this.noise(0.7, { freq: 3600, freqEnd: 150, gain: 1.1 }); this.tone(80, 0.35, { gain: 0.8, freqEnd: 30 }); this.noise(1.2, { freq: 500, gain: 0.25, attack: 0.05, delay: 0.08 }); break;
      case "lancer": this.tone(1800, 0.5, { type: "sawtooth", gain: 0.25, freqEnd: 90 }); this.noise(0.6, { type: "bandpass", freq: 900, q: 1.5, gain: 0.9, freqEnd: 120 }); this.tone(55, 0.5, { gain: 0.8, freqEnd: 30 }); break;
    }
  }
  dry() { this.noise(0.04, { type: "highpass", freq: 3000, gain: 0.3 }); }
  magOut() { this.noise(0.06, { type: "bandpass", freq: 1200, q: 3, gain: 0.4 }); this.tone(400, 0.05, { type: "square", gain: 0.05 }); }
  magIn() { this.noise(0.05, { type: "bandpass", freq: 2200, q: 4, gain: 0.5 }); this.noise(0.05, { type: "bandpass", freq: 1500, q: 4, gain: 0.5, delay: 0.09 }); }
  casing() { this.tone(3200 + Math.random() * 1500, 0.15, { type: "sine", gain: 0.03 }); }
  plasma(pan = 0) { this.tone(900, 0.35, { type: "sawtooth", gain: 0.12, freqEnd: 200, pan }); this.noise(0.2, { type: "bandpass", freq: 1500, q: 2, gain: 0.2, pan }); }
  charge(pan = 0) { this.tone(200, 0.55, { type: "sine", gain: 0.08, freqEnd: 900, pan }); }
  hit() { this.tone(1700, 0.05, { type: "square", gain: 0.06 }); }
  ricochet() { this.tone(2400 + Math.random() * 1500, 0.25, { gain: 0.05, freqEnd: 900 }); }
  explode(pan = 0, big = 1) { this.noise(1.4 * big, { freq: 900, freqEnd: 60, gain: 1.2 * big, pan }); this.tone(60, 0.8, { gain: 0.9 * big, freqEnd: 25, pan }); }
  hurt() { this.tone(110, 0.25, { type: "sine", gain: 0.6, freqEnd: 50 }); this.noise(0.2, { freq: 600, gain: 0.4 }); }
  coin() { this.tone(1320, 0.12, { type: "triangle", gain: 0.15 }); this.tone(1760, 0.2, { type: "triangle", gain: 0.12, delay: 0.07 }); }
  click() { this.tone(900, 0.04, { type: "square", gain: 0.05 }); }
  deny() { this.tone(180, 0.18, { type: "square", gain: 0.08 }); }
  door() { this.noise(1.6, { freq: 300, gain: 0.5, attack: 0.2 }); this.tone(70, 1.4, { type: "sawtooth", gain: 0.06 }); this.noise(0.3, { type: "bandpass", freq: 600, gain: 0.5, delay: 1.4 }); }
  step() { this.noise(0.09, { freq: 700, gain: 0.08 }); }
  wave() { this.tone(220, 0.6, { type: "sawtooth", gain: 0.08 }); this.tone(165, 0.9, { type: "sawtooth", gain: 0.08, delay: 0.5 }); }
  startAmbience() {
    const c = this.ctx;
    const mk = (freq, q, gain) => {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(f).connect(g).connect(this.master); src.start();
      return { f, g };
    };
    this.windBed = mk(420, 0.6, 0.0);
    this.windHowl = mk(900, 6, 0.0);
    this.hum = c.createOscillator(); this.hum.type = "sawtooth"; this.hum.frequency.value = 50;
    const hf = c.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 160;
    this.humGain = c.createGain(); this.humGain.gain.value = 0;
    this.hum.connect(hf).connect(this.humGain).connect(this.master); this.hum.start();
  }
  // gust 0..~1.6 ; mode 'lobby' | 'surface'
  setAmbience(mode, gust) {
    if (!this.ctx || !this.windBed) return;
    const t = this.now();
    const out = mode === "surface";
    this.windBed.g.gain.setTargetAtTime(out ? 0.06 + gust * 0.12 : 0.012, t, 0.3);
    this.windBed.f.frequency.setTargetAtTime(300 + gust * 400, t, 0.3);
    this.windHowl.g.gain.setTargetAtTime(out ? Math.max(0, gust - 0.7) * 0.05 : 0, t, 0.4);
    this.windHowl.f.frequency.setTargetAtTime(700 + gust * 500, t, 0.5);
    this.humGain.gain.setTargetAtTime(out ? 0 : 0.035, t, 0.5);
  }
}
