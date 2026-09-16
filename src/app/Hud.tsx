import { useEffect, useState } from "react";
import type { Heard } from "../audio/speechIn";
import { TIMING } from "../machine/constants";
import type { CharacterState, SleepGauge } from "../machine/types";

function statusKind(text: string): "empty" | "warn" | "live" {
  if (text.startsWith("エラー") || text.startsWith("start") || text.startsWith("このブラウザ") || text.startsWith("モデル失敗")) return "warn";
  if (text === "聞いてる" || text === "発話を検出" || text.startsWith("認識モデル") || text.startsWith("端末")) return "live";
  return "empty";
}

function captionClass(heard: Heard | null): string {
  if (!heard) return "empty";
  if (heard.hit) return "hit";
  if (heard.echo) return "echo";
  return "live";
}

function captionTag(heard: Heard): string {
  if (heard.hit === "angry") return "ギレ";
  if (heard.hit === "name") return "呼びかけ";
  if (heard.hit === "kuiya") return "クイヤ";
  if (heard.echo) return "自分の声";
  return "";
}

function sleepCaption(g: SleepGauge): string {
  if (g.phase === "sleeping") return "爆睡中";
  if (g.phase === "paused") return "行動中（リセット）";
  if (g.phase === "nodding") return `撫でて爆睡 ${Math.ceil(g.remainSec ?? 0)}秒`;
  return `うとうとまで ${Math.ceil(g.remainSec ?? 0)}秒`;
}

function SleepBar({
  state,
  getSleepGauge,
}: {
  state: CharacterState;
  getSleepGauge: () => SleepGauge;
}) {
  const [gauge, setGauge] = useState(getSleepGauge);

  useEffect(() => {
    setGauge(getSleepGauge());
    const id = window.setInterval(() => setGauge(getSleepGauge()), 250);
    return () => window.clearInterval(id);
  }, [getSleepGauge, state]);

  return (
    <div
      className={`sleep-gauge ${gauge.phase}`}
      title={`起き続け ${TIMING.noddingAfterMs / 1000}秒でうとうと、頭を撫でてさらに ${TIMING.deepSleepMs / 1000}秒で爆睡`}
    >
      <span className="sleep-gauge-label">ねむけ</span>
      <div className="sleep-gauge-bar">
        <div className="sleep-gauge-track">
          <div className="sleep-gauge-fill" style={{ width: `${gauge.fill * 100}%` }} />
        </div>
        <div className="sleep-gauge-mark" style={{ left: `${gauge.noddingMark * 100}%` }} />
      </div>
      <span className="sleep-gauge-meta">{sleepCaption(gauge)}</span>
    </div>
  );
}

export function Hud({
  state,
  mic,
  denied,
  ttsReady,
  getSleepGauge,
  heardStatus,
  heard,
  onOpenSettings,
}: {
  state: CharacterState;
  mic: "pending" | "ok" | "denied";
  denied: boolean;
  ttsReady: boolean;
  getSleepGauge: () => SleepGauge;
  heardStatus: string;
  heard: Heard | null;
  onOpenSettings: () => void;
}) {
  const tag = heard ? captionTag(heard) : "";
  const notice =
    mic === "denied" || denied
      ? "マイクなし。設定から同等操作。"
      : mic === "pending"
        ? "マイク許可を待っています"
        : !ttsReady
          ? "画面をクリックすると声とBGMが出ます"
          : heardStatus;
  const noticeKind =
    mic === "denied" || denied || (mic === "ok" && !ttsReady)
      ? "warn"
      : statusKind(mic === "pending" ? notice : heardStatus);
  return (
    <>
      <div className="hud">
        <div className="hud-row">
          <span className="state">{state}</span>
          <span className={`heard-status ${noticeKind}`}>{notice}</span>
          <button type="button" onClick={onOpenSettings}>
            設定
          </button>
        </div>
        <SleepBar state={state} getSleepGauge={getSleepGauge} />
      </div>
      <aside className={`heard-caption ${captionClass(heard)}`} aria-live="polite">
        <div className="heard-caption-label">きこえ{tag ? ` · ${tag}` : ""}</div>
        <div className="heard-caption-text">{heard?.text || "（ここに聞き取りが出ます）"}</div>
      </aside>
    </>
  );
}
