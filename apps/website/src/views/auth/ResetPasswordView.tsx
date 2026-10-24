import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useApp } from "../../context/AppContext";
import { validatePassword } from "../../utils/validation";
import { updateMetaTags } from "../../utils/seo";

export const ResetPasswordView = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const { navigate, showToast } = useApp();

  useEffect(() => {
    updateMetaTags({
      title: "新しいパスワードの設定",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthorized(session !== null);
    });
  }, []);

  const handleResetPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const passCheck = validatePassword(password);
    if (!passCheck.isValid) {
      setError(passCheck.error || "パスワードは8文字以上で入力してください");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setLoading(true);
    setError("");

    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message);
    } else {
      showToast("パスワードを更新しました。新しいパスワードでログインしてください。");
      await supabase.auth.signOut();
      navigate("login");
    }
    setLoading(false);
  };

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center transition-colors">
        <p className="text-sm text-gray-500 dark:text-gray-400 font-bold">確認中...</p>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4 transition-colors">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">エラー</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 font-medium">
            無効なアクセス、またはリンクの有効期限が切れています。パスワード再設定メールのリンクから再度アクセスしてください。
          </p>
          <button
            onClick={() => navigate("login")}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 cursor-pointer"
          >
            ログイン画面に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4 transition-colors">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
          新しいパスワードの設定
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6 font-medium">
          新しいパスワードを入力してください
        </p>
        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        <form onSubmit={handleResetPassword} className="space-y-4">
          <input
            type="password"
            placeholder="新しいパスワード（8文字以上）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="新しいパスワード（確認）"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {loading ? "更新中..." : "パスワードを更新"}
          </button>
        </form>
      </div>
    </div>
  );
};
