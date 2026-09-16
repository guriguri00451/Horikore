import { debugLog } from "../debug/log";
import { TIMING } from "./constants";
import { busyReply, KUIYA_LINE, lineForEnter } from "./lines";
import type { CharacterState, MachineEvent, MachineSnapshot, SleepGauge } from "./types";

const SLEEP_SPAN_MS = TIMING.noddingAfterMs + TIMING.deepSleepMs;
const NODDING_MARK = TIMING.noddingAfterMs / SLEEP_SPAN_MS;

type Listener = (snap: MachineSnapshot) => void;

/** たまに来たら寝てる／セット中、みたいな部屋の出会い。起きてることが多い。 */
function pickVisitState(): CharacterState {
  const r = Math.random();
  if (r < 0.22) return "sleeping";
  if (r < 0.35) return "nodding";
  if (r < 0.41) return "workout";
  if (r < 0.45) return "beauty";
  return "awake";
}

export function createMachine(boot = performance.now()) {
  let state: CharacterState = "awake";
  let line: string | null = null;
  let lineId = 0;
  let speaking = false;
  let awakeStarted = boot;
  let activityEnds = 0;
  let lastWorkoutSlot = -1;
  let lastBeautySlot = -1;
  let lastMutter = boot;
  let fromSleep = false;
  let resumeAfterHit: CharacterState = "awake";
  let hitAnimDone = false;
  let petting = false;
  let petMs = 0;
  let petNodMs = 0;
  let lastNow = boot;
  const listeners = new Set<Listener>();

  function emit() {
    const snap: MachineSnapshot = { state, line, lineId, speaking, petting };
    listeners.forEach((fn) => fn(snap));
  }

  function say(text: string | null, isSpeaking = Boolean(text)) {
    line = text;
    speaking = isSpeaking;
    if (text) {
      lineId += 1;
      lastMutter = performance.now();
    }
    debugLog("machine", "say", { state, lineId, speaking, text });
  }

  function enter(next: CharacterState, text?: string | null) {
    const woken = fromSleep && next === "awake";
    fromSleep = next === "sleeping";
    state = next;
    if (next === "awake") {
      awakeStarted = performance.now();
      petMs = 0;
      petNodMs = 0;
    }
    if (next === "nodding") petNodMs = 0;
    if (next === "sleeping") {
      petMs = 0;
      petNodMs = 0;
    }
    if (next === "workout") activityEnds = performance.now() + TIMING.workoutMs;
    if (next === "beauty") activityEnds = performance.now() + TIMING.beautyMs;
    if (next === "called" || next === "angry" || next === "hit") activityEnds = 0;
    const nextLine = text === undefined ? lineForEnter(next, woken) : text;
    say(nextLine, Boolean(nextLine));
    emit();
  }

  function canSchedule() {
    return state === "awake";
  }

  function sleepGauge(now = performance.now()): SleepGauge {
    if (state === "sleeping") {
      return { fill: 1, noddingMark: NODDING_MARK, remainSec: null, phase: "sleeping" };
    }
    if (state === "nodding") {
      return {
        fill: (TIMING.noddingAfterMs + Math.min(petNodMs, TIMING.deepSleepMs)) / SLEEP_SPAN_MS,
        noddingMark: NODDING_MARK,
        remainSec: Math.max(0, TIMING.deepSleepMs - petNodMs) / 1000,
        phase: "nodding",
      };
    }
    if (state === "awake") {
      const elapsed = Math.max(petMs, now - awakeStarted);
      return {
        fill: Math.min(elapsed, TIMING.noddingAfterMs) / SLEEP_SPAN_MS,
        noddingMark: NODDING_MARK,
        remainSec: Math.max(0, TIMING.noddingAfterMs - elapsed) / 1000,
        phase: "awake",
      };
    }
    return { fill: 0, noddingMark: NODDING_MARK, remainSec: null, phase: "paused" };
  }

  function poke() {
    if (state !== "hit") resumeAfterHit = state;
    fromSleep = false;
    hitAnimDone = false;
    state = "hit";
    say(lineForEnter("hit"), true);
    emit();
  }

  function leaveHit() {
    const resume = resumeAfterHit;
    resumeAfterHit = "awake";
    hitAnimDone = false;
    if (resume === "workout" || resume === "beauty" || resume === "nodding") {
      state = resume;
      say(null, false);
      emit();
      return;
    }
    enter("awake", null);
  }

  function apply(event: MachineEvent) {
    if (event.type !== "tick") {
      debugLog("machine", "event", { type: event.type, state, lineId, speaking, line });
    }

    if (event.type === "debug") {
      if (event.state === "hit") poke();
      else enter(event.state);
      return;
    }

    if (event.type === "poke") {
      poke();
      return;
    }

    if (event.type === "pet") {
      petting = event.active;
      emit();
      return;
    }

    if (event.type === "hitDone") {
      if (state !== "hit" || event.lineId !== lineId) return;
      hitAnimDone = true;
      if (!speaking) leaveHit();
      return;
    }

    if (event.type === "instrument") {
      if (state === "awake" || state === "nodding") enter("sleeping");
      return;
    }

    if (event.type === "loud") {
      if (state === "sleeping" || state === "nodding") {
        enter("awake", lineForEnter("awake", true));
      }
      return;
    }

    if (event.type === "angryKw") {
      if (state !== "sleeping" && state !== "angry") enter("angry");
      return;
    }

    if (event.type === "name") {
      if (state === "sleeping") {
        enter("awake", lineForEnter("awake", true));
        return;
      }
      if (state === "awake" || state === "nodding") enter("called");
      else if (state === "workout" || state === "beauty") {
        say(busyReply(state), true);
        emit();
      }
      return;
    }

    if (event.type === "kuiya") {
      if (state === "workout" || state === "beauty") {
        say(KUIYA_LINE, true);
        emit();
        return;
      }
      enter("called", KUIYA_LINE);
      return;
    }

    if (event.type === "activityEnd") {
      if (state === "called" || state === "angry") {
        enter("awake", null);
        return;
      }
      speaking = false;
      line = null;
      emit();
      if (state === "hit" && hitAnimDone) leaveHit();
      return;
    }

    if (event.type === "tick") {
      const { now } = event;
      const dt = Math.min(300, Math.max(0, now - lastNow));
      lastNow = now;
      if (petting && state !== "sleeping") {
        if (state === "nodding") {
          petNodMs += dt;
          if (petNodMs >= TIMING.deepSleepMs) {
            enter("sleeping");
            return;
          }
        } else {
          petMs += dt;
          if (petMs >= TIMING.noddingAfterMs) {
            enter("nodding");
            return;
          }
        }
      }
      if ((state === "workout" || state === "beauty") && now >= activityEnds) {
        enter("awake", null);
        return;
      }
      if (state === "nodding" && now - lastMutter >= TIMING.noddingMutterEveryMs) {
        lastMutter = now;
        say(lineForEnter("nodding"), true);
        emit();
        return;
      }
      if (!canSchedule()) return;
      if (now - lastMutter >= TIMING.mutterEveryMs) {
        lastMutter = now;
        say(lineForEnter("awake"), true);
        emit();
        return;
      }

      const workoutSlot = Math.floor((now - boot) / TIMING.workoutEveryMs);
      const beautySlot = Math.floor((now - boot) / TIMING.beautyEveryMs);
      if (workoutSlot > 0 && workoutSlot > lastWorkoutSlot) {
        lastWorkoutSlot = workoutSlot;
        enter("workout");
        return;
      }
      if (beautySlot > 0 && beautySlot > lastBeautySlot) {
        lastBeautySlot = beautySlot;
        enter("beauty");
        return;
      }
      if (now - awakeStarted >= TIMING.noddingAfterMs) {
        enter("nodding");
      }
    }
  }

  enter(pickVisitState());

  return {
    get: (): MachineSnapshot => ({ state, line, lineId, speaking, petting }),
    sleepGauge,
    dispatch: apply,
    subscribe(fn: Listener) {
      listeners.add(fn);
      fn({ state, line, lineId, speaking, petting });
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type Machine = ReturnType<typeof createMachine>;
