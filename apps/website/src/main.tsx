import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isDevelopment, supabaseConfig } from "./supabaseConfig";
import "./style.css";

const App = lazy(() => import("./App.tsx"));

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    {"error" in supabaseConfig ? (
      <main role="alert" className="mx-auto max-w-xl space-y-3 px-6 py-12 text-gray-900">
        <h1 className="text-xl font-bold">Supabase の接続設定を確認してください</h1>
        <p>{supabaseConfig.error}</p>
        {isDevelopment && (
          <p>
            ローカルでは <code>apps/website/.env.example</code> を参考に{" "}
            <code>apps/website/.env.development.local</code> を設定して開発サーバーを再起動します。
            Vercel の検証環境では Preview 用の環境変数を設定して再デプロイしてください。
          </p>
        )}
      </main>
    ) : (
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense fallback={null}>
            <App />
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    )}
  </StrictMode>,
);
