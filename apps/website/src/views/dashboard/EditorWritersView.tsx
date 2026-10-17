import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { ChevronLeft } from "lucide-react";
import type { Profile } from "../../supabase";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";

export function EditorWritersView() {
  const { showToast } = useApp();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchRole, setSearchRole] = useState<"" | "viewer" | "writer" | "editor">("");
  const nav = useNavigate();

  const fetchAll = async () => {
    setLoading(true);
    const { data: rpcData, error: rpcError } = await supabase.rpc("admin_get_all_profiles");
    if (!rpcError && rpcData) {
      setAllProfiles(rpcData as Profile[]);
    } else {
      // 安全な公開カラムのみ取得するフォールバック
      const { data: fallbackData } = await supabase
        .from("profiles")
        .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
        .order("role", { ascending: true });
      if (fallbackData) setAllProfiles(fallbackData as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const changeRole = async (id: string, role: "viewer" | "writer" | "editor") => {
    const { error: rpcError } = await supabase.rpc("admin_change_user_role", {
      target_user_id: id,
      new_role: role,
    });

    if (rpcError) {
      showToast("ロールの変更に失敗しました: " + rpcError.message);
      return;
    }
    setAllProfiles(allProfiles.map((w) => (w.id === id ? { ...w, role } : w)));
    showToast("ロールを変更しました");
  };

  const promoteWriter = async (email: string) => {
    const targetEmail = email.trim();
    if (!targetEmail) return;

    // セキュアな管理者専用RPC関数を実行
    const { data: rpcData, error: rpcError } = await supabase.rpc("admin_promote_writer", {
      target_email: targetEmail,
    });

    if (rpcError) {
      showToast("ライターの昇格に失敗しました: " + rpcError.message);
      return;
    }

    if (rpcData) {
      const updated = rpcData as Profile;
      setAllProfiles((prev) =>
        prev.find((w) => w.id === updated.id)
          ? prev.map((w) => (w.id === updated.id ? updated : w))
          : [...prev, updated],
      );
      showToast(
        `${updated.display_name ?? (updated.username ? `@${updated.username}` : (updated.email ?? updated.id))} をライターに昇格しました`,
      );
    }
  };

  const [newEmail, setNewEmail] = useState("");

  const filtered = allProfiles.filter((w) => {
    const emailMatch =
      searchEmail === "" ||
      (w.email ? w.email.toLowerCase().includes(searchEmail.toLowerCase()) : false);
    const roleMatch = searchRole === "" || w.role === searchRole;
    return emailMatch && roleMatch;
  });

  const roleLabel: Record<string, string> = {
    viewer: "閲覧者",
    writer: "ライター",
    editor: "編集長",
  };
  const roleColor: Record<string, string> = {
    viewer: "bg-gray-100 text-gray-600",
    writer: "bg-blue-100 text-blue-700",
    editor: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="p-4 space-y-4 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 -mt-4 px-4 bg-white border-b border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-4">
        <button onClick={() => nav(-1)} className="p-2 bg-white rounded-full shadow-sm">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-purple-800">ライター管理</h2>
        <span className="ml-auto text-xs text-gray-400">{allProfiles.length} アカウント</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
        <p className="font-bold text-gray-800 text-sm">メアドでライターに昇格</p>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="メールアドレス"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <button
            onClick={() => {
              void promoteWriter(newEmail);
              setNewEmail("");
            }}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700"
          >
            昇格
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-2">
        <p className="font-bold text-gray-800 text-sm">絞り込み</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="メアドで検索"
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <select
            value={searchRole}
            onChange={(e) => setSearchRole(e.target.value as "" | "viewer" | "writer" | "editor")}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">すべて</option>
            <option value="viewer">閲覧者</option>
            <option value="writer">ライター</option>
            <option value="editor">編集長</option>
          </select>
          {(searchEmail || searchRole) && (
            <button
              onClick={() => {
                setSearchEmail("");
                setSearchRole("");
              }}
              className="px-3 py-2 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              クリア
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">読み込み中...</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => (
            <div
              key={w.id}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800 text-sm truncate">
                    {w.display_name ?? "（名前未設定）"}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[w.role] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {roleLabel[w.role] ?? w.role}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">{w.email ?? "メール非公開"}</p>
              </div>
              <select
                value={w.role}
                onChange={(e) =>
                  void changeRole(w.id, e.target.value as "viewer" | "writer" | "editor")
                }
                className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none shrink-0"
              >
                <option value="viewer">閲覧者</option>
                <option value="writer">ライター</option>
                <option value="editor">編集長</option>
              </select>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-sm">
              {allProfiles.length === 0
                ? "登録アカウントがありません"
                : "条件に一致するアカウントがありません"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
