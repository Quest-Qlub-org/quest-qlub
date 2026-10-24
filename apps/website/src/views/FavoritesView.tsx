import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { CustomStarIcon } from "../components/icons/NavIcons";
import { ArticleCard } from "../components/ArticleCard";
import { ArticleCardSkeleton } from "../components/Skeleton";
import { supabase } from "../supabase";
import type { Article } from "../types";
import { mapDbArticleToArticle } from "../types";
import { updateMetaTags } from "../utils/seo";

export const FavoritesView = () => {
  const { articles, articlesLoading, favorites, navigate, userRole, authLoading } = useApp();
  const [extraFavArticles, setExtraFavArticles] = useState<Article[]>([]);
  const [fetchingExtra, setFetchingExtra] = useState(false);

  useEffect(() => {
    updateMetaTags({
      title: "お気に入り記事",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    if (favorites.length === 0) {
      setExtraFavArticles([]);
      return;
    }

    // キャッシュにないお気に入り記事IDを特定
    const missingIds = favorites.filter((id) => !articles.some((a) => a.id === id));
    if (missingIds.length === 0) return;

    let isMounted = true;
    const fetchMissingFavorites = async () => {
      setFetchingExtra(true);
      try {
        const { data, error } = await supabase
          .from("articles")
          .select(
            "id, title, thumbnail, thumbnail_url, thumbnail_color, writer_id, views, likes, tags, is_recommended, is_popular, status, summary, series_id, episode_number, created_at",
          )
          .in("id", missingIds)
          .eq("status", "published");

        if (isMounted && data && !error) {
          setExtraFavArticles(data.map(mapDbArticleToArticle));
        }
      } catch (e) {
        console.error("Failed to fetch missing favorite articles", e);
      } finally {
        if (isMounted) setFetchingExtra(false);
      }
    };

    void fetchMissingFavorites();
    return () => {
      isMounted = false;
    };
  }, [favorites, articles]);

  const allKnownArticles = [...articles, ...extraFavArticles];
  const favArticles = favorites
    .map((favId) => allKnownArticles.find((a) => a.id === favId && a.status === "published"))
    .filter((a): a is Article => Boolean(a));

  const isLoading = authLoading || articlesLoading || fetchingExtra;

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">お気に入り記事</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          保存した記事をまとめて確認できます
        </p>
      </div>

      {authLoading ? (
        <div className="space-y-3 mt-4">
          <ArticleCardSkeleton />
          <ArticleCardSkeleton />
        </div>
      ) : userRole === "guest" ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <CustomStarIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-gray-600 dark:text-gray-200 font-bold mb-2">ログインが必要です</p>
          <p className="text-sm text-gray-400 dark:text-gray-400 mb-6">
            お気に入り機能を利用するには
            <br />
            ログインしてください。
          </p>
          <button
            onClick={() => navigate("/login")}
            className="px-6 py-3 bg-blue-600 text-white rounded-full font-bold shadow-md hover:bg-blue-700 cursor-pointer"
          >
            ログインする
          </button>
        </div>
      ) : isLoading && favArticles.length === 0 ? (
        <div className="space-y-3 mt-4">
          <ArticleCardSkeleton />
          <ArticleCardSkeleton />
        </div>
      ) : favArticles.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mt-4">
          <p className="text-gray-600 dark:text-gray-200 font-bold mb-2">
            登録されている記事がありません
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-400 mb-6">
            好きな記事を見つけて☆アイコンをタップしましょう
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-3 border-2 border-blue-500 text-blue-600 dark:text-blue-400 rounded-full font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
          >
            記事を探す
          </button>
        </div>
      ) : (
        <div className="space-y-3 mt-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {favArticles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
};
