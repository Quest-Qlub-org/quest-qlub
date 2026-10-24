import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { ChevronLeft, Plus, X } from "lucide-react";
import type { Profile } from "../../supabase";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  getProfileRoles,
  profileHasRole,
  getPrimaryRole,
  getRoleLabel,
  getRoleBadgeClass,
  setLocalRolesOverride,
  enrichFallbackProfileRoles,
} from "../../utils/roles";

export function EditorWritersView() {
  const { showToast, refreshTeamMembers, refreshWriters } = useApp();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchRole, setSearchRole] = useState<string>("");
  const [customRoleInputs, setCustomRoleInputs] = useState<Record<string, string>>({});
  const [openCustomInputId, setOpenCustomInputId] = useState<string | null>(null);
  const nav = useNavigate();

  const notifyRolesUpdated = () => {
    if (typeof refreshTeamMembers === "function") {
      void refreshTeamMembers();
    }
    if (typeof refreshWriters === "function") {
      void refreshWriters();
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("quest_qlub_roles_updated"));
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    const { data: rpcData, error: rpcError } = await supabase.rpc("admin_get_all_profiles");
    if (!rpcError && rpcData) {
      setAllProfiles((rpcData as Profile[]).map((p) => enrichFallbackProfileRoles(p)));
    } else {
      // 安全な公開カラムのみ取得するフォールバック
      let profilesResult: Profile[] = [];
      const { data: fallbackData, error: fbError } = await supabase
        .from("profiles")
        .select("id, role, roles, display_name, username, x_account, avatar_url, bio, created_at")
        .order("role", { ascending: true });
      if (!fbError && fallbackData) {
        profilesResult = (fallbackData as unknown as Profile[]).map((p) =>
          enrichFallbackProfileRoles(p),
        );
      } else if (fbError && (fbError.code === "42703" || fbError.message?.includes("roles"))) {
        const retry = await supabase
          .from("profiles")
          .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
          .order("role", { ascending: true });
        if (!retry.error && retry.data) {
          profilesResult = (retry.data as unknown as Profile[]).map((p) =>
            enrichFallbackProfileRoles(p),
          );
        }
      }
      setAllProfiles(profilesResult);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const persistRolesToBackend = async (
    id: string,
    nextRoles: string[],
    nextPrimary: "viewer" | "writer" | "editor",
  ): Promise<boolean> => {
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
        new_role: nextPrimary,
      });
      if (fallbackErr) {
        showToast("ロールの変更に失敗しました: " + fallbackErr.message);
        return false;
      }
    } else if (rpcError) {
      showToast("ロールの変更に失敗しました: " + rpcError.message);
      return false;
    }

    setLocalRolesOverride(id, nextRoles);
    return true;
  };

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

    const editorCount = allProfiles.filter((p) => profileHasRole(p, "editor")).length;
    if (profileHasRole(target, "editor") && !nextRoles.includes("editor") && editorCount <= 1) {
      showToast("最後の編集長アカウントを降格することはできません。");
      return;
    }

    const ok = await persistRolesToBackend(id, nextRoles, role);
    if (!ok) return;

    setAllProfiles(allProfiles.map((w) => (w.id === id ? { ...w, role, roles: nextRoles } : w)));
    notifyRolesUpdated();
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

    const editorCount = allProfiles.filter((p) => profileHasRole(p, "editor")).length;
    if (profileHasRole(target, "editor") && !nextRoles.includes("editor") && editorCount <= 1) {
      showToast("最後の編集長アカウントを降格することはできません。");
      return;
    }

    const ok = await persistRolesToBackend(id, nextRoles, nextPrimary);
    if (!ok) return;

    setAllProfiles((prev) =>
      prev.map((w) => (w.id === id ? { ...w, role: nextPrimary, roles: nextRoles } : w)),
    );
    notifyRolesUpdated();
    showToast(`ロール（${getRoleLabel(roleToToggle)}）を更新しました`);
  };

  const addCustomRole = async (id: string) => {
    const rawRole = (customRoleInputs[id] || "").trim().toLowerCase();
    if (!rawRole) return;
    const target = allProfiles.find((p) => p.id === id);
    if (!target) return;

    const currentRoles = getProfileRoles(target);
    if (currentRoles.includes(rawRole)) {
      setCustomRoleInputs((prev) => ({ ...prev, [id]: "" }));
      setOpenCustomInputId(null);
      return;
    }

    const nextRoles = [...currentRoles.filter((r) => r !== "viewer"), rawRole];
    const nextPrimary = getPrimaryRole(nextRoles);

    const ok = await persistRolesToBackend(id, nextRoles, nextPrimary);
    if (!ok) return;

    setAllProfiles((prev) =>
      prev.map((w) => (w.id === id ? { ...w, role: nextPrimary, roles: nextRoles } : w)),
    );
    setCustomRoleInputs((prev) => ({ ...prev, [id]: "" }));
    setOpenCustomInputId(null);
    notifyRolesUpdated();
    showToast(`ロール（${getRoleLabel(rawRole)}）を追加しました`);
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
      const existing = allProfiles.find((w) => w.id === updated.id);
      const nextRoles = Array.from(
        new Set(
          [...(existing ? getProfileRoles(existing) : []), "writer"].filter((r) => r !== "viewer"),
        ),
      );
      setLocalRolesOverride(updated.id, nextRoles);
      setAllProfiles((prev) =>
        prev.find((w) => w.id === updated.id)
          ? prev.map((w) =>
              w.id === updated.id
                ? {
                    ...w,
                    ...updated,
                    role: "writer",
                    roles: nextRoles,
                  }
                : w,
            )
          : [...prev, { ...updated, role: "writer", roles: nextRoles }],
      );
      notifyRolesUpdated();
      showToast(
        `${updated.display_name ?? (updated.username ? `@${updated.username}` : (updated.email ?? updated.id))} をライターに昇格しました`,
      );
    }
  };

  const [newEmail, setNewEmail] = useState("");

  // 全アカウントから検出されたカスタムロール一覧（絞り込みセレクト用）
  const customRoleKeys = Array.from(
    new Set(
      allProfiles
        .flatMap((p) => getProfileRoles(p))
        .filter((r) => !["editor", "writer", "engineer", "viewer", "guest"].includes(r)),
    ),
  );

  const filtered = allProfiles.filter((w) => {
    const emailMatch =
      searchEmail === "" ||
      (w.email ? w.email.toLowerCase().includes(searchEmail.toLowerCase()) : false) ||
      (w.display_name ? w.display_name.toLowerCase().includes(searchEmail.toLowerCase()) : false) ||
      (w.username ? w.username.toLowerCase().includes(searchEmail.toLowerCase()) : false);
    const roleMatch = searchRole === "" || profileHasRole(w, searchRole);
    return emailMatch && roleMatch;
  });

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:mx-0 -mt-4 md:mt-0 px-4 md:rounded-xl bg-white border-b md:border border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-4">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="p-2 bg-white rounded-full shadow-sm cursor-pointer hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-purple-800">ライター・ロール管理</h2>
        <span className="ml-auto text-xs text-gray-400">{allProfiles.length} アカウント</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
        <p className="font-bold text-gray-800 text-sm">メアドでライターに昇格</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            placeholder="メールアドレス"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-0"
          />
          <button
            type="button"
            onClick={() => {
              void promoteWriter(newEmail);
              setNewEmail("");
            }}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 cursor-pointer shrink-0"
          >
            昇格
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-2">
        <p className="font-bold text-gray-800 text-sm">絞り込み</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="名前・ID・メアドで検索"
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-0"
          />
          <div className="flex gap-2">
            <select
              value={searchRole}
              onChange={(e) => setSearchRole(e.target.value)}
              className="flex-1 sm:flex-initial border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              <option value="">すべてのロール</option>
              <option value="editor">編集長</option>
              <option value="writer">ライター</option>
              <option value="engineer">エンジニア</option>
              {customRoleKeys.map((cr) => (
                <option key={cr} value={cr}>
                  {getRoleLabel(cr)}
                </option>
              ))}
              <option value="viewer">閲覧者</option>
            </select>
            {(searchEmail || searchRole) && (
              <button
                type="button"
                onClick={() => {
                  setSearchEmail("");
                  setSearchRole("");
                }}
                className="px-3 py-2 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer shrink-0"
              >
                クリア
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">読み込み中...</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => {
            const roles = getProfileRoles(w);
            const customUserRoles = roles.filter(
              (r) => !["editor", "writer", "engineer", "viewer", "guest"].includes(r),
            );
            return (
              <div
                key={w.id}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800 text-sm truncate">
                      {w.display_name ?? "（名前未設定）"}
                    </p>
                    {w.username && (
                      <span className="text-xs text-gray-400 font-mono">@{w.username}</span>
                    )}
                    {roles.map((r) => (
                      <span
                        key={r}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${getRoleBadgeClass(r)}`}
                      >
                        {getRoleLabel(r)}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {w.email ?? "メール非公開"}
                  </p>

                  {/* 複数ロール付与・解除トグルボタン */}
                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
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

                    {/* 付与済みのカスタムロール解除ボタン */}
                    {customUserRoles.map((cr) => (
                      <button
                        key={cr}
                        type="button"
                        onClick={() => void toggleRole(w.id, cr)}
                        title="クリックしてロールを解除"
                        className={`text-xs px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${getRoleBadgeClass(cr)} ring-1 ring-offset-1`}
                      >
                        ✓ {getRoleLabel(cr)} <X className="w-3 h-3" />
                      </button>
                    ))}

                    {/* 新規カスタムロール追加UI */}
                    {openCustomInputId === w.id ? (
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          data-testid={`custom-role-input-${w.id}`}
                          placeholder="例: designer / 広報"
                          value={customRoleInputs[w.id] || ""}
                          onChange={(e) =>
                            setCustomRoleInputs((prev) => ({ ...prev, [w.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void addCustomRole(w.id);
                            }
                          }}
                          className="text-xs border border-purple-300 rounded-lg px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <button
                          type="button"
                          data-testid={`custom-role-submit-${w.id}`}
                          onClick={() => void addCustomRole(w.id)}
                          className="text-xs px-2 py-1 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 cursor-pointer"
                        >
                          追加
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenCustomInputId(null)}
                          className="text-xs px-1.5 py-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid={`open-custom-role-${w.id}`}
                        onClick={() => setOpenCustomInputId(w.id)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600 font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> ロール追加
                      </button>
                    )}
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
            );
          })}
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
