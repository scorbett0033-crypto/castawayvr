// Experiments & challenges, tracked on the hub board and the GOALS menu tab.
import * as THREE from "three";
import { tv } from "./physics.js";
import { zoneAt } from "./world.js";

const _v = new THREE.Vector3(), _u = new THREE.Vector3();

export class Challenges {
  constructor(game) {
    this.game = game;
    const g = game;
    this.c = { hoops: new Set(), fixed: 0, rag: 0, booms: [] };
    this.list = [
      { id: "range", name: "Sharpshooter", desc: "Hit 10 pop-up targets in 40 s (Training Range)" },
      { id: "hoops", name: "Hoop Dreams", desc: "Throw 5 things into the bin from behind the counter", progress: () => `${Math.min(5, this.c.hoops.size)}/5` },
      { id: "stack", name: "Skyscraper", desc: "Stack anything above the 2.5 m line (Sandbox)" },
      { id: "domino", name: "Domino Effect", desc: "Topple the last domino (Sandbox)" },
      { id: "strike", name: "Strike!", desc: "All 10 pins down with one roll (Outdoor)" },
      { id: "boom", name: "Chain Reaction", desc: "Set off 3 explosive barrels within 2 seconds" },
      { id: "fixer", name: "Fixer Upper", desc: "Repair 3 broken objects with the Mender", progress: () => `${Math.min(3, this.c.fixed)}/3` },
      { id: "ragdoll", name: "Bot Bowling", desc: "Knock over 5 TED units", progress: () => `${Math.min(5, this.c.rag)}/5` },
      { id: "wave", name: "Friendly Face", desc: "Wave at a TED until it waves back" },
      { id: "party", name: "Party Starter", desc: "Get a TED unit dancing" },
      { id: "reboot", name: "Second Chance", desc: "Bring the broken TED in the lab back online" },
      { id: "vault", name: "Vault 07", desc: "Crack the vault keypad in the hub", secret: true },
      { id: "chaos", name: "The Chaos Room", desc: "Break into the hidden room", secret: true },
      { id: "duck", name: "Bring It Home", desc: "Put the Golden Duck on the hub trophy pedestal", secret: true },
    ];
    this.range = { on: false, t: 0, hits: 0, next: 0 };
    this.bowl = { armed: true, rolling: false, t: 0 };
    this.stackT = 0; this.checkT = 0;
    g.onRepaired = () => { this.c.fixed++; if (this.c.fixed >= 3) this.complete("fixer"); this.drawBoard(); };
    g.onRagdoll = (n) => { if (n.opts.disabled && !n.wasUp) return; this.c.rag++; if (this.c.rag >= 5) this.complete("ragdoll"); };
    g.onDance = () => this.complete("party");
    g.onWave = () => this.complete("wave");
    g.onNpcRepaired = (n) => { n.wasUp = true; if (n.opts.disabled) this.complete("reboot"); };
    g.onExplode = () => { const t = g.time; this.c.booms = this.c.booms.filter((x) => t - x < 2); this.c.booms.push(t); if (this.c.booms.length >= 3) this.complete("boom"); };
  }

  complete(id) {
    const g = this.game;
    if (g.save.done[id]) return;
    g.save.done[id] = true; g.persist();
    const c = this.list.find((x) => x.id === id);
    g.toast(c.secret ? "SECRET FOUND" : "CHALLENGE COMPLETE", c.name, c.secret ? "#c58bff" : "#5dff8a");
    g.audio.play("ok", null, { vol: 0.8 });
    this.drawBoard();
    if (g.ui.menuOpen) g.ui.draw();
  }

  /* ---------- range ---------- */
  startRange() {
    const W = this.game.world, I = this.game.interact;
    this.range = { on: true, t: 40, hits: 0, next: 0.5 };
    W.targets.forEach((t) => I.setTarget(t, false));
    this.game.audio.play("ok", null, { vol: 0.5 });
  }
  targetHit() { if (this.range.on) { this.range.hits++; this.game.audio.play("beep", null, { vol: 0.4, rate: 1.4 }); } }
  drawRange() {
    const W = this.game.world, c = W.rangeCanvas.getContext("2d"), R = this.range;
    const txt = R.on ? `${Math.ceil(R.t)}s   HITS ${R.hits}/10` : R.done ? `RESULT: ${R.hits} HITS` : "PRESS START";
    if (this._lastRange === txt) return; this._lastRange = txt;
    c.fillStyle = "#06090b"; c.fillRect(0, 0, 512, 128); c.fillStyle = R.on ? "#ffd34d" : "#46e6ff"; c.font = "bold 54px monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, 256, 66);
    W.rangeTex.needsUpdate = true;
  }

  bowlReset() { this.bowl = { armed: true, rolling: false, t: 0 }; }

