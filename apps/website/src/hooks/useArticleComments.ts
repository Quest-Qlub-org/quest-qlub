import { useState, useEffect, useCallback } from "react";
import { supabase, type Profile } from "../supabase";
import type { UserRole } from "../context/AuthContext";
import { COMMENT_COOLDOWN_DURATION_MS, COMMENT_COOLDOWN_KEY } from "../utils/antiSpam";
import { profileHasRole } from "../utils/roles";
import { useSubmissionCooldown } from "./useSubmissionCooldown";

export interface CommentItem {
  id: string;
  articleId: string;
  authorName: string;
  authorId: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommentHistoryItem {
  id: string;
  commentId: string;
  previousContent: string;
  editedAt: string;
}

const COMMENTS_STORAGE_PREFIX = "quest_qlub_comments_";
const MAX_PINNED_COMMENTS = 3;

export function getLocalComments(articleId: string): CommentItem[] {
  try {
    const raw = localStorage.getItem(`${COMMENTS_STORAGE_PREFIX}${articleId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setLocalComments(articleId: string, comments: CommentItem[]): void {
  try {
    localStorage.setItem(`${COMMENTS_STORAGE_PREFIX}${articleId}`, JSON.stringify(comments));
  } catch {
    // ignore
  }
}

export function isCommentsSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  const msg = typeof err.message === "string" ? err.message : "";
  const lowerMsg = msg.toLowerCase();

  // 正規の RLS / 権限拒否（42501, permission denied, row-level security）は絶対にスキーマドリフトとみなさない
  if (
    err.code === "42501" ||
    lowerMsg.includes("permission denied") ||
    lowerMsg.includes("row-level security")
  ) {
    return false;
  }

  return (
    err.code === "PGRST205" ||
    err.code === "42P01" ||
    err.code === "42703" ||
    err.code === "42883" ||
    msg.includes("Could not find the table") ||
    msg.includes("schema cache") ||
    (lowerMsg.includes("does not exist") &&
      (msg.includes("article_comments") ||
        msg.includes("comments_enabled") ||
        msg.includes("check_is_editor")))
  );
}

interface UseArticleCommentsParams {
  articleId: string;
  writerId?: string;
  collaboratorIds?: string[];
  commentsEnabled: boolean;
  currentUserId: string | null;
  profile: Profile | null;
  userRole: UserRole;
}

/**
 * 記事コメントの取得・投稿・ピン留め・編集・削除・履歴取得（およびスキーマ未適用時ローカル退避）を管理するフック
 */
export function useArticleComments({
  articleId,
  writerId,
  collaboratorIds,
  commentsEnabled,
  currentUserId,
  profile,
  userRole,
}: UseArticleCommentsParams) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const { cooldown, triggerCooldown: startCooldown } = useSubmissionCooldown(
    COMMENT_COOLDOWN_KEY,
    COMMENT_COOLDOWN_DURATION_MS,
  );

  // インライン編集用ステート
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // 編集履歴モーダル用ステート
  const [historyTargetComment, setHistoryTargetComment] = useState<CommentItem | null>(null);
  const [historyItems, setHistoryItems] = useState<CommentHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const isAuthenticated = userRole !== "guest" && !!currentUserId;
  const isArticleWriter = Boolean(currentUserId && writerId && currentUserId === writerId);
  const isCollaborator = Boolean(
    currentUserId && collaboratorIds && collaboratorIds.includes(currentUserId),
  );
  const isEditor = userRole === "editor" || profileHasRole(profile, "editor");
  const canManageArticleComments = isArticleWriter || isCollaborator || isEditor;

  // コメントオフ時は、記事ライターまたは編集長のみ過去コメントを閲覧可能
  const canViewComments = commentsEnabled || canManageArticleComments;

  const sortComments = useCallback((list: CommentItem[]) => {
    return [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, []);

  const commitComments = useCallback(
    (nextList: CommentItem[], shouldSort = false) => {
      const normalized = shouldSort ? sortComments(nextList) : nextList;
      setComments(normalized);
      setLocalComments(articleId, normalized);
    },
    [articleId, sortComments],
  );

  const restoreLocalCommentsOnError = useCallback(
    (err?: unknown) => {
      const local = getLocalComments(articleId);
      if (local.length > 0) {
        setComments(sortComments(local));
      }
      if (!err || isCommentsSchemaError(err)) {
        setIsFallbackMode(true);
      }
    },
    [articleId, sortComments],
  );

  const fetchComments = useCallback(async () => {
    if (!canViewComments) {
      setComments([]);
      return;
    }

    try {
      const { data, error: fetchErr } = await supabase
        .from("article_comments")
        .select(
          "id, article_id, author_name, author_id, content, is_pinned, created_at, updated_at",
        )
        .eq("article_id", articleId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: true });

      if (!fetchErr && data) {
        const loaded: CommentItem[] = data.map((d: any) => ({
          id: d.id,
          articleId: d.article_id,
          authorName: d.author_name,
          authorId: d.author_id || "",
          content: d.content,
          isPinned: Boolean(d.is_pinned),
          createdAt: d.created_at,
          updatedAt: d.updated_at || d.created_at,
        }));
        commitComments(loaded, true);
        setIsFallbackMode(false);
      } else if (fetchErr) {
        console.warn("fetchComments failed:", fetchErr);
        restoreLocalCommentsOnError(fetchErr);
      }
    } catch (e) {
      console.warn("fetchComments exception:", e);
      restoreLocalCommentsOnError();
    }
  }, [articleId, canViewComments, commitComments, restoreLocalCommentsOnError]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  const appendLocalFallbackComment = useCallback(
    (displayAuthorName: string, authorId: string, trimmedContent: string) => {
      const nowIso = new Date().toISOString();
      const newComment: CommentItem = {
        id: `local_comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        articleId,
        authorName: displayAuthorName,
        authorId,
        content: trimmedContent,
        isPinned: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      commitComments([...comments, newComment], true);
      setContent("");
      setIsFallbackMode(true);
      startCooldown();
    },
    [articleId, comments, commitComments, startCooldown],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !currentUserId) {
      setError("コメントを投稿するにはログインが必要です");
      return;
    }
    if (!commentsEnabled) {
      setError("この記事のコメント機能はオフになっています");
      return;
    }
    if (cooldown > 0) {
      setError(`連続投稿を防ぐため、あと${cooldown}秒お待ちください`);
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError("コメントを入力してください");
      return;
    }
    if (trimmedContent.length > 500) {
      setError("コメントは500文字以内で入力してください");
      return;
    }

    const displayAuthorName =
      profile?.display_name || (profile?.username ? `@${profile.username}` : "読者");

    setSubmitting(true);
    setError("");

    try {
      const insertQuery = supabase.from("article_comments").insert({
        article_id: articleId,
        author_name: displayAuthorName,
        author_id: currentUserId,
        content: trimmedContent,
      });

      const res =
        typeof (insertQuery as any).select === "function"
          ? await (insertQuery as any).select().maybeSingle()
          : await insertQuery;

      const nowIso = new Date().toISOString();

      if (res?.error) {
        if (isCommentsSchemaError(res.error)) {
          appendLocalFallbackComment(displayAuthorName, currentUserId, trimmedContent);
          return;
        }
        const errCode = typeof res.error.code === "string" ? res.error.code : "";
        const errMessage = typeof res.error.message === "string" ? res.error.message : "";
        if (errCode === "P0001" && errMessage) {
          setError(errMessage);
          startCooldown();
          return;
        }
        setError("コメントの送信に失敗しました");
        return;
      }

      const inserted = res?.data;
      const newComment: CommentItem = {
        id: inserted?.id || `comment_${Date.now()}`,
        articleId,
        authorName: inserted?.author_name || displayAuthorName,
        authorId: inserted?.author_id || currentUserId,
        content: inserted?.content || trimmedContent,
        isPinned: Boolean(inserted?.is_pinned),
        createdAt: inserted?.created_at || nowIso,
        updatedAt: inserted?.updated_at || inserted?.created_at || nowIso,
      };

      commitComments([...comments, newComment], true);
      setContent("");
      setIsFallbackMode(false);
      startCooldown();
    } catch {
      appendLocalFallbackComment(displayAuthorName, currentUserId, trimmedContent);
    } finally {
      setSubmitting(false);
    }
  };

