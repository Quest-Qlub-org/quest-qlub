import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type { Profile } from "../supabase";
import type { Article, Series } from "../types";
import { mapDbArticleToArticle } from "../types";
import { useAuth } from "./AuthContext";
import { useUI } from "./UIContext";

const ARTICLE_PAGE_SIZE = 12;
const WRITER_PAGE_SIZE = 12;

export interface DataContextType {
  // Articles
  articles: Article[];
  setArticles: React.Dispatch<React.SetStateAction<Article[]>>;
  articlesLoading: boolean;
  refreshArticles: () => Promise<void>;
  hasMoreArticles: boolean;
  loadingMoreArticles: boolean;
  loadMoreArticles: () => Promise<void>;

  // Writers
  writers: Profile[];
  setWriters: React.Dispatch<React.SetStateAction<Profile[]>>;
  writersLoading: boolean;
  refreshWriters: () => Promise<void>;
  hasMoreWriters: boolean;
  loadingMoreWriters: boolean;
  loadMoreWriters: () => Promise<void>;

  // Series
  seriesList: Series[];
  setSeriesList: React.Dispatch<React.SetStateAction<Series[]>>;

  // Favorites
  favorites: string[];
  setFavorites: React.Dispatch<React.SetStateAction<string[]>>;
  favoritesLoading: boolean;
  toggleFavorite: (articleId: string) => Promise<void>;

  // Initial load complete flag (for Issue #30)
  dataLoaded: boolean;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useAuth();
  const { showToast } = useUI();

  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [hasMoreArticles, setHasMoreArticles] = useState(true);
  const [loadingMoreArticles, setLoadingMoreArticles] = useState(false);

  const [writers, setWriters] = useState<Profile[]>([]);
  const [writersLoading, setWritersLoading] = useState(true);
  const [hasMoreWriters, setHasMoreWriters] = useState(true);
  const [loadingMoreWriters, setLoadingMoreWriters] = useState(false);

  const [seriesList, setSeriesList] = useState<Series[]>([]);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  const [dataLoaded, setDataLoaded] = useState(false);

  // Issue #23 & Issue #24: 本文(content)を除外し、range(0, ARTICLE_PAGE_SIZE - 1) でページ単位取得
  const fetchArticles = useCallback(async () => {
    setArticlesLoading(true);
    try {
      let res = await supabase
        .from("articles")
        .select(
          "id, title, thumbnail, thumbnail_url, thumbnail_color, writer_id, views, likes, tags, is_recommended, is_popular, status, summary, series_id, episode_number, comments_enabled, created_at",
        )
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(0, ARTICLE_PAGE_SIZE - 1);

      // 初回失敗時の安全な再試行（セッション初期化タイミングのラグ対策）
      if (res.error) {
        console.warn("fetchArticles first attempt failed, retrying...", res.error);
        await new Promise((r) => setTimeout(r, 200));
        res = await supabase
          .from("articles")
          .select(
            "id, title, thumbnail, thumbnail_url, thumbnail_color, writer_id, views, likes, tags, is_recommended, is_popular, status, summary, series_id, episode_number, comments_enabled, created_at",
          )
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .range(0, ARTICLE_PAGE_SIZE - 1);
      }

      if (!res.error && res.data) {
        setArticles(res.data.map((item) => mapDbArticleToArticle(item)));
        setHasMoreArticles(res.data.length === ARTICLE_PAGE_SIZE);
      }
    } catch (e) {
      console.error("Failed to fetch articles", e);
    } finally {
      setArticlesLoading(false);
    }
  }, []);

  const loadMoreArticles = useCallback(async () => {
    if (loadingMoreArticles || !hasMoreArticles) return;
    setLoadingMoreArticles(true);
    try {
      const start = articles.length;
      const end = start + ARTICLE_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("articles")
        .select(
          "id, title, thumbnail, thumbnail_url, thumbnail_color, writer_id, views, likes, tags, is_recommended, is_popular, status, summary, series_id, episode_number, comments_enabled, created_at",
        )
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(start, end);

      if (!error && data) {
        if (data.length > 0) {
          const newArticles = data.map((item) => mapDbArticleToArticle(item));
          setArticles((prev) => [...prev, ...newArticles]);
        }
        setHasMoreArticles(data.length === ARTICLE_PAGE_SIZE);
      }
    } catch (e) {
      console.error("Failed to load more articles", e);
    } finally {
      setLoadingMoreArticles(false);
    }
  }, [articles.length, loadingMoreArticles, hasMoreArticles]);

