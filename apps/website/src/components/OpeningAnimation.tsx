import { useState, useEffect } from "react";
import { LogoIcon } from "./icons/NavIcons";

const STORAGE_KEY = "quest_qlub_has_seen_opening";
const LEGACY_STORAGE_KEY = "share_quest_has_seen_opening";
const TITLE_TEXT = "QUEST QLUB";

export function OpeningAnimation({ onFinished }: { onFinished?: () => void }) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined" || !window.sessionStorage) return false;
    // 既に見たセッション、またはモーション軽減設定がある場合は表示しない
    const hasSeen =
      window.sessionStorage.getItem(STORAGE_KEY) ||
      window.sessionStorage.getItem(LEGACY_STORAGE_KEY);
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return !hasSeen && !prefersReducedMotion;
  });

  const [charIndex, setCharIndex] = useState(0);
  const [showSubText, setShowSubText] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  const finishAnimation = () => {
    setFadingOut(true);
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY, "true");
      window.sessionStorage.setItem(LEGACY_STORAGE_KEY, "true");
    }
    setTimeout(() => {
      setVisible(false);
      onFinished?.();
    }, 600);
  };

  useEffect(() => {
    if (!visible) {
      onFinished?.();
      return;
    }

    // セーフティガード：万一タイマーが詰まっても4秒で強制終了
    const safetyTimer = setTimeout(() => {
      finishAnimation();
    }, 4000);

    let charTimer: ReturnType<typeof setTimeout> | undefined;
    let subTimer: ReturnType<typeof setTimeout> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;

    // 1文字ずつ表示（90msごと）
    if (charIndex < TITLE_TEXT.length) {
      charTimer = setTimeout(() => {
        setCharIndex((prev) => prev + 1);
      }, 90);
    } else {
      // 文字が表示し終わったらサブテキストを表示
      subTimer = setTimeout(() => {
        setShowSubText(true);
      }, 200);

      // 全体表示後、自動フェードアウト（1.5秒後）
      finishTimer = setTimeout(() => {
        finishAnimation();
      }, 1500);
    }

    return () => {
      clearTimeout(safetyTimer);
      if (charTimer) clearTimeout(charTimer);
      if (subTimer) clearTimeout(subTimer);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, [visible, charIndex]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="オープニングアニメーション"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-950 text-white transition-opacity duration-700 select-none ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* スキップボタン */}
      <button
        onClick={finishAnimation}
        className="absolute top-6 right-6 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-gray-300 hover:text-white transition-colors border border-white/10"
      >
        スキップ &gt;
      </button>

      <div className="flex flex-col items-center gap-6 px-4">
        {/* ロゴアイコン */}
        <div className="w-16 h-16 md:w-20 md:h-20 text-blue-500 animate-pulse">
          <LogoIcon className="w-full h-full" />
        </div>

        {/* 1文字ずつ表示されるタイトル */}
        <div className="flex items-center tracking-widest text-3xl md:text-5xl font-black min-h-[3rem]">
          {TITLE_TEXT.split("").map((char, index) => (
            <span
              key={index}
              className={`transition-all duration-300 ${
                index < charIndex
                  ? "opacity-100 translate-y-0 text-white"
                  : "opacity-0 translate-y-2 text-transparent"
              } ${char === " " ? "w-3 md:w-4" : ""}`}
            >
              {char}
            </span>
          ))}
          {/* タイピングカーソル */}
          {charIndex < TITLE_TEXT.length && (
            <span className="w-0.5 h-8 md:h-10 bg-blue-500 animate-pulse ml-1 inline-block" />
          )}
        </div>

        {/* サブテキスト */}
        <p
          className={`text-sm md:text-base text-gray-400 font-medium tracking-wider transition-all duration-700 ${
            showSubText ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          学びの「楽しい！」をつなげる
        </p>
      </div>
    </div>
  );
}
