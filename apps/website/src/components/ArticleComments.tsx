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
  Check,
  EyeOff,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  useArticleComments,
  getLocalComments,
  setLocalComments,
  isCommentsSchemaError,
  type CommentItem,
  type CommentHistoryItem,
} from "../hooks/useArticleComments";
import { CommentEditHistoryModal } from "./CommentEditHistoryModal";
import { formatDateTime } from "../utils/date";

export { getLocalComments, setLocalComments, isCommentsSchemaError };
export type { CommentItem, CommentHistoryItem };

interface ArticleCommentsProps {
  articleId: string;
  writerId?: string;
  collaboratorIds?: string[];
  commentsEnabled?: boolean;
  onToggleCommentsEnabled?: (nextEnabled: boolean) => Promise<void> | void;
}

export function ArticleComments({
  articleId,
  writerId,
  collaboratorIds,
  commentsEnabled = true,
  onToggleCommentsEnabled,
}: ArticleCommentsProps) {
  const navigate = useNavigate();
  const { user, profile, userRole } = useAuth();
  const currentUserId = profile?.id || user?.id || null;

  const {
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
  } = useArticleComments({
    articleId,
    writerId,
    collaboratorIds,
    commentsEnabled,
    currentUserId,
    profile,
    userRole,
  });

  // コメント機能がオフで、一般読者・ゲストが閲覧している場合（過去のコメントも含め完全非表示）
  if (!commentsEnabled && !canManageArticleComments) {
    return (
      <section className="bg-gray-50 dark:bg-gray-800/80 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mt-8 text-center transition-colors">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full flex items-center justify-center mx-auto mb-3">
          <EyeOff className="w-5 h-5" />
        </div>
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">
          コメント欄は非表示になっています
        </h2>
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
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            感想・コメント ({comments.length})
          </h2>
        </div>

        {/* ライター本人または編集長によるコメント機能オン/オフ切り替えスイッチ */}
        {canManageArticleComments && onToggleCommentsEnabled && (
          <button
            type="button"
            data-testid="toggle-comments-enabled"
            aria-pressed={commentsEnabled}
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
        <div
          role="alert"
          className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 font-bold"
        >
          {error}
        </div>
      )}

      {/* コメント一覧 */}
      {comments.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          <p>まだコメントはありません。</p>
          {commentsEnabled && (
            <p className="text-xs mt-1">最初の感想や応援メッセージを投稿してみましょう！</p>
          )}
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {comments.map((comment) => {
            const isCommentOwner = Boolean(currentUserId && comment.authorId === currentUserId);
            const canDelete = isCommentOwner || canManageArticleComments;
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
                    {writerId && comment.authorId === writerId ? (
                      <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        記事ライター
                      </span>
                    ) : collaboratorIds?.includes(comment.authorId) ? (
                      <span className="text-[10px] font-bold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                        共同執筆者
                      </span>
                    ) : null}
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {formatDateTime(comment.createdAt)}
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
                        aria-label={comment.isPinned ? "ピン留めを解除" : "コメントをピン留め"}
                        aria-pressed={comment.isPinned}
                        title={
                          comment.isPinned ? "ピン留めを解除" : "コメントをピン留め（最大3件）"
                        }
                        className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          comment.isPinned
                            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800"
                            : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
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
                        aria-label="コメントを編集"
                        title="コメントを編集"
                        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
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
                        aria-label="コメントを削除"
                        title="コメントを削除"
                        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
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
                      aria-label="コメントを編集"
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
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">
                  コメントを投稿する
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  投稿者: {profile?.display_name || `@${profile?.username || "user"}`}
                </span>
              </div>
              <div>
                <label htmlFor="comment-content-input" className="sr-only">
                  コメント内容
                </label>
                <textarea
                  id="comment-content-input"
                  placeholder="記事の感想や応援メッセージをご記入ください（最大500文字）"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                {cooldown > 0 ? (
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-xs text-amber-700 dark:text-amber-400 font-medium"
                  >
                    連続投稿防止のため、あと {cooldown} 秒お待ちください
                  </p>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  disabled={submitting || !content.trim() || cooldown > 0}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {submitting
                      ? "送信中..."
                      : cooldown > 0
                        ? `投稿待機中 (${cooldown}秒)`
                        : "コメントを投稿"}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 編集履歴モーダル（誰でも閲覧可能） */}
      <CommentEditHistoryModal
        targetComment={historyTargetComment}
        historyItems={historyItems}
        loading={loadingHistory}
        onClose={closeHistoryModal}
      />
    </section>
  );
}
