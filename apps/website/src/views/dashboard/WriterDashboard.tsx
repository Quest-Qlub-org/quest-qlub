import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../supabase";
import { LogoIcon } from "../../components/icons/NavIcons";
import { getThumbnailColor, ARTICLE_STATUS_CONFIG, mapDbArticleToArticle } from "../../types";
import type { Article, ArticleStatus } from "../../types";
import { ARTICLE_LIST_FIELDS } from "../../context/DataContext";
import { sanitizeHtml } from "../../utils/sanitize";
import {
  formatScheduledDateTime,
  getEffectiveArticleStatus,
  getLocalScheduledAt,
} from "../../utils/scheduledArticles";
import { ChevronLeft, Plus, Edit3, Loader2, Eye, X, Clock, RotateCcw } from "lucide-react";
import { updateMetaTags } from "../../utils/seo";

function enrichWriterArticle(article: Article): Article {
  const localSched = getLocalScheduledAt(article.id);
  const scheduledAt = article.scheduledAt ?? localSched ?? null;
  const effectiveStatus = getEffectiveArticleStatus({ ...article, scheduledAt });
  return {
    ...article,
    scheduledAt,
    status: effectiveStatus,
  };
}

export const WriterDashboard = () => {
  const { profile, articles, setArticles, showToast, navigate, authLoading, getFontSizeClass } =
    useApp();
  const [writerArticles, setWriterArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    updateMetaTags({
      title: "ライターダッシュボード",
      noindex: true,
    });
  }, []);

  const fetchMyArticles = useCallback(async () => {
    if (authLoading) return;
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("articles")
        .select(ARTICLE_LIST_FIELDS)
        .eq("writer_id", profile.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setWriterArticles(data.map((row) => enrichWriterArticle(mapDbArticleToArticle(row))));
      } else {
        setWriterArticles(
          articles.filter((a) => a.writerId === profile.id).map(enrichWriterArticle),
        );
      }
    } catch (e) {
      console.error("Failed to load writer articles", e);
      setWriterArticles(articles.filter((a) => a.writerId === profile.id).map(enrichWriterArticle));
    } finally {
      setLoading(false);
    }
  }, [profile?.id, articles, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      void fetchMyArticles();
    }
  }, [fetchMyArticles, authLoading]);

  const myArticles =
    writerArticles.length > 0
      ? writerArticles
      : articles.filter((a) => a.writerId === profile?.id).map(enrichWriterArticle);

  const openCreate = () => {
    navigate("writerNew");
  };
  const openSeriesManager = () => {
    navigate("writerSeries");
  };

  const openEdit = (article: Article) => {
    navigate("writerEdit", article.id);
  };

  const openInlinePreview = async (article: Article) => {
    setPreviewArticle(article);
    if (!article.content) {
      setPreviewLoading(true);
      try {
        const query = supabase.from("articles").select("*");
        if (query && typeof (query as { eq?: unknown }).eq === "function") {
          const eqQuery = query.eq("id", article.id);
          if (eqQuery && typeof (eqQuery as { maybeSingle?: unknown }).maybeSingle === "function") {
            const { data, error } = await eqQuery.maybeSingle();
            if (!error && data) {
              const row = data as Record<string, unknown>;
              setPreviewArticle((prev) =>
                prev
                  ? enrichWriterArticle({
                      ...prev,
                      content: typeof row.content === "string" ? row.content : prev.content,
                      summary: typeof row.summary === "string" ? row.summary : prev.summary,
                    })
                  : null,
              );
            }
          }
        }
      } catch {
        // fallback to existing fields
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const handleSubmit = async (article: Article) => {
    const { error } = await supabase
      .from("articles")
      .update({ status: "pending" })
      .eq("id", article.id);
    if (!error) {
      setWriterArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, status: "pending" } : a)),
      );
      setArticles(articles.map((a) => (a.id === article.id ? { ...a, status: "pending" } : a)));
      setPreviewArticle((prev) =>
        prev && prev.id === article.id ? { ...prev, status: "pending" } : prev,
      );
      showToast("投稿申請しました");
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
  };

  const handleWithdrawPending = async (article: Article) => {
    const { error } = await supabase
      .from("articles")
      .update({ status: "draft" })
      .eq("id", article.id);
    if (!error) {
      setWriterArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, status: "draft" } : a)),
      );
      setArticles(articles.map((a) => (a.id === article.id ? { ...a, status: "draft" } : a)));
      setPreviewArticle((prev) =>
        prev && prev.id === article.id ? { ...prev, status: "draft" } : prev,
      );
      showToast("投稿申請を取り消し、下書きに戻しました");
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
  };

  const handleUnpublish = async (article: Article) => {
    if (!window.confirm(`「${article.title}」を非公開（下書き）に戻しますか？`)) return;
    const { error } = await supabase
      .from("articles")
      .update({ status: "draft" })
      .eq("id", article.id);
    if (!error) {
      setWriterArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, status: "draft" } : a)),
      );
      setArticles(articles.map((a) => (a.id === article.id ? { ...a, status: "draft" } : a)));
      setPreviewArticle((prev) =>
        prev && prev.id === article.id ? { ...prev, status: "draft" } : prev,
      );
      showToast("記事を非公開（下書き）に戻しました");
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
  };

  const handleDelete = async (article: Article) => {
    if (!window.confirm(`「${article.title}」を削除しますか？`)) return;
    const { error } = await supabase.from("articles").delete().eq("id", article.id);
    if (!error) {
      setWriterArticles((prev) => prev.filter((a) => a.id !== article.id));
      setArticles(articles.filter((a) => a.id !== article.id));
      if (previewArticle?.id === article.id) {
        setPreviewArticle(null);
      }
      showToast("記事を削除しました");
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
  };

  const statusLabel = (status: string) => {
    const config = ARTICLE_STATUS_CONFIG[status as ArticleStatus] ?? ARTICLE_STATUS_CONFIG.draft;
    return (
      <span className={`text-xs ${config.badgeClass} px-2 py-1 rounded font-bold shrink-0`}>
        {config.label}
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
        <h2 className="text-lg font-bold text-gray-800">記事を作成</h2>
      </div>

      {/* 記事一覧 */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-bold text-gray-800">自分の記事 ({myArticles.length}件)</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={openSeriesManager}
              className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1 hover:bg-gray-200"
            >
              連載管理
            </button>
            <button
              onClick={openCreate}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> 新規作成
            </button>
          </div>
        </div>
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {loading || authLoading ? (
            <div className="flex flex-col items-center justify-center py-12 md:col-span-2 gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs">記事を読み込んでいます...</span>
            </div>
          ) : myArticles.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8 bg-white rounded-xl border md:col-span-2">
              まだ記事がありません。「新規作成」から始めましょう！
            </p>
          ) : null}
          {myArticles.map((article) => {
            const color = getThumbnailColor(article.thumbnailColor ?? null);
            const schedLabel = formatScheduledDateTime(article.scheduledAt);
            return (
              <div
                key={article.id}
                className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex gap-3"
              >
                <div
                  className={`${color.bg} w-14 h-14 rounded-lg flex items-center justify-center shrink-0`}
                >
                  <LogoIcon className="w-8 h-8 opacity-40" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h4 className="font-bold text-gray-800 text-sm truncate">{article.title}</h4>
                    {statusLabel(article.status)}
                  </div>
                  {schedLabel && (
                    <p className="text-[11px] text-purple-700 font-bold mb-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 公開予定: {schedLabel}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <button
                      onClick={() => navigate("article", article.id)}
                      className="py-1.5 px-2 bg-gray-50 text-gray-700 text-xs font-bold rounded hover:bg-gray-100 flex items-center justify-center gap-1 border border-gray-200"
                    >
                      <Eye className="w-3 h-3" /> 確認
                    </button>
                    <button
                      type="button"
                      data-testid={`writer-inline-preview-${article.id}`}
                      onClick={() => void openInlinePreview(article)}
                      className="py-1.5 px-2 bg-indigo-50 text-indigo-700 text-xs font-bold rounded hover:bg-indigo-100 flex items-center justify-center gap-1 border border-indigo-200"
                    >
                      プレビュー
                    </button>
                    <button
                      onClick={() => openEdit(article)}
                      className="flex-1 py-1.5 px-2 bg-gray-100 text-gray-600 text-xs font-bold rounded hover:bg-gray-200 flex items-center justify-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" /> 編集
                    </button>
                    {article.status === "draft" && (
                      <button
                        onClick={() => void handleSubmit(article)}
                        className="flex-1 py-1.5 px-2 bg-blue-50 text-blue-600 text-xs font-bold rounded hover:bg-blue-100 border border-blue-200"
                      >
                        投稿申請
                      </button>
                    )}
                    {article.status === "pending" && (
                      <button
                        type="button"
                        data-testid={`withdraw-pending-${article.id}`}
                        onClick={() => void handleWithdrawPending(article)}
                        className="py-1.5 px-2 bg-orange-50 text-orange-700 text-xs font-bold rounded hover:bg-orange-100 border border-orange-200 flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> 申請取消
                      </button>
                    )}
                    {(article.status === "published" || article.status === "scheduled") && (
                      <button
                        onClick={() => void handleUnpublish(article)}
                        className="py-1.5 px-2 bg-amber-50 text-amber-700 text-xs font-bold rounded hover:bg-amber-100 border border-amber-200"
                      >
                        非公開にする
                      </button>
                    )}
                    {article.status !== "published" && (
                      <button
                        onClick={() => void handleDelete(article)}
                        className="py-1.5 px-2 bg-red-50 text-red-500 text-xs font-bold rounded hover:bg-red-100 border border-red-200"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* その場で確認できるインラインプレビューモーダル (#54-12) */}
      {previewArticle && (
        <div
          data-testid="writer-inline-preview-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={() => setPreviewArticle(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <div className="flex items-center gap-2 min-w-0">
                {statusLabel(previewArticle.status)}
                {formatScheduledDateTime(previewArticle.scheduledAt) && (
                  <span className="text-xs text-purple-700 font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatScheduledDateTime(previewArticle.scheduledAt)}
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setPreviewArticle(null)}
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900 break-words">
                {previewArticle.title}
              </h2>
              {previewArticle.summary && (
                <div className="bg-blue-50 p-3 rounded-xl text-sm text-gray-700 border border-blue-100">
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

            <div className="p-4 border-t bg-gray-50 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = previewArticle;
                  setPreviewArticle(null);
                  openEdit(target);
                }}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-100 flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" /> 編集する
              </button>
              {previewArticle.status === "draft" && (
                <button
                  type="button"
                  onClick={() => void handleSubmit(previewArticle)}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700"
                >
                  投稿申請する
                </button>
              )}
              {previewArticle.status === "pending" && (
                <button
                  type="button"
                  onClick={() => void handleWithdrawPending(previewArticle)}
                  className="px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl hover:bg-orange-700"
                >
                  申請を取り消す
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
