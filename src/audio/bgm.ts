/** トモコレの部屋／Wii顔広場の気が抜けるループ。任天堂曲は使わない。 */
import type { CharacterState } from "../machine/types";

const BPM = 92;
const STEPS = 8;
const BARS = 16;
const STEP = 60 / BPM / 2;
const SWING = 0.07;
const MASTER = 1;

/** F F | C C | Dm Dm | Bb Bb | F F | Am Am | Bb Bb | C C */
const CHORDS: [number, number, number][] = [
  [53, 57, 60],
  [53, 57, 60],
  [48, 52, 55],
  [48, 52, 55],
  [50, 53, 57],
  [50, 53, 57],
  [46, 50, 53],
  [46, 50, 53],
  [53, 57, 60],
  [53, 57, 60],
  [45, 48, 52],
  [45, 48, 52],
  [46, 50, 53],
  [46, 50, 53],
  [48, 52, 55],
  [48, 52, 55],
];

const BASS = [
  41, 41, 48, 45, 41, 48, 41, 43, 36, 36, 43, 38, 36, 43, 36, 40, 38, 38, 45, 41, 38, 45, 38, 43, 34, 41, 34, 38, 34, 41,
  36, 43, 41, 48, 41, 45, 41, 48, 43, 45, 45, 40, 45, 48, 45, 52, 48, 43, 34, 41, 46, 43, 34, 41, 38, 43, 36, 43, 38, 43,
  36, 40, 43, 45,
];

/** 8ths. 0 = rest. F major, loops onto the opening C5. */
const MELODY = [
  72, 0, 69, 0, 65, 0, 69, 72, 74, 0, 72, 69, 0, 65, 0, 0, 67, 0, 72, 0, 76, 0, 72, 67, 69, 0, 67, 65, 64, 0, 0, 0, 69,
  0, 72, 0, 74, 0, 72, 69, 65, 0, 69, 0, 0, 0, 0, 0, 70, 0, 69, 0, 65, 62, 65, 0, 67, 0, 65, 0, 0, 0, 64, 0, 72, 0, 77,
  0, 76, 74, 72, 0, 69, 0, 72, 0, 65, 0, 0, 0, 72, 0, 76, 0, 77, 0, 76, 72, 69, 0, 64, 0, 0, 0, 0, 0, 70, 0, 72, 74, 0,
  72, 70, 0, 69, 0, 65, 0, 0, 0, 0, 0, 67, 0, 69, 0, 72, 0, 74, 76, 77, 0, 72, 0, 0, 0, 69, 0,
];

export type Plaza = {
  setMood: (state: CharacterState) => void;
  setSpeaking: (on: boolean) => void;
  setVolume: (value: number) => void;
  setHeld: (on: boolean) => void;
  stop: () => void;
};

function mtof(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  const p = g.gain;
  p.cancelScheduledValues(t);
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  p.exponentialRampToValueAtTime(0.0001, t + decay);
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const n = ctx.sampleRate;
  const buf = ctx.createBuffer(1, n, n);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function makeImpulse(ctx: AudioContext): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * 1.35);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2.6;
  }
  return buf;
}

