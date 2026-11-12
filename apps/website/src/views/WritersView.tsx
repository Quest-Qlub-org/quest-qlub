import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { CustomUserIcon } from "../components/icons/NavIcons";
import { ChevronLeft, Loader2, UserPlus, UserCheck } from "lucide-react";
import type { Profile } from "../supabase";
import { WriterRowSkeleton } from "../components/Skeleton";
import { useFollows } from "../hooks/useFollows";
import { getProfileRoles, profileHasRole, getRoleLabel } from "../utils/roles";
import { updateMetaTags } from "../utils/seo";

const WriterRow = ({
  w,
  isFollowing,
  currentUserId,
  onToggleFollow,
}: {
  w: Profile;
  isFollowing: boolean;
  currentUserId?: string | null;
  onToggleFollow: (id: string) => void;
}) => {
  const writerName = w.display_name ?? (w.username ? `@${w.username}` : "名称未設定");
  const profilePath = `/writers/${w.username || w.id}`;

  return (
    <div className="relative flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-xl m-2 hover:bg-blue-50 dark:hover:bg-gray-700/60 focus-within:ring-2 focus-within:ring-blue-500 transition-colors shadow-sm">
      <Link
        to={profilePath}
        className="flex items-center gap-4 min-w-0 flex-1 after:absolute after:inset-0 focus-visible:outline-none"
      >
        <div className="bg-gray-100 dark:bg-gray-700 rounded-full border border-gray-200 dark:border-gray-600 overflow-hidden w-12 h-12 flex items-center justify-center shrink-0">
          {w.avatar_url ? (
            <img
              src={w.avatar_url}
              className="w-12 h-12 object-cover"
              alt={`${writerName}のアバター`}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <CustomUserIcon className="w-8 h-8" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-gray-800 dark:text-gray-100 text-base truncate">
            {writerName}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {getProfileRoles(w).map((r) => (
              <span
                key={r}
                className={`text-xs font-bold ${
                  r === "editor"
                    ? "text-purple-600 dark:text-purple-400"
                    : r === "engineer"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-blue-600 dark:text-blue-400"
                }`}
              >
                {getRoleLabel(r)}
              </span>
            ))}
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        {currentUserId !== w.id && (
          <button
            type="button"
            aria-pressed={isFollowing}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFollow(w.id);
            }}
            className={`relative z-10 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm cursor-pointer ${
              isFollowing
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
            }`}
          >
            {isFollowing ? (
              <>
                <UserCheck className="w-3.5 h-3.5" />
                <span>フォロー中</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>フォロー</span>
              </>
            )}
          </button>
        )}
        <span
          className="text-sm font-bold text-gray-500 dark:text-gray-400 hidden sm:flex items-center pointer-events-none"
          aria-hidden="true"
        >
          記事一覧 <ChevronLeft className="w-4 h-4 rotate-180 ml-1" />
        </span>
      </div>
    </div>
  );
};

export const WritersView = () => {
  const {
    writers,
    writersLoading,
    hasMoreWriters,
    loadingMoreWriters,
    loadMoreWriters,
    navigate,
    showToast,
  } = useApp();
  const { isFollowing, toggleFollow, isAuthenticated, currentUserId } = useFollows();

  useEffect(() => {
    updateMetaTags({
      title: "ライター一覧",
      description:
        "Quest Qlubで活躍するライター一覧です。多彩な専門知識を持つ執筆者たちをご紹介します。",
      url: "https://quest-qlub.vercel.app/writers",
    });
  }, []);

  const handleToggleFollow = async (id: string) => {
    if (!isAuthenticated) {
      showToast("フォローするにはログインが必要です");
      navigate("login");
      return;
    }
    if (currentUserId === id) {
      showToast("自分自身をフォローすることはできません");
      return;
    }
    const wasFollowing = isFollowing(id);
    const ok = await toggleFollow(id);
    if (!ok) {
      showToast("フォロー処理に失敗しました");
      return;
    }
    showToast(wasFollowing ? "フォローを解除しました" : "ライターをフォローしました");
  };

  const editors = writers.filter((w) => profileHasRole(w, "editor"));
  const writerList = writers.filter(
    (w) => profileHasRole(w, "writer") && !profileHasRole(w, "editor"),
  );

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">ライター一覧</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Quest Qlub で知識を発信するライター・編集長の一覧です
        </p>
      </div>

      {writersLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <WriterRowSkeleton />
          <WriterRowSkeleton />
          <WriterRowSkeleton />
          <WriterRowSkeleton />
        </div>
      ) : (
        <>
          {editors.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pl-2">
                編集長
              </h2>
              <div className="md:grid md:grid-cols-2 md:gap-2">
                {editors.map((w) => (
                  <WriterRow
                    key={w.id}
                    w={w}
                    isFollowing={isFollowing(w.id)}
                    currentUserId={currentUserId}
                    onToggleFollow={handleToggleFollow}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pl-2">
              ライター
            </h2>
            <div className="md:grid md:grid-cols-2 md:gap-2">
              {writerList.length > 0 ? (
                writerList.map((w) => (
                  <WriterRow
                    key={w.id}
                    w={w}
                    isFollowing={isFollowing(w.id)}
                    currentUserId={currentUserId}
                    onToggleFollow={handleToggleFollow}
                  />
                ))
              ) : (
                <div className="col-span-2 text-center py-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    ライターがまだいません
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Issue #24: ライターページネーション */}
          {hasMoreWriters && (
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={() => void loadMoreWriters()}
                disabled={loadingMoreWriters}
                className="px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-xl transition-all shadow-sm hover:border-gray-400 dark:hover:border-gray-600 disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
              >
                {loadingMoreWriters ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                    <span>読み込み中...</span>
                  </>
                ) : (
                  <span>さらにライターを読み込む</span>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
