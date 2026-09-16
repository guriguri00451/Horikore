import type { CharacterState } from "../machine/types";
import { debugLog } from "../debug/log";
import { loadSeVolume } from "../persist/audioPrefs";
import { setSeFxVolume } from "./se";
import { holdRecognition, setSpokenLine } from "./speechIn";

type VoiceProfile = { pitch: number; rate: number };

/** 普通の男声。ステート差は速度だけ少し振る。 */
const PROFILE: Record<CharacterState, VoiceProfile> = {
  awake: { pitch: 1, rate: 0.82 },
  nodding: { pitch: 0.98, rate: 0.78 },
  called: { pitch: 1, rate: 0.84 },
  angry: { pitch: 1.05, rate: 0.92 },
  workout: { pitch: 0.98, rate: 0.83 },
  beauty: { pitch: 1, rate: 0.8 },
  sleeping: { pitch: 0.92, rate: 0.72 },
  hit: { pitch: 1.12, rate: 1.05 },
};

const PREFERRED_MALE_HINT = /ichiro|otoya|hattori|daichi|keita|male|man|男性|一郎/i;
const MALE_HINT = /ichiro|otoya|hattori|eddy|rocko|reed|grandpa|male|man|男性|一郎|daichi|keita/i;
const FEMALE_HINT = /kyoko|oren|flo|grandma|sandy|shelley|female|woman|女性|sakura|haruka|ayumi|nanami/i;
const GOOGLE_VOICE = /google/i;
const PERSONA_VOICE = /eddy|flo|grandpa|grandma|reed|rocko|sandy|shelley/i;
const START_WATCH_MS = 800;
const MAX_START_TRIES = 3;
const STALE_RESET_MS = 120;
const VOICE_POLL_MS = 100;
const VOICE_WAIT_MS = 2000;
const UNLOCK_EVENTS = ["click", "touchend", "keydown"] as const;

type Job = {
  text: string;
  state: CharacterState;
  onend: () => void;
  id: number;
};

let held: SpeechSynthesisUtterance | null = null;
let gestured = false;
let jobId = 0;
let job: Job | null = null;
let pending: Job | null = null;
let startWatch = 0;
let endWatch = 0;
let staleReset = 0;
const listeners = new Set<() => void>();
let queued: (() => void) | null = null;
let seVolume = loadSeVolume();
let voicesReady: Promise<void> | null = null;

function speechState(): Record<string, unknown> {
  return {
    gestured,
    userActive: navigator.userActivation?.isActive ?? null,
    userHasBeenActive: navigator.userActivation?.hasBeenActive ?? null,
    speaking: speechSynthesis.speaking,
    pending: speechSynthesis.pending,
    paused: speechSynthesis.paused,
    voices: speechSynthesis.getVoices().length,
    hasJob: Boolean(job),
    pendingId: pending?.id ?? null,
    queued: Boolean(queued),
    staleReset: Boolean(staleReset),
  };
}

function logTts(event: string, data: Record<string, unknown> = {}): void {
  debugLog("tts", event, { ...speechState(), ...data });
}

export function setSeVolume(value: number): void {
  seVolume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  if (held) held.volume = seVolume;
  setSeFxVolume(seVolume);
}

function notify() {
  listeners.forEach((fn) => fn());
}

function setQueued(fn: (() => void) | null) {
  queued = fn;
  notify();
}

export function isSpeechUnlocked(): boolean {
  return gestured && !queued;
}

export function onSpeechUnlock(fn: () => void): () => void {
  listeners.add(fn);
  fn();
  return () => {
    listeners.delete(fn);
  };
}

function userActive(): boolean {
  return Boolean(navigator.userActivation?.isActive);
}

function kickResume() {
  try {
    if (speechSynthesis.paused) speechSynthesis.resume();
  } catch {
    /* ignore */
  }
}

