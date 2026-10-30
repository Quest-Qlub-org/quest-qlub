import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, X } from "lucide-react";
import { supabase } from "../../supabase";
import type { Profile } from "../../supabase";
import { fetchFollowCounts, fetchFollowDetails } from "../../hooks/useFollows";
import { CustomUserIcon } from "../../components/icons/NavIcons";

function notifyProfileUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("quest_qlub_roles_updated"));
  }
}

export function ProfileSettingsSection({
  profile,
  setProfile,
  setWriters,
  showToast,
}: {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setWriters?: React.Dispatch<React.SetStateAction<Profile[]>>;
  showToast: (msg: string) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
      <div className="p-4 bg-gray-50/50 dark:bg-gray-800/50">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm">プロフィール設定</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          記事やライター一覧に表示される公開情報です
        </p>
      </div>
      <FollowManageSection profile={profile} />
      <AvatarUpload
        profile={profile}
        onUpdate={(url) => {
          setProfile((p) => (p ? { ...p, avatar_url: url } : p));
          if (setWriters && profile) {
            setWriters((ws) =>
              ws.map((w) => (w.id === profile.id ? { ...w, avatar_url: url } : w)),
            );
          }
          notifyProfileUpdated();
          showToast("アイコン画像を更新しました");
        }}
      />
      <DisplayNameEdit
        profile={profile}
        setProfile={setProfile}
        setWriters={setWriters}
        showToast={showToast}
      />
      <UsernameEdit
        profile={profile}
        setProfile={setProfile}
        setWriters={setWriters}
        showToast={showToast}
      />
      <BioEdit
        profile={profile}
        setProfile={setProfile}
        setWriters={setWriters}
        showToast={showToast}
      />
      <XAccountEdit
        profile={profile}
        setProfile={setProfile}
        setWriters={setWriters}
        showToast={showToast}
      />
    </div>
  );
}

