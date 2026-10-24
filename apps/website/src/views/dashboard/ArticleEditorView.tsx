import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
  Edit3,
  Save,
  Check,
  SlidersHorizontal,
  Image as ImageIcon,
  Tag,
  Clock,
  Send,
} from "lucide-react";
import RichTextEditor from "../../components/RichTextEditor";
import { supabase } from "../../supabase";
import { sanitizeHtml } from "../../utils/sanitize";
import { useApp } from "../../context/AppContext";
import { LogoIcon } from "../../components/icons/NavIcons";
import { getThumbnailColor, THUMBNAIL_COLORS, mapDbArticleToArticle } from "../../types";
import type { Article, ArticleStatus } from "../../types";
import {
  formatScheduledDateTime,
  getLocalScheduledAt,
  isArticleScheduledFuture,
  setLocalScheduledAt,
  toDatetimeLocalValue,
  toSafeIsoString,
} from "../../utils/scheduledArticles";
import { profileHasRole } from "../../utils/roles";
import { updateMetaTags } from "../../utils/seo";
import { isArticleOptionalColumnSchemaError } from "../../utils/supabaseErrors";

export const ArticleEditorTabs = ({
  settingsPanel,
  editorPanel,
}: {
  settingsPanel: React.ReactNode;
  editorPanel: React.ReactNode;
}) => {
  return (
    <div className="space-y-6">
      {settingsPanel}
      {editorPanel}
    </div>
  );
};

export interface ArticleEditorPageProps {
  editingId: string | null;
}

function buildBaseArticlePayload(params: {
  title: string;
  content: string;
  summary: string;
  tags: string[];
  thumbnailColor: string;
  thumbnailUrl: string | null;
  seriesId: string;
  episodeNumber: string;
  commentsEnabled: boolean;
}): Record<string, unknown> {
  return {
    title: params.title,
    content: params.content,
    summary: params.summary || null,
    tags: params.tags,
    thumbnail_color: params.thumbnailColor,
    thumbnail_url: params.thumbnailUrl,
    series_id: params.seriesId || null,
    episode_number: params.episodeNumber ? parseInt(params.episodeNumber, 10) : null,
    comments_enabled: params.commentsEnabled,
  };
}

async function updateArticleWithFallback(targetId: string, payload: Record<string, unknown>) {
  let { error } = await supabase.from("articles").update(payload).eq("id", targetId);
  if (error && isArticleOptionalColumnSchemaError(error)) {
    const { comments_enabled: _c, scheduled_at: _s, ...safePayload } = payload;
    if (safePayload.status === "scheduled") {
      safePayload.status = "published";
    }
    const retryRes = await supabase.from("articles").update(safePayload).eq("id", targetId);
    error = retryRes.error;
  }
  return { error };
}

