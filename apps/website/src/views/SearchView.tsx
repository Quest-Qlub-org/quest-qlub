import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { CustomUserIcon, CustomSearchIcon } from "../components/icons/NavIcons";
import { MOCK_TAGS, mapDbArticleToArticle } from "../types";
import type { Article } from "../types";
import { ArticleCard } from "../components/ArticleCard";
import { X } from "lucide-react";
import { parseSearchKeywords, matchKeywords } from "../utils/normalizeJapanese";
import { getLocalScheduledAt, isArticlePubliclyVisible } from "../utils/scheduledArticles";
import { profileHasRole } from "../utils/roles";
import { updateMetaTags } from "../utils/seo";
import { supabase } from "../supabase";
import type { Profile } from "../supabase";
import { fetchProfilesListWithFallback } from "../utils/profileQueries";
import { ARTICLE_LIST_FIELDS } from "../context/DataContext";

const SEARCH_ARTICLE_FIELDS =
  "id, title, content, summary, thumbnail, thumbnail_url, thumbnail_color, writer_id, views, likes, tags, is_recommended, is_popular, status, series_id, episode_number, created_at";

function enrichMappedArticleSchedule(article: Article): Article {
  const localSched = getLocalScheduledAt(article.id);
  if (!article.scheduledAt && localSched) {
    return { ...article, scheduledAt: localSched };
  }
  return article;
}

