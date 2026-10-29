import { useState } from "react";
import { Smartphone, Download, Share2, CheckCircle2, X, Sparkles, Loader2 } from "lucide-react";
import { usePwaInstall } from "../../hooks/usePwaInstall";

export interface PwaInstallSettingsSectionProps {
  showToast?: (msg: string) => void;
}

export function PwaInstallSettingsSection({ showToast }: PwaInstallSettingsSectionProps) {
  const {
    isStandalone,
    isInstalled,
    isIos,
    isDismissed,
    canInstallPrompt,
    promptInstall,
    dismiss,
    resetDismissed,
  } = usePwaInstall();

  const [isPrompting, setIsPrompting] = useState(false);

  // ユーザーに煩わしくないように、非表示（消去）設定されている場合は再表示導線のみ表示（既インストール時は完全非表示）
  if (isDismissed) {
    if (isInstalled || isStandalone) {
      return null;
    }
    return (
      <div className="flex justify-end -mt-2">
        <button
          type="button"
          onClick={() => {
            resetDismissed();
            showToast?.("アプリのインストール案内を再表示しました");
          }}
          className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 underline decoration-dotted transition-colors"
          data-testid="pwa-restore-button"
        >
          アプリ（PWA）のインストール案内を再表示
        </button>
      </div>
    );
  }

  const handleInstallClick = async () => {
    setIsPrompting(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        showToast?.("アプリをインストールしました");
      } else if (outcome === "dismissed") {
        showToast?.("インストールをキャンセルしました");
      }
    } finally {
      setIsPrompting(false);
    }
  };

  const handleDismiss = () => {
    dismiss();
    showToast?.("インストール案内を非表示にしました");
  };

  return (
    <section
      aria-label="アプリ（PWA）のインストール案内"
      data-testid="pwa-install-settings-section"
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      {/* セクションヘッダー */}
      <div className="p-4 bg-gray-50/50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700/80 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                アプリ（PWA）のインストール
              </h2>
              {isInstalled && (
                <span
                  data-testid="pwa-installed-badge"
                  className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-full"
                >
                  インストール済み
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              ホーム画面やデスクトップに追加して、素早く快適に Quest Qlub を利用できます
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="インストール案内を閉じる"
          title="この案内を非表示にする"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors shrink-0"
          data-testid="pwa-dismiss-button"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* セクションコンテンツ */}
      {isInstalled || isStandalone ? (
        /* インストール済み状態 */
        <div
          data-testid="pwa-installed-content"
          className="p-4 sm:p-5 flex items-start gap-3 bg-emerald-50/40 dark:bg-emerald-950/20"
        >
          <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">
              Quest Qlub はアプリとしてインストールされています
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
              ホーム画面やDock/タスクバーから直接開くことができ、オフラインでの一部閲覧やスムーズな画面遷移に対応しています。
            </p>
          </div>
        </div>
      ) : canInstallPrompt ? (
        /* beforeinstallprompt が利用可能な状態（ワンクリックでインストールダイアログ表示） */
        <div data-testid="pwa-promptable-content" className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-300">
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/40 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span>1タップで高速起動</span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/40 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
              <span>全画面の快適な閲覧体験</span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/40 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>オフラインでも記事を保持</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ストアを経由せず、端末のストレージをほとんど消費せずにインストールできます。
            </p>
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              disabled={isPrompting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-bold rounded-xl transition-all shadow-sm shrink-0 disabled:opacity-50"
              data-testid="pwa-install-button"
            >
              {isPrompting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>アプリをインストール</span>
            </button>
          </div>
        </div>
      ) : isIos ? (
        /* iOS Safari 向けの手順案内 */
        <div data-testid="pwa-ios-content" className="p-4 sm:p-5 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            iOS（Safari）では、以下の手順でホーム画面にアプリを追加できます：
          </p>
          <ol className="space-y-2 text-xs text-gray-700 dark:text-gray-200 list-none">
            <li className="flex items-start gap-2.5 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/40">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-bold text-[11px] shrink-0 mt-0.5">
                1
              </span>
              <span className="leading-relaxed">
                Safari 画面下部（iPad は画面右上）の <strong>共有ボタン</strong>（
                <Share2 className="w-3.5 h-3.5 inline text-blue-600 dark:text-blue-400 align-text-bottom mx-0.5" />
                ）をタップします
              </span>
            </li>
            <li className="flex items-start gap-2.5 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/40">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-bold text-[11px] shrink-0 mt-0.5">
                2
              </span>
              <span className="leading-relaxed">
                共有メニューをスクロールし、<strong>「ホーム画面に追加」</strong> を選択します
              </span>
            </li>
            <li className="flex items-start gap-2.5 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/40">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-bold text-[11px] shrink-0 mt-0.5">
                3
              </span>
              <span className="leading-relaxed">
                右上の <strong>「追加」</strong>{" "}
                をタップすると、ホーム画面からワンタップでアプリとして起動できるようになります
              </span>
            </li>
          </ol>
        </div>
      ) : (
        /* その他ブラウザ（プロンプト未検知 / 手動案内） */
        <div data-testid="pwa-general-content" className="p-4 sm:p-5 space-y-2.5">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            お使いのブラウザのアドレスバーにある <strong>インストールアイコン</strong>
            、またはブラウザメニュー（「…」）の <strong>「Quest Qlub をインストール」</strong>{" "}
            または <strong>「ホーム画面に追加」</strong> からアプリとして登録できます。
          </p>
          <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 pt-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>インストールすると全画面で快適に記事を読めるようになります</span>
          </div>
        </div>
      )}

      {/* フッター：消せるように案内 */}
      <div className="px-4 py-2.5 bg-gray-50/50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-400">
        <span>この案内はいつでも非表示にできます</span>
        <button
          type="button"
          onClick={handleDismiss}
          className="hover:text-gray-600 dark:hover:text-gray-200 underline decoration-dotted transition-colors"
          data-testid="pwa-dismiss-link"
        >
          この案内を閉じる
        </button>
      </div>
    </section>
  );
}
