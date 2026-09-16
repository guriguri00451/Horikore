import { useEffect } from "react";
import type { CharacterState } from "../machine/types";

function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <label className="settings-row settings-volume">
      <span>{label}</span>
      <input type="range" min={0} max={100} value={pct} onChange={(e) => onChange(Number(e.target.value) / 100)} />
      <span className="settings-meta">{pct}</span>
    </label>
  );
}

const DEBUG_STATES: { id: CharacterState; label: string }[] = [
  { id: "awake", label: "起きてる" },
  { id: "called", label: "呼びかけ" },
  { id: "angry", label: "ギレ" },
  { id: "nodding", label: "うとうと" },
  { id: "sleeping", label: "爆睡" },
  { id: "workout", label: "筋トレ" },
  { id: "beauty", label: "美容" },
  { id: "hit", label: "いてっ" },
];

export function Settings({
  open,
  onClose,
  mic,
  hasSample,
  recording,
  bgmVolume,
  seVolume,
  onDebug,
  onRecord,
  onClearSample,
  onBgmVolume,
  onSeVolume,
}: {
  open: boolean;
  onClose: () => void;
  mic: "pending" | "ok" | "denied";
  hasSample: boolean;
  recording: boolean;
  bgmVolume: number;
  seVolume: number;
  onDebug: (s: CharacterState) => void;
  onRecord: () => void;
  onClearSample: () => void;
  onBgmVolume: (v: number) => void;
  onSeVolume: (v: number) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <section
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <h2 id="settings-title">設定</h2>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </header>

        <div className="settings-section">
          <h3>おと</h3>
          <VolumeRow label="BGM" value={bgmVolume} onChange={onBgmVolume} />
          <VolumeRow label="SE" value={seVolume} onChange={onSeVolume} />
          <div className="settings-row">
            <span>楽器の参照音</span>
            <span className="settings-meta">{hasSample ? "録音済み" : "未録音"}</span>
          </div>
          <p className="settings-hint">この音を鳴らすと爆睡します。約2秒録ります。</p>
          <div className="settings-row">
            <button type="button" onClick={onRecord} disabled={recording || mic !== "ok"}>
              {recording ? "録音中…" : hasSample ? "録り直す" : "録音する"}
            </button>
            {hasSample ? (
              <button type="button" onClick={onClearSample} disabled={recording}>
                消す
              </button>
            ) : null}
          </div>
          {mic === "denied" ? (
            <p className="settings-hint warn">マイクがないので録音できません。</p>
          ) : mic !== "ok" ? (
            <p className="settings-hint">マイク許可のあと録音できます。</p>
          ) : null}
        </div>

        <div className="settings-section">
          <h3>デバッグ</h3>
          <p className="settings-hint">ステートを強制で切り替えます。</p>
          <div className="settings-row wrap">
            {DEBUG_STATES.map((s) => (
              <button key={s.id} type="button" onClick={() => onDebug(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
