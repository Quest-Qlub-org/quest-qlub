import { useState } from "react";
import { supabase } from "../../../supabase";
import type { Profile } from "../../../supabase";
import { normalizeHandle, normalizeXAccount } from "../../../utils/validation";

export function notifyProfileUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("quest_qlub_roles_updated"));
  }
}

export interface ProfileFieldEditorProps {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setWriters?: React.Dispatch<React.SetStateAction<Profile[]>>;
  showToast: (msg: string) => void;
}

function applyProfilePatch(
  profileId: string,
  patch: Partial<Profile>,
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>,
  setWriters?: React.Dispatch<React.SetStateAction<Profile[]>>,
) {
  setProfile((p) => (p ? { ...p, ...patch } : p));
  if (setWriters) {
    setWriters((ws) => ws.map((w) => (w.id === profileId ? { ...w, ...patch } : w)));
  }
}

/**
 * 表示名の編集セクション
 */
export function DisplayNameEdit({
  profile,
  setProfile,
  setWriters,
  showToast,
}: ProfileFieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("表示名を入力してください");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmedName })
        .eq("id", profile.id);
      if (error) {
        showToast("表示名の更新に失敗しました: " + (error.message || "エラーが発生しました"));
      } else {
        applyProfilePatch(profile.id, { display_name: trimmedName }, setProfile, setWriters);
        notifyProfileUpdated();
        setEditing(false);
        showToast("表示名を更新しました");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "エラーが発生しました";
      showToast("表示名の更新に失敗しました: " + message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-bold">表示名</p>
      {editing ? (
        <div className="flex gap-2">
          <label htmlFor="profile-display-name-input" className="sr-only">
            表示名
          </label>
          <input
            id="profile-display-name-input"
            autoComplete="name"
            className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "…" : "保存"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-bold rounded-lg"
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800 dark:text-gray-200">
            {profile?.display_name ?? "（未設定）"}
          </p>
          <button
            onClick={() => {
              setName(profile?.display_name ?? "");
              setEditing(true);
            }}
            className="text-xs text-blue-500 dark:text-blue-400 font-bold underline"
          >
            編集
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * ユーザー名（@username）の編集セクション
 */
export function UsernameEdit({
  profile,
  setProfile,
  setWriters,
  showToast,
}: ProfileFieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [uname, setUname] = useState(profile?.username ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!profile) return;
    const cleanUname = normalizeHandle(uname);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUname)) {
      setErr("半角英数字・アンダースコアのみ。3〜20文字で入力してください");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username: cleanUname })
        .eq("id", profile.id);
      if (error) {
        const isDuplicateError =
          error.code === "23505" ||
          (typeof error.message === "string" &&
            (error.message.toLowerCase().includes("duplicate") ||
              error.message.toLowerCase().includes("unique")));
        setErr(
          isDuplicateError
            ? "このユーザー名はすでに使われています"
            : `ユーザー名の更新に失敗しました: ${error.message || "エラーが発生しました"}`,
        );
      } else {
        applyProfilePatch(profile.id, { username: cleanUname }, setProfile, setWriters);
        notifyProfileUpdated();
        setEditing(false);
        showToast("ユーザー名を更新しました");
      }
    } catch {
      setErr("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-bold">
        ユーザー名 <span className="text-gray-500 dark:text-gray-400 font-normal">(@username)</span>
      </p>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-400">
              <label htmlFor="profile-username-input" className="sr-only">
                ユーザー名
              </label>
              <span className="text-gray-500 dark:text-gray-400 text-sm mr-1" aria-hidden="true">
                @
              </span>
              <input
                id="profile-username-input"
                autoComplete="username"
                className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none"
                value={uname}
                onChange={(e) => {
                  setUname(e.target.value);
                  setErr("");
                }}
                placeholder="例: taro_yamada"
              />
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "…" : "保存"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setErr("");
              }}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-bold rounded-lg"
            >
              取消
            </button>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            半角英数字・アンダースコア3〜20文字。プロフィールURLおよびX（旧Twitter）リンクに使用されます。
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800 dark:text-gray-200">
            {profile?.username ? `@${normalizeHandle(profile.username)}` : "（未設定）"}
          </p>
          <button
            onClick={() => {
              setUname(normalizeHandle(profile?.username));
              setEditing(true);
            }}
            className="text-xs text-blue-500 dark:text-blue-400 font-bold underline"
          >
            編集
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 自己紹介文の編集セクション
 */
export function BioEdit({ profile, setProfile, setWriters, showToast }: ProfileFieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ bio }).eq("id", profile.id);
      if (!error) {
        applyProfilePatch(profile.id, { bio }, setProfile, setWriters);
        setEditing(false);
        showToast("自己紹介を更新しました");
      } else {
        showToast("エラーが発生しました。もう一度お試しください。");
      }
    } catch {
      showToast("エラーが発生しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-bold">自己紹介</p>
      {editing ? (
        <div className="space-y-2">
          <label htmlFor="profile-bio-input" className="sr-only">
            自己紹介
          </label>
          <textarea
            id="profile-bio-input"
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="あなたの自己紹介を入力してください"
            maxLength={300}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 text-right">
            {bio.length}/300文字
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "…" : "保存"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setBio(profile?.bio ?? "");
              }}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-bold rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 whitespace-pre-wrap">
            {profile?.bio ? (
              profile.bio
            ) : (
              <span className="text-gray-500 dark:text-gray-400">（未設定）</span>
            )}
          </p>
          <button
            onClick={() => {
              setBio(profile?.bio ?? "");
              setEditing(true);
            }}
            className="text-xs text-blue-500 dark:text-blue-400 font-bold underline shrink-0"
          >
            編集
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * X（旧Twitter）アカウント連携の編集セクション
 */
export function XAccountEdit({
  profile,
  setProfile,
  setWriters,
  showToast,
}: ProfileFieldEditorProps) {
  const currentXHandle = normalizeXAccount(profile?.x_account);
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(currentXHandle);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!profile) return;
    const cleanHandle = normalizeXAccount(handle);
    if (cleanHandle && !/^[a-zA-Z0-9_]{1,15}$/.test(cleanHandle)) {
      setErr("半角英数字・アンダースコアのみ。1〜15文字で入力してください");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ x_account: cleanHandle || null })
        .eq("id", profile.id);
      if (!error) {
        applyProfilePatch(profile.id, { x_account: cleanHandle || null }, setProfile, setWriters);
        setEditing(false);
        showToast("Xアカウントを更新しました");
      } else {
        setErr("保存できませんでした。しばらくして再度お試しください");
        showToast("更新に失敗しました");
      }
    } catch {
      setErr("通信エラーが発生しました");
      showToast("更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-bold">X（旧Twitter）連携</p>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-400">
              <label htmlFor="profile-x-account-input" className="sr-only">
                Xアカウント名
              </label>
              <span className="text-gray-500 dark:text-gray-400 text-sm mr-1" aria-hidden="true">
                @
              </span>
              <input
                id="profile-x-account-input"
                className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none"
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  setErr("");
                }}
                placeholder="username"
              />
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "…" : "保存"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setErr("");
              }}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-bold rounded-lg"
            >
              取消
            </button>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Xのユーザー名（@なし、またはURL）を入力するとプロフィールにXリンクが表示されます。
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800 dark:text-gray-200">
            {currentXHandle ? `@${currentXHandle}` : "（未設定）"}
          </p>
          <button
            onClick={() => {
              setHandle(currentXHandle);
              setErr("");
              setEditing(true);
            }}
            className="text-xs text-blue-500 dark:text-blue-400 font-bold underline"
          >
            編集
          </button>
        </div>
      )}
    </div>
  );
}
