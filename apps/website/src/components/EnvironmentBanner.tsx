import { useState } from "react";
import { isDev, isConnectedToProductionDb } from "../supabase";
import { AlertTriangle, Database, X } from "lucide-react";

export const EnvironmentBanner = () => {
  const [dismissed, setDismissed] = useState(false);

  // 本番ビルド時は何も表示しない
  if (!isDev || dismissed) {
    return null;
  }

  return (
    <div
      className={`px-4 py-1.5 text-xs font-medium flex items-center justify-between transition-colors z-50 relative ${
        isConnectedToProductionDb
          ? "bg-amber-500 text-slate-950 border-b border-amber-600 shadow-sm"
          : "bg-emerald-600 text-white border-b border-emerald-700"
      }`}
    >
      <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
        {isConnectedToProductionDb ? (
          <>
            <AlertTriangle
              className="w-4 h-4 shrink-0 animate-pulse text-amber-950"
              aria-hidden="true"
            />
            <span>
              <strong>【ローカル開発環境】</strong> 注意: 現在{" "}
              <span className="underline font-bold">本番用Supabaseデータベース</span>{" "}
              に接続しています。 データ作成・削除操作は本番環境に反映されます。
            </span>
          </>
        ) : (
          <>
            <Database className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>【ローカル開発環境】</strong> 開発・検証用データベースに接続しています。
            </span>
          </>
        )}
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
