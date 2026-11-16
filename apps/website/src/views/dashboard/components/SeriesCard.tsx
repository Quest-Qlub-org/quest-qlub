import { Plus, X } from "lucide-react";
import { CollaboratorSelect } from "../../../components/CollaboratorSelect";
import { ARTICLE_STATUS_CONFIG } from "../../../types";
import type { Article, ArticleStatus, Series } from "../../../types";

export interface SeriesCardProps {
  series: Series;
  seriesArticles: Article[];
  unassignedArticles: Article[];
  isEditing: boolean;
  expanded: boolean;
  updating: boolean;
  currentUserId: string | undefined;
  isEditor: boolean;
  editTitle: string;
  onChangeEditTitle: (value: string) => void;
  editDesc: string;
  onChangeEditDesc: (value: string) => void;
  editCollaboratorIds: string[];
  onChangeEditCollaboratorIds: (ids: string[]) => void;
  onStartEdit: (series: Series) => void;
  onCancelEdit: () => void;
  onSaveEdit: (seriesId: string) => void;
  onDelete: (seriesId: string, title: string) => void;
  onToggleExpand: () => void;
  episodeInputs: Record<string, string>;
  onChangeEpisodeInput: (articleId: string, value: string) => void;
  onClearEpisodeInput: (articleId: string) => void;
  onUpdateEpisodeNumber: (articleId: string, nextVal: string) => void;
  onRemoveArticleFromSeries: (articleId: string) => void;
  addingArticleId: string;
  onChangeAddingArticleId: (articleId: string) => void;
  onAddArticleToSeries: (seriesId: string, maxEpisodeNumber: number) => void;
  onNavigateEditArticle: (articleId: string) => void;
}

/** 連載管理画面の個別連載カード（閲覧・編集・記事紐付け） */
export const SeriesCard = ({
  series,
  seriesArticles,
  unassignedArticles,
  isEditing,
  expanded,
  updating,
  currentUserId,
  isEditor,
  editTitle,
  onChangeEditTitle,
  editDesc,
  onChangeEditDesc,
  editCollaboratorIds,
  onChangeEditCollaboratorIds,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleExpand,
  episodeInputs,
  onChangeEpisodeInput,
  onClearEpisodeInput,
  onUpdateEpisodeNumber,
  onRemoveArticleFromSeries,
  addingArticleId,
  onChangeAddingArticleId,
  onAddArticleToSeries,
  onNavigateEditArticle,
}: SeriesCardProps) => {
  const isOwner = series.writerId === currentUserId;
  const canManageCollaborators = isOwner || isEditor;
  const canDelete = isOwner || isEditor;
  const isCollaborator = !isOwner && Boolean(series.collaboratorIds?.includes(currentUserId ?? ""));

  if (isEditing) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-blue-300 dark:border-blue-700 p-4 space-y-3">
        <h3 className="font-bold text-sm text-blue-600 dark:text-blue-400">連載を編集</h3>
        <div>
          <label htmlFor={`edit-series-title-${series.id}`} className="sr-only">
            連載名（必須）
          </label>
          <input
            id={`edit-series-title-${series.id}`}
            required
            aria-required="true"
            data-testid="edit-series-title"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-bold"
            placeholder="連載名を編集 *"
            value={editTitle}
            onChange={(e) => onChangeEditTitle(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`edit-series-desc-${series.id}`} className="sr-only">
            連載の説明（任意）
          </label>
          <textarea
            id={`edit-series-desc-${series.id}`}
            data-testid="edit-series-desc"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            placeholder="連載の説明（任意）"
            rows={2}
            value={editDesc}
            onChange={(e) => onChangeEditDesc(e.target.value)}
          />
        </div>
        {canManageCollaborators ? (
          <CollaboratorSelect
            value={editCollaboratorIds}
            onChange={onChangeEditCollaboratorIds}
            excludeUserIds={Array.from(
              new Set([
                ...(series.writerId ? [series.writerId] : []),
                ...(currentUserId ? [currentUserId] : []),
              ]),
            )}
            label="共同編集者"
          />
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            共同編集者の設定は主作成者または編集長のみ変更できます。
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancelEdit}
            disabled={updating}
            className="px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSaveEdit(series.id)}
            disabled={updating}
            className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {updating ? "保存中..." : "変更を保存"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 dark:text-gray-100 break-words">{series.title}</p>
            {isCollaborator && (
              <span
                data-testid="collaborator-series-badge"
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
              >
                共同編集
              </span>
            )}
          </div>
          {series.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 break-words">
              {series.description}
            </p>
          )}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`series-articles-panel-${series.id}`}
            onClick={onToggleExpand}
            className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-1 flex items-center gap-1"
          >
            {seriesArticles.length}件の記事
            <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onStartEdit(series)}
            className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-bold"
          >
            編集
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(series.id, series.title)}
              className="text-red-400 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-sm font-bold"
            >
              削除
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div
          id={`series-articles-panel-${series.id}`}
          className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 px-4 py-3 space-y-2.5"
        >
          {seriesArticles.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
              この連載にはまだ記事がありません
            </p>
          ) : (
            seriesArticles.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400">#</span>
                  <input
                    type="number"
                    min={1}
                    aria-label={`${a.title}の話数`}
                    data-testid={`episode-input-${a.id}`}
                    value={
                      episodeInputs[a.id] ??
                      (a.episodeNumber != null ? String(a.episodeNumber) : "")
                    }
                    onChange={(e) => onChangeEpisodeInput(a.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const nextVal = e.target.value;
                      const currentVal = a.episodeNumber != null ? String(a.episodeNumber) : "";
                      if (nextVal !== currentVal) {
                        onUpdateEpisodeNumber(a.id, nextVal);
                      } else if (a.id in episodeInputs) {
                        onClearEpisodeInput(a.id);
                      }
                    }}
                    className="w-12 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded px-1.5 py-0.5 text-xs text-center text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {a.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {ARTICLE_STATUS_CONFIG[a.status as ArticleStatus]?.label ?? a.status}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                  <button
                    onClick={() => onNavigateEditArticle(a.id)}
                    className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold"
                  >
                    記事編集
                  </button>
                  <button
                    type="button"
                    data-testid={`remove-from-series-${a.id}`}
                    onClick={() => onRemoveArticleFromSeries(a.id)}
                    title="この連載から外す"
                    aria-label={`${a.title}をこの連載から外す`}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}

          {unassignedArticles.length > 0 && (
            <div className="pt-2 border-t border-gray-200/70 dark:border-gray-700 flex flex-col sm:flex-row gap-2">
              <label htmlFor={`add-article-select-${series.id}`} className="sr-only">
                連載に追加する記事を選択
              </label>
              <select
                id={`add-article-select-${series.id}`}
                data-testid={`add-article-select-${series.id}`}
                value={addingArticleId}
                onChange={(e) => onChangeAddingArticleId(e.target.value)}
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
              >
                <option value="">＋ 既存の単発記事をこの連載に追加...</option>
                {unassignedArticles.map((ua) => (
                  <option key={ua.id} value={ua.id}>
                    {ua.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid={`add-article-btn-${series.id}`}
                disabled={!addingArticleId}
                onClick={() => {
                  const maxEp = seriesArticles.reduce(
                    (max, item) => Math.max(max, item.episodeNumber ?? 0),
                    0,
                  );
                  onAddArticleToSeries(series.id, maxEp);
                }}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 inline-flex items-center justify-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> 追加
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
