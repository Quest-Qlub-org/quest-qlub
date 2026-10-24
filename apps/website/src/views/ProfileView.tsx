import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { LogoIcon, CustomUserIcon } from "../components/icons/NavIcons";
import { ArticleCard } from "../components/ArticleCard";
import { ChevronLeft, UserPlus, UserCheck, Loader2, Users, X } from "lucide-react";
import { useFollows, fetchFollowCounts, fetchFollowDetails } from "../hooks/useFollows";
import { updateMetaTags, resetMetaTags } from "../utils/seo";
import { supabase } from "../supabase";
import type { Profile } from "../supabase";
import type { Article } from "../types";
import { mapDbArticleToArticle } from "../types";
import { ARTICLE_LIST_FIELDS } from "../context/DataContext";
import { getProfileRoles, getRoleLabel } from "../utils/roles";
import { fetchSingleProfileWithFallback } from "../utils/profileQueries";

export const ProfileView = () => {
  const { username } = useParams<{ username: string }>();
  const { writers, writersLoading, articles, navigate, viewParam, showToast, profile, user } =
    useApp();
  const { isFollowing, toggleFollow, isAuthenticated } = useFollows();

  const currentUserId = profile?.id || user?.id || null;
  const targetIdentifier = username || viewParam;
  const cleanTarget = (targetIdentifier || "").replace(/^@/, "");

  // キャッシュまたは個別フェッチしたライター情報
  const cachedWriter = writers.find(
    (w) =>
      w.id === targetIdentifier ||
      w.username === cleanTarget ||
      `@${w.username}` === targetIdentifier,
  );

  const [writer, setWriter] = useState<Profile | null>(cachedWriter || null);
  const [writerArticles, setWriterArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(!cachedWriter);
  const [notFound, setNotFound] = useState(false);

  // フォロー数・フォロワー数（誰でも閲覧可能）
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);

  // 詳細アカウント一覧モーダル（本人のみ閲覧可能）
  const [followModalTab, setFollowModalTab] = useState<"following" | "followers" | null>(null);
  const [followingList, setFollowingList] = useState<Profile[]>([]);
  const [followersList, setFollowersList] = useState<Profile[]>([]);
  const [loadingFollowDetails, setLoadingFollowDetails] = useState(false);

  const loadCounts = useCallback(async (userId: string) => {
    const counts = await fetchFollowCounts(userId);
    setFollowingCount(counts.followingCount);
    setFollowersCount(counts.followersCount);
  }, []);

  useEffect(() => {
    if (!targetIdentifier) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let isMounted = true;

    // 既にキャッシュにあれば即時表示しつつ最新化
    if (cachedWriter) {
      setWriter(cachedWriter);
      setLoading(false);
    }

    const fetchWriterData = async () => {
      try {
        let profileData = cachedWriter || null;

        if (!profileData) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            targetIdentifier,
          );
          const fetchedProfile = await fetchSingleProfileWithFallback(
            isUuid ? { id: targetIdentifier } : { username: cleanTarget },
          );

          if (!isMounted) return;

          if (!fetchedProfile) {
            if (!cachedWriter) setNotFound(true);
            setLoading(false);
            return;
          }
          profileData = fetchedProfile;
          setWriter(profileData);
          setNotFound(false);
        }

        // ライターの公開記事とフォローカウントを取得
        if (profileData) {
          void loadCounts(profileData.id);

          const { data: artsData } = await supabase
            .from("articles")
            .select(ARTICLE_LIST_FIELDS)
            .eq("writer_id", profileData.id)
            .eq("status", "published")
            .order("created_at", { ascending: false });

          if (!isMounted) return;

          if (artsData && artsData.length > 0) {
            setWriterArticles(artsData.map((item) => mapDbArticleToArticle(item)));
          } else {
            // グローバルarticlesからフォールバック
            const fallback = articles.filter(
              (a) => a.writerId === profileData?.id && a.status === "published",
            );
            setWriterArticles(fallback);
          }
        }
      } catch (e) {
        console.error("Failed to load writer profile", e);
        if (!cachedWriter && isMounted) setNotFound(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchWriterData();

    return () => {
      isMounted = false;
    };
  }, [targetIdentifier, cleanTarget, cachedWriter, loadCounts]);

  const cleanUsername = (writer?.username || "").replace(/^@/, "");
  const xAccount = (writer?.x_account || "").replace(/^@/, "");
  const following = writer ? isFollowing(writer.id) : false;
  const isOwnProfile = Boolean(writer && currentUserId && writer.id === currentUserId);

  const handleOpenFollowModal = async (tab: "following" | "followers") => {
    if (!writer || !isOwnProfile) return;
    setFollowModalTab(tab);
    setLoadingFollowDetails(true);
    const details = await fetchFollowDetails(writer.id, currentUserId);
    if (details.allowed) {
      setFollowingList(details.following);
      setFollowersList(details.followers);
    }
    setLoadingFollowDetails(false);
  };

  useEffect(() => {
    if (!writer) return;
    const writerName = writer.display_name ?? (cleanUsername ? `@${cleanUsername}` : "ライター");
    const description = writer.bio || `${writerName} さんのプロフィールと記事一覧です。`;
    const url = `${window.location.origin}/writers/${cleanUsername || writer.id}`;

    updateMetaTags({
      title: `${writerName}のプロフィール`,
      description,
      image: writer.avatar_url,
      url,
      type: "profile",
    });

    return () => {
      resetMetaTags();
    };
  }, [writer, cleanUsername]);

  useEffect(() => {
    if (notFound) {
      updateMetaTags({
        title: "プロフィールが見つかりません",
        noindex: true,
      });
      return () => {
        resetMetaTags();
      };
    }
  }, [notFound]);

  if (loading || (writersLoading && !writer)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">プロフィールを読み込んでいます...</p>
      </div>
    );
  }

  if (notFound || !writer) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-gray-500 text-base font-bold">プロフィールが見つかりません</p>
        <button
          onClick={() => navigate("writers")}
          className="px-5 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors"
        >
          ライター一覧へ戻る
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in slide-in-from-right-8 duration-300">
      <div className="bg-gradient-to-b from-blue-500 to-blue-700 dark:from-blue-700 dark:to-gray-900 pt-12 pb-8 px-4 text-center text-white relative">
        <button
          onClick={() => navigate("writers")}
          className="absolute top-4 left-4 p-2 rounded-full bg-black/20 hover:bg-black/30 flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
          <span className="text-xs font-bold">戻る</span>
        </button>
        <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg border-4 border-white dark:border-gray-800 overflow-hidden">
          {writer.avatar_url ? (
            <img src={writer.avatar_url} className="w-24 h-24 object-cover" alt="" />
          ) : (
            <CustomUserIcon className="w-16 h-16" />
          )}
        </div>
        <h2 className="text-2xl font-bold mb-1">
          {writer.display_name ?? (cleanUsername ? `@${cleanUsername}` : "名称未設定")}
        </h2>
        <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
          {getProfileRoles(writer).map((r) => (
            <span
              key={r}
              className="inline-block px-3 py-1 bg-white/20 rounded-full text-sm font-bold backdrop-blur-sm"
            >
              {getRoleLabel(r)}
            </span>
          ))}
          {!isOwnProfile && (
            <button
              type="button"
              onClick={async () => {
                if (!isAuthenticated) {
                  showToast("フォローするにはログインが必要です");
                  navigate("login");
                  return;
                }
                const wasFollowing = following;
                const ok = await toggleFollow(writer.id);
                if (!ok) {
                  showToast("フォロー処理に失敗しました");
                  return;
                }
                setFollowersCount((c) => (wasFollowing ? Math.max(0, c - 1) : c + 1));
                showToast(wasFollowing ? "フォローを解除しました" : "ライターをフォローしました");
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold transition-all shadow-sm cursor-pointer ${
                following
                  ? "bg-white text-blue-700 hover:bg-blue-50"
                  : "bg-blue-600 border border-white/50 text-white hover:bg-blue-500"
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

        {/* フォロー中・フォロワー数（誰でもカウントは確認可能、詳細一覧は本人のみクリック可能） */}
        <div className="flex items-center justify-center gap-4 my-3">
          {isOwnProfile ? (
            <>
              <button
                type="button"
                data-testid="open-following-list"
                onClick={() => void handleOpenFollowModal("following")}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span className="text-sm font-extrabold">{followingCount}</span>
                <span className="text-white/90">フォロー中</span>
              </button>
              <button
                type="button"
                data-testid="open-followers-list"
                onClick={() => void handleOpenFollowModal("followers")}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span className="text-sm font-extrabold">{followersCount}</span>
                <span className="text-white/90">フォロワー</span>
              </button>
            </>
          ) : (
            <>
              <div
                data-testid="public-following-count"
                className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold flex items-center gap-1.5 select-none"
              >
                <span className="text-sm font-extrabold">{followingCount}</span>
                <span className="text-white/90">フォロー中</span>
              </div>
              <div
                data-testid="public-followers-count"
                className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold flex items-center gap-1.5 select-none"
              >
                <span className="text-sm font-extrabold">{followersCount}</span>
                <span className="text-white/90">フォロワー</span>
              </div>
            </>
          )}
        </div>

        {xAccount && (
          <div className="mt-2">
            <a
              href={`https://x.com/${encodeURIComponent(xAccount)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-black/20 hover:bg-black/35 text-white rounded-full text-xs font-bold backdrop-blur-sm transition-all border border-white/20 hover:border-white/40 shadow-sm"
              aria-label={`@${xAccount} のX（旧Twitter）アカウントを開く`}
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>@{xAccount}</span>
            </a>
          </div>
        )}
      </div>
      <div className="p-4 md:p-8 space-y-6 -mt-4 relative z-10">
        {writer.bio && (
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium leading-relaxed">
            {writer.bio}
          </div>
        )}
        <section className={!writer.bio ? "mt-6" : ""}>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="bg-blue-100 dark:bg-blue-900/50 p-1.5 rounded-lg">
              <LogoIcon className="w-5 h-5" />
            </span>
            この人の記事 ({writerArticles.length}件)
          </h3>
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {writerArticles.length > 0 ? (
              writerArticles.map((article) => <ArticleCard key={article.id} article={article} />)
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                まだ記事がありません
              </p>
            )}
          </div>
        </section>
      </div>

      {/* 本人専用：フォロー中・フォロワー詳細一覧モーダル */}
      {isOwnProfile && followModalTab && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setFollowModalTab(null)}
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
                  フォロー・フォロワー管理
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setFollowModalTab(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 border-b border-gray-100 dark:border-gray-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFollowModalTab("following")}
                className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
                  followModalTab === "following"
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/40"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                フォロー中 ({followingList.length})
              </button>
              <button
                type="button"
                onClick={() => setFollowModalTab("followers")}
                className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
                  followModalTab === "followers"
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/40"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                フォロワー ({followersList.length})
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5">
              {loadingFollowDetails ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                  読み込み中...
                </p>
              ) : (followModalTab === "following" ? followingList : followersList).length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                  {followModalTab === "following"
                    ? "フォロー中のアカウントはありません"
                    : "フォロワーはまだいません"}
                </p>
              ) : (
                (followModalTab === "following" ? followingList : followersList).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setFollowModalTab(null);
                      navigate("profile", item.username || item.id);
                    }}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden flex items-center justify-center shrink-0">
                        {item.avatar_url ? (
                          <img
                            src={item.avatar_url}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        ) : (
                          <CustomUserIcon className="w-6 h-6" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                          {item.display_name || (item.username ? `@${item.username}` : "ユーザー")}
                        </p>
                        {item.username && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            @{item.username}
                          </p>
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
};
