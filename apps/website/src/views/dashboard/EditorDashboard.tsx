import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../supabase";
import { mapDbArticleToArticle } from "../../types";
import type { Article, ArticleStatus } from "../../types";
import {
  enrichArticleWithSchedule,
  formatScheduledDateTime,
  isArticleScheduledFuture,
  setLocalScheduledAt,
  toDatetimeLocalValue,
  toSafeIsoString,
} from "../../utils/scheduledArticles";
import { CustomUserIcon } from "../../components/icons/NavIcons";
import {
  ChevronLeft,
  Check,
  AlertCircle,
  Eye,
  Mail,
  Clock,
  ExternalLink,
  Edit3,
} from "lucide-react";
import { updateMetaTags } from "../../utils/seo";
import { profileHasRole } from "../../utils/roles";
import { isArticleOptionalColumnSchemaError } from "../../utils/supabaseErrors";
import {
  ArticleStatusBadge,
  DashboardArticlePreviewModal,
} from "./components/DashboardArticlePreviewModal";
import { fetchArticlePreviewDetails, updateArticleStatusSafe } from "./utils/articleStatusHelpers";

export const EditorDashboard = () => {
  const { profile, navigate, articles, setArticles, writers, showToast, getFontSizeClass } =
    useApp();

  const [fetchedArticles, setFetchedArticles] = useState<Article[]>([]);
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scheduleInput, setScheduleInput] = useState("");

  const closePreviewModal = useCallback(() => setPreviewArticle(null), []);

  useEffect(() => {
    updateMetaTags({
      title: "編集長ダッシュボード",
      noindex: true,
    });
  }, []);

  const fetchEditorQueue = useCallback(async () => {
    try {
      const fromFn = (supabase as unknown as { from?: (table: string) => unknown }).from;
      if (typeof fromFn !== "function") return;
      const tableObj = supabase.from("articles") as unknown as {
        select?: (cols: string) => {
          in?: (
            col: string,
            vals: string[],
          ) => {
            order?: (
              col: string,
              opts: { ascending: boolean },
            ) => Promise<{ data?: unknown[]; error?: unknown }>;
          };
          order?: (
            col: string,
            opts: { ascending: boolean },
          ) => Promise<{ data?: unknown[]; error?: unknown }>;
        };
      };
      if (!tableObj || typeof tableObj.select !== "function") return;

      const selected = tableObj.select("*");
      let res: { data?: unknown[]; error?: unknown } | null = null;
      if (selected && typeof selected.in === "function") {
        const filtered = selected.in("status", ["pending", "scheduled", "published"]);
        if (filtered && typeof filtered.order === "function") {
          res = await filtered.order("created_at", { ascending: false });
        }
      } else if (selected && typeof selected.order === "function") {
        res = await selected.order("created_at", { ascending: false });
      }

      if (res && !res.error && Array.isArray(res.data)) {
        setFetchedArticles(
          res.data.map((row) =>
            enrichArticleWithSchedule(
              mapDbArticleToArticle(row as Parameters<typeof mapDbArticleToArticle>[0]),
            ),
          ),
        );
      }
    } catch {
      // Ignore in simple test environments without full query chains
    }
  }, []);

  useEffect(() => {
    void fetchEditorQueue();
  }, [fetchEditorQueue]);

  // グローバル articles と個別フェッチした fetchedArticles をマージ
  const mergedArticles = useMemo(() => {
    const map = new Map<string, Article>();
    for (const a of articles) {
      map.set(a.id, enrichArticleWithSchedule(a));
    }
    for (const f of fetchedArticles) {
      const existing = map.get(f.id);
      map.set(
        f.id,
        enrichArticleWithSchedule(
          existing ? { ...existing, ...f, content: f.content || existing.content } : f,
        ),
      );
    }
    return Array.from(map.values());
  }, [articles, fetchedArticles]);

  const pendingArticles = useMemo(
    () => mergedArticles.filter((a) => a.status === "pending"),
    [mergedArticles],
  );

  const scheduledArticles = useMemo(
    () =>
      mergedArticles.filter(
        (a) => a.status === "scheduled" || isArticleScheduledFuture(a.scheduledAt),
      ),
    [mergedArticles],
  );

  const openInlinePreview = async (article: Article) => {
    setPreviewArticle(article);
    setScheduleInput(toDatetimeLocalValue(article.scheduledAt));
    if (!article.content) {
      setPreviewLoading(true);
      try {
        const full = await fetchArticlePreviewDetails(article, "*");
        if (full) {
          setPreviewArticle((prev) => (prev && prev.id === article.id ? full : prev));
          setScheduleInput(toDatetimeLocalValue(full.scheduledAt));
        }
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const updateLocalArticleState = (id: string, patch: Partial<Article>) => {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setFetchedArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setPreviewArticle((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

  const handleApproveArticle = async (article: Article, customScheduleIso?: string | null) => {
    const targetIso =
      customScheduleIso !== undefined ? customScheduleIso : (article.scheduledAt ?? null);
    const isFuture = isArticleScheduledFuture(targetIso);
    const nextStatus: ArticleStatus = isFuture ? "scheduled" : "published";

    const updatePayload: Record<string, unknown> = isFuture
      ? { status: nextStatus, scheduled_at: targetIso }
      : { status: "published", scheduled_at: null };

    const { error } = await updateArticleStatusSafe(article.id, updatePayload, {
      isFutureSchedule: isFuture,
    });

    if (!error) {
      setLocalScheduledAt(article.id, isFuture ? targetIso : null);
      updateLocalArticleState(article.id, {
        status: nextStatus,
        scheduledAt: isFuture ? targetIso : null,
      });
      if (previewArticle?.id === article.id) {
        setPreviewArticle(null);
      }
      showToast(
        isFuture
          ? `公開予約（${formatScheduledDateTime(targetIso)}）として承認しました`
          : "記事を公開しました",
      );
    } else if (isFuture && isArticleOptionalColumnSchemaError(error)) {
      showToast("データベース更新準備中のため、公開予約を設定できません");
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
  };

  const handleRejectArticle = async (article: Article) => {
    const { error } = await updateArticleStatusSafe(article.id, {
      status: "draft",
      scheduled_at: null,
    });
    if (!error) {
      setLocalScheduledAt(article.id, null);
      updateLocalArticleState(article.id, { status: "draft", scheduledAt: null });
      if (previewArticle?.id === article.id) {
        setPreviewArticle(null);
      }
      showToast("差し戻しました");
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
  };

  const getStatusBadge = (status: ArticleStatus) => <ArticleStatusBadge status={status} />;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:mx-0 -mt-4 md:mt-0 px-4 md:rounded-xl bg-white dark:bg-gray-800 border-b md:border border-gray-200 dark:border-gray-700 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-6">
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="戻る"
          className="p-2 bg-white dark:bg-gray-700 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-purple-800 dark:text-purple-300">
          編集長ダッシュボード
        </h1>
      </div>
      {(profileHasRole(profile, "editor") || profileHasRole(profile, "writer")) && (
        <button
          onClick={() => navigate("writerDash")}
          className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold shadow-md flex items-center justify-between mb-4 hover:from-blue-600 hover:to-blue-700 transition-all"
        >
          <span>記事を書く（ライター機能）</span>
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </button>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <button
          onClick={() => navigate("editorArticles")}
          className="p-4 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800/60 rounded-xl shadow-sm text-center font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
        >
          全記事の
          <br />
          編集・削除
        </button>
        <button
          onClick={() => navigate("editorRecommend")}
          className="p-4 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800/60 rounded-xl shadow-sm text-center font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
        >
          おすすめ・人気
          <br />
          設定
        </button>
        <button
          onClick={() => navigate("editorWriters")}
          className="p-4 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800/60 rounded-xl shadow-sm text-center font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center justify-center gap-2 transition-colors"
        >
          <CustomUserIcon className="w-5 h-5 shrink-0" /> <span>新規ライターの追加</span>
        </button>
        <button
          onClick={() => navigate("editorApplications")}
          className="p-4 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800/60 rounded-xl shadow-sm text-center font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center justify-center gap-2 transition-colors"
        >
          <Mail className="w-5 h-5 shrink-0" /> <span>ライター応募一覧</span>
        </button>
      </div>

      {/* 投稿承認待ちセクション */}
      <section>
        <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">
          <AlertCircle className="w-5 h-5 text-orange-500" /> 投稿承認待ち ({pendingArticles.length}
          件)
        </h2>
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {pendingArticles.map((article) => {
            const writerName =
              writers.find((w) => w.id === article.writerId)?.display_name ?? "不明";
            const schedLabel = formatScheduledDateTime(article.scheduledAt);
            return (
              <div
                key={article.id}
                className="bg-orange-50 dark:bg-orange-950/30 p-4 rounded-xl border border-orange-200 dark:border-orange-800/50 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-bold text-gray-800 dark:text-gray-100 break-words">
                      {article.title}
                    </p>
                    {getStatusBadge(article.status)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">申請者: {writerName}</p>
                  {schedLabel && (
                    <p className="text-xs text-purple-700 dark:text-purple-300 font-bold mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> 希望公開日時: {schedLabel}
                    </p>
                  )}
                  {article.summary && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 line-clamp-2 bg-white/70 dark:bg-gray-800/70 p-2 rounded-lg border border-orange-100 dark:border-orange-900/40">
                      {article.summary}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={`preview-pending-${article.id}`}
                    onClick={() => void openInlinePreview(article)}
                    className="px-3 py-2 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-sm font-bold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 flex items-center justify-center gap-1 border border-blue-200 dark:border-blue-800/50 shadow-sm cursor-pointer"
                  >
                    <Eye className="w-4 h-4" /> 内容確認
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApproveArticle(article)}
                    className="flex-1 py-2 px-3 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600 flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> 許可 (公開)
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRejectArticle(article)}
                    className="py-2 px-3 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-600 text-sm font-bold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer"
                  >
                    差し戻し
                  </button>
                </div>
              </div>
            );
          })}
          {pendingArticles.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 md:col-span-2">
              現在、承認待ちの記事はありません。
            </p>
          )}
        </div>
      </section>

      {/* 公開予約中セクション */}
      {scheduledArticles.length > 0 && (
        <section>
          <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">
            <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" /> 公開予約中 (
            {scheduledArticles.length}件)
          </h2>
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {scheduledArticles.map((article) => {
              const writerName =
                writers.find((w) => w.id === article.writerId)?.display_name ?? "不明";
              const schedLabel = formatScheduledDateTime(article.scheduledAt);
              return (
                <div
                  key={article.id}
                  className="bg-purple-50/70 dark:bg-purple-950/30 p-4 rounded-xl border border-purple-200 dark:border-purple-800/50 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-bold text-gray-800 dark:text-gray-100 break-words">
                        {article.title}
                      </p>
                      {getStatusBadge("scheduled")}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">執筆者: {writerName}</p>
                    {schedLabel && (
                      <p className="text-xs text-purple-700 dark:text-purple-300 font-bold mt-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> 予約日時: {schedLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openInlinePreview(article)}
                      className="px-3 py-2 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-lg hover:bg-purple-100 dark:hover:bg-purple-950/40 flex items-center justify-center gap-1 border border-purple-200 dark:border-purple-800/50 shadow-sm cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> 内容・予約確認
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApproveArticle(article, null)}
                      className="flex-1 py-2 px-3 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> 今すぐ公開
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRejectArticle(article)}
                      className="py-2 px-3 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer"
                    >
                      下書きへ戻す
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* その場で確認できるインラインプレビューモーダル (#54-12 & #54-3) */}
      <DashboardArticlePreviewModal
        article={previewArticle}
        loading={previewLoading}
        onClose={closePreviewModal}
        getFontSizeClass={getFontSizeClass}
        testId="editor-inline-preview-modal"
        titleId="editor-dash-preview-title"
        maxWidthClass="max-w-3xl"
        showThumbnail
        headerMeta={
          previewArticle && (
            <>
              {getStatusBadge(previewArticle.status)}
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                申請者:{" "}
                {writers.find((w) => w.id === previewArticle.writerId)?.display_name ?? "不明"}
              </span>
            </>
          )
        }
        headerActions={
          previewArticle && (
            <>
              <button
                type="button"
                onClick={() => {
                  const targetId = previewArticle.id;
                  setPreviewArticle(null);
                  navigate("writerEdit", targetId);
                }}
                className="text-xs px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 inline-flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" /> 編集
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = previewArticle.id;
                  setPreviewArticle(null);
                  navigate("article", targetId);
                }}
                className="text-xs px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 inline-flex items-center gap-1 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 記事ページへ
              </button>
            </>
          )
        }
        footer={
          previewArticle && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <label
                  htmlFor="editor-dash-preview-schedule-input"
                  className="text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center gap-1"
                >
                  <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>公開予約日時:</span>
                </label>
                <input
                  id="editor-dash-preview-schedule-input"
                  type="datetime-local"
                  data-testid="editor-preview-schedule-input"
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                {scheduleInput && (
                  <button
                    type="button"
                    onClick={() => setScheduleInput("")}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                  >
                    クリア
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end flex-wrap">
                <button
                  type="button"
                  data-testid="modal-reject-btn"
                  onClick={() => void handleRejectArticle(previewArticle)}
                  className="px-4 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 text-sm font-bold rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                >
                  差し戻し
                </button>
                {(() => {
                  const safeScheduleIso = toSafeIsoString(scheduleInput);
                  return safeScheduleIso && isArticleScheduledFuture(safeScheduleIso) ? (
                    <button
                      type="button"
                      data-testid="modal-schedule-approve-btn"
                      onClick={() => void handleApproveArticle(previewArticle, safeScheduleIso)}
                      className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Clock className="w-4 h-4" /> 予約公開で承認
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="modal-approve-btn"
                      onClick={() => void handleApproveArticle(previewArticle, null)}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Check className="w-4 h-4" /> 許可 (公開)
                    </button>
                  );
                })()}
              </div>
            </div>
          )
        }
      />
    </div>
  );
};
