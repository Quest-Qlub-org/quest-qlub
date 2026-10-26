import { Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "../../supabase";
import { Header } from "../navigation/Header";
import { MobileNav } from "../navigation/MobileNav";
import { EnvironmentBanner } from "../EnvironmentBanner";
import { MfaChallengeModal } from "../MfaChallengeModal";
import { OpeningAnimation } from "../OpeningAnimation";
import { LogoIcon } from "../icons/NavIcons";
import { useAuth } from "../../context/AuthContext";
import { useUI } from "../../context/UIContext";
import imgTitle from "../../assets/brand_title.png";

const HIDE_HEADER_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/setup-profile",
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mfaChallengeRequired, setMfaChallengeRequired } = useAuth();
  const { toastMessage, hideToast } = useUI();

  const hideHeader = HIDE_HEADER_PATHS.some((path) => location.pathname.startsWith(path));

  // Root-level MFA Barrier: 2FAが未完了の場合は Outlet を一切マウントせず、検証ツールによるDOM削除バイパスを物理的に無力化
  // ただし /login 等の認証画面では LoginView 自身がインライン2FAを処理するためアンマウントしない（再ログイン画面ループ防止）
  if (mfaChallengeRequired && !hideHeader) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <MfaChallengeModal
          isOpen={true}
          onSuccess={() => {
            setMfaChallengeRequired(false);
            if (location.pathname.startsWith("/login")) {
              void navigate("/");
            }
          }}
          onCancel={async () => {
            setMfaChallengeRequired(false);
            await supabase.auth.signOut().catch(() => {});
            void navigate("/login");
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-800 dark:text-gray-100 font-sans selection:bg-blue-200 dark:selection:bg-blue-900/50 flex flex-col justify-between overflow-x-hidden transition-colors">
      <div>
        <EnvironmentBanner />
        {!hideHeader && <Header />}
        {!hideHeader && <MobileNav />}

        <main className="max-w-6xl mx-auto flex-1 w-full min-w-0">
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {!hideHeader && (
        <footer className="bg-gray-50 dark:bg-gray-900/60 border-t border-gray-200 dark:border-gray-800 mt-12 pb-[calc(env(safe-area-inset-bottom)+3.5rem)] md:pb-0">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8 mb-6">
              <div className="flex flex-col gap-2">
                <div
                  className="flex items-center gap-2.5 cursor-pointer"
                  onClick={() => navigate("/")}
                >
                  <LogoIcon className="w-8 h-8" />
                  <img
                    src={imgTitle}
                    className="h-7 object-contain dark:brightness-0 dark:invert transition-all"
                    alt="Quest Qlub"
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-400 max-w-xs leading-relaxed">
                  学びをシェアする、知識のクエスト。実践的なノウハウ・知見が集まるメディアプラットフォーム。
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex flex-col gap-2">
                  <p className="font-bold text-gray-700 dark:text-gray-200">コンテンツ</p>
                  <button
                    onClick={() => navigate("/")}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    トップ
                  </button>
                  <button
                    onClick={() => navigate("/search")}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    探す
                  </button>
                  <button
                    onClick={() => navigate("/writers")}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    ライター一覧
                  </button>
                  <button
                    onClick={() => navigate("/favorites")}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    お気に入り
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="font-bold text-gray-700 dark:text-gray-200">サービスについて</p>
                  <button
                    onClick={() => navigate("/about")}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Quest Qlubとは
                  </button>
                  <button
                    onClick={() => navigate("/contact")}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    お問い合わせ
                  </button>
                  <button
                    onClick={() => navigate("/terms")}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    利用規約
                  </button>
                  <button
                    onClick={() => navigate("/privacy")}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    プライバシーポリシー
                  </button>
                </div>

                <div className="flex flex-col gap-2 col-span-2 sm:col-span-1">
                  <p className="font-bold text-gray-700 dark:text-gray-200">公式SNS</p>
                  <a
                    href="https://x.com/QuestQlub"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1"
                  >
                    <span>公式X (@QuestQlub)</span>
                  </a>
                  <button
                    onClick={() => navigate("/writer-apply")}
                    className="text-left text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    ライター応募フォーム →
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                © 2026 Quest Qlub. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      )}

      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)] bg-gray-900/90 dark:bg-gray-800/95 dark:border dark:border-gray-700 backdrop-blur text-white px-5 py-3 rounded-2xl md:rounded-full shadow-2xl z-[60] animate-in slide-in-from-bottom-5 fade-in duration-300 flex items-center gap-3 text-xs md:text-sm font-bold break-words">
          <span className="min-w-0 break-words">{toastMessage}</span>
          <button
            onClick={hideToast}
            aria-label="通知を閉じる"
            className="p-1 rounded-full hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 初回アクセス時オープニングアニメーション */}
      <OpeningAnimation />
    </div>
  );
}
