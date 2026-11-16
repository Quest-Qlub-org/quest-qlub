import { Check, Clock, Edit3 } from "lucide-react";
import { ARTICLE_STATUS_CONFIG } from "../../types";
import type { Article, ArticleStatus } from "../../types";
import { formatScheduledDateTime } from "../../utils/scheduledArticles";

interface ArticlePreviewBannerProps {
  article: Article;
  isAuthor: boolean;
  isCollaborator: boolean;
  isEditor: boolean;
  onEditClick: () => void;
  onQuickStatusChange: (nextStatus: ArticleStatus) => void;
}

/**
 * 記事詳細ページの未公開プレビュー用バナー（編集・ステータス変更操作付き）。
 */
export function ArticlePreviewBanner({
  article,
  isAuthor,
  isCollaborator,
  isEditor,
  onEditClick,
  onQuickStatusChange,
}: ArticlePreviewBannerProps) {
  return (
    <div
      data-testid="article-preview-banner"
      className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-3 text-amber-800 dark:text-amber-200 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-2 max-w-full"
    >
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
        <span className="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-extrabold text-[10px]">
          PREVIEW
        </span>
        <span>
          【プレビュー表示中】ステータス:{" "}
          {ARTICLE_STATUS_CONFIG[article.status]?.label ?? article.status}
          （一般には公開されていません）
        </span>
        {formatScheduledDateTime(article.scheduledAt) && (
          <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" /> 公開予定: {formatScheduledDateTime(article.scheduledAt)}
          </span>
        )}
      </div>

      {(isEditor || isAuthor || isCollaborator) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onEditClick}
            className="px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" /> 編集する
          </button>
          {(isAuthor || isCollaborator) && article.status === "draft" && (
            <button
              type="button"
              onClick={() => onQuickStatusChange("pending")}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
            >
              投稿申請する
            </button>
          )}
          {(isAuthor || isCollaborator) && !isEditor && article.status === "pending" && (
            <button
              type="button"
              data-testid="preview-banner-withdraw-btn"
              onClick={() => onQuickStatusChange("draft")}
              className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              申請取消
            </button>
          )}
          {isEditor && (
            <>
              <button
                type="button"
                data-testid="preview-banner-approve-btn"
                onClick={() => onQuickStatusChange("published")}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 inline-flex items-center gap-1 shadow-sm cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" /> 許可 (公開)
              </button>
              {article.status !== "draft" && (
                <button
                  type="button"
                  data-testid="preview-banner-reject-btn"
                  onClick={() => onQuickStatusChange("draft")}
                  className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                >
                  差し戻し
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
