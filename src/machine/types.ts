export type CharacterState =
  | "awake"
  | "nodding"
  | "called"
  | "angry"
  | "workout"
  | "beauty"
  | "sleeping"
  | "hit";

export type MachineEvent =
  | { type: "tick"; now: number }
  | { type: "name" }
  | { type: "kuiya" }
  | { type: "angryKw" }
  | { type: "instrument" }
  | { type: "loud" }
  | { type: "poke" }
  | { type: "pet"; active: boolean }
  | { type: "hitDone"; lineId: number }
  | { type: "activityEnd" }
  | { type: "debug"; state: CharacterState };

export type MachineSnapshot = {
  state: CharacterState;
  line: string | null;
  lineId: number;
  speaking: boolean;
  petting: boolean;
};

export type SleepPhase = "awake" | "nodding" | "sleeping" | "paused";

/** 起き続け〜爆睡までの一本バー。Called 等は Awake 復帰でタイマーが戻るので fill 0。 */
export type SleepGauge = {
  fill: number;
  noddingMark: number;
  remainSec: number | null;
  phase: SleepPhase;
};