  // ピン留め切り替え（記事のライター本人のみ・最大3件まで）
  const handleTogglePin = async (comment: CommentItem) => {
    if (!isArticleWriter) return;
    setError("");

    const nextPinned = !comment.isPinned;
    if (nextPinned) {
      const currentPinnedCount = comments.filter((c) => c.isPinned).length;
      if (currentPinnedCount >= MAX_PINNED_COMMENTS) {
        setError(`ピン留めできるコメントは最大${MAX_PINNED_COMMENTS}件までです`);
        return;
      }
    }

    const applyPin = () =>
      commitComments(
        comments.map((c) => (c.id === comment.id ? { ...c, isPinned: nextPinned } : c)),
        true,
      );

    try {
      const { error: pinErr } = await supabase
        .from("article_comments")
        .update({ is_pinned: nextPinned })
        .eq("id", comment.id);

      if (pinErr) {
        if (isCommentsSchemaError(pinErr) || comment.id.startsWith("local_")) {
          applyPin();
          return;
        }
        setError(pinErr.message || "ピン留めの更新に失敗しました");
        return;
      }

      applyPin();
    } catch {
      if (comment.id.startsWith("local_") || isFallbackMode) {
        applyPin();
      } else {
        setError("ピン留めの更新に失敗しました");
      }
    }
  };

