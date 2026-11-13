// Canvas-rendered VR menus: wrist menu (Y / Tab), laser pointer, toasts.
import * as THREE from "three";

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

class Panel {
  constructor(w, h, mw) {
    this.c = document.createElement("canvas"); this.c.width = w; this.c.height = h;
    this.ctx = this.c.getContext("2d");
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, (mw * h) / w), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.mesh.renderOrder = 995;
    this.items = []; this.hover = -1;
  }
}

export class UI {
  constructor(game) {
    this.game = game;
    this.menuOpen = false;
    this.tab = "play";
    this.panel = new Panel(1024, 720, 0.48);
    this.panel.mesh.visible = false;
    game.scene.add(this.panel.mesh);
    this.ray = new THREE.Raycaster();
    const lg = new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6); lg.rotateX(Math.PI / 2); lg.translate(0, 0, -0.5);
    this.laser = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xffb04d, transparent: true, opacity: 0.8 }));
    this.laser.visible = false; game.scene.add(this.laser);
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd28a, depthTest: false }));
    this.dot.renderOrder = 996; this.dot.visible = false; game.scene.add(this.dot);
    this.toast = new Panel(768, 160, 0.5); this.toast.mesh.visible = false; game.scene.add(this.toast.mesh);
    this.toasts = []; this.toastT = 0;
    this.mouse = new THREE.Vector2();
    addEventListener("mousemove", (e) => { this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
    addEventListener("mousedown", (e) => { if (this.menuOpen && !game.player.xr && e.button === 0) this.click = true; });
  }

  pointerActive(h) { return this.menuOpen && h.side === "right" && this.hoverIdx >= 0; }

  toggle(force) {
    this.menuOpen = force ?? !this.menuOpen;
    this.panel.mesh.visible = this.menuOpen;
    this.game.audio.play("beep", null, { vol: 0.35, rate: this.menuOpen ? 1.2 : 0.8 });
    if (this.menuOpen) { this.draw(); this.place(true); if (!this.game.player.xr && document.pointerLockElement) document.exitPointerLock(); }
    else { this.laser.visible = this.dot.visible = false; }
  }

  place(force) {
    const P = this.game.player, m = this.panel.mesh;
    const head = P.headWorld(new THREE.Vector3());
    if (P.xr) {
      const L = P.hands.left;
      if (L.active) { m.position.copy(L.pos).add(new THREE.Vector3(0, 0.2, 0)).lerp(head, 0.18); }
      else m.position.copy(head).add(new THREE.Vector3(0, -0.2, -0.45).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), P.headYaw())));
      m.lookAt(head);
    } else if (force) {
      const q = P.camera.getWorldQuaternion(new THREE.Quaternion());
      m.position.copy(head).add(new THREE.Vector3(0, 0, -0.55).applyQuaternion(q)); m.quaternion.copy(q);
    }
  }

  /* ---------- menu content ---------- */
  draw() {
    const g = this.game, S = g.settings, x = this.panel.ctx, W = 1024, H = 720;
    const items = (this.panel.items = []);
    x.clearRect(0, 0, W, H);
    x.fillStyle = "rgba(10,13,16,0.94)"; this.rr(x, 0, 0, W, H, 28); x.fill();
    x.strokeStyle = "#ff8a1f"; x.lineWidth = 4; this.rr(x, 2, 2, W - 4, H - 4, 26); x.stroke();
    x.fillStyle = "#ff8a1f"; x.fillRect(0, 86, W, 3);
    x.font = "900 34px sans-serif"; x.fillStyle = "#fff"; x.textBaseline = "middle"; x.fillText("PROJECT", 30, 46); x.fillStyle = "#ff8a1f"; x.fillText("CHAOS", 192, 46);
    const tabs = [["play", "SETTINGS"], ["spawn", "SPAWN"], ["world", "WORLD"], ["travel", "TRAVEL"], ["goals", "GOALS"]];
    tabs.forEach(([id, label], i) => this.btn(352 + i * 132, 18, 124, 52, label, () => { this.tab = id; this.draw(); }, this.tab === id, 22));
    const row = (y, label, opts, cur, set) => {
      x.fillStyle = "#b9c6cf"; x.font = "bold 26px sans-serif"; x.textAlign = "left"; x.fillText(label, 40, y + 28);
      opts.forEach(([v, l], i) => this.btn(330 + i * 222, y, 210, 56, l, () => { set(v); g.saveSettings(); this.draw(); }, cur === v));
    };
    x.textAlign = "left";
    if (this.tab === "play") {
      row(112, "Movement", [["smooth", "Smooth"], ["teleport", "Teleport"], ["both", "Both"]], S.locomotion, (v) => (S.locomotion = v));
      row(182, "Turning", [["snap30", "Snap 30°"], ["snap45", "Snap 45°"], ["smooth", "Smooth"]], S.turn, (v) => (S.turn = v));
      row(252, "Comfort vignette", [[true, "On"], [false, "Off"]], S.vignette, (v) => (S.vignette = v));
      row(322, "Shadows", [[true, "On"], [false, "Off"]], S.shadows, (v) => { S.shadows = v; g.applyShadows(); });
      row(392, "Volume", [[0.3, "Low"], [0.65, "Medium"], [1, "High"]], S.volume, (v) => { S.volume = v; g.audio.setVolume(v); });
      row(462, "Seated height", [[0, "Standing"], [0.35, "Seated +35cm"], [0.6, "Low +60cm"]], S.heightOffset, (v) => (S.heightOffset = v));
      x.fillStyle = "#7d8b96"; x.font = "22px sans-serif";
      ["Grip: grab · Trigger: fire/use · A/X: eject mag · reach to hip + grip: fresh mag",
        "Left stick: move (click = sprint) · Right stick: turn / push forward to teleport · B: jump",
        "Point + hold grip at far objects to pull them to your hand."].forEach((t, i) => x.fillText(t, 40, 560 + i * 34));
      this.btn(W - 250, H - 78, 220, 56, "CLOSE", () => this.toggle(false));
    } else if (this.tab === "spawn") {
      const defs = Object.entries(g.props.defs).filter(([, d]) => d.spawnable !== false);
      const cols = 5, bw = 186, bh = 54;
      defs.forEach(([k, d], i) => this.btn(30 + (i % cols) * (bw + 8), 108 + Math.floor(i / cols) * (bh + 8), bw, bh, d.name, () => g.spawnInFront(k), false, 21));
      const yb = 108 + Math.ceil(defs.length / cols) * (bh + 8) + 6;
      this.btn(30, yb, 300, 56, "SPAWN TED UNIT", () => g.spawnTedInFront(), false, 22);
      this.btn(342, yb, 300, 56, "CLEAR SPAWNED", () => { g.props.clearSpawned(); g.toast("Spawned objects cleared"); }, false, 22);
      this.btn(654, yb, 300, 56, "CLEAR DEBRIS", () => g.clearDebris(), false, 22);
    } else if (this.tab === "world") {
      row(112, "Gravity", [[-9.81, "Earth"], [-1.62, "Moon"], [0, "Zero-G"]], g.physics.gravityY, (v) => g.setGravity(v));
      row(182, "Time", [[1, "1×"], [0.5, "½× slow"], [0.2, "Bullet time"]], g.timeScale, (v) => (g.timeScale = v));
      this.btn(330, 262, 430, 56, "FREEZE ALL MOTION", () => g.freezeAll());
      this.btn(330, 332, 430, 56, "RESET TED UNITS", () => { g.npcs.reset(); g.toast("TED units rebooted"); });
      this.btn(330, 402, 430, 56, "RESPAWN ME", () => { g.player.respawn(); this.toggle(false); });
      x.fillStyle = "#b9c6cf"; x.font = "bold 26px sans-serif";
      x.fillText("Sandbox", 40, 290); x.fillText("NPCs", 40, 360); x.fillText("Player", 40, 430);
      x.fillStyle = "#7d8b96"; x.font = "22px sans-serif";
      x.fillText(`Objects: ${g.props.list.size}   Broken: ${g.stats.broken || 0}   Ragdolls: ${g.stats.ragdolls || 0}`, 40, 520);
    } else if (this.tab === "travel") {
      g.world.locations.forEach((L, i) => this.btn(40 + (i % 2) * 476, 112 + Math.floor(i / 2) * 84, 460, 70, L.name, () => { g.player.teleport(L.pos, L.yaw); this.toggle(false); }, false, 26));
    } else if (this.tab === "goals") {
      const list = g.challenges.list;
      x.font = "22px sans-serif";
      list.forEach((c, i) => {
        const y = 100 + i * 43, done = g.save.done[c.id];
        x.fillStyle = done ? "#5dff8a" : "#ff8a1f"; x.font = "bold 24px sans-serif"; x.fillText(done ? "✔" : "○", 34, y + 18);
        x.fillStyle = done ? "#9fb0bd" : "#fff"; x.fillText(c.secret && !done ? "?????? (secret)" : c.name, 70, y + 18);
        x.fillStyle = "#7d8b96"; x.font = "20px sans-serif"; x.fillText(c.secret && !done ? "???" : c.desc + (c.progress ? `  [${c.progress()}]` : ""), 330, y + 18);
      });
    }
    this.panel.tex.needsUpdate = true;
  }
  rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  btn(bx, by, w, h, label, fn, active = false, size = 24) {
    const x = this.panel.ctx, idx = this.panel.items.length;
    const hov = this.panel.hover === idx;
    x.fillStyle = active ? "#ff8a1f" : hov ? "#3a4752" : "#232b33"; this.rr(x, bx, by, w, h, 10); x.fill();
    x.fillStyle = active ? "#140a02" : "#e9eef2"; x.font = `bold ${size}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(label, bx + w / 2, by + h / 2 + 1); x.textAlign = "left";
    this.panel.items.push({ x: bx, y: by, w, h, fn });
  }

  /* ---------- toasts ---------- */
  notify(text, sub = "", color = "#ff8a1f") { this.toasts.push({ text, sub, color }); }
  drawToast(t) {
    const x = this.toast.ctx; x.clearRect(0, 0, 768, 160);
    x.fillStyle = "rgba(10,13,16,0.9)"; this.rr(x, 4, 4, 760, 152, 20); x.fill();
    x.strokeStyle = t.color; x.lineWidth = 4; this.rr(x, 4, 4, 760, 152, 20); x.stroke();
    x.fillStyle = "#fff"; x.font = "bold 40px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(t.text, 384, t.sub ? 58 : 80);
    if (t.sub) { x.fillStyle = "#b9c6cf"; x.font = "26px sans-serif"; x.fillText(t.sub, 384, 112); }
    this.toast.tex.needsUpdate = true;
  }

  /* ---------- per frame ---------- */
  update(dt) {
    const g = this.game, P = g.player;
    // toasts float in front of you
    if (this.toastT <= 0 && this.toasts.length) { this.drawToast(this.toasts.shift()); this.toastT = 3.2; }
    if (this.toastT > 0) {
      this.toastT -= dt;
      const m = this.toast.mesh; m.visible = true;
      const head = P.headWorld(_v), q = P.camera.getWorldQuaternion(_q);
      const want = new THREE.Vector3(0, -0.12, -1.1).applyQuaternion(q).add(head);
      if (!this.toastPlaced) { m.position.copy(want); this.toastPlaced = true; } else m.position.lerp(want, Math.min(1, dt * 4));
      m.lookAt(head);
      m.material.opacity = Math.min(1, this.toastT * 3);
      if (this.toastT <= 0) { m.visible = false; this.toastPlaced = false; }
    }
    // menu toggle
    const L = P.hands.left, R = P.hands.right;
    if ((P.xr && L.pressed("b")) || (!P.xr && P.desktopMenu && !this.tabLatch)) this.toggle();
    this.tabLatch = !P.xr && P.desktopMenu;
    if (!this.menuOpen) { this.hoverIdx = -1; return; }
    this.place(false);
    // pointer
    let hit = null;
    if (P.xr) {
      this.ray.set(R.aimPos, R.aimDir);
      hit = this.ray.intersectObject(this.panel.mesh, false)[0];
      this.laser.visible = true; this.laser.position.copy(R.aimPos); this.laser.quaternion.copy(R.aimQuat); this.laser.scale.set(1, 1, hit ? hit.distance : 0.6);
    } else {
      this.ray.setFromCamera(this.mouse, P.camera);
      hit = this.ray.intersectObject(this.panel.mesh, false)[0];
    }
    let idx = -1;
    if (hit) {
      this.dot.visible = true; this.dot.position.copy(hit.point);
      const px = hit.uv.x * 1024, py = (1 - hit.uv.y) * 720;
      idx = this.panel.items.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
    } else this.dot.visible = false;
    this.hoverIdx = hit ? idx : -1;
    if (idx !== this.panel.hover) { this.panel.hover = idx; this.draw(); if (idx >= 0 && P.xr) R.haptic(0.1, 10); }
    const click = P.xr ? R.triggerPressed() : this.click;
    this.click = false;
    if (click && idx >= 0) { g.audio.play("click", null, { vol: 0.5 }); this.panel.items[idx].fn(); }
  }
}
