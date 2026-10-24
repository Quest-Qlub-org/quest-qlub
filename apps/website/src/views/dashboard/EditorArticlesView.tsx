import { sanitizeHtml } from "../../utils/sanitize";
import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { ChevronLeft, X, MessageSquare, EyeOff, Clock, Check } from "lucide-react";
import type { Article, ArticleStatus } from "../../types";
import { mapDbArticleToArticle, ARTICLE_STATUS_CONFIG } from "../../types";
import {
  formatScheduledDateTime,
  getEffectiveArticleStatus,
  getLocalScheduledAt,
  isArticleScheduledFuture,
  setLocalScheduledAt,
  toDatetimeLocalValue,
  toSafeIsoString,
} from "../../utils/scheduledArticles";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { updateMetaTags } from "../../utils/seo";

function enrichEditorArticle(article: Article): Article {
  const localSched = getLocalScheduledAt(article.id);
  const scheduledAt = article.scheduledAt ?? localSched ?? null;
  const effectiveStatus = getEffectiveArticleStatus({ ...article, scheduledAt });
  return {
    ...article,
    scheduledAt,
    status: effectiveStatus,
  };
}

export function EditorArticlesView() {
  const { getFontSizeClass, showToast, setArticles: setGlobalArticles } = useApp();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [scheduleInput, setScheduleInput] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    updateMetaTags({
      title: "記事管理",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    void supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setArticles(data.map((row) => enrichEditorArticle(mapDbArticleToArticle(row))));
        setLoading(false);
      });
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("この記事を削除しますか？")) return;
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (!error) {
      setLocalScheduledAt(id, null);
      setArticles(articles.filter((a) => a.id !== id));
    }
  };

  const handleToggleComments = async (article: Article) => {
    const nextEnabled = !(article.commentsEnabled !== false);
    const { error } = await supabase
      .from("articles")
      .update({ comments_enabled: nextEnabled })
      .eq("id", article.id);
    if (!error) {
      setArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, commentsEnabled: nextEnabled } : a)),
      );
      setGlobalArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, commentsEnabled: nextEnabled } : a)),
      );
      showToast(nextEnabled ? "コメント機能をオンにしました" : "コメント機能をオフにしました");
    } else {
      if (
        (error as { code?: string; message?: string }).code === "42703" ||
        error.message?.includes("comments_enabled")
      ) {
        showToast("データベース更新準備中のため、コメント設定を変更できません");
      } else {
        showToast("コメント設定の更新に失敗しました");
      }
    }
  };

  const handleToggleStatus = async (article: Article) => {
    const nextStatus: ArticleStatus = article.status === "published" ? "draft" : "published";
    const promptMsg =
      nextStatus === "draft"
        ? `「${article.title}」を非公開（下書き）にしますか？`
        : `「${article.title}」を公開しますか？`;
    if (!confirm(promptMsg)) return;

    const { error } = await supabase
      .from("articles")
      .update({ status: nextStatus })
      .eq("id", article.id);

    if (!error) {
      setLocalScheduledAt(article.id, null);
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id ? { ...a, status: nextStatus, scheduledAt: null } : a,
        ),
      );
      setGlobalArticles((prev) => {
        const exists = prev.some((a) => a.id === article.id);
        const updated: Article = { ...article, status: nextStatus, scheduledAt: null };
        if (exists) {
          return prev.map((a) =>
            a.id === article.id ? { ...a, status: nextStatus, scheduledAt: null } : a,
          );
        }
        if (nextStatus === "published") {
          return [updated, ...prev];
        }
        return prev;
      });
      showToast(
        nextStatus === "published" ? "記事を公開しました" : "記事を非公開（下書き）にしました",
      );
    } else {
      showToast("ステータス変更に失敗しました");
    }
  };

  const handleUpdateScheduleOrStatus = async (
    article: Article,
    targetStatus: ArticleStatus,
    scheduledIso: string | null,
  ) => {
    const isFuture = isArticleScheduledFuture(scheduledIso);
    const effectiveStatus: ArticleStatus =
      targetStatus === "draft" ? "draft" : isFuture ? "scheduled" : "published";
    const updatePayload: Record<string, unknown> = scheduledIso
      ? { status: effectiveStatus, scheduled_at: scheduledIso }
      : { status: effectiveStatus };

    let { error } = await supabase.from("articles").update(updatePayload).eq("id", article.id);
    if (error) {
      const fallbackStatus = effectiveStatus === "scheduled" ? "published" : effectiveStatus;
      const retry = await supabase
        .from("articles")
        .update({ status: fallbackStatus })
        .eq("id", article.id);
      error = retry.error;
    }

    if (!error) {
      setLocalScheduledAt(article.id, isFuture ? scheduledIso : null);
      const patch = {
        status: effectiveStatus,
        scheduledAt: isFuture ? scheduledIso : null,
      };
      setArticles((prev) => prev.map((a) => (a.id === article.id ? { ...a, ...patch } : a)));
      setGlobalArticles((prev) => {
        const exists = prev.some((a) => a.id === article.id);
        const updated: Article = { ...article, ...patch };
        if (exists) {
          return prev.map((a) => (a.id === article.id ? { ...a, ...patch } : a));
        }
        if (effectiveStatus === "published") {
          return [updated, ...prev];
        }
        return prev;
      });
      setPreviewArticle(null);
      showToast(
        effectiveStatus === "draft"
          ? "記事を下書きに戻しました"
          : isFuture
            ? `公開予約（${formatScheduledDateTime(scheduledIso)}）を設定しました`
            : "記事を公開しました",
      );
    } else {
      showToast("ステータス変更に失敗しました");
    }
  };

  const getStatusConfig = (s: string) =>
    ARTICLE_STATUS_CONFIG[s as ArticleStatus] ?? ARTICLE_STATUS_CONFIG.draft;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:mx-0 -mt-4 md:mt-0 px-4 md:rounded-xl bg-white border-b md:border border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-4">
        <button onClick={() => nav(-1)} className="p-2 bg-white rounded-full shadow-sm">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-purple-800">全記事の編集・削除</h2>
      </div>
      {loading ? (
        <p className="text-center text-gray-400 py-8">読み込み中...</p>
      ) : (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {articles.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8 md:col-span-2">記事がありません</p>
          ) : (
            articles.map((a) => {
              const isCommentsOn = a.commentsEnabled !== false;
              const schedLabel = formatScheduledDateTime(a.scheduledAt);
              return (
                <div
                  key={a.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => {
                        setPreviewArticle(a);
                        setScheduleInput(toDatetimeLocalValue(a.scheduledAt));
                      }}
                    >
                      <p className="font-bold text-gray-800 text-sm truncate hover:text-blue-600">
                        {a.title}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${getStatusConfig(a.status).badgeClass}`}
                        >
                          {getStatusConfig(a.status).label}
                        </span>
                        {schedLabel && (
                          <span className="text-[11px] font-bold text-purple-700 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {schedLabel}
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(a)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          a.status === "published"
                            ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                            : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                        }`}
                        title={a.status === "published" ? "下書きに戻す（非公開）" : "公開する"}
                      >
                        {a.status === "published" ? "非公開" : "公開"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleComments(a)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          isCommentsOn
                            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                            : "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200"
                        }`}
                        title="この記事のコメント機能のオン/オフを切り替え"
                      >
                        {isCommentsOn ? (
                          <>
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>コメントON</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>コメントOFF</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      {previewArticle && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setPreviewArticle(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-base truncate">{previewArticle.title}</p>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${getStatusConfig(previewArticle.status).badgeClass}`}
                >
                  {getStatusConfig(previewArticle.status).label}
                </span>
              </div>
              <button
                onClick={() => setPreviewArticle(null)}
                className="ml-3 p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className={`flex-1 overflow-y-auto p-5 article-content ${getFontSizeClass()}`}>
              {previewArticle.content ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewArticle.content) }} />
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">本文がありません</p>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-purple-600" />
                  <span>公開予約:</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => void handleUpdateScheduleOrStatus(previewArticle, "draft", null)}
                  className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-100"
                >
                  下書きへ
                </button>
                {(() => {
                  const safeScheduleIso = toSafeIsoString(scheduleInput);
                  return safeScheduleIso && isArticleScheduledFuture(safeScheduleIso) ? (
                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateScheduleOrStatus(
                          previewArticle,
                          "scheduled",
                          safeScheduleIso,
                        )
                      }
                      className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 flex items-center gap-1"
                    >
                      <Clock className="w-3.5 h-3.5" /> 予約公開を設定
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateScheduleOrStatus(previewArticle, "published", null)
                      }
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> 公開する
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
}
