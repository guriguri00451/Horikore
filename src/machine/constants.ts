export const TIMING = {
  noddingAfterMs: 7_000,
  deepSleepMs: 10_000,
  workoutEveryMs: 180_000,
  workoutMs: 20_000,
  beautyEveryMs: 300_000,
  beautyMs: 15_000,
  mutterEveryMs: 45_000,
  noddingMutterEveryMs: 20_000,
} as const;

export const NAMES = ["堀大輔", "大輔", "ホリ", "ほりだいすけ", "だいすけ"] as const;

/** 音声認識のゆれ込み。 */
export const KUIYA_NAMES = ["クイヤ", "くいや", "クイア", "くいあ", "クィア", "くぃあ", "クリア", "くりあ"] as const;

export const ANGRY_PHRASES = [
  "寝た方がいいんじゃないですか",
  "寝たほうがいいんじゃないですか",
  "寝た方がいい",
  "寝たほうがいい",
  "睡眠不足",
  "寝なさい",
  "寝ろ",
  "ねたほうがいい",
] as const;
