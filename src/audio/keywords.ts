import { ANGRY_PHRASES, KUIYA_NAMES, NAMES } from "../machine/constants";

const SMALL_VOWEL: Record<string, string> = {
  ぁ: "あ",
  ぃ: "い",
  ぅ: "う",
  ぇ: "え",
  ぉ: "お",
  ァ: "ア",
  ィ: "イ",
  ゥ: "ウ",
  ェ: "エ",
  ォ: "オ",
};

/** 音声認識は「方が」「良い」をひらがな寄りに出すことが多い。 */
export function foldSpeech(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s\u3000]/g, "")
    .replace(/[、。．，.？?！!〜~・]/g, "")
    .replace(/[ぁぃぅぇぉァィゥェォ]/g, (ch) => SMALL_VOWEL[ch] ?? ch)
    .replace(/方が/g, "ほうが")
    .replace(/良い|よい/g, "いい");
}

export function hitName(text: string): boolean {
  const t = foldSpeech(text);
  return NAMES.some((n) => t.includes(foldSpeech(n)));
}

export function hitKuiya(text: string): boolean {
  const t = foldSpeech(text);
  return KUIYA_NAMES.some((n) => t.includes(foldSpeech(n)));
}

export function hitAngry(text: string): boolean {
  const t = foldSpeech(text);
  return ANGRY_PHRASES.some((p) => t.includes(foldSpeech(p)));
}
