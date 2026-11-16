import { Link } from "react-router-dom";
import { Users, X } from "lucide-react";
import type { Profile } from "../supabase";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { CustomUserIcon } from "./icons/NavIcons";

interface FollowListModalProps {
  activeTab: "following" | "followers" | null;
  onTabChange: (tab: "following" | "followers") => void;
  followingList: Profile[];
  followersList: Profile[];
  loading: boolean;
  onClose: () => void;
}

/**
 * フォロー中・フォロワー一覧をタブ切り替えで表示するモーダル
 */
export function FollowListModal({
  activeTab,
  onTabChange,
  followingList,
  followersList,
  loading,
  onClose,
}: FollowListModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>(Boolean(activeTab), onClose);

  if (!activeTab) return null;

  const activeList = activeTab === "following" ? followingList : followersList;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-manage-modal-title"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2
              id="follow-manage-modal-title"
              className="font-bold text-gray-900 dark:text-gray-100 text-base"
            >
              フォロー・フォロワー一覧
            </h2>
          </div>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 border-b border-gray-100 dark:border-gray-700 text-xs font-bold">
          <button
            type="button"
            onClick={() => onTabChange("following")}
            className={`py-3 text-center border-b-2 transition-colors ${
              activeTab === "following"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            フォロー中 ({followingList.length})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("followers")}
            className={`py-3 text-center border-b-2 transition-colors ${
              activeTab === "followers"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            フォロワー ({followersList.length})
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5">
          {loading ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              読み込み中...
            </p>
          ) : activeList.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              {activeTab === "following"
                ? "フォロー中のアカウントはありません"
                : "フォロワーはまだいません"}
            </p>
          ) : (
            activeList.map((item) => (
              <Link
                key={item.id}
                to={`/writers/${item.username || item.id}`}
                onClick={onClose}
                className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden flex items-center justify-center shrink-0">
                    {item.avatar_url ? (
                      <img src={item.avatar_url} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <CustomUserIcon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">
                      {item.display_name || (item.username ? `@${item.username}` : "ユーザー")}
                    </p>
                    {item.username && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        @{item.username}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