  // コメント削除（投稿者本人、記事ライター、共同執筆者、または編集長）
  const handleDelete = async (comment: CommentItem) => {
    const isCommentOwner = Boolean(currentUserId && comment.authorId === currentUserId);
    if (!isCommentOwner && !canManageArticleComments) return;

    setError("");
    const applyDelete = () => commitComments(comments.filter((c) => c.id !== comment.id));

    try {
      const { error: delErr } = await supabase
        .from("article_comments")
        .delete()
        .eq("id", comment.id);

      if (delErr) {
        if (isCommentsSchemaError(delErr) || comment.id.startsWith("local_")) {
          applyDelete();
          return;
        }
        setError("コメントの削除に失敗しました");
        return;
      }

      applyDelete();
    } catch {
      if (comment.id.startsWith("local_") || isFallbackMode) {
        applyDelete();
      } else {
        setError("コメントの削除に失敗しました");
      }
    }
  };

  // コメント編集の開始（投稿者本人のみ）
  const startEdit = (comment: CommentItem) => {
    if (!currentUserId || comment.authorId !== currentUserId) return;
    setEditingCommentId(comment.id);
    setEditingContent(comment.content);
    setError("");
  };

  // コメント編集の保存（投稿者本人のみ）
  const handleSaveEdit = async (comment: CommentItem) => {
    if (!currentUserId || comment.authorId !== currentUserId) return;
    const trimmed = editingContent.trim();
    if (!trimmed) {
      setError("コメントを入力してください");
      return;
    }
    if (trimmed.length > 500) {
      setError("コメントは500文字以内で入力してください");
      return;
    }
    if (trimmed === comment.content) {
      setEditingCommentId(null);
      return;
    }

    const applyEdit = (nowIso: string) => {
      commitComments(
        comments.map((c) =>
          c.id === comment.id ? { ...c, content: trimmed, updatedAt: nowIso } : c,
        ),
      );
      setEditingCommentId(null);
    };

    try {
      const nowIso = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("article_comments")
        .update({ content: trimmed, updated_at: nowIso })
        .eq("id", comment.id);

      if (updateErr) {
        if (isCommentsSchemaError(updateErr) || comment.id.startsWith("local_")) {
          applyEdit(nowIso);
          return;
        }
        setError("コメントの編集に失敗しました");
        return;
      }

      applyEdit(nowIso);
    } catch {
      if (comment.id.startsWith("local_") || isFallbackMode) {
        applyEdit(new Date().toISOString());
      } else {
        setError("コメントの編集に失敗しました");
      }
    }
  };

  // 編集履歴の表示（誰でも閲覧可能）
  const handleOpenHistory = async (comment: CommentItem) => {
    setHistoryTargetComment(comment);
    setLoadingHistory(true);
    setHistoryItems([]);
    try {
      const { data, error: histErr } = await supabase
        .from("comment_edit_history")
        .select("id, comment_id, previous_content, edited_at")
        .eq("comment_id", comment.id)
        .order("edited_at", { ascending: false });

      if (!histErr && data) {
        setHistoryItems(
          data.map((h: any) => ({
            id: h.id,
            commentId: h.comment_id,
            previousContent: h.previous_content,
            editedAt: h.edited_at,
          })),
        );
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const closeHistoryModal = useCallback(() => setHistoryTargetComment(null), []);

  return {
    comments,
    content,
    setContent,
    submitting,
    error,
    isFallbackMode,
    cooldown,
    editingCommentId,
    setEditingCommentId,
    editingContent,
    setEditingContent,
    historyTargetComment,
    historyItems,
    loadingHistory,
    isAuthenticated,
    isArticleWriter,
    canManageArticleComments,
    handleSubmit,
    handleTogglePin,
    handleDelete,
    startEdit,
    handleSaveEdit,
    handleOpenHistory,
    closeHistoryModal,
  };
}
