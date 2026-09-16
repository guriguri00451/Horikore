const BGM_KEY = "horikore.bgm.volume";
const SE_KEY = "horikore.se.volume";
const MUTE_KEY = "horikore.bgm.muted";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function readPct(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return n > 1 ? clamp01(n / 100) : clamp01(n);
  } catch {
    return fallback;
  }
}

function writePct(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(clamp01(value) * 100)));
  } catch {
    /* ignore */
  }
}

export function loadBgmVolume(): number {
  try {
    if (localStorage.getItem(BGM_KEY) == null && localStorage.getItem(MUTE_KEY) === "1") return 0;
  } catch {
    /* ignore */
  }
  return readPct(BGM_KEY, 1);
}

export function loadSeVolume(): number {
  return readPct(SE_KEY, 1);
}

export function saveBgmVolume(value: number): void {
  writePct(BGM_KEY, value);
}

export function saveSeVolume(value: number): void {
  writePct(SE_KEY, value);
}
