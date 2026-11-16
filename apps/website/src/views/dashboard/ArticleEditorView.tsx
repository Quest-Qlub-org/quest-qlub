import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Eye, Edit3, Save, Check, Clock, Send } from "lucide-react";
import RichTextEditor from "../../components/RichTextEditor";
import { supabase } from "../../supabase";
import { useApp } from "../../context/AppContext";
import { mapDbArticleToArticle } from "../../types";
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
import {
  buildBaseArticlePayload,
  insertArticleWithFallback,
  updateArticleWithFallback,
  uploadArticleImageToStorage,
} from "./utils/articleEditorApi";
import { ArticleEditorPreview } from "./components/ArticleEditorPreview";
import { ArticleEditorSettingsPanel } from "./components/ArticleEditorSettingsPanel";

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
  const routerNavigate = useNavigate();
  const currentUserId = profile?.id ?? null;
  const isEditor = userRole === "editor" || profileHasRole(profile, "editor");
  const editingArticle = editingId ? (articles.find((a) => a.id === editingId) ?? null) : null;
  const [loadedArticle, setLoadedArticle] = useState<typeof editingArticle>(null);
  const effectiveEditingArticle = editingArticle || loadedArticle;
  const canManageCollaborators = Boolean(
    currentUserId &&
    (!effectiveEditingArticle || isEditor || effectiveEditingArticle.writerId === currentUserId),
  );

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
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>(
    editingArticle?.collaboratorIds ?? [],
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
  const [notFound, setNotFound] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const editVersionRef = useRef(0);
  const autoSaveIdRef = useRef<string | null>(editingId);
  const skipNextFetchForIdRef = useRef<string | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const hasPushedGuardRef = useRef(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const markDirty = () => {
    editVersionRef.current += 1;
    setIsDirty(true);
  };

  useEffect(() => {
    if (!editingId) {
      autoSaveIdRef.current = null;
      skipNextFetchForIdRef.current = null;
      setNotFound(false);
      setIsDirty(false);
      setEditorLoading(false);
      setLoadedArticle(null);
      setFormTitle("");
      setFormContent("");
      setFormColor("blue");
      setTags([]);
      setFormSeriesId("");
      setFormEpisodeNumber("");
      setThumbnailUrl(null);
      setFormSummary("");
      setCollaboratorIds([]);
      setFormCommentsEnabled(true);
      setFormScheduledAt("");
      setTagInput("");
      setSaving(false);
      setShowPreview(false);
      setThumbnailUploading(false);
      setLastSavedAt(null);
      return;
    }

    if (skipNextFetchForIdRef.current === editingId) {
      skipNextFetchForIdRef.current = null;
      setNotFound(false);
      setEditorLoading(false);
      return;
    }

    autoSaveIdRef.current = editingId;
    setNotFound(false);
    setIsDirty(false);
    setEditorLoading(!editingArticle?.content);

    let isMounted = true;
    const fetchArticleForEdit = async () => {
      try {
        const { data, error } = await supabase
          .from("articles")
          .select("*")
          .eq("id", editingId)
          .maybeSingle();

        if (!isMounted) return;

        if (error || !data) {
          if (!editingArticle) {
            setNotFound(true);
          }
          return;
        }

        const mapped = mapDbArticleToArticle(data);
        const hasEditAccess =
          isEditor ||
          !currentUserId ||
          mapped.writerId === currentUserId ||
          (mapped.collaboratorIds ?? []).includes(currentUserId);
        if (!hasEditAccess) {
          showToast("この記事を編集する権限がありません");
          navigate("writerDash");
          return;
        }
        setLoadedArticle(mapped);
        setFormTitle(mapped.title ?? "");
        setFormContent(mapped.content ?? "");
        setFormColor(mapped.thumbnailColor ?? "blue");
        setTags(mapped.tags ?? []);
        setFormSeriesId(mapped.seriesId ?? "");
        setFormEpisodeNumber(mapped.episodeNumber?.toString() ?? "");
        setThumbnailUrl(mapped.thumbnailUrl ?? null);
        setFormSummary(mapped.summary ?? "");
        setCollaboratorIds(mapped.collaboratorIds ?? []);
        setFormCommentsEnabled(mapped.commentsEnabled !== false);
        setFormScheduledAt(
          toDatetimeLocalValue(mapped.scheduledAt ?? getLocalScheduledAt(mapped.id)),
        );
        setNotFound(false);
        setIsDirty(false);
      } catch (e) {
        console.error("Failed to load article for editing", e);
        if (isMounted && !editingArticle) {
          setNotFound(true);
        }
      } finally {
        if (isMounted) setEditorLoading(false);
      }
    };

    void fetchArticleForEdit();
    return () => {
      isMounted = false;
    };
  }, [editingId]);

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailUploading(true);
    const url = await uploadArticleImageToStorage(file, currentUserId, "thumb", showToast);
    if (url) {
      setThumbnailUrl(url);
      markDirty();
      showToast("サムネイル画像をアップロードしました");
    }
    setThumbnailUploading(false);
  };

  const handleInlineImageUpload = async (file: File): Promise<string | null> => {
    const url = await uploadArticleImageToStorage(file, currentUserId, "inline", showToast);
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
      markDirty();
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
    markDirty();
  };

  const handleSave = async (submitForReview = false) => {
    if (!formTitle.trim()) {
      showToast("タイトルを入力してください");
      return;
    }
    const scheduledIso = toSafeIsoString(formScheduledAt);
    if (formScheduledAt.trim() && !scheduledIso) {
      showToast("有効な公開予約日時を入力してください");
      return;
    }
    setSaving(true);
    if (saveInFlightRef.current) {
      try {
        await saveInFlightRef.current;
      } catch {
        // ignore prior autosave error
      }
    }

    const versionAtStart = editVersionRef.current;
    const targetId = editingId || effectiveEditingArticle?.id || autoSaveIdRef.current;
    const isFutureSchedule = isArticleScheduledFuture(scheduledIso);

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
      scheduledAt: scheduledIso,
      collaboratorIds,
    };

    const runSave = (async () => {
      if (targetId) {
        const nextStatus: ArticleStatus | undefined = submitForReview
          ? isEditor
            ? isFutureSchedule
              ? "scheduled"
              : "published"
            : "pending"
          : undefined;

        const updatePayload = buildBaseArticlePayload(currentValues, canManageCollaborators);
        if (nextStatus) {
          updatePayload.status = nextStatus;
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
            collaboratorIds,
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
          if (editVersionRef.current === versionAtStart) {
            setIsDirty(false);
          }
          setLastSavedAt(
            new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
          );
          const isCollaborator = Boolean(
            effectiveEditingArticle?.collaboratorIds?.includes(currentUserId ?? ""),
          );
          const isEditingOtherArticle =
            isEditor &&
            !isCollaborator &&
            Boolean(effectiveEditingArticle && effectiveEditingArticle.writerId !== currentUserId);
          const destination = isEditingOtherArticle ? "editorArticles" : "writerDash";

          if (submitForReview) {
            showToast(
              nextStatus === "published"
                ? "記事を公開しました"
                : scheduledIso
                  ? `公開予約（${formatScheduledDateTime(scheduledIso)}）で申請しました`
                  : "投稿申請しました",
            );
            hasPushedGuardRef.current = false;
            navigate(destination);
          } else {
            showToast(effectiveEditingArticle ? "記事を更新しました" : "下書きを保存しました");
            if (effectiveEditingArticle) {
              hasPushedGuardRef.current = false;
              navigate(destination);
            }
          }
        } else {
          console.error("記事更新エラー:", error);
          showToast("エラーが発生しました。もう一度お試しください。");
        }
      } else {
        const initialStatus: ArticleStatus = submitForReview
          ? isEditor
            ? isFutureSchedule
              ? "scheduled"
              : "published"
            : "pending"
          : "draft";

        const insertPayload = buildBaseArticlePayload(currentValues, canManageCollaborators);
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
              collaboratorIds: data.collaborator_ids ?? collaboratorIds,
              scheduledAt: scheduledIso,
            },
            ...prev,
          ]);
          if (editVersionRef.current === versionAtStart) {
            setIsDirty(false);
          }
          setLastSavedAt(
            new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
          );
          if (submitForReview) {
            showToast(
              initialStatus === "published"
                ? "記事を公開しました"
                : scheduledIso
                  ? `公開予約（${formatScheduledDateTime(scheduledIso)}）で申請しました`
                  : "投稿申請しました",
            );
            hasPushedGuardRef.current = false;
            navigate("writerDash");
          } else {
            showToast("下書きを保存しました");
          }
        } else {
          console.error("下書き保存エラー:", error);
          showToast("エラーが発生しました。もう一度お試しください。");
        }
      }
    })();

    saveInFlightRef.current = runSave;
    try {
      await runSave;
    } finally {
      if (saveInFlightRef.current === runSave) {
        saveInFlightRef.current = null;
      }
      setSaving(false);
    }
  };

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
    if (!isDirty) return;
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. <a> タグによる画面遷移
      const anchor = target.closest("a");
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
          if (!window.confirm("保存されていない変更があります。ページを離れますか？")) {
            e.preventDefault();
            e.stopPropagation();
            return;
          } else {
            setIsDirty(false);
            hasPushedGuardRef.current = false;
            return;
          }
        }
      }

      // 2. エディタ外部（ヘッダー、ナビゲーション、フッターなど）のナビゲーション要素クリック
      const isOutsideEditor =
        editorContainerRef.current && !editorContainerRef.current.contains(target);
      const isNavContainer = target.closest("header, nav, footer, [role='navigation']");
      if (isOutsideEditor || isNavContainer) {
        const clickable = target.closest(
          "button, [role='button'], a, div[class*='cursor-pointer']",
        );
        if (clickable) {
          if (!window.confirm("保存されていない変更があります。ページを離れますか？")) {
            e.preventDefault();
            e.stopPropagation();
          } else {
            setIsDirty(false);
            hasPushedGuardRef.current = false;
          }
        }
      }
    };
    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [isDirty]);

  useEffect(() => {
    if (isDirty && !hasPushedGuardRef.current) {
      window.history.pushState({ __editorGuard: true }, "", window.location.href);
      hasPushedGuardRef.current = true;
    }
  }, [isDirty]);

  useEffect(() => {
    const handlePopState = () => {
      if (!hasPushedGuardRef.current) return;
      if (isDirtyRef.current) {
        if (!window.confirm("保存されていない変更があります。ページを離れますか？")) {
          window.history.pushState({ __editorGuard: true }, "", window.location.href);
        } else {
          hasPushedGuardRef.current = false;
          isDirtyRef.current = false;
          setIsDirty(false);
          window.history.back();
        }
      } else {
        hasPushedGuardRef.current = false;
        window.history.back();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!isDirty || !formTitle.trim() || !currentUserId || saving) return;
    const timer = setTimeout(async () => {
      if (savingRef.current || saveInFlightRef.current) return;
      const versionAtStart = editVersionRef.current;
      const scheduledIso = toSafeIsoString(formScheduledAt);
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
        scheduledAt: scheduledIso,
        collaboratorIds,
      };

      const runAutoSave = (async () => {
        if (autoSaveIdRef.current) {
          const updatePayload = buildBaseArticlePayload(currentValues, canManageCollaborators);
          const { error } = await updateArticleWithFallback(autoSaveIdRef.current, updatePayload);
          if (error) return;
          setLocalScheduledAt(autoSaveIdRef.current, scheduledIso);
        } else {
          const insertPayload = buildBaseArticlePayload(currentValues, canManageCollaborators);
          insertPayload.writer_id = currentUserId;
          insertPayload.status = "draft";
          insertPayload.views = 0;
          insertPayload.likes = 0;
          insertPayload.is_recommended = false;
          insertPayload.is_popular = false;

          const { data, error } = await insertArticleWithFallback(insertPayload);
          if (error || !data) return;
          autoSaveIdRef.current = data.id;
          skipNextFetchForIdRef.current = data.id;
          setLocalScheduledAt(data.id, scheduledIso);
          void routerNavigate(`/writer-dash/edit/${data.id}`, { replace: true });
          const newArticle: Article = {
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
            collaboratorIds,
            scheduledAt: scheduledIso,
          };
          setLoadedArticle(newArticle);
          setArticles((prev) => [newArticle, ...prev]);
        }
        if (editVersionRef.current === versionAtStart) {
          setIsDirty(false);
        }
        setLastSavedAt(
          new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        );
        showToast("自動保存しました");
      })();

      saveInFlightRef.current = runAutoSave;
      try {
        await runAutoSave;
      } finally {
        if (saveInFlightRef.current === runAutoSave) {
          saveInFlightRef.current = null;
        }
      }
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
    formScheduledAt,
    collaboratorIds,
    canManageCollaborators,
    isDirty,
    saving,
    currentUserId,
    setArticles,
    showToast,
  ]);

  if (editorLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">記事データを読み込んでいます...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-gray-500 dark:text-gray-400 text-base font-bold">記事が見つかりません</p>
        <button
          type="button"
          onClick={() => navigate("writerDash")}
          className="px-5 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors"
        >
          ダッシュボードへ戻る
        </button>
      </div>
    );
  }

  const selectedSeries = seriesList.find((s) => s.id === formSeriesId);

  return (
    <div ref={editorContainerRef} className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
              if (hasPushedGuardRef.current) {
                hasPushedGuardRef.current = false;
                window.history.go(-2);
              } else {
                window.history.back();
              }
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
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
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
            aria-pressed={showPreview}
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
              <span>{formScheduledAt ? "予約投稿申請" : isEditor ? "記事を公開" : "投稿申請"}</span>
            </button>
          )}
          {isEditor && effectiveEditingArticle?.status === "pending" && (
            <button
              type="button"
              data-testid="editor-direct-publish-btn"
              onClick={() => void handleSave(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-green-600 text-white text-xs md:text-sm font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 shadow-xs transition-colors"
            >
              {formScheduledAt ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              <span>{formScheduledAt ? "公開予約で承認" : "今すぐ公開"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {showPreview ? (
          <ArticleEditorPreview
            title={formTitle}
            summary={formSummary}
            content={formContent}
            thumbnailUrl={thumbnailUrl}
            thumbnailColor={formColor}
            tags={tags}
            selectedSeries={selectedSeries}
            episodeNumber={formEpisodeNumber}
            fontSizeClass={getFontSizeClass()}
          />
        ) : (
          <ArticleEditorTabs
            settingsPanel={
              <ArticleEditorSettingsPanel
                formTitle={formTitle}
                onChangeTitle={(value) => {
                  setFormTitle(value);
                  markDirty();
                }}
                formSummary={formSummary}
                onChangeSummary={(value) => {
                  setFormSummary(value);
                  markDirty();
                }}
                settingsExpanded={settingsExpanded}
                onToggleSettingsExpanded={() => setSettingsExpanded((v) => !v)}
                thumbnailUrl={thumbnailUrl}
                thumbnailUploading={thumbnailUploading}
                onThumbnailUpload={(e) => void handleThumbnailUpload(e)}
                onClearThumbnail={() => {
                  setThumbnailUrl(null);
                  markDirty();
                }}
                formColor={formColor}
                onChangeColor={(colorId) => {
                  setFormColor(colorId);
                  markDirty();
                }}
                canManageCollaborators={canManageCollaborators}
                collaboratorIds={collaboratorIds}
                onChangeCollaboratorIds={(ids) => {
                  setCollaboratorIds(ids);
                  markDirty();
                }}
                effectiveEditingArticle={effectiveEditingArticle}
                currentUserId={currentUserId}
                tags={tags}
                tagInput={tagInput}
                onChangeTagInput={setTagInput}
                onAddTag={addTag}
                onRemoveTag={removeTag}
                formSeriesId={formSeriesId}
                onChangeSeriesId={(seriesId) => {
                  setFormSeriesId(seriesId);
                  markDirty();
                }}
                formEpisodeNumber={formEpisodeNumber}
                onChangeEpisodeNumber={(ep) => {
                  setFormEpisodeNumber(ep);
                  markDirty();
                }}
                seriesList={seriesList}
                isEditor={isEditor}
                formCommentsEnabled={formCommentsEnabled}
                onChangeCommentsEnabled={(enabled) => {
                  setFormCommentsEnabled(enabled);
                  markDirty();
                }}
                formScheduledAt={formScheduledAt}
                onChangeScheduledAt={(scheduledAt) => {
                  setFormScheduledAt(scheduledAt);
                  markDirty();
                }}
              />
            }
            editorPanel={
              <div>
                <RichTextEditor
                  content={formContent}
                  onChange={(html) => {
                    setFormContent(html);
                    markDirty();
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
