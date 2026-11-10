// In-world canvas touch panels (shop + wardrobe), wrist HUD and laser pointers.
import * as THREE from "three";
import { WEAPONS } from "./weapons.js";
import { HAIR_STYLES, HAIR_COLORS, OUTFITS, CLOTH_ITEMS, BODY_TYPES, MASKS } from "./avatar.js";
import { save, persist, trySpend } from "./save.js";

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(" "); let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  ctx.fillText(line, x, y);
}

export class Panel {
  constructor(wM, hM, pxW, pxH) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = pxW; this.canvas.height = pxH;
    this.ctx = this.canvas.getContext("2d");
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.buttons = [];
    this.hoverId = null;
    this.mesh.userData.interact = this;
  }
  button(id, x, y, w, h, onClick) { this.buttons.push({ id, x, y, w, h, onClick }); return this.hoverId === id; }
  redraw() { this.buttons = []; this.draw(this.ctx, this.canvas.width, this.canvas.height); this.tex.needsUpdate = true; }
  pick(uv) {
    const x = uv.x * this.canvas.width, y = (1 - uv.y) * this.canvas.height;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }
  hover(hit) {
    const b = hit ? this.pick(hit.uv) : null;
    const id = b ? b.id : null;
    if (id !== this.hoverId) { this.hoverId = id; this.redraw(); }
  }
  select(hit) { const b = this.pick(hit.uv); if (b && b.onClick) { b.onClick(); this.redraw(); return true; } return false; }
}

