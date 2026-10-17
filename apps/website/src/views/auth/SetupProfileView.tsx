import { useState } from "react";
import { supabase } from "../../supabase";
import { useApp } from "../../context/AppContext";

export const SetupProfileView = () => {
  const { profile, setProfile, showToast } = useApp();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!displayName.trim()) {
      setError("表示名を入力してください");
      return;
    }
    if (username.trim().length < 3 || username.trim().length > 20) {
      setError("ユーザー名は3文字以上20文字以内で入力してください");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError("ユーザー名は半角英数字とアンダースコアのみ使用できます");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: existing, error: checkErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.trim())
        .maybeSingle();

      if (checkErr) {
        setError("エラーが発生しました。もう一度お試しください。");
        setLoading(false);
        return;
      }

      if (existing && existing.id !== profile?.id) {
        setError("このユーザー名は既に使用されています");
        setLoading(false);
        return;
      }

      const { error: saveError } = await supabase.from("profiles").upsert(
        {
          id: profile?.id,
          email: profile?.email,
          display_name: displayName.trim(),
          username: username.trim(),
          avatar_url: profile?.avatar_url,
          role: profile?.role ?? "viewer",
        },
        { onConflict: "id" },
      );

      if (saveError) {
        setError(saveError.message);
      } else {
        setProfile((p) =>
          p
            ? {
                ...p,
                display_name: displayName.trim(),
                username: username.trim(),
              }
            : null,
        );
        showToast("プロフィールを設定しました！");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">プロフィールの初期設定</h1>
        <p className="text-xs text-gray-500 text-center mb-6">
          Quest Qlubを利用するためにプロフィールを設定してください
        </p>
        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">表示名 *</label>
            <input
              type="text"
              placeholder="例: 山田太郎"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">ユーザー名 *</label>
            <input
              type="text"
              placeholder="例: tarou_yamada (英数字・_ )"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              半角英数字・アンダースコア3〜20文字。プロフィールURLおよびX（旧Twitter）リンクに使用されます。
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 mt-2"
          >
            {loading ? "設定中..." : "設定を完了する"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 border border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 bg-white"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
};
