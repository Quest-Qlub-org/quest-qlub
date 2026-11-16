import { useState, useEffect, useCallback } from "react";
import type { Profile } from "../../../supabase";
import { fetchFollowCounts, fetchFollowDetails } from "../../../hooks/useFollows";
import { FollowListModal } from "../../../components/FollowListModal";

/**
 * プロフィール設定内のフォロー・フォロワー数および一覧モーダル管理セクション
 */
export function FollowManageSection({ profile }: { profile: Profile | null }) {
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [modalTab, setModalTab] = useState<"following" | "followers" | null>(null);
  const [followingList, setFollowingList] = useState<Profile[]>([]);
  const [followersList, setFollowersList] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const closeModal = useCallback(() => setModalTab(null), []);

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

      <FollowListModal
        activeTab={modalTab}
        onTabChange={setModalTab}
        followingList={followingList}
        followersList={followersList}
        loading={loading}
        onClose={closeModal}
      />
    </div>
  );
}