export const SearchView = () => {
  const { articles, writers } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlTag = searchParams.get("tag");
  const urlQ = searchParams.get("q") || searchParams.get("keyword");

  const [keyword, setKeyword] = useState(() => urlQ || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(() => (urlTag ? [urlTag] : []));
  const [selectedWriterIds, setSelectedWriterIds] = useState<string[]>([]);

  const [serverTags, setServerTags] = useState<string[]>([]);
  const [serverWriters, setServerWriters] = useState<Profile[]>([]);
  const [serverResults, setServerResults] = useState<Article[] | null>(null);
  const [isLoadingServerResults, setIsLoadingServerResults] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    updateMetaTags({
      title: "記事を探す",
      description: "Quest Qlubで気になるトピックやキーワード、タグから記事を検索できます。",
      url: "https://quest-qlub.vercel.app/search",
    });
  }, []);

  useEffect(() => {
    if (urlTag) {
      setSelectedTags([urlTag]);
    }
  }, [urlTag]);

  useEffect(() => {
    if (urlQ) {
      setKeyword(urlQ);
    }
  }, [urlQ]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("articles")
          .select("tags")
          .eq("status", "published");
        if (!isMounted || error || !data) return;
        const tags = Array.from(
          new Set(data.flatMap((row) => (row.tags as string[]) ?? [])),
        ).filter(Boolean);
        if (tags.length > 0) setServerTags(tags);
      } catch {
        // ignore
      }
    })();

    void fetchProfilesListWithFallback({
      inRole: ["writer", "editor"],
      order: { column: "created_at", ascending: false },
    })
      .then((profiles) => {
        if (!isMounted || !profiles) return;
        setServerWriters(profiles);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const displayTags = useMemo(() => {
    if (serverTags.length > 0) return serverTags;
    const publishedArticles = articles.filter((a) => isArticlePubliclyVisible(a));
    const allTags = Array.from(new Set(publishedArticles.flatMap((a) => a.tags ?? []))).filter(
      Boolean,
    );
    return allTags.length > 0 ? allTags : MOCK_TAGS;
  }, [articles, serverTags]);

  const effectiveWriters = useMemo(() => {
    return serverWriters.length > 0 ? serverWriters : writers;
  }, [serverWriters, writers]);

  const queryKeywords = useMemo(() => parseSearchKeywords(keyword), [keyword]);
  const hasFilter = Boolean(keyword || selectedTags.length > 0 || selectedWriterIds.length > 0);

  useEffect(() => {
    setVisibleCount(12);
  }, [keyword, selectedTags, selectedWriterIds]);

  useEffect(() => {
    if (!hasFilter) {
      setServerResults(null);
      setIsLoadingServerResults(false);
      return;
    }

    let isMounted = true;
    setIsLoadingServerResults(true);

    const timer = setTimeout(async () => {
      try {
        const selectFields = queryKeywords.length > 0 ? SEARCH_ARTICLE_FIELDS : ARTICLE_LIST_FIELDS;
        const articlesTable: any = supabase.from("articles");
        let query = articlesTable
          .select(selectFields)
          .eq("status", "published")
          .order("created_at", { ascending: false });

        if (selectedWriterIds.length > 0) {
          query = query.in("writer_id", selectedWriterIds);
        }
        if (selectedTags.length > 0) {
          query = query.overlaps("tags", selectedTags);
        }

        const { data, error } = await query;
        if (!isMounted) return;

        if (!error && Array.isArray(data)) {
          let mapped: Article[] = (data as unknown as Parameters<typeof mapDbArticleToArticle>[0][])
            .map((item) => enrichMappedArticleSchedule(mapDbArticleToArticle(item)))
            .filter((a: Article) => isArticlePubliclyVisible(a));

          if (queryKeywords.length > 0) {
            mapped = mapped.filter((a: Article) => {
              const writer = effectiveWriters.find((w) => w.id === a.writerId);
              const searchTargets = [
                a.title,
                a.summary,
                a.content,
                ...(a.tags ?? []),
                writer?.display_name,
                writer?.username,
              ];
              return matchKeywords(searchTargets, queryKeywords);
            });
          }
          setServerResults(mapped);
        } else {
          setServerResults(null);
        }
      } catch (err) {
        console.error("Search query failed", err);
        if (isMounted) setServerResults(null);
      } finally {
        if (isMounted) setIsLoadingServerResults(false);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [hasFilter, keyword, selectedTags, selectedWriterIds, queryKeywords, effectiveWriters]);

  const results = useMemo(() => {
    if (serverResults !== null) {
      return serverResults;
    }
    return articles.filter((a) => {
      if (!isArticlePubliclyVisible(a)) return false;

      if (queryKeywords.length > 0) {
        const writer = effectiveWriters.find((w) => w.id === a.writerId);
        const searchTargets = [
          a.title,
          a.summary,
          a.content,
          ...(a.tags ?? []),
          writer?.display_name,
          writer?.username,
        ];
        if (!matchKeywords(searchTargets, queryKeywords)) {
          return false;
        }
      }

      if (selectedTags.length > 0 && !selectedTags.some((t) => (a.tags ?? []).includes(t)))
        return false;
      if (selectedWriterIds.length > 0 && !selectedWriterIds.includes(a.writerId)) return false;
      return true;
    });
  }, [articles, effectiveWriters, queryKeywords, selectedTags, selectedWriterIds, serverResults]);

  const pagedResults = useMemo(() => {
    return results.slice(0, visibleCount);
  }, [results, visibleCount]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      if (searchParams.get("tag") === tag && !next.includes(tag)) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("tag");
        setSearchParams(nextParams, { replace: true });
      }
      return next;
    });

  const toggleWriter = (id: string) =>
    setSelectedWriterIds((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id],
    );

  const handleClearKeyword = () => {
    setKeyword("");
    if (searchParams.has("q") || searchParams.has("keyword")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("q");
      nextParams.delete("keyword");
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleResetFilters = () => {
    setKeyword("");
    setSelectedTags([]);
    setSelectedWriterIds([]);
    if (searchParams.toString()) {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
      <div
        className={
          hasFilter
            ? "md:grid md:grid-cols-[300px_1fr] md:gap-6 md:items-start space-y-4 md:space-y-0"
            : "max-w-3xl mx-auto space-y-4"
        }
      >
        <div className="space-y-4 min-w-0">
          <div className="relative">
            <input
              type="text"
              placeholder="キーワードで検索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full pl-12 pr-10 py-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 dark:focus:border-blue-400 transition-all outline-none font-bold text-gray-700 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 shadow-sm"
            />
            <div className="absolute left-3 top-3.5">
              <CustomSearchIcon className="w-7 h-7" />
            </div>
            {keyword && (
              <button
                onClick={handleClearKeyword}
                className="absolute right-3 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <section className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
              タグでしぼる
            </h3>
            <div className="flex flex-wrap gap-2">
              {displayTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 border rounded-lg text-sm font-bold transition-colors cursor-pointer ${selectedTags.includes(tag) ? "bg-blue-500 border-blue-500 text-white" : "bg-gray-50 dark:bg-gray-700/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400"}`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </section>
          <section className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
              ライターでしぼる
            </h3>
            <div
              className={`grid gap-2 ${
                hasFilter
                  ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-1"
                  : "grid-cols-2 sm:grid-cols-3"
              }`}
            >
              {effectiveWriters
                .filter((w) => profileHasRole(w, "writer") || profileHasRole(w, "editor"))
                .sort((a, b) => {
                  const rank = (w: typeof a) => {
                    const dName = w.display_name ?? "";
                    if (
                      dName.includes("Quest Qlub編集部") ||
                      dName.includes("SHARE Quest編集部") ||
                      dName.includes("編集部")
                    )
                      return 0;
                    if (profileHasRole(w, "editor")) return 1;
                    return 2;
                  };
                  const ra = rank(a),
                    rb = rank(b);
                  if (ra !== rb) return ra - rb;
                  return (a.display_name ?? "").localeCompare(b.display_name ?? "", "ja");
                })
                .map((w) => (
                  <button
                    key={w.id}
                    onClick={() => toggleWriter(w.id)}
                    className={`flex items-center gap-2 p-2.5 border rounded-lg text-left transition-colors min-w-0 cursor-pointer ${selectedWriterIds.includes(w.id) ? "bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-500" : "bg-gray-50 dark:bg-gray-700/60 border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-200"}`}
                  >
                    {w.avatar_url ? (
                      <img
                        src={w.avatar_url}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                        alt=""
                      />
                    ) : (
                      <CustomUserIcon className="w-6 h-6 shrink-0" />
                    )}
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">
                      {w.display_name ?? (w.username ? `@${w.username}` : "名称未設定")}
                    </span>
                  </button>
                ))}
            </div>
          </section>
          {hasFilter && (
            <button
              onClick={handleResetFilters}
              className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <X className="w-5 h-5" />
              フィルターをリセット
            </button>
          )}
        </div>
        <div className="min-w-0">
          {hasFilter && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold text-gray-700 dark:text-gray-200">
                  検索結果 ({results.length}件)
                </p>
                {isLoadingServerResults && (
                  <span className="text-xs text-blue-500 font-medium">検索中...</span>
                )}
              </div>
              <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                {results.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 lg:col-span-2">
                    該当する記事が見つかりませんでした
                  </p>
                ) : (
                  pagedResults.map((a) => <ArticleCard key={a.id} article={a} />)
                )}
              </div>
              {results.length > visibleCount && (
                <div className="flex justify-center pt-6">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 12)}
                    className="px-6 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    さらに表示する（残り {results.length - visibleCount} 件）
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