function loadVoices(): Promise<void> {
  if (speechSynthesis.getVoices().length > 0) return Promise.resolve();
  if (voicesReady) return voicesReady;

  voicesReady = new Promise((resolve) => {
    let done = false;
    let poll = 0;
    let timeout = 0;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      speechSynthesis.removeEventListener("voiceschanged", check);
      resolve();
    };
    const check = () => {
      if (speechSynthesis.getVoices().length > 0) finish();
    };
    speechSynthesis.addEventListener("voiceschanged", check);
    poll = window.setInterval(check, VOICE_POLL_MS);
    timeout = window.setTimeout(finish, VOICE_WAIT_MS);
    check();
  });

  return voicesReady;
}

function flushQueued() {
  logTts("flushQueued");
  if (playQueued()) return;
  if (!job && pending) {
    const follow = pending;
    pending = null;
    logTts("flush pending", { id: follow.id, state: follow.state, text: follow.text });
    start(follow);
    return;
  }
  notify();
}

function lineBudgetMs(text: string, rate: number): number {
  const perSec = Math.max(0.45, rate) * 6;
  return Math.min(18_000, Math.max(2200, (text.length / perSec) * 1000 + 900));
}

function playQueued() {
  const next = queued;
  if (!next) return false;
  setQueued(null);
  next();
  return true;
}

export function unlockSpeech() {
  gestured = true;
  kickResume();
  void loadVoices();
  logTts("unlockSpeech");
  flushQueued();
}

if (typeof window !== "undefined") {
  const kick = () => unlockSpeech();
  UNLOCK_EVENTS.forEach((event) => window.addEventListener(event, kick, true));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) kickResume();
  });
  void loadVoices();
  speechSynthesis.addEventListener("voiceschanged", () => {
    speechSynthesis.getVoices();
  });
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  if (!v.lang.toLowerCase().startsWith("ja")) return -1;
  let n = 5;
  const blob = `${v.name} ${v.voiceURI}`;
  if (v.localService) n += 2;
  else n -= 1;
  if (GOOGLE_VOICE.test(blob)) n -= 1;
  if (PERSONA_VOICE.test(blob)) n -= 4;
  if (PREFERRED_MALE_HINT.test(blob)) n += 8;
  else if (MALE_HINT.test(blob)) n += 4;
  else if (FEMALE_HINT.test(blob)) n -= 2;
  else n += 1;
  return n;
}

function jaVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const s = scoreVoice(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

function clearWatches() {
  window.clearTimeout(startWatch);
  window.clearTimeout(endWatch);
  window.clearTimeout(staleReset);
  startWatch = 0;
  endWatch = 0;
  staleReset = 0;
}

function waitForGesture(next: Job) {
  pending = next;
  logTts("waitForGesture", { id: next.id, state: next.state, text: next.text });
  setQueued(() => {
    const follow = pending;
    pending = null;
    logTts("gesture queue fired", { id: follow?.id ?? null, text: follow?.text ?? null });
    if (follow) start(follow);
  });
}

function canStartNow(): boolean {
  return userActive() || gestured;
}

function browserHasStaleSpeech(): boolean {
  return !job && !held && (speechSynthesis.speaking || speechSynthesis.pending);
}

function resetStaleSpeechThenStart(next: Job) {
  pending = next;
  window.clearTimeout(staleReset);
  logTts("reset stale browser speech", { id: next.id, state: next.state, text: next.text });
  try {
    speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  staleReset = window.setTimeout(() => {
    staleReset = 0;
    const follow = pending;
    pending = null;
    if (follow) start(follow);
  }, STALE_RESET_MS);
}

function queueMe() {
  holdRecognition(false);
  const again = job;
  logTts("queueMe", { id: again?.id ?? null, text: again?.text ?? null });
  job = null;
  held = null;
  clearWatches();
  if (!again) return;
  waitForGesture(again);
}

function finish(u: SpeechSynthesisUtterance, unstick: boolean) {
  if (held !== u) return;
  logTts("finish", { unstick, text: u.text });
  held = null;
  clearWatches();
  const done = job;
  job = null;
  const follow = pending;
  pending = null;
  const after = () => {
    if (!follow) {
      setSpokenLine(null);
      holdRecognition(false);
    }
    done?.onend();
    if (follow) start(follow);
  };
  if (unstick && (speechSynthesis.speaking || speechSynthesis.pending)) {
    kickResume();
  }
  after();
}

function start(next: Job, tries = 1) {
  logTts("start", { id: next.id, tries, state: next.state, text: next.text });
  job = next;
  pending = pending?.id === next.id ? null : pending;
  setSpokenLine(next.text);
  clearWatches();
  holdRecognition(true);

  const u = new SpeechSynthesisUtterance(next.text);
  held = u;
  let begun = false;
  const voice = jaVoice();
  if (voice) u.voice = voice;
  u.lang = "ja-JP";
  const p = PROFILE[next.state];
  const femaleFallback = voice && FEMALE_HINT.test(voice.name);
  u.pitch = femaleFallback ? Math.max(0.7, p.pitch - 0.2) : p.pitch;
  u.rate = Math.min(2, p.rate);
  u.volume = Math.max(0.01, seVolume);
  u.onstart = () => {
    if (held !== u) return;
    begun = true;
    logTts("utterance onstart", { id: next.id, text: next.text });
    window.clearTimeout(startWatch);
    startWatch = 0;
    endWatch = window.setTimeout(() => finish(u, true), lineBudgetMs(next.text, u.rate));
    notify();
  };
  u.onend = () => finish(u, false);
  u.onerror = (ev) => {
    if (held !== u) return;
    const err = "error" in ev ? String(ev.error) : "";
    logTts("utterance onerror", { id: next.id, error: err, text: next.text });
    if (err === "not-allowed") {
      queueMe();
      return;
    }
    if (err === "interrupted" || err === "canceled") {
      finish(u, false);
      return;
    }
    if (tries < MAX_START_TRIES) {
      held = null;
      window.setTimeout(() => {
        if (job?.id === next.id) start(next, tries + 1);
      }, 80);
      return;
    }
    queueMe();
  };

  kickResume();
  try {
    logTts("speechSynthesis.speak call", {
      id: next.id,
      text: next.text,
      voice: voice?.name ?? null,
      voiceURI: voice?.voiceURI ?? null,
      voiceLang: voice?.lang ?? null,
      volume: u.volume,
      rate: u.rate,
      pitch: u.pitch,
    });
    speechSynthesis.speak(u);
  } catch {
    logTts("speechSynthesis.speak throw", { id: next.id, text: next.text });
    queueMe();
    return;
  }

  startWatch = window.setTimeout(() => {
    if (held !== u) return;
    kickResume();
    if (begun) return;
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      logTts("start watch still pending", { id: next.id, text: next.text });
      startWatch = window.setTimeout(() => {
        if (held !== u || begun) return;
        logTts("start watch queue retry", { id: next.id, text: next.text });
        queueMe();
      }, START_WATCH_MS);
      return;
    }
    if (tries < MAX_START_TRIES) {
      held = null;
      logTts("start retry", { id: next.id, nextTry: tries + 1, text: next.text });
      start(next, tries + 1);
      return;
    }
    queueMe();
  }, START_WATCH_MS);
}

/** 再生中は切らない。次のセリフは1件だけ待ち、常に最新の内容へ置き換える。 */
export function speak(text: string, state: CharacterState, onend: () => void): void {
  const next: Job = { text, state, onend, id: ++jobId };
  logTts("speak request", { id: next.id, state, text });
  if (staleReset) {
    pending = next;
    logTts("replace stale reset pending", { id: next.id, state, text });
    return;
  }
  if (job) {
    pending = next;
    logTts("replace pending", { id: next.id, state, text, currentJobId: job.id });
    return;
  }
  if (!canStartNow()) {
    waitForGesture(next);
    return;
  }
  if (browserHasStaleSpeech()) {
    resetStaleSpeechThenStart(next);
    return;
  }
  start(next);
}
