import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../supabase";
import { ChevronLeft } from "lucide-react";
import { ARTICLE_STATUS_CONFIG } from "../../types";
import type { ArticleStatus, Series } from "../../types";

export const WriterSeriesPage = () => {
  const { profile, seriesList, setSeriesList, showToast, navigate, articles, setArticles } =
    useApp();

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [localSeries, setLocalSeries] = useState<Series[]>([]);
  const [localSeriesLoaded, setLocalSeriesLoaded] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [updating, setUpdating] = useState(false);

  const fetchMySeries = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase.from("series").select("*").eq("writer_id", profile.id);

      if (!error && data) {
        setLocalSeries(
          data.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description ?? null,
            writerId: s.writer_id,
          })),
        );
      }
    } catch (e) {
      console.error("Failed to load writer series", e);
    } finally {
      setLocalSeriesLoaded(true);
    }
  }, [profile?.id]);

  useEffect(() => {
    void fetchMySeries();
  }, [fetchMySeries]);

  const mySeries = localSeriesLoaded
    ? localSeries
    : seriesList.filter((s) => s.writerId === profile?.id);

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      showToast("連載名を入力してください");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("series")
      .insert({
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        writer_id: profile?.id,
      })
      .select()
      .single();
    if (!error && data) {
      const createdItem: Series = {
        id: data.id,
        title: data.title,
        description: data.description ?? null,
        writerId: data.writer_id,
      };
      setLocalSeries((prev) => [...prev, createdItem]);
      setSeriesList((prev) => [...prev, createdItem]);
      setNewTitle("");
      setNewDesc("");
      showToast("連載を作成しました");
    } else {
      console.error("連載作成エラー:", error);
      showToast("エラーが発生しました。もう一度お試しください。");
    }
    setSaving(false);
  };

  const handleStartEdit = (s: Series) => {
    setEditingSeriesId(s.id);
    setEditTitle(s.title);
    setEditDesc(s.description ?? "");
  };

  const handleCancelEdit = () => {
    setEditingSeriesId(null);
    setEditTitle("");
    setEditDesc("");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editTitle.trim()) {
      showToast("連載名を入力してください");
      return;
    }
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("series")
        .update({
          title: editTitle.trim(),
          description: editDesc.trim() || null,
        })
        .eq("id", id);

      if (!error) {
        setLocalSeries((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, title: editTitle.trim(), description: editDesc.trim() || null }
              : s,
          ),
        );
        setSeriesList((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, title: editTitle.trim(), description: editDesc.trim() || null }
              : s,
          ),
        );
        showToast("連載を更新しました");
        handleCancelEdit();
      } else {
        console.error("連載更新エラー:", error);
        showToast("エラーが発生しました。もう一度お試しください。");
      }
    } catch (e) {
      console.error("連載更新例外:", e);
      showToast("エラーが発生しました。もう一度お試しください。");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`「${title}」を削除しますか？\n連載に紐づく記事の連載設定は解除されます。`))
      return;
    const { error } = await supabase.from("series").delete().eq("id", id);
    if (!error) {
      setLocalSeries((prev) => prev.filter((s) => s.id !== id));
      setSeriesList((prev) => prev.filter((s) => s.id !== id));
      setArticles((prev) =>
        prev.map((a) => (a.seriesId === id ? { ...a, seriesId: null, episodeNumber: null } : a)),
      );
      showToast("連載を削除しました");
    } else {
      showToast("削除に失敗しました。もう一度お試しください。");
    }
  };

  return (
    <div className="p-4 md:p-8 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 px-4 md:px-8 bg-white border-b border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-6">
        <button
          onClick={() => window.history.back()}
          className="p-2 bg-white rounded-full shadow-sm"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">連載管理</h1>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start space-y-6 md:space-y-0">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-bold text-gray-800">新しい連載を作成</h2>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="連載名 *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            placeholder="連載の説明（任意）"
            rows={3}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-blue-500 text-white font-bold py-3 rounded-xl hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? "作成中..." : "連載を作成"}
          </button>
        </div>
        <div className="space-y-3">
          <h2 className="font-bold text-gray-800">作成済みの連載</h2>
          {mySeries.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">連載はまだありません</p>
          ) : (
            mySeries.map((s) => {
              const seriesArticles = articles
                .filter((a) => a.seriesId === s.id)
                .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
              const expanded = expandedSeriesId === s.id;
              const isEditing = editingSeriesId === s.id;

              if (isEditing) {
                return (
                  <div
                    key={s.id}
                    className="bg-white rounded-2xl shadow-sm border border-blue-300 p-4 space-y-3"
                  >
                    <h3 className="font-bold text-sm text-blue-600">連載を編集</h3>
                    <input
                      data-testid="edit-series-title"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-bold"
                      placeholder="連載名を編集 *"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                    <textarea
                      data-testid="edit-series-desc"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none text-gray-700"
                      placeholder="連載の説明（任意）"
                      rows={2}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={handleCancelEdit}
                        disabled={updating}
                        className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => void handleSaveEdit(s.id)}
                        disabled={updating}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {updating ? "保存中..." : "変更を保存"}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={s.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <div className="p-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900">{s.title}</p>
                      {s.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>
                      )}
                      <button
                        onClick={() => setExpandedSeriesId(expanded ? null : s.id)}
                        className="text-xs text-blue-500 hover:text-blue-700 mt-1 flex items-center gap-1"
                      >
                        {seriesArticles.length}件の記事
                        <span>{expanded ? "▲" : "▼"}</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleStartEdit(s)}
                        className="text-blue-500 hover:text-blue-700 text-sm font-bold"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(s.id, s.title)}
                        className="text-red-400 hover:text-red-600 text-sm font-bold"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                      {seriesArticles.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">
                          この連載にはまだ記事がありません
                        </p>
                      ) : (
                        seriesArticles.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-gray-100"
                          >
                            <span className="text-xs text-gray-400 w-8 shrink-0">
                              {a.episodeNumber != null ? `#${a.episodeNumber}` : "—"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">
                                {a.title}
                              </p>
                              <p className="text-xs text-gray-400">
                                {ARTICLE_STATUS_CONFIG[a.status as ArticleStatus]?.label ??
                                  a.status}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                navigate("writerEdit", a.id);
                              }}
                              className="text-xs text-blue-500 hover:text-blue-700 shrink-0"
                            >
                              編集
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
