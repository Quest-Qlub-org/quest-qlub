import { History, X } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { CommentHistoryItem, CommentItem } from "../hooks/useArticleComments";
import { formatDateTime } from "../utils/date";

interface CommentEditHistoryModalProps {
  targetComment: CommentItem | null;
  historyItems: CommentHistoryItem[];
  loading: boolean;
  onClose: () => void;
}

/**
 * コメントの編集履歴を表示するモーダル
 */
export function CommentEditHistoryModal({
  targetComment,
  historyItems,
  loading,
  onClose,
}: CommentEditHistoryModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>(Boolean(targetComment), onClose);

  if (!targetComment) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comment-history-modal-title"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2
              id="comment-history-modal-title"
              className="font-bold text-gray-900 dark:text-gray-100 text-base"
            >
              コメントの編集履歴
            </h2>
          </div>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-1">
              <span>現在の表示内容（最新）</span>
              <span>{formatDateTime(targetComment.updatedAt)}</span>
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
              {targetComment.content}
            </p>
          </div>

          {loading ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
              履歴を読み込み中...
            </p>
          ) : historyItems.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
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
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                    編集日時: {formatDateTime(item.editedAt)}
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
  );
}
