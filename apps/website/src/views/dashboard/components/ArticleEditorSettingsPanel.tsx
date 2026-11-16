import type React from "react";
import {
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Image as ImageIcon,
  Tag,
  Clock,
} from "lucide-react";
import { LogoIcon } from "../../../components/icons/NavIcons";
import { CollaboratorSelect } from "../../../components/CollaboratorSelect";
import { getThumbnailColor, THUMBNAIL_COLORS } from "../../../types";
import type { Article, Series } from "../../../types";

export interface ArticleEditorSettingsPanelProps {
  formTitle: string;
  onChangeTitle: (value: string) => void;
  formSummary: string;
  onChangeSummary: (value: string) => void;
  settingsExpanded: boolean;
  onToggleSettingsExpanded: () => void;
  thumbnailUrl: string | null;
  thumbnailUploading: boolean;
  onThumbnailUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearThumbnail: () => void;
  formColor: string;
  onChangeColor: (colorId: string) => void;
  canManageCollaborators: boolean;
  collaboratorIds: string[];
  onChangeCollaboratorIds: (ids: string[]) => void;
  effectiveEditingArticle: Article | null;
  currentUserId: string | null;
  tags: string[];
  tagInput: string;
  onChangeTagInput: (value: string) => void;
  onAddTag: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  formSeriesId: string;
  onChangeSeriesId: (seriesId: string) => void;
  formEpisodeNumber: string;
  onChangeEpisodeNumber: (episodeNumber: string) => void;
  seriesList: Series[];
  isEditor: boolean;
  formCommentsEnabled: boolean;
  onChangeCommentsEnabled: (enabled: boolean) => void;
  formScheduledAt: string;
  onChangeScheduledAt: (scheduledAt: string) => void;
}

