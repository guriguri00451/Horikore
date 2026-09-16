import { foldSpeech, hitAngry, hitKuiya, hitName } from "./keywords";

export type HeardHit = "angry" | "name" | "kuiya" | null;

export type Heard = {
  text: string;
  echo: boolean;
  hit: HeardHit;
};

type Handlers = {
  onName: () => void;
  onKuiya: () => void;
  onAngry: () => void;
  onHeard?: (heard: Heard) => void;
  onStatus?: (status: string) => void;
};

const FATAL = new Set(["network", "not-allowed", "service-not-allowed", "audio-capture"]);

let rec: SpeechRecognition | null = null;
let stopped = true;
let hold = false;
let echo = "";

/** Chromium は TTS と SpeechRecognition が同じエンジンを奪い合う。 */
export function holdRecognition(on: boolean): void {
  if (hold === on) return;
  hold = on;
  if (!rec || stopped) return;
  try {
    if (on) rec.stop();
    else rec.start();
  } catch {
    /* already in that state */
  }
}

/** 発話中にスピーカー→マイクで自分のセリフを拾わない。 */
export function setSpokenLine(text: string | null): void {
  echo = text ? foldSpeech(text) : "";
}

export function ownVoice(hay: string): boolean {
  if (!echo) return false;
  const t = foldSpeech(hay);
  if (!t) return false;
  if (echo.includes(t)) return true;
  if (!t.includes(echo)) return false;
  const rest = t.replace(echo, "");
  return !hitAngry(rest) && !hitKuiya(rest) && !hitName(rest);
}

function ingest(
  hay: string,
  handlers: Handlers,
  clocks: { lastName: number; lastKuiya: number; lastAngry: number },
): HeardHit {
  const echoHit = ownVoice(hay);
  const now = performance.now();
  let hit: HeardHit = null;
  if (!echoHit && hitAngry(hay) && now - clocks.lastAngry > 2500) {
    clocks.lastAngry = now;
    hit = "angry";
    handlers.onAngry();
  } else if (!echoHit && hitKuiya(hay) && now - clocks.lastKuiya > 1800) {
    clocks.lastKuiya = now;
    hit = "kuiya";
    handlers.onKuiya();
  } else if (!echoHit && hitName(hay) && now - clocks.lastName > 1800) {
    clocks.lastName = now;
    hit = "name";
    handlers.onName();
  }
  if (hay) handlers.onHeard?.({ text: hay, echo: echoHit, hit });
  return hit;
}

export function startRecognition(handlers: Handlers): () => void {
  stopped = false;
  const clocks = { lastName: 0, lastKuiya: 0, lastAngry: 0 };

  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) {
    handlers.onStatus?.("このブラウザは音声認識非対応");
    return () => {
      stopped = true;
    };
  }

  const instance = new Ctor();
  rec = instance;
  instance.continuous = true;
  instance.interimResults = true;
  instance.lang = "ja-JP";
  let running = false;
  let fatal = false;
  let seen = 0;
  let retry = 0;

  const status = (s: string) => handlers.onStatus?.(s);

  const kick = () => {
    if (stopped || running || fatal || hold) return;
    try {
      instance.start();
    } catch (err) {
      status(`start失敗 ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  instance.onstart = () => {
    running = true;
    status("聞いてる");
  };
  instance.onaudiostart = () => status("聞いてる");
  instance.onspeechstart = () => status("発話を検出");
  instance.onerror = (ev) => {
    const err = ev.error;
    if (err === "no-speech" || err === "aborted") return;
    if (FATAL.has(err)) {
      fatal = true;
      status(`認識停止 ${err}`);
      return;
    }
    status(`エラー ${err}`);
  };
  instance.onresult = (ev) => {
    let hay = "";
    for (let i = seen; i < ev.results.length; i++) {
      hay += ev.results[i]![0]!.transcript;
    }
    const hit = ingest(hay, handlers, clocks);
    if (hit === "angry") {
      for (let i = seen; i < ev.results.length; i++) {
        if (!ev.results[i]!.isFinal) break;
        seen = i + 1;
      }
      seen = ev.results.length;
    } else if (hit === "name" || hit === "kuiya") {
      for (let i = seen; i < ev.results.length; i++) {
        if (!ev.results[i]!.isFinal) break;
        seen = i + 1;
      }
    }
  };
  instance.onend = () => {
    running = false;
    seen = 0;
    if (!stopped && !fatal && !hold) retry = window.setTimeout(kick, 120);
  };

  kick();
  status("認識を起動…");

  return () => {
    stopped = true;
    window.clearTimeout(retry);
    instance.onend = null;
    instance.onresult = null;
    instance.onstart = null;
    instance.onerror = null;
    instance.onaudiostart = null;
    instance.onspeechstart = null;
    try {
      instance.stop();
    } catch {
      /* ignore */
    }
    if (rec === instance) rec = null;
  };
}
