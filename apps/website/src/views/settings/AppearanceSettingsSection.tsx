import React from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import type { ThemeMode } from "../../context/UIContext";

export function AppearanceSettingsSection({
  fontSize,
  setFontSize,
  theme,
  setTheme,
  showToast,
}: {
  fontSize: string;
  setFontSize: React.Dispatch<React.SetStateAction<string>>;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  showToast: (msg: string) => void;
}) {
  const fontOptions = [
    { value: "small", label: "小", desc: "コンパクト表示" },
    { value: "medium", label: "中（標準）", desc: "通常の文字サイズ" },
    { value: "large", label: "大", desc: "読みやすい大きめサイズ" },
    { value: "xlarge", label: "特大", desc: "見やすさ最重視" },
  ];

  const themeOptions: { value: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
    { value: "light", label: "ライト", desc: "明るい配色", icon: Sun },
    { value: "dark", label: "ダーク", desc: "暗い配色（目に優しい）", icon: Moon },
    { value: "system", label: "端末に合わせる", desc: "OS設定に自動連動", icon: Laptop },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden space-y-6">
      {/* テーマ設定 */}
      <div>
        <div className="p-4 bg-gray-50/50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700/80">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm">外観テーマ設定</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            画面のカラーテーマ（ライト / ダーク / システム設定に連動）を切り替えられます
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setTheme(opt.value);
                    showToast(`外観テーマを「${opt.label}」に設定しました`);
                  }}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold ring-2 ring-blue-400/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  }`}
                >
                  <Icon className="w-5 h-5 text-current" />
                  <p className="text-sm font-bold">{opt.label}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-400">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 文字サイズ設定 */}
      <div className="border-t border-gray-100 dark:border-gray-700">
        <div className="p-4 bg-gray-50/50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700/80">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm">記事文字サイズ設定</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            記事本文のフォントサイズを調整できます
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {fontOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setFontSize(opt.value);
                  showToast(`文字サイズを「${opt.label}」に変更しました`);
                }}
                className={`p-3 rounded-xl border text-center transition-all ${
                  fontSize === opt.value
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold ring-2 ring-blue-400/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <p className="text-sm font-bold">{opt.label}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
