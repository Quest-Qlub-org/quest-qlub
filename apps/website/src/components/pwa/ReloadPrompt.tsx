import { useRef, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";

export function ReloadPrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        registrationRef.current = registration;
      }
    },
    onRegisterError(error) {
      console.error("SW registration error", error);
    },
  });

  useEffect(() => {
    const interval = setInterval(
      () => {
        if (registrationRef.current && typeof navigator !== "undefined" && navigator.onLine) {
          void registrationRef.current.update();
        }
      },
      60 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, []);

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      role="alert"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] md:bottom-8 right-4 md:right-8 z-50 max-w-sm bg-gray-900/95 dark:bg-gray-800/95 text-white p-4 rounded-2xl shadow-2xl border border-gray-700/60 backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300"
      data-testid="pwa-reload-prompt"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 shrink-0 mt-0.5">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-100">新しいバージョンが利用可能です</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            最新の機能と改善を反映するために、アプリを再読み込みしてください。
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => void updateServiceWorker(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
            >
              更新する
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="px-3 py-1.5 text-gray-400 hover:text-gray-200 text-xs font-medium rounded-lg transition-colors"
            >
              あとで
            </button>
          </div>
        </div>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="プロンプトを閉じる"
          className="text-gray-400 hover:text-gray-200 p-1 rounded-lg transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