/** 記事のタイトル・要約および折りたたみ詳細設定パネル */
export const ArticleEditorSettingsPanel = ({
  formTitle,
  onChangeTitle,
  formSummary,
  onChangeSummary,
  settingsExpanded,
  onToggleSettingsExpanded,
  thumbnailUrl,
  thumbnailUploading,
  onThumbnailUpload,
  onClearThumbnail,
  formColor,
  onChangeColor,
  canManageCollaborators,
  collaboratorIds,
  onChangeCollaboratorIds,
  effectiveEditingArticle,
  currentUserId,
  tags,
  tagInput,
  onChangeTagInput,
  onAddTag,
  onRemoveTag,
  formSeriesId,
  onChangeSeriesId,
  formEpisodeNumber,
  onChangeEpisodeNumber,
  seriesList,
  isEditor,
  formCommentsEnabled,
  onChangeCommentsEnabled,
  formScheduledAt,
  onChangeScheduledAt,
}: ArticleEditorSettingsPanelProps) => {
  return (
    <div className="space-y-4">
      {/* タイトル＆要約カード */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 md:p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
        <div>
          <label
            htmlFor="article-title-input"
            className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5"
          >
            記事タイトル <span className="text-red-500">*</span>
          </label>
          <input
            id="article-title-input"
            required
            aria-required="true"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-300 rounded-xl px-4 py-3 text-lg md:text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"
            placeholder="読者の目を引くタイトルを入力..."
            value={formTitle}
            onChange={(e) => onChangeTitle(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="article-summary-input"
            className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5"
          >
            リード文・要約{" "}
            <span className="text-gray-500 dark:text-gray-400 font-normal">
              （記事冒頭やSNSシェア時の説明文に表示されます）
            </span>
          </label>
          <textarea
            id="article-summary-input"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 placeholder:text-gray-500 dark:placeholder:text-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            rows={2}
            placeholder="この記事のポイントや概要を1〜2文で入力（省略可）"
            value={formSummary}
            onChange={(e) => onChangeSummary(e.target.value)}
          />
        </div>
      </div>

      {/* 折りたたみ可能な詳細設定パネル（サムネイル・タグ・連載） */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          type="button"
          aria-expanded={settingsExpanded}
          aria-controls="article-extra-settings-panel"
          onClick={onToggleSettingsExpanded}
          className="w-full px-5 py-3.5 bg-gray-50/70 dark:bg-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-gray-750 flex items-center justify-between transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
              サムネイル・タグ・連載設定
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal hidden sm:inline">
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
          <div
            id="article-extra-settings-panel"
            className="p-5 md:p-6 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* 左カラム: サムネイル設定 */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="article-thumbnail-upload"
                  className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2"
                >
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
                      alt={formTitle || "サムネイルプレビュー"}
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
                      id="article-thumbnail-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={onThumbnailUpload}
                      disabled={thumbnailUploading}
                    />
                  </label>
                  {thumbnailUrl && (
                    <button
                      type="button"
                      onClick={onClearThumbnail}
                      className="px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>

              {!thumbnailUrl && (
                <div>
                  <p
                    id="article-bg-color-label"
                    className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-2"
                  >
                    背景カラー（画像未設定時）:{" "}
                    <span className="text-gray-500 dark:text-gray-400 font-normal">
                      {getThumbnailColor(formColor).label}
                    </span>
                  </p>
                  <div
                    role="radiogroup"
                    aria-labelledby="article-bg-color-label"
                    className="flex gap-2 flex-wrap"
                  >
                    {THUMBNAIL_COLORS.map((color) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={formColor === color.id}
                        aria-label={`${color.label}を背景色に選択`}
                        key={color.id}
                        onClick={() => onChangeColor(color.id)}
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

              <div className="pt-2 border-t border-gray-100 dark:border-gray-700/60">
                {canManageCollaborators ? (
                  <CollaboratorSelect
                    value={collaboratorIds}
                    onChange={onChangeCollaboratorIds}
                    excludeUserIds={Array.from(
                      new Set([
                        ...(effectiveEditingArticle?.writerId
                          ? [effectiveEditingArticle.writerId]
                          : []),
                        ...(currentUserId ? [currentUserId] : []),
                      ]),
                    )}
                    label="共同執筆者（共同編集者）"
                    description="他のライターと共同執筆・編集できます"
                  />
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    共同執筆者の設定は主作成者または編集長のみ変更できます。
                  </p>
                )}
              </div>
            </div>

            {/* 右カラム: タグ＆連載設定 */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="article-tag-input"
                  className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2"
                >
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
                          aria-label={`タグ「${tag}」を削除`}
                          onClick={() => onRemoveTag(tag)}
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
                    id="article-tag-input"
                    className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="タグを入力（Enterまたはカンマで追加）"
                    value={tagInput}
                    onChange={(e) => onChangeTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        onAddTag(tagInput);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onAddTag(tagInput)}
                    className="px-3.5 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 shrink-0 transition-colors"
                  >
                    追加
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={formSeriesId ? "sm:col-span-2" : "sm:col-span-3"}>
                  <label
                    htmlFor="article-series-select"
                    className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5"
                  >
                    連載シリーズ
                  </label>
                  <select
                    id="article-series-select"
                    className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={formSeriesId}
                    onChange={(e) => onChangeSeriesId(e.target.value)}
                  >
                    <option value="">連載なし（単発記事）</option>
                    {seriesList
                      .filter(
                        (s) =>
                          s.writerId === currentUserId ||
                          s.collaboratorIds?.includes(currentUserId ?? "") ||
                          (effectiveEditingArticle && s.id === effectiveEditingArticle.seriesId) ||
                          isEditor,
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                  </select>
                </div>
                {formSeriesId && (
                  <div>
                    <label
                      htmlFor="article-episode-input"
                      className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5"
                    >
                      話数
                    </label>
                    <input
                      id="article-episode-input"
                      type="number"
                      min={1}
                      className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="例: 1"
                      value={formEpisodeNumber}
                      onChange={(e) => onChangeEpisodeNumber(e.target.value)}
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
                    onChange={(e) => onChangeCommentsEnabled(e.target.checked)}
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
                        onClick={() => onChangeScheduledAt("")}
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
                    onChange={(e) => onChangeScheduledAt(e.target.value)}
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
  );
};
