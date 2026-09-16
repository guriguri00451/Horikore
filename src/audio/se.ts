import { loadSeVolume } from "../persist/audioPrefs";
import alarmBurstUrl from "../../alarm-burst.wav?url";

const COOLDOWN_MS = 280;

let volume = loadSeVolume();
let el: HTMLAudioElement | null = null;
let last = 0;

export function setSeFxVolume(value: number): void {
  volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  if (el) el.volume = volume;
}

export function playWallHit(): void {
  if (volume <= 0) return;
  const now = performance.now();
  if (now - last < COOLDOWN_MS) return;
  last = now;
  if (!el) {
    el = new Audio(alarmBurstUrl);
    el.preload = "auto";
  }
  el.volume = volume;
  el.currentTime = 0;
  void el.play().catch(() => undefined);
}
