import { useEffect, useRef, useState } from "react";
import { startPlaza, type Plaza } from "../audio/bgm";
import { acquireMic, onAudioUnlock, onFirstGesture, resumeAudio } from "../audio/mic";
import { startRecognition, type Heard } from "../audio/speechIn";
import { rmsFromAnalyser, cosineSim, spectrumFromAnalyser } from "../audio/spectrum";
import { isSpeechUnlocked, onSpeechUnlock, setSeVolume, speak } from "../audio/tts";
import { debugLog } from "../debug/log";
import { createMachine } from "../machine/createMachine";
import type { CharacterState, MachineSnapshot } from "../machine/types";
import { loadBgmVolume, loadSeVolume, saveBgmVolume, saveSeVolume } from "../persist/audioPrefs";
import { clearSpectrum, loadSpectrum, saveSpectrum } from "../persist/sampleStore";
import { Scene } from "../scene/Scene";
import { Hud } from "./Hud";
import { Settings } from "./Settings";

const MATCH = 0.88;
/** 爆睡からの起こし。会話では足りず、拍手や叫びくらい。 */
const LOUD = 0.32;
/** うとうと中は声でも起きる。 */
const NODDING_LOUD = 0.12;

export function App() {
  const machineRef = useRef<ReturnType<typeof createMachine> | null>(null);
  if (!machineRef.current) machineRef.current = createMachine();
  const machine = machineRef.current;
  const [snap, setSnap] = useState<MachineSnapshot>(machine.get());
  const [mic, setMic] = useState<"pending" | "ok" | "denied">("pending");
  const [hasSample, setHasSample] = useState(false);
  const [recording, setRecording] = useState(false);
  const [ttsReady, setTtsReady] = useState(isSpeechUnlocked);
  const [bgmVolume, setBgmVolume] = useState(loadBgmVolume);
  const [seVolume, setSeVol] = useState(loadSeVolume);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [heardStatus, setHeardStatus] = useState("（画面クリックで開始）");
  const [heard, setHeard] = useState<Heard | null>(null);
  const sample = useRef<Float32Array | null>(null);
  const recFlag = useRef(false);
  const recAccum = useRef<Float32Array | null>(null);
  const recFrames = useRef(0);
  const plazaRef = useRef<Plaza | null>(null);
  const bgmVolRef = useRef(bgmVolume);
  bgmVolRef.current = bgmVolume;

  useEffect(() => {
    return machine.subscribe(setSnap);
  }, [machine]);

  useEffect(() => {
    return onSpeechUnlock(() => setTtsReady(isSpeechUnlocked()));
  }, []);

  useEffect(() => {
    plazaRef.current?.setMood(snap.state);
    plazaRef.current?.setSpeaking(snap.speaking);
  }, [snap.state, snap.speaking]);

  useEffect(() => {
    const id = window.setInterval(() => machine.dispatch({ type: "tick", now: performance.now() }), 250);
    return () => window.clearInterval(id);
  }, [machine]);

  useEffect(() => {
    let spoken = 0;
    const off = machine.subscribe((next) => {
      debugLog("app", "machine snapshot for speech", {
        state: next.state,
        lineId: next.lineId,
        speaking: next.speaking,
        text: next.line,
        lastSpoken: spoken,
      });
      if (!next.line || !next.speaking || next.lineId === spoken) {
        debugLog("app", "skip speak", {
          reason: !next.line ? "no line" : !next.speaking ? "not speaking" : "already spoken",
          lineId: next.lineId,
          text: next.line,
        });
        return;
      }
      spoken = next.lineId;
      const lineId = next.lineId;
      debugLog("app", "call speak", { state: next.state, lineId, text: next.line });
      speak(next.line, next.state, () => {
        debugLog("app", "speak callback", { lineId, currentLineId: machine.get().lineId, text: next.line });
        if (machine.get().lineId === lineId) machine.dispatch({ type: "activityEnd" });
      });
    });
    return off;
  }, [machine]);

  useEffect(() => {
    let stopRec: () => void = () => undefined;
    let recDelay = 0;
    let offUnlock: () => void = () => undefined;
    let offGesture: () => void = () => undefined;
    let raf = 0;
    let ctx: AudioContext | undefined;
    let cancelled = false;

    void loadSpectrum().then((stored) => {
      if (cancelled || !stored) return;
      sample.current = stored;
      setHasSample(true);
    });

    const wireMic = async () => {
      try {
        const stream = await acquireMic();
        if (cancelled || !ctx || ctx.state === "closed") return;
        setMic("ok");
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const freq = new Uint8Array(analyser.frequencyBinCount);
        const time = new Uint8Array(analyser.fftSize);
        let lastInstrument = 0;
        let lastLoud = 0;

        const loop = () => {
          raf = requestAnimationFrame(loop);
          const spec = spectrumFromAnalyser(analyser, freq);
          const energy = spec.reduce((a, b) => a + b, 0) / spec.length;
          if (recFlag.current) {
            if (!recAccum.current) recAccum.current = new Float32Array(spec.length);
            for (let i = 0; i < spec.length; i++) recAccum.current[i] += spec[i]!;
            recFrames.current += 1;
          }
          const now = performance.now();
          const ref = sample.current;
          if (ref && energy > 0.08 && cosineSim(spec, ref) >= MATCH && now - lastInstrument > 2000) {
            lastInstrument = now;
            machine.dispatch({ type: "instrument" });
          }
          const live = machine.get();
          const loudMin = live.state === "nodding" ? NODDING_LOUD : LOUD;
          if (
            !live.speaking &&
            rmsFromAnalyser(analyser, time) >= loudMin &&
            now - lastLoud > 1200
          ) {
            lastLoud = now;
            machine.dispatch({ type: "loud" });
          }
        };
        loop();
      } catch {
        if (!cancelled) setMic("denied");
      }
    };

    const recHandlers = {
      onName: () => machine.dispatch({ type: "name" }),
      onKuiya: () => machine.dispatch({ type: "kuiya" }),
      onAngry: () => machine.dispatch({ type: "angryKw" }),
      onHeard: (next: Heard) => setHeard(next),
      onStatus: (status: string) => setHeardStatus(status),
    };

    let booted = false;
    const boot = () => {
      if (cancelled || booted) return;
      booted = true;
      recDelay = window.setTimeout(() => {
        if (cancelled) return;
        stopRec = startRecognition(recHandlers);
      }, 2500);
      ctx = new AudioContext();
      resumeAudio(ctx);
      offUnlock = onAudioUnlock(ctx);
      const plaza = startPlaza(ctx);
      plaza.setVolume(bgmVolRef.current);
      plaza.setMood(machine.get().state);
      plaza.setSpeaking(machine.get().speaking);
      plazaRef.current = plaza;
      void wireMic();
    };

    offGesture = onFirstGesture(boot);
    if (navigator.userActivation?.isActive) boot();

    return () => {
      cancelled = true;
      offGesture();
      window.clearTimeout(recDelay);
      stopRec();
      offUnlock();
      cancelAnimationFrame(raf);
      plazaRef.current?.stop();
      plazaRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, [machine, startPlaza]);

  const onBgmVolume = (value: number) => {
    bgmVolRef.current = value;
    setBgmVolume(value);
    saveBgmVolume(value);
    plazaRef.current?.setVolume(value);
  };

  const onSeVolume = (value: number) => {
    setSeVol(value);
    saveSeVolume(value);
    setSeVolume(value);
  };

  const onClearSample = () => {
    sample.current = null;
    setHasSample(false);
    void clearSpectrum();
  };

  const onRecord = () => {
    recFlag.current = true;
    recAccum.current = null;
    recFrames.current = 0;
    setRecording(true);
    plazaRef.current?.setHeld(true);
    window.setTimeout(() => {
      recFlag.current = false;
      setRecording(false);
      plazaRef.current?.setHeld(false);
      const acc = recAccum.current;
      const n = recFrames.current;
      if (!acc || n < 8) return;
      const bins = new Float32Array(acc.length);
      for (let i = 0; i < acc.length; i++) bins[i] = acc[i]! / n;
      sample.current = bins;
      setHasSample(true);
      void saveSpectrum(bins);
    }, 1800);
  };

  return (
    <>
      <Scene
        state={snap.state}
        line={snap.speaking ? snap.line : null}
        lineId={snap.lineId}
        petting={snap.petting}
        onPoke={() => machine.dispatch({ type: "poke" })}
        onPet={(active) => machine.dispatch({ type: "pet", active })}
        onHitDone={(lineId) => machine.dispatch({ type: "hitDone", lineId })}
      />
      <Hud
        state={snap.state}
        mic={mic}
        denied={mic === "denied"}
        ttsReady={ttsReady}
        getSleepGauge={machine.sleepGauge}
        heardStatus={heardStatus}
        heard={heard}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mic={mic}
        hasSample={hasSample}
        recording={recording}
        bgmVolume={bgmVolume}
        seVolume={seVolume}
        onDebug={(s: CharacterState) => machine.dispatch({ type: "debug", state: s })}
        onRecord={onRecord}
        onClearSample={onClearSample}
        onBgmVolume={onBgmVolume}
        onSeVolume={onSeVolume}
      />
    </>
  );
}
