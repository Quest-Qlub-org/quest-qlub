import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, Home, LogIn, ArrowRight } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { updateMetaTags } from "../../utils/seo";

interface AccessDeniedViewProps {
  requiredRole?: "writer" | "editor" | "authenticated";
  message?: string;
}

export function AccessDeniedView({ requiredRole, message }: AccessDeniedViewProps) {
  const navigate = useNavigate();
  const { user, profile } = useApp();

  useEffect(() => {
    updateMetaTags({
      title: "アクセス権限がありません",
      noindex: true,
    });
  }, []);

  const getExplanation = () => {
    if (message) return message;
    if (requiredRole === "editor") {
      return "このページは編集長（管理者）専用の管理画面です。";
    }
    if (requiredRole === "writer") {
      return "このページは記事を執筆するライター専用のダッシュボードです。";
    }
    return "このページを閲覧・操作するためのアクセス権限がありません。";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-12 text-center animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-red-100">
        <ShieldAlert className="w-8 h-8" />
      </div>

      <p className="text-6xl font-black text-gray-200 select-none mb-1 tracking-wider">403</p>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">アクセス権限がありません</h1>
      <p className="text-gray-600 text-sm mb-2 max-w-md leading-relaxed">{getExplanation()}</p>

      {!user ? (
        <p className="text-xs text-gray-500 mb-8 max-w-sm">
          現在ログインしていません。該当の権限を持つアカウントでログインしてください。
        </p>
      ) : profile?.role === "viewer" && requiredRole === "writer" ? (
        <p className="text-xs text-gray-500 mb-8 max-w-sm">
          記事の執筆を希望される場合は、ライター応募フォームよりご申請ください。
        </p>
      ) : (
        <p className="text-xs text-gray-400 mb-8 max-w-sm">
          アカウントの権限設定に関するお問い合わせはサポートまでご連絡ください。
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
        <button
          onClick={() => navigate("/")}
          className="flex-1 min-w-[140px] px-5 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Home className="w-4 h-4" />
          <span>トップへ戻る</span>
        </button>

        {!user ? (
          <button
            onClick={() => navigate("/login")}
            className="flex-1 min-w-[140px] px-5 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            <span>ログインする</span>
          </button>
        ) : profile?.role === "viewer" ? (
          <button
            onClick={() => navigate("/contact")}
            className="flex-1 min-w-[140px] px-5 py-3 bg-blue-50 text-blue-700 border border-blue-200 text-sm font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
          >
            <span>お問い合わせ</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
