import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { supabase } from "../supabase";
import { LogOut, LogIn, Loader2 } from "lucide-react";
import { ProfileSettingsSection } from "./settings/ProfileSettingsSection";
import { AppearanceSettingsSection } from "./settings/AppearanceSettingsSection";
import { SecuritySettingsSection } from "./settings/SecuritySettingsSection";
import { RoleSettingsSection } from "./settings/RoleSettingsSection";

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
    authLoading,
  } = useApp();

  if (authLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">アカウント情報を確認中...</p>
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
      <div className="border-b border-gray-200 pb-3">
        <h1 className="text-2xl font-bold text-gray-900">アカウント設定</h1>
        <p className="text-xs text-gray-500 mt-1">
          プロフィール、表示設定、セキュリティの確認と変更ができます
        </p>
      </div>

      {isGuest ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center space-y-3">
          <p className="font-bold text-blue-900 text-base">ログインしていません</p>
          <p className="text-xs text-blue-700 max-w-sm mx-auto">
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

      {/* 表示設定（フォントサイズなど） - 読者もゲストも利用可能 */}
      <AppearanceSettingsSection
        fontSize={fontSize}
        setFontSize={setFontSize}
        showToast={showToast}
      />

      {/* ログアウト */}
      {!isGuest && (
        <div className="pt-2">
          <button
            onClick={() => void handleSignOut()}
            className="w-full py-3 px-4 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>ログアウト</span>
          </button>
        </div>
      )}
    </div>
  );
};
