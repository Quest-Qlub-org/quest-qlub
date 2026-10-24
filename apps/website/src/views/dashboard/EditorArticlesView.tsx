import { sanitizeHtml } from "../../utils/sanitize";
import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { ChevronLeft, X, MessageSquare, EyeOff } from "lucide-react";
import type { Article, ArticleStatus } from "../../types";
import { mapDbArticleToArticle, ARTICLE_STATUS_CONFIG } from "../../types";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";

export function EditorArticlesView() {
  const { getFontSizeClass, showToast, setArticles: setGlobalArticles } = useApp();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    void supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setArticles(data.map(mapDbArticleToArticle));
        setLoading(false);
      });
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("この記事を削除しますか？")) return;
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (!error) setArticles(articles.filter((a) => a.id !== id));
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
      showToast("コメント設定の更新に失敗しました");
    }
  };

  const getStatusConfig = (s: string) =>
    ARTICLE_STATUS_CONFIG[s as ArticleStatus] ?? ARTICLE_STATUS_CONFIG.draft;

  return (
    <div className="p-4 space-y-4 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 -mt-4 px-4 bg-white border-b border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-4">
        <button onClick={() => nav(-1)} className="p-2 bg-white rounded-full shadow-sm">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-purple-800">全記事の編集・削除</h2>
      </div>
      {loading ? (
        <p className="text-center text-gray-400 py-8">読み込み中...</p>
      ) : (
        <div className="space-y-3">
          {articles.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">記事がありません</p>
          ) : (
            articles.map((a) => {
              const isCommentsOn = a.commentsEnabled !== false;
              return (
                <div
                  key={a.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => setPreviewArticle(a)}
                    >
                      <p className="font-bold text-gray-800 text-sm truncate hover:text-blue-600">
                        {a.title}
                      </p>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${getStatusConfig(a.status).badgeClass}`}
                      >
                        {getStatusConfig(a.status).label}
                      </span>
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
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
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPreviewArticle(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
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
            <div className={`overflow-y-auto p-5 article-content ${getFontSizeClass()}`}>
              {previewArticle.content ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewArticle.content) }} />
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">本文がありません</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
