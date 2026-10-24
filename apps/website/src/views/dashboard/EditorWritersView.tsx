import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { ChevronLeft } from "lucide-react";
import type { Profile } from "../../supabase";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  getProfileRoles,
  profileHasRole,
  getPrimaryRole,
  getRoleLabel,
  getRoleBadgeClass,
} from "../../utils/roles";

export function EditorWritersView() {
  const { showToast, refreshTeamMembers } = useApp();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchRole, setSearchRole] = useState<"" | "viewer" | "writer" | "editor" | "engineer">(
    "",
  );
  const nav = useNavigate();

  const fetchAll = async () => {
    setLoading(true);
    const { data: rpcData, error: rpcError } = await supabase.rpc("admin_get_all_profiles");
    if (!rpcError && rpcData) {
      setAllProfiles(rpcData as Profile[]);
    } else {
      // 安全な公開カラムのみ取得するフォールバック
      let profilesResult: Profile[] = [];
      const { data: fallbackData, error: fbError } = await supabase
        .from("profiles")
        .select("id, role, roles, display_name, username, x_account, avatar_url, bio, created_at")
        .order("role", { ascending: true });
      if (!fbError && fallbackData) {
        profilesResult = fallbackData as unknown as Profile[];
      } else if (fbError && (fbError.code === "42703" || fbError.message?.includes("roles"))) {
        const retry = await supabase
          .from("profiles")
          .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
          .order("role", { ascending: true });
        if (!retry.error && retry.data) {
          profilesResult = retry.data as unknown as Profile[];
        }
      }
      setAllProfiles(profilesResult);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const changeRole = async (id: string, role: "viewer" | "writer" | "editor") => {
    const target = allProfiles.find((p) => p.id === id);
    const existingRoles = target ? getProfileRoles(target) : [];
    const nonEditorialRoles = existingRoles.filter(
      (r) => r !== "viewer" && r !== "editor" && r !== "writer",
    );
    let nextRoles: string[];
    if (role === "viewer") {
      nextRoles = nonEditorialRoles.length > 0 ? nonEditorialRoles : ["viewer"];
    } else {
      nextRoles = [role, ...nonEditorialRoles];
    }

    const { error: rpcError } = await supabase.rpc("admin_set_user_roles", {
      target_user_id: id,
      new_roles: nextRoles,
    });

    if (
      rpcError &&
      (rpcError.code === "42883" || rpcError.message?.includes("admin_set_user_roles"))
    ) {
      const { error: fallbackErr } = await supabase.rpc("admin_change_user_role", {
        target_user_id: id,
        new_role: role,
      });
      if (fallbackErr) {
        showToast("ロールの変更に失敗しました: " + fallbackErr.message);
        return;
      }
    } else if (rpcError) {
      showToast("ロールの変更に失敗しました: " + rpcError.message);
      return;
    }

    setAllProfiles(allProfiles.map((w) => (w.id === id ? { ...w, role, roles: nextRoles } : w)));
    if (typeof refreshTeamMembers === "function") {
      void refreshTeamMembers();
    }
    showToast("ロールを変更しました");
  };

  const toggleRole = async (id: string, roleToToggle: string) => {
    const target = allProfiles.find((p) => p.id === id);
    if (!target) return;
    const currentRoles = getProfileRoles(target);
    let nextRoles: string[];
    if (currentRoles.includes(roleToToggle)) {
      nextRoles = currentRoles.filter((r) => r !== roleToToggle);
      if (nextRoles.length === 0) nextRoles = ["viewer"];
    } else {
      nextRoles = [...currentRoles.filter((r) => r !== "viewer"), roleToToggle];
    }
    const nextPrimary = getPrimaryRole(nextRoles);

    // admin_set_user_roles を試行
    const { error: rpcError } = await supabase.rpc("admin_set_user_roles", {
      target_user_id: id,
      new_roles: nextRoles,
    });

    if (
      rpcError &&
      (rpcError.code === "42883" || rpcError.message?.includes("admin_set_user_roles"))
    ) {
      // 未適用の場合は従来の admin_change_user_role へフォールバック
      const { error: fallbackErr } = await supabase.rpc("admin_change_user_role", {
        target_user_id: id,
        new_role: nextPrimary,
      });
      if (fallbackErr) {
        showToast("ロールの変更に失敗しました: " + fallbackErr.message);
        return;
      }
    } else if (rpcError) {
      showToast("ロールの変更に失敗しました: " + rpcError.message);
      return;
    }

    setAllProfiles((prev) =>
      prev.map((w) => (w.id === id ? { ...w, role: nextPrimary, roles: nextRoles } : w)),
    );
    if (typeof refreshTeamMembers === "function") {
      void refreshTeamMembers();
    }
    showToast(`ロール（${getRoleLabel(roleToToggle)}）を更新しました`);
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
          ? prev.map((w) =>
              w.id === updated.id
                ? {
                    ...w,
                    ...updated,
                    role: "writer",
                    roles: Array.from(new Set([...(w.roles ?? []), "writer"])),
                  }
                : w,
            )
          : [...prev, updated],
      );
      if (typeof refreshTeamMembers === "function") {
        void refreshTeamMembers();
      }
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
    const roleMatch = searchRole === "" || profileHasRole(w, searchRole);
    return emailMatch && roleMatch;
  });

  return (
    <div className="p-4 space-y-4 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 -mt-4 px-4 bg-white border-b border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-4">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="p-2 bg-white rounded-full shadow-sm cursor-pointer"
        >
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
            type="button"
            onClick={() => {
              void promoteWriter(newEmail);
              setNewEmail("");
            }}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 cursor-pointer"
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
            onChange={(e) =>
              setSearchRole(e.target.value as "" | "viewer" | "writer" | "editor" | "engineer")
            }
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">すべてのロール</option>
            <option value="editor">編集長</option>
            <option value="writer">ライター</option>
            <option value="engineer">エンジニア</option>
            <option value="viewer">閲覧者</option>
          </select>
          {(searchEmail || searchRole) && (
            <button
              type="button"
              onClick={() => {
                setSearchEmail("");
                setSearchRole("");
              }}
              className="px-3 py-2 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
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
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800 text-sm truncate">
                    {w.display_name ?? "（名前未設定）"}
                  </p>
                  {getProfileRoles(w).map((r) => (
                    <span
                      key={r}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleBadgeClass(r)}`}
                    >
                      {getRoleLabel(r)}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">{w.email ?? "メール非公開"}</p>

                {/* 複数ロール付与・解除トグルボタン */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {(["editor", "writer", "engineer"] as const).map((r) => {
                    const active = profileHasRole(w, r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => void toggleRole(w.id, r)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer ${
                          active
                            ? `${getRoleBadgeClass(r)} ring-1 ring-offset-1`
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                        }`}
                      >
                        {active ? `✓ ${getRoleLabel(r)}` : `+ ${getRoleLabel(r)}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <select
                  data-testid={`role-select-${w.id}`}
                  value={w.role}
                  onChange={(e) =>
                    void changeRole(w.id, e.target.value as "viewer" | "writer" | "editor")
                  }
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none"
                >
                  <option value="viewer">閲覧者</option>
                  <option value="writer">ライター</option>
                  <option value="editor">編集長</option>
                </select>
              </div>
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
