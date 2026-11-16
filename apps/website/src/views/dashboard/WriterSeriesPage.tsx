import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../supabase";
import { ChevronLeft, Loader2 } from "lucide-react";
import { mapDbArticleToArticle } from "../../types";
import type { Article, Series } from "../../types";
import { ARTICLE_LIST_FIELDS, WRITER_ARTICLE_LIST_FIELDS } from "../../context/DataContext";
import { applySeriesOverrides, removeLocalSeriesOverride } from "../../utils/seriesOverrides";
import { updateMetaTags } from "../../utils/seo";
import { isArticleOptionalColumnSchemaError } from "../../utils/supabaseErrors";
import { profileHasRole } from "../../utils/roles";
import { CreateSeriesForm } from "./components/CreateSeriesForm";
import { SeriesCard } from "./components/SeriesCard";

export const WriterSeriesPage = () => {
  const {
    profile,
    userRole,
    authLoading,
    seriesList,
    setSeriesList,
    showToast,
    navigate,
    articles,
    setArticles,
  } = useApp();

  useEffect(() => {
    updateMetaTags({
      title: "連載の管理",
      noindex: true,
    });
  }, []);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCollaboratorIds, setNewCollaboratorIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [localSeries, setLocalSeries] = useState<Series[]>([]);
  const [localSeriesLoaded, setLocalSeriesLoaded] = useState(false);
  const [writerArticles, setWriterArticles] = useState<Article[]>([]);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCollaboratorIds, setEditCollaboratorIds] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [addingArticleBySeries, setAddingArticleBySeries] = useState<Record<string, string>>({});
  const [episodeInputs, setEpisodeInputs] = useState<Record<string, string>>({});

  const fetchMySeries = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const baseQuery = supabase.from("series").select("*");
      let query;
      if (typeof baseQuery.or === "function") {
        query = baseQuery.or(`writer_id.eq.${profile.id},collaborator_ids.cs.{"${profile.id}"}`);
      } else {
        query = baseQuery.eq("writer_id", profile.id);
      }
      let { data, error } = await query;
      if (error) {
        const fallbackRes = await supabase.from("series").select("*").eq("writer_id", profile.id);
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (!error && data) {
        const mapped = data.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description ?? null,
          writerId: s.writer_id,
          collaboratorIds: s.collaborator_ids ?? [],
        }));
        setLocalSeries(applySeriesOverrides(mapped));
      }
    } catch (e) {
      console.error("Failed to load writer series", e);
    } finally {
      setLocalSeriesLoaded(true);
    }

    // 自分の全記事（下書き・承認待ち・共同執筆含む）も安全に取得して連載記事一覧に反映
    try {
      const res = supabase.from("articles");
      if (res && typeof res.select === "function") {
        const artBase = res.select(WRITER_ARTICLE_LIST_FIELDS);
        let artQuery;
        if (typeof artBase.or === "function") {
          artQuery = artBase.or(`writer_id.eq.${profile.id},collaborator_ids.cs.{"${profile.id}"}`);
        } else {
          artQuery = artBase.eq("writer_id", profile.id);
        }
        const artPrimaryRes = await artQuery.order("created_at", { ascending: false });
        let data: Parameters<typeof mapDbArticleToArticle>[0][] | null = artPrimaryRes.data;
        let error = artPrimaryRes.error;
        // スキーマドリフト（collaborator_ids未存在の42703エラー等）発生時は安全な ARTICLE_LIST_FIELDS でフォールバック
        if (error) {
          const fallbackRes = await res
            .select(ARTICLE_LIST_FIELDS)
            .eq("writer_id", profile.id)
            .order("created_at", { ascending: false });
          data = fallbackRes.data;
          error = fallbackRes.error;
        }

        if (!error && Array.isArray(data)) {
          setWriterArticles(
            data.map((r) =>
              mapDbArticleToArticle(r as Parameters<typeof mapDbArticleToArticle>[0]),
            ),
          );
        }
      }
    } catch (e) {
      console.error("Failed to load writer articles for series", e);
    }
  }, [profile?.id]);

  useEffect(() => {
    void fetchMySeries();
  }, [fetchMySeries]);

  const mySeries = useMemo(() => {
    const base = localSeriesLoaded
      ? localSeries
      : seriesList.filter(
          (s) => s.writerId === profile?.id || s.collaboratorIds?.includes(profile?.id ?? ""),
        );
    return applySeriesOverrides(base);
  }, [localSeriesLoaded, localSeries, seriesList, profile?.id]);

  const mergedWriterArticles = useMemo(() => {
    if (!profile?.id) return [];
    const mySeriesIdSet = new Set(mySeries.map((s) => s.id));
    const map = new Map<string, Article>();
    for (const a of articles) {
      if (
        a.writerId === profile.id ||
        a.collaboratorIds?.includes(profile.id) ||
        (a.seriesId && mySeriesIdSet.has(a.seriesId))
      ) {
        map.set(a.id, a);
      }
    }
    for (const wa of writerArticles) {
      if (
        wa.writerId === profile.id ||
        wa.collaboratorIds?.includes(profile.id) ||
        (wa.seriesId && mySeriesIdSet.has(wa.seriesId))
      ) {
        const existing = map.get(wa.id);
        map.set(wa.id, existing ? { ...existing, ...wa } : wa);
      }
    }
    return Array.from(map.values());
  }, [articles, writerArticles, profile?.id, mySeries]);

  const handleCreate = async () => {
    if (!profile?.id) {
      showToast("ログイン情報が見つかりません");
      return;
    }
    if (!newTitle.trim()) {
      showToast("連載名を入力してください");
      return;
    }
    setSaving(true);
    const insertPayload: Record<string, unknown> = {
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      writer_id: profile?.id,
    };
    if (newCollaboratorIds.length > 0) {
      insertPayload.collaborator_ids = newCollaboratorIds;
    }
    let { data, error } = await supabase.from("series").insert(insertPayload).select().single();

    if (error && isArticleOptionalColumnSchemaError(error)) {
      const { collaborator_ids: _c, ...safePayload } = insertPayload;
      const retryRes = await supabase.from("series").insert(safePayload).select().single();
      data = retryRes.data;
      error = retryRes.error;
    }

    if (!error && data) {
      const createdItem: Series = {
        id: data.id,
        title: data.title,
        description: data.description ?? null,
        writerId: data.writer_id,
        collaboratorIds: data.collaborator_ids ?? newCollaboratorIds,
      };
      removeLocalSeriesOverride(createdItem.id);
      setLocalSeries((prev) => [...prev, createdItem]);
      setSeriesList((prev) => [...prev, createdItem]);
      setNewTitle("");
      setNewDesc("");
      setNewCollaboratorIds([]);
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
    setEditCollaboratorIds(s.collaboratorIds ?? []);
  };

  const handleCancelEdit = () => {
    setEditingSeriesId(null);
    setEditTitle("");
    setEditDesc("");
    setEditCollaboratorIds([]);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editTitle.trim()) {
      showToast("連載名を入力してください");
      return;
    }
    setUpdating(true);
    const nextTitle = editTitle.trim();
    const nextDesc = editDesc.trim() || null;
    const currentSeries = mySeries.find((s) => s.id === id);
    const isEditorUser =
      userRole === "editor" || profile?.role === "editor" || profileHasRole(profile, "editor");
    const canManageSeriesCollaborators =
      !currentSeries || currentSeries.writerId === profile?.id || isEditorUser;
    const updatePayload: Record<string, unknown> = {
      title: nextTitle,
      description: nextDesc,
    };
    if (
      canManageSeriesCollaborators &&
      (editCollaboratorIds.length > 0 ||
        (currentSeries?.collaboratorIds && currentSeries.collaboratorIds.length > 0))
    ) {
      updatePayload.collaborator_ids = editCollaboratorIds;
    }
    try {
      let { error } = await supabase.from("series").update(updatePayload).eq("id", id);

      if (error && isArticleOptionalColumnSchemaError(error)) {
        const { collaborator_ids: _c, ...safePayload } = updatePayload;
        const retryRes = await supabase.from("series").update(safePayload).eq("id", id);
        error = retryRes.error;
      }

      if (!error) {
        removeLocalSeriesOverride(id);
        setLocalSeries((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  title: nextTitle,
                  description: nextDesc,
                  collaboratorIds: editCollaboratorIds,
                }
              : s,
          ),
        );
        setSeriesList((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  title: nextTitle,
                  description: nextDesc,
                  collaboratorIds: editCollaboratorIds,
                }
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
    const target = mySeries.find((s) => s.id === id);
    const isOwner = target ? target.writerId === profile?.id : false;
    const isEditor =
      userRole === "editor" || profile?.role === "editor" || profileHasRole(profile, "editor");
    if (!isOwner && !isEditor) {
      showToast("連載の削除は作成者のみ可能です");
      return;
    }
    if (!window.confirm(`「${title}」を削除しますか？\n連載に紐づく記事の連載設定は解除されます。`))
      return;
    const { error } = await supabase.from("series").delete().eq("id", id);
    if (!error) {
      removeLocalSeriesOverride(id);
      setLocalSeries((prev) => prev.filter((s) => s.id !== id));
      setSeriesList((prev) => prev.filter((s) => s.id !== id));
      setArticles((prev) =>
        prev.map((a) => (a.seriesId === id ? { ...a, seriesId: null, episodeNumber: null } : a)),
      );
      setWriterArticles((prev) =>
        prev.map((a) => (a.seriesId === id ? { ...a, seriesId: null, episodeNumber: null } : a)),
      );
      showToast("連載を削除しました");
    } else {
      showToast("削除に失敗しました。もう一度お試しください。");
    }
  };

  const handleUpdateEpisodeNumber = async (articleId: string, nextEpRaw: string) => {
    const parsed = nextEpRaw.trim() === "" ? null : parseInt(nextEpRaw, 10);
    const nextEp = parsed !== null && !Number.isNaN(parsed) && parsed > 0 ? parsed : null;
    try {
      const { error } = await supabase
        .from("articles")
        .update({ episode_number: nextEp })
        .eq("id", articleId);
      if (!error) {
        setArticles((prev) =>
          prev.map((a) => (a.id === articleId ? { ...a, episodeNumber: nextEp } : a)),
        );
        setWriterArticles((prev) =>
          prev.map((a) => (a.id === articleId ? { ...a, episodeNumber: nextEp } : a)),
        );
        showToast("話数を更新しました");
      } else {
        showToast("話数の更新に失敗しました");
      }
    } catch {
      showToast("話数の更新に失敗しました");
    } finally {
      setEpisodeInputs((prev) => {
        if (!(articleId in prev)) return prev;
        const next = { ...prev };
        delete next[articleId];
        return next;
      });
    }
  };

  const handleRemoveArticleFromSeries = async (articleId: string) => {
    try {
      const { error } = await supabase
        .from("articles")
        .update({ series_id: null, episode_number: null })
        .eq("id", articleId);
      if (!error) {
        setArticles((prev) =>
          prev.map((a) => (a.id === articleId ? { ...a, seriesId: null, episodeNumber: null } : a)),
        );
        setWriterArticles((prev) =>
          prev.map((a) => (a.id === articleId ? { ...a, seriesId: null, episodeNumber: null } : a)),
        );
        showToast("連載から記事を外しました");
      } else {
        showToast("更新に失敗しました");
      }
    } catch {
      showToast("更新に失敗しました");
    }
  };

  const handleAddArticleToSeries = async (seriesId: string, maxEpisodeNumber: number) => {
    const targetArticleId = addingArticleBySeries[seriesId];
    if (!targetArticleId) return;
    const nextEp = maxEpisodeNumber + 1;
    try {
      const { error } = await supabase
        .from("articles")
        .update({ series_id: seriesId, episode_number: nextEp })
        .eq("id", targetArticleId);
      if (!error) {
        setArticles((prev) =>
          prev.map((a) =>
            a.id === targetArticleId ? { ...a, seriesId, episodeNumber: nextEp } : a,
          ),
        );
        setWriterArticles((prev) =>
          prev.map((a) =>
            a.id === targetArticleId ? { ...a, seriesId, episodeNumber: nextEp } : a,
          ),
        );
        setAddingArticleBySeries((prev) => ({ ...prev, [seriesId]: "" }));
        showToast("連載に記事を追加しました");
      } else {
        showToast("記事の追加に失敗しました");
      }
    } catch {
      showToast("記事の追加に失敗しました");
    }
  };

  if (authLoading || !profile?.id) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-8 animate-in fade-in duration-300">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:mx-0 -mt-4 md:mt-0 px-4 md:px-6 md:rounded-xl bg-white dark:bg-gray-800 border-b md:border border-gray-200 dark:border-gray-700 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-6">
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="戻る"
          className="p-2 bg-white dark:bg-gray-700 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">連載管理</h1>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start space-y-6 md:space-y-0">
        <CreateSeriesForm
          newTitle={newTitle}
          onChangeTitle={setNewTitle}
          newDesc={newDesc}
          onChangeDesc={setNewDesc}
          newCollaboratorIds={newCollaboratorIds}
          onChangeCollaboratorIds={setNewCollaboratorIds}
          excludeUserIds={profile?.id ? [profile.id] : []}
          saving={saving}
          onCreate={handleCreate}
        />
        <div className="space-y-3">
          <h2 className="font-bold text-gray-800 dark:text-gray-100">作成済みの連載</h2>
          {mySeries.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">
              連載はまだありません
            </p>
          ) : (
            mySeries.map((s) => {
              const seriesArticles = mergedWriterArticles
                .filter((a) => a.seriesId === s.id)
                .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
              const unassignedArticles = mergedWriterArticles.filter((a) => !a.seriesId);
              const isEditor =
                userRole === "editor" ||
                profile?.role === "editor" ||
                profileHasRole(profile, "editor");

              return (
                <SeriesCard
                  key={s.id}
                  series={s}
                  seriesArticles={seriesArticles}
                  unassignedArticles={unassignedArticles}
                  isEditing={editingSeriesId === s.id}
                  expanded={expandedSeriesId === s.id}
                  updating={updating}
                  currentUserId={profile?.id}
                  isEditor={isEditor}
                  editTitle={editTitle}
                  onChangeEditTitle={setEditTitle}
                  editDesc={editDesc}
                  onChangeEditDesc={setEditDesc}
                  editCollaboratorIds={editCollaboratorIds}
                  onChangeEditCollaboratorIds={setEditCollaboratorIds}
                  onStartEdit={handleStartEdit}
                  onCancelEdit={handleCancelEdit}
                  onSaveEdit={(id) => void handleSaveEdit(id)}
                  onDelete={handleDelete}
                  onToggleExpand={() =>
                    setExpandedSeriesId(expandedSeriesId === s.id ? null : s.id)
                  }
                  episodeInputs={episodeInputs}
                  onChangeEpisodeInput={(articleId, value) =>
                    setEpisodeInputs((prev) => ({ ...prev, [articleId]: value }))
                  }
                  onClearEpisodeInput={(articleId) =>
                    setEpisodeInputs((prev) => {
                      const next = { ...prev };
                      delete next[articleId];
                      return next;
                    })
                  }
                  onUpdateEpisodeNumber={(articleId, nextVal) =>
                    void handleUpdateEpisodeNumber(articleId, nextVal)
                  }
                  onRemoveArticleFromSeries={(articleId) =>
                    void handleRemoveArticleFromSeries(articleId)
                  }
                  addingArticleId={addingArticleBySeries[s.id] || ""}
                  onChangeAddingArticleId={(articleId) =>
                    setAddingArticleBySeries((prev) => ({ ...prev, [s.id]: articleId }))
                  }
                  onAddArticleToSeries={(seriesId, maxEp) =>
                    void handleAddArticleToSeries(seriesId, maxEp)
                  }
                  onNavigateEditArticle={(articleId) => navigate("writerEdit", articleId)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