function tap(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, t: number, gain: number, dur: number, hp: number): void {
  const src = ctx.createBufferSource();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = noise;
  f.type = "highpass";
  f.frequency.value = hp;
  env(g, t, gain, 0.004, dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function marimba(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, midi: number, t: number, vel: number, dur: number): void {
  const f = mtof(midi);
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const body = ctx.createOscillator();
  const modG = ctx.createGain();
  const mix = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  car.type = "sine";
  mod.type = "sine";
  body.type = "triangle";
  car.frequency.value = f;
  body.frequency.value = f;
  mod.frequency.value = f * 2.015;
  modG.gain.setValueAtTime(f * 2.1 * vel, t);
  modG.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  hp.type = "highpass";
  hp.frequency.value = 140;
  env(mix, t, 0.42 * vel, 0.006, dur);
  const bodyG = ctx.createGain();
  env(bodyG, t, 0.1 * vel, 0.01, dur * 0.85);
  mod.connect(modG);
  modG.connect(car.frequency);
  car.connect(hp);
  hp.connect(mix);
  mix.connect(dest);
  body.connect(bodyG);
  bodyG.connect(dest);
  tap(ctx, dest, noise, t, 0.03 * vel, 0.04, 1800);
  car.start(t);
  mod.start(t);
  body.start(t);
  car.stop(t + dur + 0.04);
  mod.stop(t + dur + 0.04);
  body.stop(t + dur + 0.04);
}

function bass(ctx: AudioContext, dest: AudioNode, midi: number, t: number, vel: number): void {
  const f = mtof(midi);
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  a.type = "sine";
  b.type = "sine";
  a.frequency.value = f;
  b.frequency.value = f * 2;
  lp.type = "lowpass";
  lp.frequency.value = 520;
  lp.Q.value = 0.7;
  const g2 = ctx.createGain();
  env(g, t, 0.55 * vel, 0.012, 0.95);
  env(g2, t, 0.09 * vel, 0.012, 0.45);
  a.connect(lp);
  lp.connect(g);
  g.connect(dest);
  b.connect(g2);
  g2.connect(dest);
  a.start(t);
  b.start(t);
  a.stop(t + 1.05);
  b.stop(t + 0.55);
}

function bell(ctx: AudioContext, dest: AudioNode, midi: number, t: number, vel: number): void {
  const f = mtof(midi);
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  const g2 = ctx.createGain();
  o.type = "sine";
  o2.type = "sine";
  o.frequency.value = f;
  o2.frequency.value = f * 2.003;
  env(g, t, 0.16 * vel, 0.004, 1.1);
  env(g2, t, 0.04 * vel, 0.004, 0.55);
  o.connect(g);
  g.connect(dest);
  o2.connect(g2);
  g2.connect(dest);
  o.start(t);
  o2.start(t);
  o.stop(t + 1.15);
  o2.stop(t + 0.6);
}

function wood(ctx: AudioContext, dest: AudioNode, t: number, vel: number): void {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o2.type = "sine";
  o.frequency.value = 890;
  o2.frequency.value = 1480;
  env(g, t, 0.08 * vel, 0.002, 0.07);
  const g2 = ctx.createGain();
  env(g2, t, 0.02 * vel, 0.002, 0.05);
  o.connect(g);
  g.connect(dest);
  o2.connect(g2);
  g2.connect(dest);
  o.start(t);
  o2.start(t);
  o.stop(t + 0.09);
  o2.stop(t + 0.07);
}

function pad(ctx: AudioContext, dest: AudioNode, chord: [number, number, number], t: number, dur: number, vel: number): void {
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = mtof(chord[i]! - 12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * vel * (i === 0 ? 1.1 : 0.7), t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

function ramp(param: AudioParam, value: number, now: number, sec = 0.12): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + sec);
}

export function startPlaza(ctx: AudioContext): Plaza {
  const noise = makeNoise(ctx);
  const bus = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const duck = ctx.createGain();
  const mute = ctx.createGain();
  const userVol = ctx.createGain();
  const master = ctx.createGain();
  const wet = ctx.createGain();
  const conv = ctx.createConvolver();
  const melG = ctx.createGain();
  const percG = ctx.createGain();
  filter.type = "lowpass";
  filter.frequency.value = 9000;
  filter.Q.value = 0.4;
  duck.gain.value = 1;
  mute.gain.value = 1;
  userVol.gain.value = 1;
  master.gain.value = MASTER;
  wet.gain.value = 0.22;
  melG.gain.value = 1;
  percG.gain.value = 1;
  conv.buffer = makeImpulse(ctx);
  bus.connect(filter);
  filter.connect(duck);
  duck.connect(mute);
  mute.connect(userVol);
  userVol.connect(master);
  userVol.connect(wet);
  wet.connect(conv);
  conv.connect(master);
  master.connect(ctx.destination);
  melG.connect(bus);
  percG.connect(bus);

  let step = 0;
  let next = ctx.currentTime + 0.06;
  let sleeping = false;
  let held = false;
  let timer = 0;
  let stopped = false;

  const applyMute = () => {
    ramp(mute.gain, held ? 0 : 1, ctx.currentTime, 0.08);
  };

  const tick = () => {
    if (stopped) return;
    const horizon = ctx.currentTime + 0.18;
    if (next < ctx.currentTime - 0.08) next = ctx.currentTime;
    while (next < horizon) {
      const bar = Math.floor(step / STEPS) % BARS;
      const st = step % STEPS;
      const t = next + (st % 2 === 1 ? STEP * SWING : 0);
      const chord = CHORDS[bar]!;
      const vel = sleeping ? 0.55 : 1;

      if (st === 0 || st === 2 || st === 4 || st === 6) {
        const note = BASS[bar * 4 + (st >> 1)]!;
        bass(ctx, bus, note, t, vel * (st === 0 ? 1 : 0.78));
      }
      if (st === 0 && bar % 2 === 0) pad(ctx, bus, chord, t, STEP * STEPS * 2 + 0.2, vel * 0.85);
      if (st === 2 || st === 6) marimba(ctx, bus, noise, chord[st === 2 ? 1 : 2]!, t, vel * 0.3, 0.62);
      if (st === 0) bell(ctx, bus, chord[2]! + 24, t, vel * 0.5);
      if (st === 4) bell(ctx, bus, chord[1]! + 24, t, vel * 0.35);
      const m = MELODY[bar * STEPS + st]!;
      if (m) marimba(ctx, melG, noise, m, t, vel * 0.95, 0.85);
      if (st === 2 || st === 6) wood(ctx, percG, t, vel * (st === 6 ? 0.7 : 0.45));

      next += STEP;
      step += 1;
    }
  };

  timer = window.setInterval(tick, 40);
  tick();

  return {
    setMood(state) {
      const now = ctx.currentTime;
      sleeping = state === "sleeping";
      const nodding = state === "nodding";
      ramp(filter.frequency, sleeping ? 1200 : nodding ? 2800 : 9000, now, 0.45);
      ramp(melG.gain, sleeping ? 0 : nodding ? 0.45 : 1, now, 0.3);
      ramp(percG.gain, sleeping || nodding ? 0 : 1, now, 0.25);
      ramp(master.gain, MASTER * (sleeping ? 0.55 : nodding ? 0.8 : 1), now, 0.4);
    },
    setSpeaking(on) {
      ramp(duck.gain, on ? 0.22 : 1, ctx.currentTime, 0.09);
    },
    setVolume(value) {
      const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
      ramp(userVol.gain, v, ctx.currentTime, 0.05);
    },
    setHeld(on) {
      held = on;
      applyMute();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      try {
        master.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}
