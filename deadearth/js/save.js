// Persistent progress (coins, unlocks, look) in localStorage.
import { DEFAULT_LOOK, HAIR_STYLES, HAIR_COLORS, OUTFITS, CLOTH_ITEMS } from "./avatar.js";

const KEY = "deadearth-save-v1";
const free = (list) => list.filter((x) => x.price === 0).map((x) => x.id);

function fresh() {
  return {
    coins: 300,
    weapons: ["pistol"],
    equipped: "pistol",
    owned: { hair: free(HAIR_STYLES), hairColor: free(HAIR_COLORS), outfit: free(OUTFITS), cloth: free(CLOTH_ITEMS) },
    look: { ...DEFAULT_LOOK },
    stats: { kills: 0, bestWave: 0, runs: 0 },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    const f = fresh();
    return { ...f, ...s, owned: { ...f.owned, ...(s.owned || {}) }, look: { ...f.look, ...(s.look || {}) }, stats: { ...f.stats, ...(s.stats || {}) } };
  } catch { return fresh(); }
}

export const save = load();
const listeners = new Set();
export function onSave(fn) { listeners.add(fn); }
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode: progress lives for this session */ }
  listeners.forEach((fn) => fn(save));
}
export function addCoins(n) { save.coins += n; persist(); }
export function trySpend(n) { if (save.coins < n) return false; save.coins -= n; persist(); return true; }