  /* ---------- board ---------- */
  drawBoard() {
    const W = this.game.world, c = W.boardTex.getContext("2d"), g = this.game;
    c.fillStyle = "#0b0f13"; c.fillRect(0, 0, 1024, 720);
    c.strokeStyle = "#ff8a1f"; c.lineWidth = 8; c.strokeRect(4, 4, 1016, 712);
    c.fillStyle = "#ff8a1f"; c.font = "900 46px sans-serif"; c.fillText("EXPERIMENT LOG", 34, 62);
    const done = this.list.filter((x) => g.save.done[x.id]).length;
    c.fillStyle = "#c9d4dc"; c.font = "bold 30px sans-serif"; c.fillText(`${done} / ${this.list.length} complete`, 680, 60);
    this.list.forEach((x, i) => {
      const y = 108 + i * 43, ok = g.save.done[x.id];
      c.fillStyle = ok ? "#5dff8a" : "#55626c"; c.font = "bold 28px sans-serif"; c.fillText(ok ? "✔" : "□", 34, y + 10);
      c.fillStyle = ok ? "#8fa0ab" : "#fff"; c.fillText(x.secret && !ok ? "??????" : x.name, 76, y + 10);
      c.fillStyle = "#7d8b96"; c.font = "22px sans-serif"; c.fillText(x.secret && !ok ? "A secret somewhere in the facility" : x.desc + (x.progress && !ok ? `  [${x.progress()}]` : ""), 340, y + 10);
    });
    W.boardT.needsUpdate = true;
  }

  update(dt) {
    const g = this.game, W = g.world, I = g.interact;
    // range
    const R = this.range;
    if (R.on) {
      R.t -= dt; R.next -= dt;
      const up = W.targets.filter((t) => t.up);
      if (R.next <= 0 && up.length < 3) { const down = W.targets.filter((t) => !t.up); const t = down[Math.floor(Math.random() * down.length)]; if (t) { I.setTarget(t, true); t.upT = 2.6; g.audio.play("servo", tv(t.ent.body.translation()), { vol: 0.25, rate: 2 }); } R.next = 0.7 + Math.random() * 0.9; }
      for (const t of up) { t.upT -= dt; if (t.upT <= 0) I.setTarget(t, false); }
      if (R.t <= 0) { R.on = false; R.done = true; W.targets.forEach((t) => I.setTarget(t, false)); if (R.hits >= 10) this.complete("range"); else g.toast("RANGE OVER", `${R.hits} / 10 hits — try again`); }
    }
    this.drawRange();
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.2; const step = 0.2;
    // hoops
    if (!g.save.done.hoops) {
      for (const e of g.props.list) {
        if (e.heldBy?.length || !e.thrownFrom || e.thrownFrom.z < -15.2 || this.c.hoops.has(e)) continue;
        const t = e.body.translation();
        if (Math.abs(t.x - W.bin.x) < 0.48 && Math.abs(t.z - W.bin.z) < 0.48 && t.y < 0.9) { this.c.hoops.add(e); g.audio.play("ok", tv(t), { vol: 0.5 }); g.toast("SCORE!", `${Math.min(5, this.c.hoops.size)} / 5`); if (this.c.hoops.size >= 5) this.complete("hoops"); }
      }
    }
    // skyscraper
    if (!g.save.done.stack) {
      let tall = false;
      for (const e of g.props.list) {
        if (e.heldBy?.length) continue;
        const t = e.body.translation();
        if (t.x < 14 || t.x > 20 || t.z < -10 || t.z > -4) continue;
        const v = e.body.linvel();
        if (t.y + (e.size || 0.3) * 0.3 > 2.5 && Math.hypot(v.x, v.y, v.z) < 0.2) { tall = true; break; }
      }
      this.stackT = tall ? this.stackT + step : 0;
      W.stackBar.material.color.set(tall ? 0x5dff8a : 0x46e6ff); W.stackBar.material.opacity = tall ? 0.25 : 0.12;
      if (this.stackT >= 3) this.complete("stack");
    }
    // domino
    if (!g.save.done.domino) {
      const last = W.dominoes[W.dominoes.length - 1];
      if (last && !last.dead && last.body) { const r = last.body.rotation(); _u.set(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)); if (_u.y < 0.5 && !last.heldBy?.length && g.time - (last.lastHeld || -99) > 5) this.complete("domino"); }
    }
    // bowling
    const B = this.bowl;
    if (!B.rolling && B.armed) {
      for (const e of g.props.list) { if (e.type !== "bowling_ball" || e.heldBy?.length) continue; const t = e.body.translation(); if (t.z > 63 && t.z < 72 && Math.abs(t.x + 28) < 0.9) { B.rolling = true; B.t = 4; break; } }
    } else if (B.rolling) {
      B.t -= step;
      if (B.t <= 0) {
        B.rolling = false; B.armed = false;
        let down = 0;
        W.pins.forEach((p, i) => { if (p.dead || !p.body) { down++; return; } const r = p.body.rotation(); _u.set(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)); const t = p.body.translation(); if (_u.y < 0.75 || Math.hypot(t.x - W.pinSpots[i].x, t.z - W.pinSpots[i].z) > 0.35) down++; });
        if (down >= 10) this.complete("strike"); else g.toast(`${down} PIN${down === 1 ? "" : "S"}`, "Press RESET to set them up again");
      }
    }
    // secrets by location
    const z = zoneAt(g.player.feet);
    if (z === "secret") this.complete("chaos");
    if (z === "vault") this.complete("vault");
    if (!g.save.done.duck) {
      for (const e of g.props.list) if (e.type === "golden_duck" && !e.heldBy?.length) { const t = e.body.translation(); if (_v.set(t.x, t.y, t.z).distanceTo(W.trophy) < 0.4) this.complete("duck"); }
    }
  }
}
