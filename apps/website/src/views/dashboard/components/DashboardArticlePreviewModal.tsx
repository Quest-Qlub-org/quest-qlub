import type React from "react";
import { Loader2, X } from "lucide-react";
import { LogoIcon } from "../../../components/icons/NavIcons";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import { ARTICLE_STATUS_CONFIG, getThumbnailColor } from "../../../types";
import type { Article, ArticleStatus } from "../../../types";
import { sanitizeHtml } from "../../../utils/sanitize";

/**
 * 記事ステータスに対応するバッジを表示する共通コンポーネント。
 */
export function ArticleStatusBadge({
  status,
  className = "text-xs font-bold px-2 py-0.5 rounded-full",
}: {
  status: string;
  className?: string;
}) {
  const cfg = ARTICLE_STATUS_CONFIG[status as ArticleStatus] ?? ARTICLE_STATUS_CONFIG.draft;
  return <span className={`${className} ${cfg.badgeClass}`}>{cfg.label}</span>;
}

interface DashboardArticlePreviewModalProps {
  article: Article | null;
  loading: boolean;
  onClose: () => void;
  getFontSizeClass?: () => string;
  testId?: string;
  titleId: string;
  maxWidthClass?: string;
  showThumbnail?: boolean;
  headerMeta?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * 管理画面（WriterDashboard / EditorDashboard / EditorArticlesView）共通の
 * インライン記事プレビューモーダル。
 */
export function DashboardArticlePreviewModal({
  article,
  loading,
  onClose,
  getFontSizeClass,
  testId,
  titleId,
  maxWidthClass = "max-w-2xl",
  showThumbnail = false,
  headerMeta,
  headerActions,
  footer,
}: DashboardArticlePreviewModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>(Boolean(article), onClose);

  if (!article) return null;

  const fontSizeClass = typeof getFontSizeClass === "function" ? getFontSizeClass() : "text-base";

  return (
    <div
      data-testid={testId}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full ${maxWidthClass} max-h-[90vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">{headerMeta}</div>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <button
              type="button"
              aria-label="閉じる"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {showThumbnail &&
            (article.thumbnailUrl ? (
              <div className="w-full max-h-60 aspect-video rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                <img
                  src={article.thumbnailUrl}
                  alt={article.title}
                  className="w-full h-full object-contain max-h-60"
                />
              </div>
            ) : (
              <div
                className={`${getThumbnailColor(article.thumbnailColor ?? null).bg} w-full h-32 rounded-xl flex items-center justify-center border border-gray-100 dark:border-gray-700`}
              >
                <LogoIcon className="w-12 h-12 opacity-30" />
              </div>
            ))}

          <h2
            id={titleId}
            className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-snug break-words"
          >
            {article.title}
          </h2>

          {showThumbnail && (article.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(article.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-full border border-gray-200 dark:border-gray-600"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {article.summary && (
            <div className="bg-blue-50 dark:bg-blue-950/40 p-3.5 rounded-xl text-sm text-gray-700 dark:text-gray-300 border border-blue-100 dark:border-blue-800/50 font-medium">
              {article.summary}
            </div>
          )}

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600 dark:text-purple-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400">本文を読み込み中...</p>
              </div>
            ) : article.content ? (
              <div
                className={`article-content ${fontSizeClass}`}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                本文が設定されていません
              </p>
            )}
          </div>
        </div>

        {footer && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
