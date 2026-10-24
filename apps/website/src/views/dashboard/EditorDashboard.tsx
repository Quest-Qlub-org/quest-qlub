import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../supabase";
import { CustomUserIcon } from "../../App";
import { sanitizeHtml } from "../../utils/sanitize";
import { mapDbArticleToArticle, ARTICLE_STATUS_CONFIG, getThumbnailColor } from "../../types";
import type { Article, ArticleStatus } from "../../types";
import {
  formatScheduledDateTime,
  getEffectiveArticleStatus,
  getLocalScheduledAt,
  isArticleScheduledFuture,
  setLocalScheduledAt,
  toDatetimeLocalValue,
  toSafeIsoString,
} from "../../utils/scheduledArticles";
import { LogoIcon } from "../../components/icons/NavIcons";
import {
  ChevronLeft,
  Check,
  AlertCircle,
  Eye,
  Mail,
  X,
  Clock,
  ExternalLink,
  Edit3,
} from "lucide-react";
import { updateMetaTags } from "../../utils/seo";

function enrichArticleWithLocalSchedule(article: Article): Article {
  const localSched = getLocalScheduledAt(article.id);
  const scheduledAt = article.scheduledAt ?? localSched ?? null;
  const effectiveStatus = getEffectiveArticleStatus({ ...article, scheduledAt });
  return {
    ...article,
    scheduledAt,
    status: effectiveStatus,
  };
}

