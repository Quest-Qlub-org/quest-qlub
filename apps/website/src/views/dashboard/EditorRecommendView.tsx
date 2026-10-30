import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { ChevronLeft } from "lucide-react";
import type { Article } from "../../types";
import { mapDbArticleToArticle } from "../../types";
import { ARTICLE_LIST_FIELDS } from "../../context/DataContext";
import { useNavigate } from "react-router-dom";
import { isArticlePubliclyVisible, enrichArticleWithSchedule } from "../../utils/scheduledArticles";
import { updateMetaTags } from "../../utils/seo";

export function EditorRecommendView() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    updateMetaTags({
      title: "おすすめ・注目記事管理",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    void supabase
      .from("articles")
      .select(ARTICLE_LIST_FIELDS)
      .eq("status", "published")
      .then(({ data }) => {
        if (data) {
          setArticles(
            data
              .map(mapDbArticleToArticle)
              .map(enrichArticleWithSchedule)
              .filter(isArticlePubliclyVisible),
          );
        }
        setLoading(false);
      });
  }, []);

  const toggle = async (id: string, field: "is_recommended" | "is_popular", current: boolean) => {
    const { error } = await supabase
      .from("articles")
      .update({ [field]: !current })
      .eq("id", id);
    if (!error)
      setArticles(
        articles.map((a) =>
          a.id === id
            ? {
                ...a,
                isRecommended: field === "is_recommended" ? !current : a.isRecommended,
                isPopular: field === "is_popular" ? !current : a.isPopular,
              }
            : a,
        ),
      );
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:mx-0 -mt-4 md:mt-0 px-4 md:px-5 md:rounded-2xl md:border bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-4">
        <button
          onClick={() => nav(-1)}
          className="p-2 bg-white dark:bg-gray-700 rounded-full shadow-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-purple-800 dark:text-purple-300">
          おすすめ・人気設定
        </h2>
      </div>
      {loading ? (
        <p className="text-center text-gray-400 py-8">読み込み中...</p>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-gray-500 dark:text-gray-400 font-bold">公開済みの記事がありません</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            記事が公開されると、ここで設定できます
          </p>
        </div>
      ) : (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {articles.map((a) => (
            <div
              key={a.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
            >
              <p className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-3 break-words">
                {a.title}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => toggle(a.id, "is_recommended", a.isRecommended)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${a.isRecommended ? "bg-blue-500 text-white border-blue-500" : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600"}`}
                >
                  おすすめ {a.isRecommended ? "✓" : ""}
                </button>
                <button
                  onClick={() => toggle(a.id, "is_popular", a.isPopular)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${a.isPopular ? "bg-orange-500 text-white border-orange-500" : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600"}`}
                >
                  人気 {a.isPopular ? "✓" : ""}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
