import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { LogoIcon, CustomUserIcon } from "../components/icons/NavIcons";
import { ArticleCard } from "../components/ArticleCard";
import { ChevronLeft, UserPlus, UserCheck, Loader2 } from "lucide-react";
import { useFollows } from "../hooks/useFollows";
import { updateMetaTags, resetMetaTags } from "../utils/seo";
import { supabase } from "../supabase";
import type { Profile } from "../supabase";
import type { Article } from "../types";
import { mapDbArticleToArticle } from "../types";

export const ProfileView = () => {
  const { username } = useParams<{ username: string }>();
  const { writers, writersLoading, articles, navigate, viewParam, showToast } = useApp();
  const { isFollowing, toggleFollow } = useFollows();

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
          let query = supabase
            .from("profiles")
            .select("id, role, display_name, username, avatar_url, bio, created_at");

          if (isUuid) {
            query = query.eq("id", targetIdentifier);
          } else {
            query = query.eq("username", cleanTarget);
          }

          const { data, error } = await query.maybeSingle();

          if (!isMounted) return;

          if (error || !data) {
            if (!cachedWriter) setNotFound(true);
            setLoading(false);
            return;
          }
          profileData = data as Profile;
          setWriter(profileData);
          setNotFound(false);
        }

        // ライターの公開記事を単体取得
        if (profileData) {
          const { data: artsData } = await supabase
            .from("articles")
            .select(
              "id, title, thumbnail, thumbnail_url, thumbnail_color, writer_id, views, likes, tags, is_recommended, is_popular, status, summary, series_id, episode_number, created_at",
            )
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
  }, [targetIdentifier, cleanTarget, cachedWriter]);

  const cleanUsername = (writer?.x_account || writer?.username || "").replace(/^@/, "");
  const following = writer ? isFollowing(writer.id) : false;

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
      <div className="bg-gradient-to-b from-blue-500 to-blue-700 pt-12 pb-8 px-4 text-center text-white relative">
        <button
          onClick={() => navigate("writers")}
          className="absolute top-4 left-4 p-2 rounded-full bg-black/20 hover:bg-black/30 flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
          <span className="text-xs font-bold">戻る</span>
        </button>
        <div className="w-24 h-24 bg-white rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg border-4 border-white overflow-hidden">
          {writer.avatar_url ? (
            <img src={writer.avatar_url} className="w-24 h-24 object-cover" alt="" />
          ) : (
            <CustomUserIcon className="w-16 h-16" />
          )}
        </div>
        <h2 className="text-2xl font-bold mb-1">
          {writer.display_name ?? (cleanUsername ? `@${cleanUsername}` : "名称未設定")}
        </h2>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-sm font-bold backdrop-blur-sm">
            {writer.role === "editor" ? "編集長" : "ライター"}
          </span>
          <button
            type="button"
            onClick={() => {
              toggleFollow(writer.id);
              showToast(following ? "フォローを解除しました" : "ライターをフォローしました");
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
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
        </div>
        {cleanUsername && (
          <div className="mt-2">
            <a
              href={`https://x.com/${encodeURIComponent(cleanUsername)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-black/20 hover:bg-black/35 text-white rounded-full text-xs font-bold backdrop-blur-sm transition-all border border-white/20 hover:border-white/40 shadow-sm"
              aria-label={`@${cleanUsername} のX（旧Twitter）アカウントを開く`}
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>@{cleanUsername}</span>
            </a>
          </div>
        )}
      </div>
      <div className="p-4 md:p-8 space-y-6 -mt-4 relative z-10">
        {writer.bio && (
          <div className="bg-white p-5 rounded-xl shadow-md border border-gray-100 text-gray-700 text-sm font-medium leading-relaxed">
            {writer.bio}
          </div>
        )}
        <section className={!writer.bio ? "mt-6" : ""}>
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="bg-blue-100 p-1.5 rounded-lg">
              <LogoIcon className="w-5 h-5" />
            </span>
            この人の記事 ({writerArticles.length}件)
          </h3>
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {writerArticles.length > 0 ? (
              writerArticles.map((article) => <ArticleCard key={article.id} article={article} />)
            ) : (
              <p className="text-gray-500 text-sm text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                まだ記事がありません
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

// --- FavoritesView ---
