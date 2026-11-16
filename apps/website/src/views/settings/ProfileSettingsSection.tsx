import type { Profile } from "../../supabase";
import { FollowManageSection } from "./profile/FollowManageSection";
import { AvatarUpload } from "./profile/AvatarUpload";
import {
  notifyProfileUpdated,
  DisplayNameEdit,
  UsernameEdit,
  BioEdit,
  XAccountEdit,
} from "./profile/ProfileFieldEditors";

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