  const fetchWriters = useCallback(async () => {
    setWritersLoading(true);
    try {
      let res = await supabase
        .from("profiles")
        .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
        .in("role", ["writer", "editor"])
        .order("created_at", { ascending: false })
        .range(0, WRITER_PAGE_SIZE - 1);

      if (res.error) {
        console.warn("fetchWriters first attempt failed, retrying...", res.error);
        await new Promise((r) => setTimeout(r, 200));
        res = await supabase
          .from("profiles")
          .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
          .in("role", ["writer", "editor"])
          .order("created_at", { ascending: false })
          .range(0, WRITER_PAGE_SIZE - 1);
      }

      if (!res.error && res.data) {
        setWriters(res.data);
        setHasMoreWriters(res.data.length === WRITER_PAGE_SIZE);
      }
    } catch (e) {
      console.error("Failed to fetch writers", e);
    } finally {
      setWritersLoading(false);
    }
  }, []);

  const loadMoreWriters = useCallback(async () => {
    if (loadingMoreWriters || !hasMoreWriters) return;
    setLoadingMoreWriters(true);
    try {
      const start = writers.length;
      const end = start + WRITER_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
        .in("role", ["writer", "editor"])
        .order("created_at", { ascending: false })
        .range(start, end);

      if (!error && data) {
        if (data.length > 0) {
          setWriters((prev) => [...prev, ...data]);
        }
        setHasMoreWriters(data.length === WRITER_PAGE_SIZE);
      }
    } catch (e) {
      console.error("Failed to load more writers", e);
    } finally {
      setLoadingMoreWriters(false);
    }
  }, [writers.length, loadingMoreWriters, hasMoreWriters]);

  const fetchSeries = useCallback(async () => {
    try {
      let res = await supabase.from("series").select("*");
      if (res.error) {
        await new Promise((r) => setTimeout(r, 200));
        res = await supabase.from("series").select("*");
      }
      if (!res.error && res.data) {
        setSeriesList(
          res.data.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description ?? null,
            writerId: s.writer_id,
          })),
        );
      }
    } catch (e) {
      console.error("Failed to fetch series", e);
    }
  }, []);

  const fetchFavorites = useCallback(async (userId: string) => {
    setFavoritesLoading(true);
    try {
      const { data, error } = await supabase
        .from("favorites")
        .select("article_id")
        .eq("user_id", userId);

      if (!error && data) {
        setFavorites(data.map((f) => f.article_id));
      } else {
        setFavorites([]);
      }
    } catch (e) {
      console.error("Failed to fetch favorites", e);
      setFavorites([]);
    } finally {
      setFavoritesLoading(false);
    }
  }, []);

  // 初期データロード（初回マウント時および認証セッション確定完了時）
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      await Promise.allSettled([fetchArticles(), fetchWriters(), fetchSeries()]);
      if (isMounted) setDataLoaded(true);
    };
    void init();
    return () => {
      isMounted = false;
    };
  }, [fetchArticles, fetchWriters, fetchSeries, authLoading]);

  // ユーザーお気に入りロード
  useEffect(() => {
    if (user?.id) {
      void fetchFavorites(user.id);
    } else {
      setFavorites([]);
    }
  }, [user?.id, fetchFavorites]);

  // Issue #29: お気に入りトグルの楽観的更新 + エラー時の確実なロールバック
  const toggleFavorite = useCallback(
    async (articleId: string) => {
      if (!user?.id) {
        showToast("お気に入り登録にはログインが必要です");
        return;
      }

      const isFav = favorites.includes(articleId);
      const prevFavorites = [...favorites];

      // 楽観的UI更新
      setFavorites(isFav ? favorites.filter((id) => id !== articleId) : [...favorites, articleId]);

      try {
        if (isFav) {
          const { error } = await supabase
            .from("favorites")
            .delete()
            .eq("user_id", user.id)
            .eq("article_id", articleId);

          if (error) {
            throw error;
          }
          showToast("お気に入りを解除しました");
        } else {
          const { error } = await supabase.from("favorites").insert({
            user_id: user.id,
            article_id: articleId,
          });

          if (error) {
            throw error;
          }
          showToast("お気に入りに追加しました");
        }
      } catch (e) {
        console.error("Error toggling favorite, rolling back:", e);
        // ロールバック
        setFavorites(prevFavorites);
        showToast("お気に入りの更新に失敗しました。もう一度お試しください。");
      }
    },
    [user?.id, favorites, showToast],
  );

  const value: DataContextType = {
    articles,
    setArticles,
    articlesLoading,
    refreshArticles: fetchArticles,
    hasMoreArticles,
    loadingMoreArticles,
    loadMoreArticles,
    writers,
    setWriters,
    writersLoading,
    refreshWriters: fetchWriters,
    hasMoreWriters,
    loadingMoreWriters,
    loadMoreWriters,
    seriesList,
    setSeriesList,
    favorites,
    setFavorites,
    favoritesLoading,
    toggleFavorite,
    dataLoaded,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
