import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { WifiOff, RotateCcw, Home } from "lucide-react";
import { updateMetaTags } from "../utils/seo";

export function OfflineFallbackView() {
  const navigate = useNavigate();

  useEffect(() => {
    updateMetaTags({
      title: "オフライン - Quest Qlub",
      noindex: true,
    });
  }, []);

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center animate-in fade-in duration-300">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 shadow-sm border border-amber-200/50 dark:border-amber-800/50">
        <WifiOff className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">オフラインです</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-8 max-w-sm leading-relaxed">
        インターネット接続が切断されているか、オフライン状態です。通信状況を確認してもう一度お試しください。
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
        <button
          onClick={handleRetry}
          className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>再試行</span>
        </button>
        <button
          onClick={() => navigate("/")}
          className="w-full sm:w-auto px-6 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          <span>トップへ戻る</span>
        </button>
      </div>
    </div>
  );
}
