// src/utils/persistence.js
const STORAGE_KEY = "canvas-board-v1";

export function saveBoardState(state) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save board state", err);
  }
}

export function loadBoardState() {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error("Failed to load board state", err);
    return null;
  }
}
