import type React from "react";
import { Link } from "react-router-dom";
import { UserCheck, UserPlus } from "lucide-react";
import { CustomUserIcon } from "../../components/icons/NavIcons";
import type { Profile } from "../../supabase";
import type { Article } from "../../types";

interface ArticleAuthorSectionProps {
  article: Article;
  writer: Profile | null;
  writers: Profile[];
  collaboratorFallbacks: Profile[];
  currentUserId: string | null;
  isAuthenticated: boolean;
  isFollowing: (id: string) => boolean;
  toggleFollow: (id: string) => Promise<boolean>;
  showToast: (msg: string) => void;
  onNavigateLogin: () => void;
}

function getProfileDisplayName(p: Profile): string {
  return p.display_name ?? (p.username ? `@${p.username}` : "名称未設定");
}

function AuthorAvatar({ profile, displayName }: { profile: Profile; displayName: string }) {
  return profile.avatar_url ? (
    <img
      src={profile.avatar_url}
      className="w-8 h-8 rounded-full object-cover"
      alt={`${displayName}のアバター`}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <CustomUserIcon className="w-8 h-8" />
  );
}

/**
 * 記事の執筆者・共同執筆者カードおよびフォローボタンを表示するセクション。
 */
export function ArticleAuthorSection({
  article,
  writer,
  writers,
  collaboratorFallbacks,
  currentUserId,
  isAuthenticated,
  isFollowing,
  toggleFollow,
  showToast,
  onNavigateLogin,
}: ArticleAuthorSectionProps) {
  const handleFollowClick = async (targetId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isAuthenticated) {
      showToast("フォローするにはログインが必要です");
      onNavigateLogin();
      return;
    }
    if (currentUserId === targetId) {
      showToast("自分自身をフォローすることはできません");
      return;
    }
    const wasFollowing = isFollowing(targetId);
    const ok = await toggleFollow(targetId);
    if (!ok) {
      showToast("フォロー処理に失敗しました");
      return;
    }
    showToast(wasFollowing ? "フォローを解除しました" : "ライターをフォローしました");
  };

  const uniqueCollaboratorIds = Array.from(
    new Set((article.collaboratorIds ?? []).filter((id) => id && id !== article.writerId)),
  );

  const coAuthors = uniqueCollaboratorIds.map(
    (id) =>
      writers.find((w) => w.id === id) ||
      collaboratorFallbacks.find((w) => w.id === id) ||
      ({
        id,
        role: "writer" as const,
        display_name: null,
        username: null,
        avatar_url: null,
      } as Profile),
  );

  // 単独執筆（共同執筆者がいない場合）: 従来通りの横幅すべてを使う単一カード表示
  if (coAuthors.length === 0) {
    const singleWriter: Profile | null =
      writer ||
      (article.writerId
        ? ({
            id: article.writerId,
            role: "writer" as const,
            display_name: null,
            username: null,
            avatar_url: null,
          } as Profile)
        : null);

    if (!singleWriter) return null;

    const singleWriterName = getProfileDisplayName(singleWriter);
    const following = isFollowing(singleWriter.id);

    return (
      <Link
        to={`/writers/${singleWriter.username || singleWriter.id}`}
        data-testid={`author-card-${singleWriter.id}`}
        className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-full border border-gray-200 dark:border-gray-600">
            <AuthorAvatar profile={singleWriter} displayName={singleWriterName} />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mb-0.5">
              この記事を執筆した人
            </p>
            <p className="font-bold text-gray-800 dark:text-gray-100">{singleWriterName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentUserId !== singleWriter.id && (
            <button
              type="button"
              onClick={(e) => void handleFollowClick(singleWriter.id, e)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer ${
                following
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
              }`}
            >
              {following ? (
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
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-3 py-1.5 rounded-full hidden sm:inline-block">
            プロフィールへ
          </span>
        </div>
      </Link>
    );
  }

  // 共同執筆者が存在する場合: 複数人一覧表示
  const authors: Array<{ profile: Profile; roleLabel: string; isPrimary: boolean }> = [];
  if (article.writerId) {
    const mainAuthor: Profile =
      writer ||
      ({
        id: article.writerId,
        role: "writer",
        display_name: null,
        username: null,
        avatar_url: null,
      } as Profile);
    authors.push({ profile: mainAuthor, roleLabel: "主執筆", isPrimary: true });
  } else if (writer) {
    authors.push({ profile: writer, roleLabel: "主執筆", isPrimary: true });
  }

  coAuthors.forEach((ca) => {
    authors.push({ profile: ca, roleLabel: "共同執筆", isPrimary: false });
  });

  return (
    <div className="space-y-3 pt-2">
      <h2 className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
        この記事を執筆した人
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {authors.map(({ profile: authorProfile, roleLabel, isPrimary }) => {
          const displayName = getProfileDisplayName(authorProfile);
          const isMe = currentUserId === authorProfile.id;
          const following = isFollowing(authorProfile.id);

          return (
            <div
              key={authorProfile.id}
              data-testid={`author-card-${authorProfile.id}`}
              className="flex items-center justify-between gap-2 p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xs hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              <Link
                to={`/writers/${authorProfile.username || authorProfile.id}`}
                className="flex items-center justify-between gap-3 flex-1 min-w-0 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-full border border-gray-200 dark:border-gray-600 shrink-0">
                    <AuthorAvatar profile={authorProfile} displayName={displayName} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                          isPrimary
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                        }`}
                      >
                        {roleLabel}
                      </span>
                    </div>
                    <p className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">
                      {displayName}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 rounded-full hidden sm:inline-block shrink-0">
                  詳細
                </span>
              </Link>
              {!isMe && (
                <button
                  type="button"
                  aria-pressed={following}
                  onClick={() => void handleFollowClick(authorProfile.id)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ${
                    following
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  {following ? (
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
