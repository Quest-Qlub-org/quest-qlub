import { useState } from "react";
import { isDevelopment } from "../supabaseConfig";
import { Database, X } from "lucide-react";

export const EnvironmentBanner = () => {
  const [dismissed, setDismissed] = useState(false);

  if (!isDevelopment || dismissed) {
    return null;
  }

  return (
    <div className="relative z-50 flex items-center justify-between border-b border-emerald-700 bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white">
      <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
        <Database className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>
          <strong>【開発・検証環境】</strong> 開発・検証用データベースに接続しています。
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="バナーを閉じる"
        className="p-1 hover:bg-black/10 rounded transition-colors ml-2 shrink-0"
        title="バナーを閉じる"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
