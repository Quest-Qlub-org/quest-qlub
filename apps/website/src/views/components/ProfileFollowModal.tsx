import { Link } from "react-router-dom";
import { Users, X } from "lucide-react";
import { CustomUserIcon } from "../../components/icons/NavIcons";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { Profile } from "../../supabase";

interface ProfileFollowModalProps {
  activeTab: "following" | "followers" | null;
  onChangeTab: (tab: "following" | "followers") => void;
  onClose: () => void;
  loading: boolean;
  followingList: Profile[];
  followersList: Profile[];
}

/**
 * プロフィール本人向けのフォロー中・フォロワー詳細一覧モーダル。
 */
export function ProfileFollowModal({
  activeTab,
  onChangeTab,
  onClose,
  loading,
  followingList,
  followersList,
}: ProfileFollowModalProps) {
  const modalRef = useFocusTrap(Boolean(activeTab), onClose);

  if (!activeTab) return null;

  const list = activeTab === "following" ? followingList : followersList;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-modal-title"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2
              id="follow-modal-title"
              className="font-bold text-gray-900 dark:text-gray-100 text-base"
            >
              フォロー・フォロワー管理
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 border-b border-gray-100 dark:border-gray-700 text-xs font-bold">
          <button
            type="button"
            onClick={() => onChangeTab("following")}
            className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
              activeTab === "following"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/40"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            フォロー中 ({followingList.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab("followers")}
            className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
              activeTab === "followers"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/40"
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
          ) : list.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              {activeTab === "following"
                ? "フォロー中のアカウントはありません"
                : "フォロワーはまだいません"}
            </p>
          ) : (
            list.map((item) => {
              const itemDisplayName =
                item.display_name || (item.username ? `@${item.username}` : "ユーザー");
              return (
                <Link
                  key={item.id}
                  to={`/writers/${item.username || item.id}`}
                  onClick={onClose}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden flex items-center justify-center shrink-0">
                      {item.avatar_url ? (
                        <img
                          src={item.avatar_url}
                          className="w-full h-full object-cover"
                          alt={`${itemDisplayName}のアバター`}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <CustomUserIcon className="w-6 h-6" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                        {itemDisplayName}
                      </p>
                      {item.username && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          @{item.username}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