function frame(ctx, W, H, title, accent = "#ff9a3d") {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#151b21"); g.addColorStop(1, "#0b0f13");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.fillStyle = accent; ctx.fillRect(28, 30, 8, 44);
  ctx.fillStyle = "#e9eef2"; ctx.font = `700 40px ${FONT}`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(title, 50, 54);
  // coin counter
  ctx.textAlign = "right"; ctx.font = `700 36px ${FONT}`; ctx.fillStyle = "#ffcf5a";
  ctx.fillText(`${save.coins.toLocaleString()} ¢`, W - 40, 54);
  ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(28, 96, W - 56, 2);
  // subtle scanlines for a screen feel
  ctx.fillStyle = "rgba(255,255,255,0.018)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

function bigButton(panel, ctx, id, x, y, w, h, label, kind, onClick) {
  const hov = panel.button(id, x, y, w, h, kind === "off" ? null : onClick);
  const col = kind === "buy" ? "#ff8a2a" : kind === "equip" ? "#3fb27f" : kind === "deny" ? "#5a3030" : "#2a3138";
  rr(ctx, x, y, w, h, 14); ctx.fillStyle = col; ctx.fill();
  if (hov && kind !== "off") { ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke(); }
  ctx.fillStyle = kind === "off" ? "#7f8a94" : "#0d1114"; if (kind === "deny") ctx.fillStyle = "#e0a0a0";
  ctx.font = `800 34px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

/* ---------------- shop ---------------- */
export class ShopPanel extends Panel {
  constructor(sfx, onChange) {
    super(1.5, 0.94, 1280, 800);
    this.sfx = sfx; this.onChange = onChange;
    this.sel = save.equipped;
    this.redraw();
  }
  draw(ctx, W, H) {
    frame(ctx, W, H, "ARMORY  //  QUARTERMASTER");
    WEAPONS.forEach((w, i) => {
      const x = 28, y = 116 + i * 100, rw = 470, rh = 88;
      const hov = this.button("w" + i, x, y, rw, rh, () => { this.sel = w.id; this.sfx.click(); this.onChange("select", w.id); });
      rr(ctx, x, y, rw, rh, 12);
      ctx.fillStyle = this.sel === w.id ? "#2b3540" : hov ? "#212a33" : "#171e25"; ctx.fill();
      if (this.sel === w.id) { ctx.strokeStyle = "#ff9a3d"; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.textAlign = "left"; ctx.fillStyle = "#e8edf1"; ctx.font = `700 30px ${FONT}`;
      ctx.fillText(w.name, x + 22, y + 32);
      ctx.font = `600 22px ${FONT}`;
      const owned = save.weapons.includes(w.id);
      if (save.equipped === w.id) { ctx.fillStyle = "#5fe0a0"; ctx.fillText("EQUIPPED", x + 22, y + 64); }
      else if (owned) { ctx.fillStyle = "#9fb3c4"; ctx.fillText("OWNED", x + 22, y + 64); }
      else { ctx.fillStyle = save.coins >= w.price ? "#ffcf5a" : "#b06a5a"; ctx.fillText(`${w.price.toLocaleString()} ¢`, x + 22, y + 64); }
    });
    const w = WEAPONS.find((x) => x.id === this.sel);
    const X = 540, Y = 120;
    ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = `800 46px ${FONT}`; ctx.fillText(w.name, X, Y + 20);
    ctx.fillStyle = "#a9b6c1"; ctx.font = `400 26px ${FONT}`; wrap(ctx, w.desc, X, Y + 74, 690, 34);
    const stats = [
      ["Damage", Math.min(1, (w.dmg * w.pellets) / 240)],
      ["Fire rate", Math.min(1, w.rpm / 900)],
      ["Magazine", Math.min(1, w.mag / 32)],
      ["Accuracy", 1 - Math.min(1, w.spread / 4.5)],
      ["Range", Math.min(1, w.range / 300)],
    ];
    stats.forEach(([n, v], i) => {
      const y = Y + 160 + i * 58;
      ctx.fillStyle = "#cfd8df"; ctx.font = `600 24px ${FONT}`; ctx.fillText(n, X, y);
      rr(ctx, X + 170, y - 11, 500, 22, 11); ctx.fillStyle = "#222a31"; ctx.fill();
      rr(ctx, X + 170, y - 11, Math.max(22, 500 * v), 22, 11); ctx.fillStyle = "#ff9a3d"; ctx.fill();
    });
    ctx.fillStyle = "#7f8c97"; ctx.font = `500 22px ${FONT}`;
    ctx.fillText(`${w.auto ? "Full-auto" : "Semi-auto"} · ${w.twoHand ? "Two-handed" : "One-handed"} · ${w.mag} rounds${w.pierce ? " · Piercing" : ""}`, X, Y + 470);
    const owned = save.weapons.includes(w.id);
    const bx = X, by = H - 150, bw = 690, bh = 96;
    if (save.equipped === w.id) bigButton(this, ctx, "act", bx, by, bw, bh, "EQUIPPED", "off");
    else if (owned) bigButton(this, ctx, "act", bx, by, bw, bh, "EQUIP", "equip", () => { save.equipped = w.id; persist(); this.sfx.click(); this.onChange("equip", w.id); });
    else if (save.coins >= w.price) bigButton(this, ctx, "act", bx, by, bw, bh, `BUY  —  ${w.price.toLocaleString()} ¢`, "buy", () => {
      if (trySpend(w.price)) { save.weapons.push(w.id); save.equipped = w.id; persist(); this.sfx.coin(); this.onChange("buy", w.id); }
    });
    else bigButton(this, ctx, "act", bx, by, bw, bh, `NEED ${(w.price - save.coins).toLocaleString()} ¢ MORE`, "deny", () => this.sfx.deny());
  }
}

/* ---------------- wardrobe ---------------- */
const TABS = [
  { key: "body", label: "BODY", list: BODY_TYPES },
  { key: "hair", label: "HAIR", list: HAIR_STYLES },
  { key: "hairColor", label: "COLOR", list: HAIR_COLORS },
  { key: "outfit", label: "OUTFIT", list: OUTFITS },
  { key: "cloth", label: "CLOTH", list: CLOTH_ITEMS },
  { key: "mask", label: "GEAR", list: MASKS },
];
export class WardrobePanel extends Panel {
  // onPreview(look) is called whenever the try-on look changes
  constructor(sfx, onPreview) {
    super(1.4, 0.875, 1280, 800);
    this.sfx = sfx; this.onPreview = onPreview;
    this.tab = 0;
    this.trying = { ...save.look };
    this.redraw();
  }
  resetTryOn() { this.trying = { ...save.look }; this.onPreview(this.trying); this.redraw(); }
  draw(ctx, W, H) {
    frame(ctx, W, H, "WARDROBE  //  YOUR AVATAR", "#41c7b9");
    TABS.forEach((t, i) => {
      const x = 28 + i * 152, y = 112, w = 142, h = 60;
      const hov = this.button("t" + i, x, y, w, h, () => { this.tab = i; this.sfx.click(); });
      rr(ctx, x, y, w, h, 10); ctx.fillStyle = this.tab === i ? "#41c7b9" : hov ? "#26313a" : "#1a2229"; ctx.fill();
      ctx.fillStyle = this.tab === i ? "#071211" : "#cfd8df"; ctx.font = `800 24px ${FONT}`; ctx.textAlign = "center";
      ctx.fillText(t.label, x + w / 2, y + h / 2 + 1);
    });
    const T = TABS[this.tab];
    const owned = save.owned[T.key];
    T.list.forEach((item, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 28 + col * 306, y = 196 + row * 196, w = 290, h = 180;
      const hov = this.button("i" + i, x, y, w, h, () => { this.trying[T.key] = item.id; this.sfx.click(); this.onPreview(this.trying); });
      rr(ctx, x, y, w, h, 14);
      const isTry = this.trying[T.key] === item.id;
      ctx.fillStyle = isTry ? "#24323a" : hov ? "#1f2830" : "#161d23"; ctx.fill();
      if (isTry) { ctx.strokeStyle = "#41c7b9"; ctx.lineWidth = 4; ctx.stroke(); }
      const swatch = item.hex ?? item.jacket ?? item.color;
      if (swatch !== undefined) {
        ctx.fillStyle = "#" + swatch.toString(16).padStart(6, "0");
        ctx.beginPath(); ctx.arc(x + 54, y + 62, 30, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.fillStyle = "#41c7b9"; ctx.font = `700 46px ${FONT}`; ctx.textAlign = "center"; ctx.fillText(item.icon || "✂", x + 54, y + 64);
      }
      ctx.textAlign = "left"; ctx.fillStyle = "#e8edf1"; ctx.font = `700 26px ${FONT}`;
      ctx.fillText(item.name, x + 100, y + 62);
      ctx.font = `600 22px ${FONT}`;
      if (save.look[T.key] === item.id) { ctx.fillStyle = "#5fe0a0"; ctx.fillText("WEARING", x + 22, y + 140); }
      else if (owned.includes(item.id)) { ctx.fillStyle = "#9fb3c4"; ctx.fillText("OWNED", x + 22, y + 140); }
      else { ctx.fillStyle = save.coins >= item.price ? "#ffcf5a" : "#b06a5a"; ctx.fillText(`${item.price} ¢`, x + 22, y + 140); }
    });
    // action bar: buy/wear everything currently being tried on
    const pending = TABS.filter((t) => !save.owned[t.key].includes(this.trying[t.key]));
    const cost = pending.reduce((s, t) => s + t.list.find((x) => x.id === this.trying[t.key]).price, 0);
    const changed = TABS.some((t) => this.trying[t.key] !== save.look[t.key]);
    const by = H - 128, bh = 92;
    bigButton(this, ctx, "revert", 28, by, 300, bh, "REVERT", changed ? "neutral" : "off", () => { this.sfx.click(); this.resetTryOn(); });
    if (!changed) bigButton(this, ctx, "act", 348, by, W - 376, bh, "THIS IS YOUR CURRENT LOOK", "off");
    else if (cost === 0) bigButton(this, ctx, "act", 348, by, W - 376, bh, "WEAR THIS LOOK", "equip", () => { save.look = { ...this.trying }; persist(); this.sfx.click(); this.onPreview(this.trying, true); });
    else if (save.coins >= cost) bigButton(this, ctx, "act", 348, by, W - 376, bh, `BUY & WEAR  —  ${cost} ¢`, "buy", () => {
      if (!trySpend(cost)) return;
      pending.forEach((t) => save.owned[t.key].push(this.trying[t.key]));
      save.look = { ...this.trying }; persist(); this.sfx.coin(); this.onPreview(this.trying, true);
    });
    else bigButton(this, ctx, "act", 348, by, W - 376, bh, `NEED ${cost - save.coins} ¢ MORE — WIN COINS IN THE ARENA`, "deny", () => this.sfx.deny());
  }
}

/* ---------------- simple sign / info board ---------------- */
export function makeBoard(wM, hM, pxW, pxH, draw) {
  const p = new Panel(wM, hM, pxW, pxH);
  p.draw = draw;
  p.redraw();
  p.mesh.userData.interact = null;
  return p;
}

/* ---------------- wrist HUD ---------------- */
export class WristHUD extends Panel {
  constructor() {
    super(0.13, 0.078, 320, 192);
    this.state = { hp: 100, coins: 0, risk: -1, wave: 0, left: 0, ammo: 0, mag: 0, extract: 0, msg: "" };
    this.mesh.userData.interact = null;
    this.mesh.material.transparent = true;
    this.redraw();
  }
  set(s) {
    let dirty = false;
    for (const k in s) if (this.state[k] !== s[k]) { this.state[k] = s[k]; dirty = true; }
    if (dirty) this.redraw();
  }
  draw(ctx, W, H) {
    const s = this.state;
    ctx.clearRect(0, 0, W, H);
    rr(ctx, 4, 4, W - 8, H - 8, 18); ctx.fillStyle = "rgba(8,12,14,0.86)"; ctx.fill();
    ctx.strokeStyle = "rgba(120,255,200,0.35)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillStyle = "#9fb3c4"; ctx.font = `700 20px ${FONT}`; ctx.fillText("VITALS", 20, 28);
    rr(ctx, 20, 44, W - 40, 22, 11); ctx.fillStyle = "#1d2328"; ctx.fill();
    rr(ctx, 20, 44, Math.max(22, (W - 40) * s.hp / 100), 22, 11); ctx.fillStyle = s.hp > 35 ? "#4fe08f" : "#ff4a3a"; ctx.fill();
    ctx.fillStyle = "#ffcf5a"; ctx.font = `800 30px ${FONT}`; ctx.fillText(s.risk >= 0 ? `${s.risk} ¢ at risk` : `${s.coins} ¢`, 20, 98);
    ctx.textAlign = "right"; ctx.fillStyle = "#e8edf1"; ctx.font = `700 24px ${FONT}`;
    ctx.fillText(s.wave ? `WAVE ${s.wave} · ${s.left} left` : "", W - 20, 98);
    ctx.textAlign = "left"; ctx.fillStyle = "#cfd8df"; ctx.font = `600 20px ${FONT}`;
    if (s.extract > 0) {
      rr(ctx, 20, 132, W - 40, 36, 10); ctx.fillStyle = "#1d2328"; ctx.fill();
      rr(ctx, 20, 132, (W - 40) * s.extract, 36, 10); ctx.fillStyle = "#41c7b9"; ctx.fill();
      ctx.fillStyle = "#061010"; ctx.fillText("EXTRACTING…", 34, 151);
    } else ctx.fillText(s.msg || "Hold Y to extract", 20, 151);
  }
}

/* ---------------- laser pointer ---------------- */
export function makeLaser() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.55, depthWrite: false }));
  beam.geometry.translate(0, 0.5, 0); beam.geometry.rotateX(-Math.PI / 2);
  g.add(beam);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  g.add(dot);
  g.userData.set = (len, hit) => { beam.scale.set(1, 1, len); dot.position.set(0, 0, -len); dot.visible = hit; };
  g.userData.set(3, false);
  return g;
}