async function insertArticleWithFallback(payload: Record<string, unknown>) {
  let { data, error } = await supabase.from("articles").insert(payload).select().single();
  if (error && isArticleOptionalColumnSchemaError(error)) {
    const { comments_enabled: _c, scheduled_at: _s, ...safePayload } = payload;
    if (safePayload.status === "scheduled") {
      safePayload.status = "published";
    }
    const retryRes = await supabase.from("articles").insert(safePayload).select().single();
    data = retryRes.data;
    error = retryRes.error;
  }
  return { data, error };
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const ArticleEditorPage = ({ editingId }: ArticleEditorPageProps) => {
  const {
    articles,
    setArticles,
    seriesList,
    profile,
    userRole,
    showToast,
    navigate,
    getFontSizeClass,
  } = useApp();
  const currentUserId = profile?.id ?? null;
  const editingArticle = editingId ? (articles.find((a) => a.id === editingId) ?? null) : null;
  const [loadedArticle, setLoadedArticle] = useState<typeof editingArticle>(null);
  const effectiveEditingArticle = editingArticle || loadedArticle;

  useEffect(() => {
    updateMetaTags({
      title: editingId ? "記事の編集" : "新規記事作成",
      noindex: true,
    });
  }, [editingId]);

  const [formTitle, setFormTitle] = useState(editingArticle?.title ?? "");
  const [formContent, setFormContent] = useState(editingArticle?.content ?? "");
  const [formColor, setFormColor] = useState(editingArticle?.thumbnailColor ?? "blue");
  const [tags, setTags] = useState<string[]>(editingArticle?.tags ?? []);
  const [formSeriesId, setFormSeriesId] = useState(editingArticle?.seriesId ?? "");
  const [formEpisodeNumber, setFormEpisodeNumber] = useState(
    editingArticle?.episodeNumber?.toString() ?? "",
  );
  const [formSummary, setFormSummary] = useState(editingArticle?.summary ?? "");
  const [formCommentsEnabled, setFormCommentsEnabled] = useState<boolean>(
    editingArticle?.commentsEnabled !== false,
  );
  const [formScheduledAt, setFormScheduledAt] = useState<string>(
    toDatetimeLocalValue(
      editingArticle?.scheduledAt ?? (editingId ? getLocalScheduledAt(editingId) : null),
    ),
  );
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    editingArticle?.thumbnailUrl ?? null,
  );
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [editorLoading, setEditorLoading] = useState(
    Boolean(editingId && !editingArticle?.content),
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId) {
      setEditorLoading(false);
      return;
    }

    let isMounted = true;
    const fetchArticleForEdit = async () => {
      try {
        const { data, error } = await supabase
          .from("articles")
          .select("*")
          .eq("id", editingId)
          .maybeSingle();

        if (isMounted && data && !error) {
          const mapped = mapDbArticleToArticle(data);
          setLoadedArticle(mapped);
          setFormTitle(mapped.title ?? "");
          setFormContent(mapped.content ?? "");
          setFormColor(mapped.thumbnailColor ?? "blue");
          setTags(mapped.tags ?? []);
          setFormSeriesId(mapped.seriesId ?? "");
          setFormEpisodeNumber(mapped.episodeNumber?.toString() ?? "");
          setThumbnailUrl(mapped.thumbnailUrl ?? null);
          setFormSummary(mapped.summary ?? "");
          setFormCommentsEnabled(mapped.commentsEnabled !== false);
          setFormScheduledAt(
            toDatetimeLocalValue(mapped.scheduledAt ?? getLocalScheduledAt(mapped.id)),
          );
          setIsDirty(false);
        }
      } catch (e) {
        console.error("Failed to load article for editing", e);
      } finally {
        if (isMounted) setEditorLoading(false);
      }
    };

    void fetchArticleForEdit();
    return () => {
      isMounted = false;
    };
  }, [editingId]);

  useEffect(() => {
    if (!editingId) {
      setLoadedArticle(null);
      setFormTitle("");
      setFormContent("");
      setFormColor("blue");
      setTags([]);
      setFormSeriesId("");
      setFormEpisodeNumber("");
      setThumbnailUrl(null);
      setFormSummary("");
      setFormCommentsEnabled(true);
      setFormScheduledAt("");
      setTagInput("");
      setSaving(false);
      setShowPreview(false);
      setThumbnailUploading(false);
      setLastSavedAt(null);
    }
  }, [editingId]);

  const uploadImageToStorage = async (file: File, prefix = "thumb"): Promise<string | null> => {
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext) {
      showToast("JPEG、PNG、WebP、GIF形式の画像を選択してください");
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("10MB以下の画像を選択してください");
      return null;
    }
    const fileName = `${currentUserId}/${prefix}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("thumbnails")
      .upload(fileName, file, { upsert: true });
    if (error) {
      showToast("画像のアップロードに失敗しました");
      return null;
    }
    const { data } = supabase.storage.from("thumbnails").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailUploading(true);
    const url = await uploadImageToStorage(file, "thumb");
    if (url) {
      setThumbnailUrl(url);
      setIsDirty(true);
      showToast("サムネイル画像をアップロードしました");
    }
    setThumbnailUploading(false);
  };

  const handleInlineImageUpload = async (file: File): Promise<string | null> => {
    const url = await uploadImageToStorage(file, "inline");
    if (url) {
      showToast("本文に画像を挿入しました");
    }
    return url;
  };

  const addTag = (val: string) => {
    const newTags = val
      .split(",")
      .map((t) => t.replace(/^#/, "").trim())
      .filter((t) => t && !tags.includes(t));
    if (newTags.length) {
      setTags([...tags, ...newTags]);
      setIsDirty(true);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
    setIsDirty(true);
  };

  const handleSave = async (submitForReview = false) => {
    if (!formTitle.trim()) {
      showToast("タイトルを入力してください");
      return;
    }
    setSaving(true);
    const targetId = editingId || effectiveEditingArticle?.id || autoSaveIdRef.current;
    const scheduledIso = toSafeIsoString(formScheduledAt);
    if (formScheduledAt.trim() && !scheduledIso) {
      showToast("有効な公開予約日時を入力してください");
      setSaving(false);
      return;
    }
    const isFutureSchedule = isArticleScheduledFuture(scheduledIso);

    const isEditor = userRole === "editor" || profileHasRole(profile, "editor");
    const currentValues = {
      title: formTitle,
      content: formContent,
      summary: formSummary,
      tags,
      thumbnailColor: formColor,
      thumbnailUrl,
      seriesId: formSeriesId,
      episodeNumber: formEpisodeNumber,
      commentsEnabled: formCommentsEnabled,
    };

    if (targetId) {
      const nextStatus: ArticleStatus | undefined = submitForReview
        ? isEditor && isFutureSchedule
          ? "scheduled"
          : "pending"
        : undefined;

      const updatePayload = buildBaseArticlePayload(currentValues);
      if (nextStatus) {
        updatePayload.status = nextStatus;
      }
      if (scheduledIso || effectiveEditingArticle?.scheduledAt) {
        updatePayload.scheduled_at = scheduledIso;
      }

      const { error } = await updateArticleWithFallback(targetId, updatePayload);

      if (!error) {
        setLocalScheduledAt(targetId, scheduledIso);
        const currentStatus = effectiveEditingArticle?.status ?? "draft";
        const resolvedStatus: ArticleStatus =
          nextStatus ??
          (isFutureSchedule && currentStatus === "published" ? "scheduled" : currentStatus);

        const updatedArticleItem: Article = {
          id: targetId,
          title: formTitle,
          thumbnail: effectiveEditingArticle?.thumbnail ?? "",
          content: formContent,
          summary: formSummary || undefined,
          tags,
          thumbnailColor: formColor,
          thumbnailUrl: thumbnailUrl,
          seriesId: formSeriesId || null,
          episodeNumber: formEpisodeNumber ? parseInt(formEpisodeNumber, 10) : null,
          commentsEnabled: formCommentsEnabled,
          scheduledAt: scheduledIso,
          status: resolvedStatus,
          writerId: effectiveEditingArticle?.writerId ?? currentUserId ?? "",
          views: effectiveEditingArticle?.views ?? 0,
          likes: effectiveEditingArticle?.likes ?? 0,
          isRecommended: effectiveEditingArticle?.isRecommended ?? false,
          isPopular: effectiveEditingArticle?.isPopular ?? false,
          createdAt: effectiveEditingArticle?.createdAt,
        };

        setLoadedArticle((prev) =>
          prev ? { ...prev, ...updatedArticleItem } : updatedArticleItem,
        );

        setArticles((prev) => {
          const exists = prev.some((a) => a.id === targetId);
          if (exists) {
            return prev.map((a) => (a.id === targetId ? { ...a, ...updatedArticleItem } : a));
          }
          if (resolvedStatus === "published") {
            return [updatedArticleItem, ...prev];
          }
          return prev;
        });
        setIsDirty(false);
        setLastSavedAt(
          new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        );
        if (submitForReview) {
          showToast(
            scheduledIso
              ? `公開予約（${formatScheduledDateTime(scheduledIso)}）で申請しました`
              : "投稿申請しました",
          );
          navigate("writerDash");
        } else {
          showToast(effectiveEditingArticle ? "記事を更新しました" : "下書きを保存しました");
          if (effectiveEditingArticle) {
            navigate("writerDash");
          }
        }
      } else {
        console.error("記事更新エラー:", error);
        showToast("エラーが発生しました。もう一度お試しください。");
      }
    } else {
      const initialStatus: ArticleStatus = submitForReview
        ? isEditor && isFutureSchedule
          ? "scheduled"
          : "pending"
        : "draft";

      const insertPayload = buildBaseArticlePayload(currentValues);
      insertPayload.writer_id = currentUserId;
      insertPayload.status = initialStatus;
      insertPayload.views = 0;
      insertPayload.likes = 0;
      insertPayload.is_recommended = false;
      insertPayload.is_popular = false;
      if (scheduledIso) {
        insertPayload.scheduled_at = scheduledIso;
      }

      const { data, error } = await insertArticleWithFallback(insertPayload);
      if (!error && data) {
        autoSaveIdRef.current = data.id;
        setLocalScheduledAt(data.id, scheduledIso);
        setArticles((prev) => [
          {
            id: data.id,
            title: data.title,
            thumbnail: "",
            thumbnailColor: formColor,
            thumbnailUrl: thumbnailUrl,
            writerId: data.writer_id,
            views: 0,
            likes: 0,
            tags,
            isRecommended: false,
            isPopular: false,
            status: initialStatus,
            content: formContent,
            summary: formSummary || undefined,
            seriesId: formSeriesId || null,
            episodeNumber: formEpisodeNumber ? parseInt(formEpisodeNumber, 10) : null,
            commentsEnabled: formCommentsEnabled,
            scheduledAt: scheduledIso,
          },
          ...prev,
        ]);
        setIsDirty(false);
        setLastSavedAt(
          new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        );
        if (submitForReview) {
          showToast(
            scheduledIso
              ? `公開予約（${formatScheduledDateTime(scheduledIso)}）で申請しました`
              : "投稿申請しました",
          );
          navigate("writerDash");
        } else {
          showToast("下書きを保存しました");
        }
      } else {
        console.error("下書き保存エラー:", error);
        showToast("エラーが発生しました。もう一度お試しください。");
      }
    }
    setSaving(false);
  };

  const [isDirty, setIsDirty] = useState(false);
  const autoSaveIdRef = useRef<string | null>(editingId);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    const handlePopState = () => {
      if (isDirty) {
        window.history.go(1);
        setTimeout(() => {
          if (window.confirm("保存されていない変更があります。ページを離れますか？")) {
            setIsDirty(false);
            window.history.go(-1);
          }
        }, 0);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty || !formTitle.trim()) return;
    const timer = setTimeout(async () => {
      const currentValues = {
        title: formTitle,
        content: formContent,
        summary: formSummary,
        tags,
        thumbnailColor: formColor,
        thumbnailUrl,
        seriesId: formSeriesId,
        episodeNumber: formEpisodeNumber,
        commentsEnabled: formCommentsEnabled,
      };

      if (autoSaveIdRef.current) {
        const updatePayload = buildBaseArticlePayload(currentValues);
        await updateArticleWithFallback(autoSaveIdRef.current, updatePayload);
      } else {
        const insertPayload = buildBaseArticlePayload(currentValues);
        insertPayload.writer_id = currentUserId;
        insertPayload.status = "draft";
        insertPayload.views = 0;
        insertPayload.likes = 0;
        insertPayload.is_recommended = false;
        insertPayload.is_popular = false;

        const { data } = await insertArticleWithFallback(insertPayload);
        if (data) {
          autoSaveIdRef.current = data.id;
          setArticles((prev) => [
            {
              id: data.id,
              title: formTitle,
              thumbnail: "",
              thumbnailColor: formColor,
              thumbnailUrl,
              writerId: currentUserId ?? "",
              views: 0,
              likes: 0,
              tags,
              isRecommended: false,
              isPopular: false,
              status: "draft",
              content: formContent,
              summary: formSummary || undefined,
              seriesId: formSeriesId || null,
              episodeNumber: formEpisodeNumber ? parseInt(formEpisodeNumber, 10) : null,
              commentsEnabled: formCommentsEnabled,
            },
            ...prev,
          ]);
        }
      }
      setIsDirty(false);
      setLastSavedAt(
        new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      );
      showToast("自動保存しました");
    }, 5000);
    return () => clearTimeout(timer);
  }, [
    formTitle,
    formContent,
    formSummary,
    tags,
    formColor,
    thumbnailUrl,
    formSeriesId,
    formEpisodeNumber,
    formCommentsEnabled,
    isDirty,
  ]);

  if (editorLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">記事データを読み込んでいます...</p>
      </div>
    );
  }

  const selectedSeries = seriesList.find((s) => s.id === formSeriesId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* エディタ上部アクションバー */}
      <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 sticky top-[52px] z-30 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (
                isDirty &&
                !window.confirm("保存されていない変更があります。ページを離れますか？")
              )
                return;
              setIsDirty(false);
              window.history.back();
            }}
            className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors shrink-0"
            aria-label="戻る"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-bold text-gray-800 dark:text-gray-100 truncate">
              {effectiveEditingArticle ? "記事を編集" : "新規記事作成"}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              {saving ? (
                <span className="text-blue-600 dark:text-blue-400 font-medium">保存中...</span>
              ) : isDirty ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  ● 未保存の変更あり
                </span>
              ) : lastSavedAt ? (
                <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> {lastSavedAt} に保存済み
                </span>
              ) : (
                <span className="hidden sm:inline">タイトル入力で5秒ごとに自動保存</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
              showPreview
                ? "bg-gray-800 dark:bg-gray-700 text-white border-gray-800 dark:border-gray-600"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            {showPreview ? (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                <span>編集に戻る</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>プレビュー</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleSave(false)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue-600 text-white text-xs md:text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>
              {saving ? "保存中..." : effectiveEditingArticle ? "更新する" : "下書き保存"}
            </span>
          </button>
          {(!effectiveEditingArticle || effectiveEditingArticle.status === "draft") && (
            <button
              type="button"
              data-testid="editor-submit-btn"
              onClick={() => void handleSave(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-purple-600 text-white text-xs md:text-sm font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 shadow-xs transition-colors"
            >
              {formScheduledAt ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              <span>{formScheduledAt ? "予約投稿申請" : "投稿申請"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {showPreview ? (
          /* プレビュー画面（実際の記事詳細ページと同じデザイン） */
          <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 animate-in fade-in duration-200">
            {thumbnailUrl ? (
              <div className="w-full bg-gray-50 dark:bg-gray-900" style={{ aspectRatio: "16/9" }}>
                <img
                  src={thumbnailUrl}
                  alt={formTitle || "thumbnail"}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div
                className={`w-full flex items-center justify-center ${getThumbnailColor(formColor).bg}`}
                style={{ aspectRatio: "16/9", maxHeight: "280px" }}
              >
                <LogoIcon className="w-20 h-20 opacity-20" />
              </div>
            )}

            <div className="p-6 md:p-8 space-y-5">
              {selectedSeries && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-2 py-1 rounded-full">
                    連載
                  </span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {selectedSeries.title}
                  </span>
                  {formEpisodeNumber && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      第{formEpisodeNumber}話
                    </span>
                  )}
                </div>
              )}

              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {formTitle || (
                  <span className="text-gray-400 dark:text-gray-500">（タイトル未入力）</span>
                )}
              </h2>

              {formSummary && (
                <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-xl text-gray-700 dark:text-gray-300 border border-blue-100 dark:border-blue-800/50 font-medium text-sm leading-relaxed">
                  {formSummary}
                </div>
              )}

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-full border border-gray-200 dark:border-gray-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                {formContent && formContent !== "<p></p>" ? (
                  <div
                    className={`text-gray-800 dark:text-gray-200 leading-loose article-content ${getFontSizeClass()}`}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(formContent) }}
                  />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
                    （本文がまだ入力されていません）
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <ArticleEditorTabs
            settingsPanel={
              <div className="space-y-4">
                {/* タイトル＆要約カード */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 md:p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">
                      記事タイトル <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 rounded-xl px-4 py-3 text-lg md:text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"
                      placeholder="読者の目を引くタイトルを入力..."
                      value={formTitle}
                      onChange={(e) => {
                        setFormTitle(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">
                      リード文・要約{" "}
                      <span className="text-gray-400 dark:text-gray-500 font-normal">
                        （記事冒頭やSNSシェア時の説明文に表示されます）
                      </span>
                    </label>
                    <textarea
                      className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      rows={2}
                      placeholder="この記事のポイントや概要を1〜2文で入力（省略可）"
                      value={formSummary}
                      onChange={(e) => {
                        setFormSummary(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                </div>

                {/* 折りたたみ可能な詳細設定パネル（サムネイル・タグ・連載） */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSettingsExpanded((v) => !v)}
                    className="w-full px-5 py-3.5 bg-gray-50/70 dark:bg-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-gray-750 flex items-center justify-between transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                        サムネイル・タグ・連載設定
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-normal hidden sm:inline">
                        {tags.length > 0 ? `（タグ ${tags.length}件）` : ""}
                      </span>
                    </div>
                    {settingsExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    )}
                  </button>

                  {settingsExpanded && (
                    <div className="p-5 md:p-6 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 左カラム: サムネイル設定 */}
                      <div className="space-y-4">
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                            <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>サムネイル画像（推奨 16:9）</span>
                          </label>
                          {thumbnailUrl ? (
                            <div
                              className="mb-2.5 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                              style={{ aspectRatio: "16/9", maxHeight: "180px" }}
                            >
                              <img
                                src={thumbnailUrl}
                                alt="thumbnail"
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ) : (
                            <div
                              className={`mb-2.5 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center ${getThumbnailColor(formColor).bg}`}
                              style={{ aspectRatio: "16/9", maxHeight: "140px" }}
                            >
                              <LogoIcon className="w-12 h-12 opacity-30" />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <label className="px-3.5 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer border border-gray-200 dark:border-gray-600 transition-colors">
                              {thumbnailUploading
                                ? "アップロード中..."
                                : thumbnailUrl
                                  ? "画像を変更"
                                  : "画像をアップロード"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                                onChange={(e) => void handleThumbnailUpload(e)}
                                disabled={thumbnailUploading}
                              />
                            </label>
                            {thumbnailUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  setThumbnailUrl(null);
                                  setIsDirty(true);
                                }}
                                className="px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
                              >
                                削除
                              </button>
                            )}
                          </div>
                        </div>

                        {!thumbnailUrl && (
                          <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                              背景カラー（画像未設定時）:{" "}
                              <span className="text-gray-500 dark:text-gray-400 font-normal">
                                {getThumbnailColor(formColor).label}
                              </span>
                            </label>
                            <div className="flex gap-2 flex-wrap">
                              {THUMBNAIL_COLORS.map((color) => (
                                <button
                                  type="button"
                                  key={color.id}
                                  onClick={() => {
                                    setFormColor(color.id);
                                    setIsDirty(true);
                                  }}
                                  className={`w-8 h-8 rounded-full ${color.bg} border-2 transition-all ${
                                    formColor === color.id
                                      ? "border-gray-800 dark:border-white scale-110 shadow-xs"
                                      : "border-gray-200 dark:border-gray-700 hover:scale-105"
                                  }`}
                                  title={color.label}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 右カラム: タグ＆連載設定 */}
                      <div className="space-y-4">
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                            <Tag className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>タグ</span>
                          </label>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2.5">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full"
                                >
                                  #{tag}
                                  <button
                                    type="button"
                                    onClick={() => removeTag(tag)}
                                    className="hover:text-red-500 font-bold leading-none ml-0.5"
                                  >
                                    &times;
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input
                              className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                              placeholder="タグを入力（Enterまたはカンマで追加）"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  addTag(tagInput);
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => addTag(tagInput)}
                              className="px-3.5 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 shrink-0 transition-colors"
                            >
                              追加
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className={formSeriesId ? "sm:col-span-2" : "sm:col-span-3"}>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">
                              連載シリーズ
                            </label>
                            <select
                              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                              value={formSeriesId}
                              onChange={(e) => {
                                setFormSeriesId(e.target.value);
                                setIsDirty(true);
                              }}
                            >
                              <option value="">連載なし（単発記事）</option>
                              {seriesList
                                .filter((s) => s.writerId === currentUserId)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.title}
                                  </option>
                                ))}
                            </select>
                          </div>
                          {formSeriesId && (
                            <div>
                              <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">
                                話数
                              </label>
                              <input
                                type="number"
                                min={1}
                                className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                placeholder="例: 1"
                                value={formEpisodeNumber}
                                onChange={(e) => {
                                  setFormEpisodeNumber(e.target.value);
                                  setIsDirty(true);
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {/* コメント機能のオン/オフ設定 */}
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                          <label className="flex items-center justify-between cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                            <div>
                              <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                                コメント機能
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {formCommentsEnabled
                                  ? "オン（読者からのコメントを受け付け・表示します）"
                                  : "オフ（ライターと編集長以外にコメント欄を非表示にします）"}
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={formCommentsEnabled}
                              onChange={(e) => {
                                setFormCommentsEnabled(e.target.checked);
                                setIsDirty(true);
                              }}
                              className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                            />
                          </label>
                        </div>

                        {/* 予約投稿日時設定 (#54-3) */}
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                          <div className="bg-purple-50/60 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-200 dark:border-purple-800/50 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="schedule-datetime-input"
                                className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5"
                              >
                                <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                <span>公開予約日時（任意）</span>
                              </label>
                              {formScheduledAt && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormScheduledAt("");
                                    setIsDirty(true);
                                  }}
                                  className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline font-bold"
                                >
                                  予約を解除
                                </button>
                              )}
                            </div>
                            <input
                              id="schedule-datetime-input"
                              type="datetime-local"
                              data-testid="schedule-datetime-input"
                              value={formScheduledAt}
                              onChange={(e) => {
                                setFormScheduledAt(e.target.value);
                                setIsDirty(true);
                              }}
                              className="w-full border border-purple-200 dark:border-purple-800/60 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                            <p className="text-[11px] text-purple-700 dark:text-purple-300 leading-relaxed">
                              日時を指定すると、指定日時に達するまで一般読者には非表示となり、予定時刻に自動公開されます。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            }
            editorPanel={
              <div>
                <RichTextEditor
                  content={formContent}
                  onChange={(html) => {
                    setFormContent(html);
                    setIsDirty(true);
                  }}
                  placeholder="ここから記事の本文を書き始めましょう..."
                  onUploadImage={handleInlineImageUpload}
                />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
};
