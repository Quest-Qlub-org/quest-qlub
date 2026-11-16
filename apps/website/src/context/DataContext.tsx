import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase, isTest } from "../supabase";
import type { Profile } from "../supabase";
import type { Article, Series } from "../types";
import { getProfileRoles, isStaffRole } from "../utils/roles";
import { fetchProfilesListWithFallback } from "../utils/profileQueries";
import { applySeriesOverrides } from "../utils/seriesOverrides";
import { mapDbArticleWithSchedule, isArticlePubliclyVisible } from "../utils/scheduledArticles";
import { useAuth } from "./AuthContext";
import { useUI } from "./UIContext";

const ARTICLE_PAGE_SIZE = 12;
const WRITER_PAGE_SIZE = 12;

// 安全な記事一覧取得フィールド（巨大な本文 content を除外し、実DBで確実に存在するカラムのみ）
export const ARTICLE_LIST_FIELDS =
  "id, title, thumbnail, thumbnail_url, thumbnail_color, writer_id, views, likes, tags, is_recommended, is_popular, status, summary, series_id, episode_number, created_at";

// 共同執筆者を含むオプショナル記事一覧取得フィールド（ダッシュボード等での利用向け。未適用環境では ARTICLE_LIST_FIELDS へのフォールバック必須）
export const WRITER_ARTICLE_LIST_FIELDS = `${ARTICLE_LIST_FIELDS}, collaborator_ids`;

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

  // Resolved profile cache for authors beyond paginated writers
  knownProfiles?: Record<string, Profile>;

  // Series
  seriesList: Series[];
  setSeriesList: React.Dispatch<React.SetStateAction<Series[]>>;

  // Favorites
  favorites: string[];
  setFavorites: React.Dispatch<React.SetStateAction<string[]>>;
  favoritesLoading: boolean;
  toggleFavorite: (articleId: string) => Promise<boolean>;

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
  const [knownProfiles, setKnownProfiles] = useState<Record<string, Profile>>({});

  const [seriesList, setSeriesList] = useState<Series[]>([]);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  const [dataLoaded, setDataLoaded] = useState(false);

  const articlesOffsetRef = useRef(0);
  const writersOffsetRef = useRef(0);
  const loadingMoreArticlesRef = useRef(false);
  const loadingMoreWritersRef = useRef(false);
  const hasInitialLoadedRef = useRef(false);
  const attemptedProfileIdsRef = useRef<Set<string>>(new Set());
  const articlesRef = useRef<Article[]>(articles);
  articlesRef.current = articles;
  const favoritesRef = useRef<string[]>(favorites);
  favoritesRef.current = favorites;

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
        articlesOffsetRef.current = res.data.length;
        const mapped = res.data
          .map((item) => mapDbArticleWithSchedule(item))
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
    if (loadingMoreArticlesRef.current || !hasMoreArticles) return;
    loadingMoreArticlesRef.current = true;
    setLoadingMoreArticles(true);
    try {
      const start = articlesOffsetRef.current;
      const end = start + ARTICLE_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("articles")
        .select(ARTICLE_LIST_FIELDS)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(start, end);

      if (!error && data) {
        articlesOffsetRef.current += data.length;
        if (data.length > 0) {
          const newArticles = data
            .map((item) => mapDbArticleWithSchedule(item))
            .filter((article) => isArticlePubliclyVisible(article));
          setArticles((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            const uniqueNew = newArticles.filter((a) => !existingIds.has(a.id));
            return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
          });
        }
        setHasMoreArticles(data.length === ARTICLE_PAGE_SIZE);
      }
    } catch (e) {
      console.error("Failed to load more articles", e);
    } finally {
      loadingMoreArticlesRef.current = false;
      setLoadingMoreArticles(false);
    }
  }, [hasMoreArticles]);

  const fetchWriters = useCallback(async () => {
    setWritersLoading(true);
    try {
      const writerRows = await fetchProfilesListWithFallback({
        inRole: ["writer", "editor"],
        order: { column: "created_at", ascending: false },
        range: { from: 0, to: WRITER_PAGE_SIZE - 1 },
      });

      if (writerRows) {
        writersOffsetRef.current = writerRows.length;
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
    if (loadingMoreWritersRef.current || !hasMoreWriters) return;
    loadingMoreWritersRef.current = true;
    setLoadingMoreWriters(true);
    try {
      const start = writersOffsetRef.current;
      const end = start + WRITER_PAGE_SIZE - 1;
      const newRows = await fetchProfilesListWithFallback({
        inRole: ["writer", "editor"],
        order: { column: "created_at", ascending: false },
        range: { from: start, to: end },
      });

      if (newRows) {
        writersOffsetRef.current += newRows.length;
        if (newRows.length > 0) {
          setWriters((prev) => {
            const existingIds = new Set(prev.map((w) => w.id));
            const uniqueNew = newRows.filter((w) => !existingIds.has(w.id));
            return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
          });
        }
        setHasMoreWriters(newRows.length === WRITER_PAGE_SIZE);
      }
    } catch (e) {
      console.error("Failed to load more writers", e);
    } finally {
      loadingMoreWritersRef.current = false;
      setLoadingMoreWriters(false);
    }
  }, [hasMoreWriters]);

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
          collaboratorIds: s.collaborator_ids ?? [],
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

  // 初期データロード（認証初期化完了後に1回だけ実行）
  useEffect(() => {
    if (authLoading || hasInitialLoadedRef.current) return;
    hasInitialLoadedRef.current = true;
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

  // ページングされた writers / teamMembers に含まれない記事著者をまとめて解決
  useEffect(() => {
    if (articlesLoading || writersLoading || teamMembersLoading || articles.length === 0) return;

    const knownIds = new Set<string>([
      ...writers.map((w) => w.id),
      ...teamMembers.map((m) => m.id),
      ...Object.keys(knownProfiles),
    ]);
    const missingIds = Array.from(
      new Set(
        articles
          .map((a) => a.writerId)
          .filter(
            (id) => Boolean(id) && !knownIds.has(id) && !attemptedProfileIdsRef.current.has(id),
          ),
      ),
    );
    if (missingIds.length === 0) return;

    missingIds.forEach((id) => attemptedProfileIdsRef.current.add(id));
    let isMounted = true;
    void fetchProfilesListWithFallback({ inIds: missingIds }).then((rows) => {
      if (!isMounted || !rows || rows.length === 0) return;
      setKnownProfiles((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          next[row.id] = row;
        }
        return next;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [
    articles,
    articlesLoading,
    writers,
    writersLoading,
    teamMembers,
    teamMembersLoading,
    knownProfiles,
  ]);

  // プロフィール・ロール変更時の自動同期（Supabase Realtime & ブラウザカスタムイベント）
  useEffect(() => {
    let isMounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleRolesUpdated = () => {
      if (!isMounted) return;
      void fetchTeamMembers();
      void fetchWriters();
    };

    const handleRealtimeProfileChange = () => {
      if (!isMounted) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!isMounted) return;
        void fetchTeamMembers();
        void fetchWriters();
      }, 300);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("quest_qlub_roles_updated", handleRolesUpdated);
    }

    let realtimeChannel: { unsubscribe?: () => void } | null = null;
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
    try {
      if (typeof sbAny.channel === "function") {
        const ch = sbAny.channel("public:profiles:team_sync");
        if (ch && typeof ch.on === "function") {
          const sub = ch.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "profiles" },
            handleRealtimeProfileChange,
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
      isMounted = false;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("quest_qlub_roles_updated", handleRolesUpdated);
      }
      if (realtimeChannel) {
        if (typeof sbAny.removeChannel === "function") {
          sbAny.removeChannel(realtimeChannel);
        } else if (typeof realtimeChannel.unsubscribe === "function") {
          realtimeChannel.unsubscribe();
        }
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

  // Issue #29 & #57 & #144: お気に入りトグルの関数型楽観的更新 + 元値復元ロールバック
  const toggleFavorite = useCallback(
    async (articleId: string): Promise<boolean> => {
      if (!user?.id) {
        showToast("お気に入り登録にはログインが必要です");
        return false;
      }

      const wasFav = favoritesRef.current.includes(articleId);
      const originalLikes = articlesRef.current.find((a) => a.id === articleId)?.likes;
      const nextFavList = wasFav
        ? favoritesRef.current.filter((id) => id !== articleId)
        : [...favoritesRef.current, articleId];
      favoritesRef.current = nextFavList;

      setFavorites((prev) =>
        wasFav
          ? prev.filter((id) => id !== articleId)
          : prev.includes(articleId)
            ? prev
            : [...prev, articleId],
      );

      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId ? { ...a, likes: wasFav ? Math.max(0, a.likes - 1) : a.likes + 1 } : a,
        ),
      );

      try {
        if (wasFav) {
          const { error } = await supabase
            .from("favorites")
            .delete()
            .eq("user_id", user.id)
            .eq("article_id", articleId);

          if (error) {
            throw error;
          }
          showToast("お気に入りを解除しました");
          return true;
        } else {
          const { error } = await supabase.from("favorites").insert({
            user_id: user.id,
            article_id: articleId,
          });

          if (error) {
            throw error;
          }
          showToast("お気に入りに追加しました");
          return true;
        }
      } catch (e) {
        console.error("Error toggling favorite, rolling back:", e);
        // 他の並行トグルを破壊しないよう、対象 ID のみロールバックし、元の likes 値をそのまま復元する
        favoritesRef.current = wasFav
          ? favoritesRef.current.includes(articleId)
            ? favoritesRef.current
            : [...favoritesRef.current, articleId]
          : favoritesRef.current.filter((id) => id !== articleId);
        setFavorites((prev) =>
          wasFav
            ? prev.includes(articleId)
              ? prev
              : [...prev, articleId]
            : prev.filter((id) => id !== articleId),
        );
        if (typeof originalLikes === "number") {
          setArticles((prev) =>
            prev.map((a) => (a.id === articleId ? { ...a, likes: originalLikes } : a)),
          );
        }
        showToast("お気に入りの更新に失敗しました。もう一度お試しください。");
        return false;
      }
    },
    [user?.id, showToast],
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
    knownProfiles,
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