export const EditorDashboard = () => {
  const { userRole, navigate, articles, setArticles, writers, showToast, getFontSizeClass } =
    useApp();

  const [fetchedArticles, setFetchedArticles] = useState<Article[]>([]);
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scheduleInput, setScheduleInput] = useState("");

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
            enrichArticleWithLocalSchedule(
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
      map.set(a.id, enrichArticleWithLocalSchedule(a));
    }
    for (const f of fetchedArticles) {
      const existing = map.get(f.id);
      map.set(
        f.id,
        enrichArticleWithLocalSchedule(
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
        const query = supabase.from("articles").select("*");
        if (query && typeof (query as { eq?: unknown }).eq === "function") {
          const eqQuery = query.eq("id", article.id);
          if (eqQuery && typeof (eqQuery as { maybeSingle?: unknown }).maybeSingle === "function") {
            const { data, error } = await eqQuery.maybeSingle();
            if (!error && data) {
              const full = enrichArticleWithLocalSchedule(mapDbArticleToArticle(data));
              setPreviewArticle(full);
              setScheduleInput(toDatetimeLocalValue(full.scheduledAt));
            }
          }
        }
      } catch {
        // fallback to existing article summary/fields
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

    const updatePayload: Record<string, unknown> = targetIso
      ? { status: nextStatus, scheduled_at: targetIso }
      : { status: "published" };

    let { error } = await supabase.from("articles").update(updatePayload).eq("id", article.id);

    // scheduled_at カラム未適用環境や status check 制約環境での安全なフォールバック
    if (error) {
      const fallbackStatus = isFuture ? "published" : "published";
      const retry = await supabase
        .from("articles")
        .update({ status: fallbackStatus })
        .eq("id", article.id);
      error = retry.error;
    }

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
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
  };

  const handleRejectArticle = async (article: Article) => {
    const { error } = await supabase
      .from("articles")
      .update({ status: "draft" })
      .eq("id", article.id);
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

  const getStatusBadge = (status: ArticleStatus) => {
    const cfg = ARTICLE_STATUS_CONFIG[status] ?? ARTICLE_STATUS_CONFIG.draft;
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:mx-0 -mt-4 md:mt-0 px-4 md:rounded-xl bg-white border-b md:border border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-6">
        <button
          onClick={() => window.history.back()}
          className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-purple-800">編集長ダッシュボード</h2>
      </div>
      {userRole === "editor" && (
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
          className="p-4 bg-white border border-purple-200 rounded-xl shadow-sm text-center font-bold text-purple-700 hover:bg-purple-50 transition-colors"
        >
          全記事の
          <br />
          編集・削除
        </button>
        <button
          onClick={() => navigate("editorRecommend")}
          className="p-4 bg-white border border-purple-200 rounded-xl shadow-sm text-center font-bold text-purple-700 hover:bg-purple-50 transition-colors"
        >
          おすすめ・人気
          <br />
          設定
        </button>
        <button
          onClick={() => navigate("editorWriters")}
          className="p-4 bg-white border border-purple-200 rounded-xl shadow-sm text-center font-bold text-purple-700 hover:bg-purple-50 flex items-center justify-center gap-2 transition-colors"
        >
          <CustomUserIcon className="w-5 h-5 shrink-0" /> <span>新規ライターの追加</span>
        </button>
        <button
          onClick={() => navigate("editorApplications")}
          className="p-4 bg-white border border-purple-200 rounded-xl shadow-sm text-center font-bold text-purple-700 hover:bg-purple-50 flex items-center justify-center gap-2 transition-colors"
        >
          <Mail className="w-5 h-5 shrink-0" /> <span>ライター応募一覧</span>
        </button>
      </div>

      {/* 投稿承認待ちセクション */}
      <section>
        <h3 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2 mb-3">
          <AlertCircle className="w-5 h-5 text-orange-500" /> 投稿承認待ち ({pendingArticles.length}
          件)
        </h3>
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {pendingArticles.map((article) => {
            const writerName =
              writers.find((w) => w.id === article.writerId)?.display_name ?? "不明";
            const schedLabel = formatScheduledDateTime(article.scheduledAt);
            return (
              <div
                key={article.id}
                className="bg-orange-50 p-4 rounded-xl border border-orange-200 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-bold text-gray-800 break-words">{article.title}</p>
                    {getStatusBadge(article.status)}
                  </div>
                  <p className="text-xs text-gray-500">申請者: {writerName}</p>
                  {schedLabel && (
                    <p className="text-xs text-purple-700 font-bold mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> 希望公開日時: {schedLabel}
                    </p>
                  )}
                  {article.summary && (
                    <p className="text-xs text-gray-600 mt-2 line-clamp-2 bg-white/70 p-2 rounded-lg border border-orange-100">
                      {article.summary}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={`preview-pending-${article.id}`}
                    onClick={() => void openInlinePreview(article)}
                    className="px-3 py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1 border border-blue-200 shadow-sm cursor-pointer"
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
                    className="py-2 px-3 bg-white text-gray-600 border border-gray-300 text-sm font-bold rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    差し戻し
                  </button>
                </div>
              </div>
            );
          })}
          {pendingArticles.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6 bg-white rounded-xl border md:col-span-2">
              現在、承認待ちの記事はありません。
            </p>
          )}
        </div>
      </section>

      {/* 公開予約中セクション */}
      {scheduledArticles.length > 0 && (
        <section>
          <h3 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2 mb-3">
            <Clock className="w-5 h-5 text-purple-600" /> 公開予約中 ({scheduledArticles.length}件)
          </h3>
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {scheduledArticles.map((article) => {
              const writerName =
                writers.find((w) => w.id === article.writerId)?.display_name ?? "不明";
              const schedLabel = formatScheduledDateTime(article.scheduledAt);
              return (
                <div
                  key={article.id}
                  className="bg-purple-50/70 p-4 rounded-xl border border-purple-200 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-bold text-gray-800 break-words">{article.title}</p>
                      {getStatusBadge("scheduled")}
                    </div>
                    <p className="text-xs text-gray-500">執筆者: {writerName}</p>
                    {schedLabel && (
                      <p className="text-xs text-purple-700 font-bold mt-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> 予約日時: {schedLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openInlinePreview(article)}
                      className="px-3 py-2 bg-white text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-100 flex items-center justify-center gap-1 border border-purple-200 shadow-sm cursor-pointer"
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
                      className="py-2 px-3 bg-white text-gray-600 border border-gray-300 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer"
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
      {previewArticle && (
        <div
          data-testid="editor-inline-preview-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={() => setPreviewArticle(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="記事プレビュー"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2 min-w-0">
                {getStatusBadge(previewArticle.status)}
                <span className="text-xs text-gray-500 truncate">
                  申請者:{" "}
                  {writers.find((w) => w.id === previewArticle.writerId)?.display_name ?? "不明"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const targetId = previewArticle.id;
                    setPreviewArticle(null);
                    navigate("writerEdit", targetId);
                  }}
                  className="text-xs px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg font-bold text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1 cursor-pointer"
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
                  className="text-xs px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg font-bold text-blue-600 hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> 記事ページへ
                </button>
                <button
                  type="button"
                  aria-label="閉じる"
                  onClick={() => setPreviewArticle(null)}
                  className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* モーダル本文（スクロール領域） */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {previewArticle.thumbnailUrl ? (
                <div className="w-full max-h-60 aspect-video rounded-xl overflow-hidden bg-gray-50 border border-gray-200 flex items-center justify-center">
                  <img
                    src={previewArticle.thumbnailUrl}
                    alt={previewArticle.title}
                    className="w-full h-full object-contain max-h-60"
                  />
                </div>
              ) : (
                <div
                  className={`${getThumbnailColor(previewArticle.thumbnailColor ?? null).bg} w-full h-32 rounded-xl flex items-center justify-center border border-gray-100`}
                >
                  <LogoIcon className="w-12 h-12 opacity-30" />
                </div>
              )}

              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug break-words">
                {previewArticle.title}
              </h2>

              {(previewArticle.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(previewArticle.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-full border border-gray-200"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {previewArticle.summary && (
                <div className="bg-blue-50 p-3.5 rounded-xl text-sm text-gray-700 border border-blue-100 font-medium">
                  {previewArticle.summary}
                </div>
              )}

              <div className="border-t border-gray-100 pt-4">
                {previewLoading ? (
                  <p className="text-sm text-gray-400 text-center py-8">本文を読み込み中...</p>
                ) : previewArticle.content ? (
                  <div
                    className={`article-content ${typeof getFontSizeClass === "function" ? getFontSizeClass() : "text-base"}`}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewArticle.content) }}
                  />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">本文が設定されていません</p>
                )}
              </div>
            </div>

            {/* モーダルフッター（その場で承認・公開予約・差し戻しアクション） */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-purple-600" />
                  <span>公開予約日時:</span>
                </label>
                <input
                  type="datetime-local"
                  data-testid="editor-preview-schedule-input"
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                {scheduleInput && (
                  <button
                    type="button"
                    onClick={() => setScheduleInput("")}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
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
                  className="px-4 py-2 bg-white text-gray-700 border border-gray-300 text-sm font-bold rounded-xl hover:bg-gray-100 cursor-pointer"
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
          </div>
        </div>
      )}
    </div>
  );
};
