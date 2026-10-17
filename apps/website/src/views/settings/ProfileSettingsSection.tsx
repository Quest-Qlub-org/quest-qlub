import { useState } from "react";
import { supabase } from "../../supabase";
import type { Profile } from "../../supabase";

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
      <div className="p-4 bg-gray-50/50">
        <h2 className="font-bold text-gray-900 text-sm">プロフィール設定</h2>
        <p className="text-xs text-gray-500 mt-0.5">記事やライター一覧に表示される公開情報です</p>
      </div>
      <AvatarUpload
        profile={profile}
        onUpdate={(url) => {
          setProfile((p) => (p ? { ...p, avatar_url: url } : p));
          if (setWriters && profile) {
            setWriters((ws) =>
              ws.map((w) => (w.id === profile.id ? { ...w, avatar_url: url } : w)),
            );
          }
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
      <p className="text-xs text-gray-500 mb-2 font-bold">アイコン画像</p>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
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
                ? "bg-gray-100 text-gray-400 border-gray-200"
                : "bg-white text-blue-600 border-blue-500 hover:bg-blue-50"
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
          <p className="text-xs text-gray-400 mt-1">JPG / PNG / WebP / GIF・2MB以下</p>
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
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", profile.id);
    if (!error) {
      setProfile((p) => (p ? { ...p, display_name: name } : p));
      if (setWriters) {
        setWriters((ws) => ws.map((w) => (w.id === profile.id ? { ...w, display_name: name } : w)));
      }
      setEditing(false);
      showToast("表示名を更新しました");
    }
    setSaving(false);
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 mb-1 font-bold">表示名</p>
      {editing ? (
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg"
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800">{profile?.display_name ?? "（未設定）"}</p>
          <button
            onClick={() => {
              setName(profile?.display_name ?? "");
              setEditing(true);
            }}
            className="text-xs text-blue-500 font-bold underline"
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
      setProfile((p) => (p ? { ...p, username: cleanUname, x_account: cleanUname } : p));
      if (setWriters) {
        setWriters((ws) =>
          ws.map((w) =>
            w.id === profile.id ? { ...w, username: cleanUname, x_account: cleanUname } : w,
          ),
        );
      }
      setEditing(false);
      showToast("ユーザー名を更新しました");
    }
    setSaving(false);
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 mb-1 font-bold">
        ユーザー名 <span className="text-gray-400 font-normal">(@username)</span>
      </p>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center border border-gray-300 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-400">
              <span className="text-gray-400 text-sm mr-1">@</span>
              <input
                className="flex-1 text-sm focus:outline-none"
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
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg"
            >
              取消
            </button>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <p className="text-xs text-gray-400">
            半角英数字・アンダースコア3〜20文字。プロフィールURLおよびX（旧Twitter）リンクに使用されます。
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800">
            {profile?.username ? `@${profile.username.replace(/^@/, "")}` : "（未設定）"}
          </p>
          <button
            onClick={() => {
              setUname((profile?.username ?? "").replace(/^@/, ""));
              setEditing(true);
            }}
            className="text-xs text-blue-500 font-bold underline"
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
      <p className="text-xs text-gray-500 mb-1 font-bold">自己紹介</p>
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="あなたの自己紹介を入力してください"
            maxLength={300}
          />
          <p className="text-xs text-gray-400 text-right">{bio.length}/300文字</p>
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
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-700 flex-1 whitespace-pre-wrap">
            {profile?.bio ? profile.bio : <span className="text-gray-400">（未設定）</span>}
          </p>
          <button
            onClick={() => {
              setBio(profile?.bio ?? "");
              setEditing(true);
            }}
            className="text-xs text-blue-500 font-bold underline shrink-0"
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
  const currentXHandle = (profile?.x_account || profile?.username || "").replace(/^@/, "");
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(currentXHandle);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!profile) return;
    const cleanHandle = normalizeHandle(handle);
    if (cleanHandle && !/^[a-zA-Z0-9_]{3,20}$/.test(cleanHandle)) {
      setErr("半角英数字・アンダースコアのみ。3〜20文字で入力してください");
      return;
    }
    setSaving(true);
    setErr("");
    const { error } = await supabase
      .from("profiles")
      .update({ username: cleanHandle || null })
      .eq("id", profile.id);
    if (!error) {
      setProfile((p) =>
        p
          ? {
              ...p,
              username: cleanHandle || null,
              x_account: cleanHandle || undefined,
            }
          : p,
      );
      if (setWriters) {
        setWriters((ws) =>
          ws.map((w) =>
            w.id === profile.id
              ? {
                  ...w,
                  username: cleanHandle || null,
                  x_account: cleanHandle || undefined,
                }
              : w,
          ),
        );
      }
      setEditing(false);
      showToast("Xアカウントを更新しました");
    } else {
      setErr("このユーザー名はすでに使われているか、保存できませんでした");
      showToast("更新に失敗しました");
    }
    setSaving(false);
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 mb-1 font-bold">X（旧Twitter）連携</p>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center border border-gray-300 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-400">
              <span className="text-gray-400 text-sm mr-1">@</span>
              <input
                className="flex-1 text-sm focus:outline-none"
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
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg"
            >
              取消
            </button>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <p className="text-xs text-gray-400">
            Xのユーザー名（@なし、またはURL）を入力するとプロフィールにXリンクが表示されます。
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800">
            {currentXHandle ? `@${currentXHandle}` : "（未設定）"}
          </p>
          <button
            onClick={() => {
              setHandle(currentXHandle);
              setErr("");
              setEditing(true);
            }}
            className="text-xs text-blue-500 font-bold underline"
          >
            編集
          </button>
        </div>
      )}
    </div>
  );
}
