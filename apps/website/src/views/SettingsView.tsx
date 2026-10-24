import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { supabase } from "../supabase";
import { LogOut, LogIn, Loader2 } from "lucide-react";
import { ProfileSettingsSection } from "./settings/ProfileSettingsSection";
import { AppearanceSettingsSection } from "./settings/AppearanceSettingsSection";
import { SecuritySettingsSection } from "./settings/SecuritySettingsSection";
import { RoleSettingsSection } from "./settings/RoleSettingsSection";
import { updateMetaTags } from "../utils/seo";

export const SettingsView = () => {
  const navigate = useNavigate();
  const {
    profile,
    setProfile,
    userRole,
    setWriters,
    showToast,
    fontSize,
    setFontSize,
    theme,
    setTheme,
    authLoading,
  } = useApp();

  useEffect(() => {
    updateMetaTags({
      title: "設定",
      noindex: true,
    });
  }, []);

  if (authLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          アカウント情報を確認中...
        </p>
      </div>
    );
  }

  const isGuest = userRole === "guest" || !profile;

  const handleSignOut = async () => {
    if (window.confirm("ログアウトしますか？")) {
      await supabase.auth.signOut();
      showToast("ログアウトしました");
      void navigate("/");
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">アカウント設定</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          プロフィール、表示設定、セキュリティの確認と変更ができます
        </p>
      </div>

      {isGuest ? (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl p-6 text-center space-y-3">
          <p className="font-bold text-blue-900 dark:text-blue-300 text-base">
            ログインしていません
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-400 max-w-sm mx-auto">
            ログインすると、プロフィール設定やお気に入り管理、ライター・編集長機能を利用できます。
          </p>
          <button
            onClick={() => navigate("/login")}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            <span>ログインする</span>
          </button>
        </div>
      ) : (
        <>
          {/* ロールとダッシュボード導線 */}
          <RoleSettingsSection profile={profile} />

          {/* プロフィール設定 */}
          <ProfileSettingsSection
            profile={profile}
            setProfile={setProfile}
            setWriters={setWriters}
            showToast={showToast}
          />

          {/* セキュリティ設定（TOTP, パスキー, バックアップコード） */}
          <SecuritySettingsSection showToast={showToast} />
        </>
      )}

      {/* 表示設定（外観テーマ・フォントサイズなど） - 読者もゲストも利用可能 */}
      <AppearanceSettingsSection
        fontSize={fontSize}
        setFontSize={setFontSize}
        theme={theme}
        setTheme={setTheme}
        showToast={showToast}
      />

      {/* ログアウト */}
      {!isGuest && (
        <div className="pt-2">
          <button
            onClick={() => void handleSignOut()}
            className="w-full py-3 px-4 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>ログアウト</span>
          </button>
        </div>
      )}
    </div>
  );
};
