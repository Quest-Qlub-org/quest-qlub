import { useApp } from "../../context/AppContext";
import { supabase } from "../../supabase";
import { CustomUserIcon } from "../../App";
import { ChevronLeft, Check, AlertCircle, Eye, Mail } from "lucide-react";

export const EditorDashboard = () => {
  const { userRole, navigate, articles, setArticles, writers, showToast } = useApp();

  const pendingArticles = articles.filter((a) => a.status === "pending");
  return (
    <div className="p-4 space-y-6 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 -mt-4 px-4 bg-white border-b border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-6">
        <button
          onClick={() => window.history.back()}
          className="p-2 bg-white rounded-full shadow-sm"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-purple-800">編集長ダッシュボード</h2>
      </div>
      {userRole === "editor" && (
        <button
          onClick={() => navigate("writerDash")}
          className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold shadow-md flex items-center justify-between mb-4"
        >
          <span>記事を書く（ライター機能）</span>
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => navigate("editorArticles")}
          className="p-4 bg-white border border-purple-200 rounded-xl shadow-sm text-center font-bold text-purple-700 hover:bg-purple-50"
        >
          全記事の
          <br />
          編集・削除
        </button>
        <button
          onClick={() => navigate("editorRecommend")}
          className="p-4 bg-white border border-purple-200 rounded-xl shadow-sm text-center font-bold text-purple-700 hover:bg-purple-50"
        >
          おすすめ・人気
          <br />
          設定
        </button>
        <button
          onClick={() => navigate("editorWriters")}
          className="p-4 bg-white border border-purple-200 rounded-xl shadow-sm text-center font-bold text-purple-700 hover:bg-purple-50 flex items-center justify-center gap-2"
        >
          <CustomUserIcon className="w-5 h-5" /> 新規ライターの追加
        </button>
        <button
          onClick={() => navigate("editorApplications")}
          className="p-4 bg-white border border-purple-200 rounded-xl shadow-sm text-center font-bold text-purple-700 hover:bg-purple-50 flex items-center justify-center gap-2"
        >
          <Mail className="w-5 h-5" /> ライター応募一覧
        </button>
      </div>
      <section>
        <h3 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2 mb-3">
          <AlertCircle className="w-5 h-5 text-orange-500" /> 投稿承認待ち ({pendingArticles.length}
          件)
        </h3>
        <div className="space-y-3">
          {pendingArticles.map((article) => (
            <div key={article.id} className="bg-orange-50 p-3 rounded-xl border border-orange-200">
              <p className="font-bold text-gray-800 mb-1">{article.title}</p>
              <p className="text-xs text-gray-500 mb-3">
                申請者: {writers.find((w) => w.id === article.writerId)?.display_name ?? "不明"}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate("article", article.id)}
                  className="px-3 py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1 border border-blue-200 shadow-sm"
                >
                  <Eye className="w-4 h-4" /> 内容確認
                </button>
                <button
                  onClick={async () => {
                    const { error } = await supabase
                      .from("articles")
                      .update({ status: "published" })
                      .eq("id", article.id);
                    if (!error) {
                      setArticles((prev) =>
                        prev.map((a) => (a.id === article.id ? { ...a, status: "published" } : a)),
                      );
                      showToast("記事を公開しました");
                    } else {
                      showToast("エラーが発生しました。もう一度お試しください。");
                    }
                  }}
                  className="flex-1 py-2 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600 flex items-center justify-center gap-1 shadow-sm"
                >
                  <Check className="w-4 h-4" /> 許可 (公開)
                </button>
                <button
                  onClick={async () => {
                    const { error } = await supabase
                      .from("articles")
                      .update({ status: "draft" })
                      .eq("id", article.id);
                    if (!error) {
                      setArticles((prev) =>
                        prev.map((a) => (a.id === article.id ? { ...a, status: "draft" } : a)),
                      );
                      showToast("差し戻しました");
                    } else {
                      showToast("エラーが発生しました。もう一度お試しください。");
                    }
                  }}
                  className="py-2 px-3 bg-white text-gray-600 border border-gray-300 text-sm font-bold rounded-lg hover:bg-gray-50"
                >
                  差し戻し
                </button>
              </div>
            </div>
          ))}
          {pendingArticles.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6 bg-white rounded-xl border">
              現在、承認待ちの記事はありません。
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
