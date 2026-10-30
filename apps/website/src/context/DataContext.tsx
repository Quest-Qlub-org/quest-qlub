import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase, isTest } from "../supabase";
import type { Profile } from "../supabase";
import type { Article, Series } from "../types";
import { mapDbArticleToArticle } from "../types";
import { getProfileRoles, isStaffRole } from "../utils/roles";
import { fetchProfilesListWithFallback } from "../utils/profileQueries";
import { applySeriesOverrides } from "../utils/seriesOverrides";
import { getLocalScheduledAt, isArticlePubliclyVisible } from "../utils/scheduledArticles";
import { useAuth } from "./AuthContext";
import { useUI } from "./UIContext";

const ARTICLE_PAGE_SIZE = 12;
const WRITER_PAGE_SIZE = 12;

// 安全な記事一覧取得フィールド（巨大な本文 content を除外し、実DBで確実に存在するカラムのみ）
export const ARTICLE_LIST_FIELDS =
  "id, title, thumbnail, thumbnail_url, thumbnail_color, writer_id, views, likes, tags, is_recommended, is_popular, status, summary, series_id, episode_number, created_at";

function enrichMappedArticleSchedule(article: Article): Article {
  const localSched = getLocalScheduledAt(article.id);
  if (!article.scheduledAt && localSched) {
    return { ...article, scheduledAt: localSched };
  }
  return article;
}

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

  // Team Members (Staff for /about)
  teamMembers: Profile[];
  setTeamMembers: React.Dispatch<React.SetStateAction<Profile[]>>;
  teamMembersLoading: boolean;
  refreshTeamMembers: () => Promise<void>;

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

  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(true);

  const [seriesList, setSeriesList] = useState<Series[]>([]);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  const [dataLoaded, setDataLoaded] = useState(false);

  // Issue #23 & Issue #24: 本文(content)を除外し、range(0, ARTICLE_PAGE_SIZE - 1) でページ単位取得
  const fetchArticles = useCallback(async () => {
    setArticlesLoading(true);
    try {
      // 予約日時が到来した記事の自動公開RPC（未適用環境やエラー時はサイレントに無視）
      try {
        const rpcFn = (supabase as unknown as { rpc?: (fn: string) => Promise<unknown> }).rpc;
        if (
          typeof rpcFn === "function" &&
          (!isTest || typeof (rpcFn as { mock?: unknown }).mock !== "undefined")
        ) {
          await Promise.resolve(rpcFn.call(supabase, "publish_due_scheduled_articles")).catch(
            () => {},
          );
        }
      } catch {
        // ignore in mock/legacy environments
      }

      let res = await supabase
        .from("articles")
        .select(ARTICLE_LIST_FIELDS)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(0, ARTICLE_PAGE_SIZE - 1);

      // 初回失敗時の安全な再試行（セッション初期化タイミングのラグ対策）
      if (res.error) {
        console.warn("fetchArticles first attempt failed, retrying...", res.error);
        await new Promise((r) => setTimeout(r, 200));
        res = await supabase
          .from("articles")
          .select(ARTICLE_LIST_FIELDS)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .range(0, ARTICLE_PAGE_SIZE - 1);
      }

      if (!res.error && res.data) {
        const mapped = res.data
          .map((item) => enrichMappedArticleSchedule(mapDbArticleToArticle(item)))
          .filter((article) => isArticlePubliclyVisible(article));
        setArticles(mapped);
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
        .select(ARTICLE_LIST_FIELDS)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(start, end);

      if (!error && data) {
        if (data.length > 0) {
          const newArticles = data
            .map((item) => enrichMappedArticleSchedule(mapDbArticleToArticle(item)))
            .filter((article) => isArticlePubliclyVisible(article));
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
      const writerRows = await fetchProfilesListWithFallback({
        inRole: ["writer", "editor"],
        order: { column: "created_at", ascending: false },
        range: { from: 0, to: WRITER_PAGE_SIZE - 1 },
      });

      if (writerRows) {
        setWriters(writerRows);
        setHasMoreWriters(writerRows.length === WRITER_PAGE_SIZE);
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
      const newRows = await fetchProfilesListWithFallback({
        inRole: ["writer", "editor"],
        order: { column: "created_at", ascending: false },
        range: { from: start, to: end },
      });

      if (newRows) {
        if (newRows.length > 0) {
          setWriters((prev) => [...prev, ...newRows]);
        }
        setHasMoreWriters(newRows.length === WRITER_PAGE_SIZE);
      }
    } catch (e) {
      console.error("Failed to load more writers", e);
    } finally {
      setLoadingMoreWriters(false);
    }
  }, [writers.length, loadingMoreWriters, hasMoreWriters]);

  const fetchTeamMembers = useCallback(async () => {
    setTeamMembersLoading(true);
    try {
      const memberRows = await fetchProfilesListWithFallback({
        order: { column: "created_at", ascending: true },
      });

      if (memberRows) {
        const staffList = memberRows.filter((p) => {
          const rList = getProfileRoles(p);
          return rList.some((r) => isStaffRole(r));
        });
        setTeamMembers(staffList);
      }
    } catch (e) {
      console.error("Failed to fetch team members", e);
    } finally {
      setTeamMembersLoading(false);
    }
  }, []);

  const fetchSeries = useCallback(async () => {
    try {
      let res = await supabase.from("series").select("*");
      if (res.error) {
        await new Promise((r) => setTimeout(r, 200));
        res = await supabase.from("series").select("*");
      }
      if (!res.error && res.data) {
        const mapped = res.data.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description ?? null,
          writerId: s.writer_id,
        }));
        setSeriesList(applySeriesOverrides(mapped));
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
      await Promise.allSettled([
        fetchArticles(),
        fetchWriters(),
        fetchTeamMembers(),
        fetchSeries(),
      ]);
      if (isMounted) setDataLoaded(true);
    };
    void init();
    return () => {
      isMounted = false;
    };
  }, [fetchArticles, fetchWriters, fetchTeamMembers, fetchSeries, authLoading]);

  // プロフィール・ロール変更時の自動同期（Supabase Realtime & ブラウザカスタムイベント）
  useEffect(() => {
    const handleRolesUpdated = () => {
      void fetchTeamMembers();
      void fetchWriters();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("quest_qlub_roles_updated", handleRolesUpdated);
    }

    let realtimeChannel: { unsubscribe?: () => void } | null = null;
    try {
      const sbAny = supabase as unknown as {
        channel?: (name: string) => {
          on?: (
            type: string,
            filter: Record<string, string>,
            callback: () => void,
          ) => { subscribe?: () => { unsubscribe?: () => void } };
        };
        removeChannel?: (ch: unknown) => void;
      };
      if (typeof sbAny.channel === "function") {
        const ch = sbAny.channel("public:profiles:team_sync");
        if (ch && typeof ch.on === "function") {
          const sub = ch.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "profiles" },
            () => {
              void fetchTeamMembers();
              void fetchWriters();
            },
          );
          if (sub && typeof sub.subscribe === "function") {
            realtimeChannel = sub.subscribe();
          }
        }
      }
    } catch {
      // Realtime unavailable in test/mock environments
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("quest_qlub_roles_updated", handleRolesUpdated);
      }
      if (realtimeChannel && typeof realtimeChannel.unsubscribe === "function") {
        realtimeChannel.unsubscribe();
      }
    };
  }, [fetchTeamMembers, fetchWriters]);

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

      // 楽観的UI更新: favoritesと該当記事のlikesを即時反映
      setFavorites(isFav ? favorites.filter((id) => id !== articleId) : [...favorites, articleId]);
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId ? { ...a, likes: isFav ? Math.max(0, a.likes - 1) : a.likes + 1 } : a,
        ),
      );

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
        setArticles((prev) =>
          prev.map((a) =>
            a.id === articleId
              ? { ...a, likes: isFav ? a.likes + 1 : Math.max(0, a.likes - 1) }
              : a,
          ),
        );
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
    teamMembers,
    setTeamMembers,
    teamMembersLoading,
    refreshTeamMembers: fetchTeamMembers,
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
