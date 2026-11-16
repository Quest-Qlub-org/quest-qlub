import { LogoIcon } from "../../../components/icons/NavIcons";
import { getThumbnailColor } from "../../../types";
import type { Series } from "../../../types";
import { sanitizeHtml } from "../../../utils/sanitize";

export interface ArticleEditorPreviewProps {
  title: string;
  summary: string;
  content: string;
  thumbnailUrl: string | null;
  thumbnailColor: string;
  tags: string[];
  selectedSeries: Series | undefined;
  episodeNumber: string;
  fontSizeClass: string;
}

/** エディタ内のリアルタイムプレビュー表示コンポーネント */
export const ArticleEditorPreview = ({
  title,
  summary,
  content,
  thumbnailUrl,
  thumbnailColor,
  tags,
  selectedSeries,
  episodeNumber,
  fontSizeClass,
}: ArticleEditorPreviewProps) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 animate-in fade-in duration-200">
      {thumbnailUrl ? (
        <div className="w-full bg-gray-50 dark:bg-gray-900" style={{ aspectRatio: "16/9" }}>
          <img
            src={thumbnailUrl}
            alt={title || "サムネイルプレビュー"}
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div
          className={`w-full flex items-center justify-center ${getThumbnailColor(thumbnailColor).bg}`}
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
            {episodeNumber && (
              <span className="text-xs text-gray-500 dark:text-gray-400">第{episodeNumber}話</span>
            )}
          </div>
        )}

        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
          {title || <span className="text-gray-500 dark:text-gray-400">（タイトル未入力）</span>}
        </h2>

        {summary && (
          <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-xl text-gray-700 dark:text-gray-300 border border-blue-100 dark:border-blue-800/50 font-medium text-sm leading-relaxed">
            {summary}
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
          {content && content !== "<p></p>" ? (
            <div
              className={`text-gray-800 dark:text-gray-200 leading-loose article-content ${fontSizeClass}`}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
            />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
              （本文がまだ入力されていません）
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
