// Persistent progress (coins, unlocks, look) in localStorage.
import { DEFAULT_LOOK, HAIR_STYLES, HAIR_COLORS, OUTFITS, CLOTH_ITEMS, BODY_TYPES, MASKS, FACES, PANTS, outfitFor, faceFor } from "./avatar.js";

const KEY = "deadearth-save-v2";
const free = (list) => list.filter((x) => x.price === 0).map((x) => x.id);

function fresh() {
  return {
    coins: 300,
    weapons: ["pistol"],
    equipped: "pistol",
    owned: { body: free(BODY_TYPES), face: free(FACES), pants: free(PANTS), mask: free(MASKS), hair: free(HAIR_STYLES), hairColor: free(HAIR_COLORS), outfit: free(OUTFITS), cloth: free(CLOTH_ITEMS) },
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
    const owned = { ...f.owned };
    for (const k in s.owned || {}) owned[k] = [...new Set([...(f.owned[k] || []), ...s.owned[k]])];
    const look = { ...f.look, ...(s.look || {}) };
    look.outfit = outfitFor(look).id;
    look.face = faceFor(look);
    if (!HAIR_STYLES.find((x) => x.id === look.hair)) look.hair = "natural";
    if (!PANTS.find((x) => x.id === look.pants)) look.pants = "orig";
    if (!HAIR_COLORS.find((x) => x.id === look.hairColor)) look.hairColor = "natural";
    return { ...f, ...s, owned, look, stats: { ...f.stats, ...(s.stats || {}) } };
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
