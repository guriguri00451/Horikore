/** One live stream for the page. Re-requesting after stop() hangs in Safari when already granted. */
let streamP: Promise<MediaStream> | null = null;
const FIRST_GESTURE_EVENTS = ["pointerdown", "pointerup", "click", "touchend", "keydown"] as const;

export function acquireMic(): Promise<MediaStream> {
  if (!streamP) {
    streamP = navigator.mediaDevices.getUserMedia({ audio: true }).catch((err) => {
      streamP = null;
      throw err;
    });
  }
  return streamP;
}

export function resumeAudio(ctx: AudioContext): void {
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
}

export function onAudioUnlock(ctx: AudioContext): () => void {
  const kick = () => resumeAudio(ctx);
  kick();
  FIRST_GESTURE_EVENTS.forEach((event) => window.addEventListener(event, kick, true));
  const onState = () => resumeAudio(ctx);
  ctx.addEventListener("statechange", onState);
  return () => {
    FIRST_GESTURE_EVENTS.forEach((event) => window.removeEventListener(event, kick, true));
    ctx.removeEventListener("statechange", onState);
  };
}

export function onFirstGesture(fn: () => void): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    off();
    fn();
  };
  const off = () => {
    FIRST_GESTURE_EVENTS.forEach((event) => window.removeEventListener(event, run, true));
  };
  FIRST_GESTURE_EVENTS.forEach((event) => window.addEventListener(event, run, true));
  return off;
}
