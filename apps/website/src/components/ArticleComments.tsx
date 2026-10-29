import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Send,
  User,
  Pin,
  Trash2,
  Edit2,
  History,
  Lock,
  LogIn,
  X,
  Check,
  EyeOff,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase";
import { profileHasRole } from "../utils/roles";

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
  return (
    err.code === "PGRST205" ||
    err.code === "42P01" ||
    err.code === "42703" ||
    err.code === "42501" ||
    (typeof err.message === "string" &&
      (err.message.includes("article_comments") ||
        err.message.includes("comments_enabled") ||
        err.message.includes("check_is_editor") ||
        err.message.includes("Could not find the table") ||
        err.message.includes("schema cache") ||
        err.message.includes("permission denied")))
  );
}

interface ArticleCommentsProps {
  articleId: string;
  writerId?: string;
  commentsEnabled?: boolean;
  onToggleCommentsEnabled?: (nextEnabled: boolean) => Promise<void> | void;
}

const MAX_PINNED_COMMENTS = 3;

export function ArticleComments({
  articleId,
  writerId,
  commentsEnabled = true,
  onToggleCommentsEnabled,
}: ArticleCommentsProps) {
  const navigate = useNavigate();
  const { user, profile, userRole } = useAuth();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  // インライン編集用ステート
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // 編集履歴モーダル用ステート
  const [historyTargetComment, setHistoryTargetComment] = useState<CommentItem | null>(null);
  const [historyItems, setHistoryItems] = useState<CommentHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const currentUserId = profile?.id || user?.id || null;
  const isAuthenticated = userRole !== "guest" && !!currentUserId;
  const isArticleWriter = Boolean(currentUserId && writerId && currentUserId === writerId);
  const isEditor = userRole === "editor" || profileHasRole(profile, "editor");
  const canManageArticleComments = isArticleWriter || isEditor;

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
        setComments(sortComments(loaded));
        setLocalComments(articleId, loaded);
        setIsFallbackMode(false);
      } else if (fetchErr) {
        console.warn("fetchComments failed:", fetchErr);
        const local = getLocalComments(articleId);
        if (local.length > 0) {
          setComments(sortComments(local));
        }
        if (isCommentsSchemaError(fetchErr)) {
          setIsFallbackMode(true);
        }
      }
    } catch (e) {
      console.warn("fetchComments exception:", e);
      const local = getLocalComments(articleId);
      if (local.length > 0) {
        setComments(sortComments(local));
      }
      setIsFallbackMode(true);
    }
  }, [articleId, canViewComments, sortComments]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

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
          const newComment: CommentItem = {
            id: `local_comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            articleId,
            authorName: displayAuthorName,
            authorId: currentUserId,
            content: trimmedContent,
            isPinned: false,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          const nextComments = sortComments([...comments, newComment]);
          setComments(nextComments);
          setLocalComments(articleId, nextComments);
          setContent("");
          setIsFallbackMode(true);
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

      const nextComments = sortComments([...comments, newComment]);
      setComments(nextComments);
      setLocalComments(articleId, nextComments);
      setContent("");
      setIsFallbackMode(false);
    } catch {
      const nowIso = new Date().toISOString();
      const newComment: CommentItem = {
        id: `local_comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        articleId,
        authorName: displayAuthorName,
        authorId: currentUserId,
        content: trimmedContent,
        isPinned: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const nextComments = sortComments([...comments, newComment]);
      setComments(nextComments);
      setLocalComments(articleId, nextComments);
      setContent("");
      setIsFallbackMode(true);
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

    try {
      const { error: pinErr } = await supabase
        .from("article_comments")
        .update({ is_pinned: nextPinned })
        .eq("id", comment.id);

      if (pinErr) {
        if (isCommentsSchemaError(pinErr) || comment.id.startsWith("local_")) {
          const nextComments = sortComments(
            comments.map((c) => (c.id === comment.id ? { ...c, isPinned: nextPinned } : c)),
          );
          setComments(nextComments);
          setLocalComments(articleId, nextComments);
          return;
        }
        setError(pinErr.message || "ピン留めの更新に失敗しました");
        return;
      }

      const nextComments = sortComments(
        comments.map((c) => (c.id === comment.id ? { ...c, isPinned: nextPinned } : c)),
      );
      setComments(nextComments);
      setLocalComments(articleId, nextComments);
    } catch {
      if (comment.id.startsWith("local_") || isFallbackMode) {
        const nextComments = sortComments(
          comments.map((c) => (c.id === comment.id ? { ...c, isPinned: nextPinned } : c)),
        );
        setComments(nextComments);
        setLocalComments(articleId, nextComments);
      } else {
        setError("ピン留めの更新に失敗しました");
      }
    }
  };

  // コメント削除（投稿者本人、記事ライター、または編集長）
  const handleDelete = async (comment: CommentItem) => {
    const isCommentOwner = Boolean(currentUserId && comment.authorId === currentUserId);
    if (!isCommentOwner && !isArticleWriter && !isEditor) return;

    setError("");
    try {
      const { error: delErr } = await supabase
        .from("article_comments")
        .delete()
        .eq("id", comment.id);

      if (delErr) {
        if (isCommentsSchemaError(delErr) || comment.id.startsWith("local_")) {
          const nextComments = comments.filter((c) => c.id !== comment.id);
          setComments(nextComments);
          setLocalComments(articleId, nextComments);
          return;
        }
        setError("コメントの削除に失敗しました");
        return;
      }

      const nextComments = comments.filter((c) => c.id !== comment.id);
      setComments(nextComments);
      setLocalComments(articleId, nextComments);
    } catch {
      if (comment.id.startsWith("local_") || isFallbackMode) {
        const nextComments = comments.filter((c) => c.id !== comment.id);
        setComments(nextComments);
        setLocalComments(articleId, nextComments);
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

    try {
      const nowIso = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("article_comments")
        .update({ content: trimmed, updated_at: nowIso })
        .eq("id", comment.id);

      if (updateErr) {
        if (isCommentsSchemaError(updateErr) || comment.id.startsWith("local_")) {
          const nextComments = comments.map((c) =>
            c.id === comment.id ? { ...c, content: trimmed, updatedAt: nowIso } : c,
          );
          setComments(nextComments);
          setLocalComments(articleId, nextComments);
          setEditingCommentId(null);
          return;
        }
        setError("コメントの編集に失敗しました");
        return;
      }

      const nextComments = comments.map((c) =>
        c.id === comment.id ? { ...c, content: trimmed, updatedAt: nowIso } : c,
      );
      setComments(nextComments);
      setLocalComments(articleId, nextComments);
      setEditingCommentId(null);
    } catch {
      if (comment.id.startsWith("local_") || isFallbackMode) {
        const nowIso = new Date().toISOString();
        const nextComments = comments.map((c) =>
          c.id === comment.id ? { ...c, content: trimmed, updatedAt: nowIso } : c,
        );
        setComments(nextComments);
        setLocalComments(articleId, nextComments);
        setEditingCommentId(null);
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

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    } catch {
      return "";
    }
  };

  // コメント機能がオフで、一般読者・ゲストが閲覧している場合（過去のコメントも含め完全非表示）
  if (!commentsEnabled && !canManageArticleComments) {
    return (
      <section className="bg-gray-50 dark:bg-gray-800/80 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mt-8 text-center transition-colors">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full flex items-center justify-center mx-auto mb-3">
          <EyeOff className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">
          コメント欄は非表示になっています
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          この記事のコメント機能はオフに設定されているため、コメントの閲覧および投稿はできません。
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm mt-8 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            感想・コメント ({comments.length})
          </h3>
        </div>

        {/* ライター本人または編集長によるコメント機能オン/オフ切り替えスイッチ */}
        {canManageArticleComments && onToggleCommentsEnabled && (
          <button
            type="button"
            data-testid="toggle-comments-enabled"
            onClick={() => void onToggleCommentsEnabled(!commentsEnabled)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors border cursor-pointer ${
              commentsEnabled
                ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {commentsEnabled ? (
              <>
                <ToggleRight className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span>コメント受付: オン</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span>コメント受付: オフ（読者には非表示）</span>
              </>
            )}
          </button>
        )}
      </div>

      {!commentsEnabled && canManageArticleComments && (
        <div className="mb-6 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2 font-medium">
          <EyeOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            現在この記事のコメント機能はオフになっています。一般読者には過去のコメントも含めて非表示になっており、ライターと編集長のみが確認できます。
          </span>
        </div>
      )}

      {isFallbackMode && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <span>
            ℹ️ 現在ローカル保存モードでコメントを保持しています（ページを更新しても保持されます）。
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 font-bold">
          {error}
        </div>
      )}

      {/* コメント一覧 */}
      {comments.length === 0 ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          <p>まだコメントはありません。</p>
          {commentsEnabled && (
            <p className="text-xs mt-1">最初の感想や応援メッセージを投稿してみましょう！</p>
          )}
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {comments.map((comment) => {
            const isCommentOwner = Boolean(currentUserId && comment.authorId === currentUserId);
            const canDelete = isCommentOwner || isArticleWriter || isEditor;
            const isEdited = Boolean(comment.updatedAt && comment.updatedAt !== comment.createdAt);

            return (
              <div
                key={comment.id}
                className={`rounded-xl p-4 border transition-colors ${
                  comment.isPinned
                    ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 shadow-sm"
                    : "bg-gray-50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-700/80"
                }`}
              >
                {comment.isPinned && (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-2">
                    <Pin className="w-3.5 h-3.5 fill-amber-500 text-amber-600 dark:text-amber-400" />
                    <span>ライターによって固定されたコメント</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center font-bold text-xs">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-100">
                      {comment.authorName}
                    </span>
                    {writerId && comment.authorId === writerId && (
                      <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        記事ライター
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                      {formatDate(comment.createdAt)}
                    </span>
                    {isEdited && (
                      <button
                        type="button"
                        data-testid={`view-history-${comment.id}`}
                        onClick={() => void handleOpenHistory(comment)}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                      >
                        <History className="w-3 h-3" />
                        <span>（編集済み・履歴を見る）</span>
                      </button>
                    )}
                  </div>

                  {/* アクションボタン群 */}
                  <div className="flex items-center gap-1">
                    {/* ピン留め: 記事ライター本人のみ操作可能（編集長でも他人の記事は不可） */}
                    {isArticleWriter && (
                      <button
                        type="button"
                        data-testid={`pin-comment-${comment.id}`}
                        onClick={() => void handleTogglePin(comment)}
                        title={
                          comment.isPinned ? "ピン留めを解除" : "コメントをピン留め（最大3件）"
                        }
                        className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          comment.isPinned
                            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800"
                            : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* 編集: コメント投稿者本人のみ */}
                    {isCommentOwner && editingCommentId !== comment.id && (
                      <button
                        type="button"
                        data-testid={`edit-comment-${comment.id}`}
                        onClick={() => startEdit(comment)}
                        title="コメントを編集"
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* 削除: 投稿者本人、記事ライター、または編集長 */}
                    {canDelete && (
                      <button
                        type="button"
                        data-testid={`delete-comment-${comment.id}`}
                        onClick={() => void handleDelete(comment)}
                        title="コメントを削除"
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* コメント本文 または 編集フォーム */}
                {editingCommentId === comment.id ? (
                  <div className="pl-9 space-y-2 mt-2">
                    <textarea
                      data-testid={`edit-textarea-${comment.id}`}
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      maxLength={500}
                      className="w-full border border-blue-300 dark:border-blue-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCommentId(null)}
                        className="px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        data-testid={`save-edit-${comment.id}`}
                        onClick={() => void handleSaveEdit(comment)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>保存する</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap pl-9">
                    {comment.content}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* コメント投稿エリア（コメントオン時のみ表示） */}
      {commentsEnabled && (
        <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
          {!isAuthenticated ? (
            <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 rounded-xl p-5 text-center space-y-3">
              <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-gray-800 dark:text-gray-100">
                <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>コメントを投稿するにはアカウント登録・ログインが必要です</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ログインすると、記事への感想投稿や自分のコメントの編集・削除が行えます。
              </p>
              <button
                type="button"
                onClick={() => void navigate("/login")}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>ログイン / 新規登録へ</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200">
                  コメントを投稿する
                </h4>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  投稿者: {profile?.display_name || `@${profile?.username || "user"}`}
                </span>
              </div>
              <div>
                <textarea
                  placeholder="記事の感想や応援メッセージをご記入ください（最大500文字）"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !content.trim()}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? "送信中..." : "コメントを投稿"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 編集履歴モーダル（誰でも閲覧可能） */}
      {historyTargetComment && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setHistoryTargetComment(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-bold text-gray-900 dark:text-gray-100 text-base">
                  コメントの編集履歴
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTargetComment(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-1">
                  <span>現在の表示内容（最新）</span>
                  <span>{formatDate(historyTargetComment.updatedAt)}</span>
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                  {historyTargetComment.content}
                </p>
              </div>

              {loadingHistory ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                  履歴を読み込み中...
                </p>
              ) : historyItems.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                  過去の編集履歴データはありません
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400">編集前の履歴</p>
                  {historyItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5"
                    >
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">
                        編集日時: {formatDate(item.editedAt)}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                        {item.previousContent}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