function FollowManageSection({ profile }: { profile: Profile | null }) {
  const navigate = useNavigate();
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [modalTab, setModalTab] = useState<"following" | "followers" | null>(null);
  const [followingList, setFollowingList] = useState<Profile[]>([]);
  const [followersList, setFollowersList] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let isMounted = true;
    void fetchFollowCounts(profile.id).then((c) => {
      if (isMounted) {
        setFollowingCount(c.followingCount);
        setFollowersCount(c.followersCount);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const openModal = async (tab: "following" | "followers") => {
    if (!profile?.id) return;
    setModalTab(tab);
    setLoading(true);
    const res = await fetchFollowDetails(profile.id, profile.id);
    if (res.allowed) {
      setFollowingList(res.following);
      setFollowersList(res.followers);
    }
    setLoading(false);
  };

  if (!profile) return null;

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-bold">
        フォロー・フォロワー（詳細確認は本人のみ）
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void openModal("following")}
          className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 transition-colors flex items-center justify-between bg-white dark:bg-gray-800"
        >
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">フォロー中</span>
          <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">
            {followingCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void openModal("followers")}
          className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 transition-colors flex items-center justify-between bg-white dark:bg-gray-800"
        >
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">フォロワー</span>
          <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">
            {followersCount}
          </span>
        </button>
      </div>

      {modalTab && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalTab(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-bold text-gray-900 dark:text-gray-100 text-base">
                  フォロー・フォロワー一覧
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setModalTab(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 border-b border-gray-100 dark:border-gray-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setModalTab("following")}
                className={`py-3 text-center border-b-2 transition-colors ${
                  modalTab === "following"
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                フォロー中 ({followingList.length})
              </button>
              <button
                type="button"
                onClick={() => setModalTab("followers")}
                className={`py-3 text-center border-b-2 transition-colors ${
                  modalTab === "followers"
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                フォロワー ({followersList.length})
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5">
              {loading ? (
                <p className="text-xs text-gray-400 text-center py-8">読み込み中...</p>
              ) : (modalTab === "following" ? followingList : followersList).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">
                  {modalTab === "following"
                    ? "フォロー中のアカウントはありません"
                    : "フォロワーはまだいません"}
                </p>
              ) : (
                (modalTab === "following" ? followingList : followersList).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setModalTab(null);
                      void navigate(`/writers/${item.username || item.id}`);
                    }}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden flex items-center justify-center shrink-0">
                        {item.avatar_url ? (
                          <img
                            src={item.avatar_url}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        ) : (
                          <CustomUserIcon className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">
                          {item.display_name || (item.username ? `@${item.username}` : "ユーザー")}
                        </p>
                        {item.username && (
                          <p className="text-xs text-gray-400 truncate">@{item.username}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarUpload({
  profile,
  onUpdate,
}: {
  profile: Profile | null;
  onUpdate: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const ALLOWED_AVATAR_TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const ext = ALLOWED_AVATAR_TYPES[file.type];
    if (!ext) {
      setError("JPEG、PNG、WebP、GIF形式の画像を選択してください");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("2MB以下の画像を選択してください");
      return;
    }

    setUploading(true);
    setError("");

    const filePath = `${profile.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      setError(`アップロードに失敗しました: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const cleanUrl = data.publicUrl;
    const displayUrl = cleanUrl + "?t=" + Date.now();
    await supabase.from("profiles").update({ avatar_url: cleanUrl }).eq("id", profile.id);
    onUpdate(displayUrl);
    setUploading(false);
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-bold">アイコン画像</p>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-gray-400">👤</span>
          )}
        </div>
        <div className="flex-1">
          <label
            className={`inline-block px-4 py-2 rounded-lg text-sm font-bold cursor-pointer border-2 transition-all ${
              uploading
                ? "bg-gray-100 dark:bg-gray-700 text-gray-400 border-gray-200 dark:border-gray-600"
                : "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            }`}
          >
            {uploading ? "アップロード中..." : "画像を変更"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            JPG / PNG / WebP / GIF・2MB以下
          </p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function DisplayNameEdit({
  profile,
  setProfile,
  setWriters,
  showToast,
}: {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setWriters?: React.Dispatch<React.SetStateAction<Profile[]>>;
  showToast: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name })
        .eq("id", profile.id);
      if (error) {
        showToast("表示名の更新に失敗しました: " + (error.message || "エラーが発生しました"));
      } else {
        setProfile((p) => (p ? { ...p, display_name: name } : p));
        if (setWriters) {
          setWriters((ws) =>
            ws.map((w) => (w.id === profile.id ? { ...w, display_name: name } : w)),
          );
        }
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
          <input
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

function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .split(/[/?#]/)[0]
    .replace(/^@/, "")
    .trim();
}

function UsernameEdit({
  profile,
  setProfile,
  setWriters,
  showToast,
}: {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setWriters?: React.Dispatch<React.SetStateAction<Profile[]>>;
  showToast: (msg: string) => void;
}) {
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
    const { error } = await supabase
      .from("profiles")
      .update({ username: cleanUname })
      .eq("id", profile.id);
    if (error) {
      setErr("このユーザー名はすでに使われています");
    } else {
      setProfile((p) => (p ? { ...p, username: cleanUname } : p));
      if (setWriters) {
        setWriters((ws) =>
          ws.map((w) => (w.id === profile.id ? { ...w, username: cleanUname } : w)),
        );
      }
      notifyProfileUpdated();
      setEditing(false);
      showToast("ユーザー名を更新しました");
    }
    setSaving(false);
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-bold">
        ユーザー名 <span className="text-gray-400 dark:text-gray-500 font-normal">(@username)</span>
      </p>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-400">
              <span className="text-gray-400 dark:text-gray-500 text-sm mr-1">@</span>
              <input
                className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
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
          <p className="text-xs text-gray-400 dark:text-gray-500">
            半角英数字・アンダースコア3〜20文字。プロフィールURLおよびX（旧Twitter）リンクに使用されます。
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800 dark:text-gray-200">
            {profile?.username ? `@${profile.username.replace(/^@/, "")}` : "（未設定）"}
          </p>
          <button
            onClick={() => {
              setUname((profile?.username ?? "").replace(/^@/, ""));
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

function BioEdit({
  profile,
  setProfile,
  setWriters,
  showToast,
}: {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setWriters?: React.Dispatch<React.SetStateAction<Profile[]>>;
  showToast: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ bio }).eq("id", profile.id);
    if (!error) {
      setProfile((p) => (p ? { ...p, bio } : p));
      if (setWriters) {
        setWriters((ws) => ws.map((w) => (w.id === profile.id ? { ...w, bio } : w)));
      }
      setEditing(false);
      showToast("自己紹介を更新しました");
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
    setSaving(false);
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-bold">自己紹介</p>
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="あなたの自己紹介を入力してください"
            maxLength={300}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
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
              <span className="text-gray-400 dark:text-gray-500">（未設定）</span>
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

function XAccountEdit({
  profile,
  setProfile,
  setWriters,
  showToast,
}: {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setWriters?: React.Dispatch<React.SetStateAction<Profile[]>>;
  showToast: (msg: string) => void;
}) {
  const currentXHandle = (profile?.x_account ?? "").replace(/^@/, "");
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(currentXHandle);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!profile) return;
    const cleanHandle = normalizeHandle(handle);
    if (cleanHandle && !/^[a-zA-Z0-9_]{1,15}$/.test(cleanHandle)) {
      setErr("半角英数字・アンダースコアのみ。1〜15文字で入力してください");
      return;
    }
    setSaving(true);
    setErr("");
    const { error } = await supabase
      .from("profiles")
      .update({ x_account: cleanHandle || null })
      .eq("id", profile.id);
    if (!error) {
      setProfile((p) => (p ? { ...p, x_account: cleanHandle || null } : p));
      if (setWriters) {
        setWriters((ws) =>
          ws.map((w) => (w.id === profile.id ? { ...w, x_account: cleanHandle || null } : w)),
        );
      }
      setEditing(false);
      showToast("Xアカウントを更新しました");
    } else {
      setErr("保存できませんでした。しばらくして再度お試しください");
      showToast("更新に失敗しました");
    }
    setSaving(false);
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-bold">X（旧Twitter）連携</p>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-400">
              <span className="text-gray-400 dark:text-gray-500 text-sm mr-1">@</span>
              <input
                className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
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
          <p className="text-xs text-gray-400 dark:text-gray-500">
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
