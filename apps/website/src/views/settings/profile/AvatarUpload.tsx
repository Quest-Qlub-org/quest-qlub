import { useState } from "react";
import { supabase } from "../../../supabase";
import type { Profile } from "../../../supabase";

const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * プロフィールアイコン画像のアップロード・更新セクション
 */
export function AvatarUpload({
  profile,
  onUpdate,
}: {
  profile: Profile | null;
  onUpdate: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

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

    try {
      const filePath = `${profile.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });
      if (uploadError) {
        setError(`アップロードに失敗しました: ${uploadError.message}`);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const cleanUrl = data.publicUrl;
      const displayUrl = cleanUrl + "?t=" + Date.now();
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ avatar_url: cleanUrl })
        .eq("id", profile.id);

      if (dbError) {
        setError(`プロフィール画像の保存に失敗しました: ${dbError.message}`);
        return;
      }

      onUpdate(displayUrl);
    } catch {
      setError("画像のアップロード中にエラーが発生しました");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-bold">アイコン画像</p>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name ? `${profile.display_name}のアバター` : "現在のアバター"}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-2xl text-gray-500 dark:text-gray-400">👤</span>
          )}
        </div>
        <div className="flex-1">
          <label
            className={`inline-block px-4 py-2 rounded-lg text-sm font-bold cursor-pointer border-2 transition-all ${
              uploading
                ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600"
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            JPG / PNG / WebP / GIF・2MB以下
          </p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
