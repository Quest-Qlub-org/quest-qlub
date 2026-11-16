import { CollaboratorSelect } from "../../../components/CollaboratorSelect";

export interface CreateSeriesFormProps {
  newTitle: string;
  onChangeTitle: (value: string) => void;
  newDesc: string;
  onChangeDesc: (value: string) => void;
  newCollaboratorIds: string[];
  onChangeCollaboratorIds: (ids: string[]) => void;
  excludeUserIds: string[];
  saving: boolean;
  onCreate: () => void;
}

/** 連載新規作成フォーム */
export const CreateSeriesForm = ({
  newTitle,
  onChangeTitle,
  newDesc,
  onChangeDesc,
  newCollaboratorIds,
  onChangeCollaboratorIds,
  excludeUserIds,
  saving,
  onCreate,
}: CreateSeriesFormProps) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
      <h2 className="font-bold text-gray-800 dark:text-gray-100">新しい連載を作成</h2>
      <div>
        <label htmlFor="new-series-title" className="sr-only">
          連載名（必須）
        </label>
        <input
          id="new-series-title"
          required
          aria-required="true"
          className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="連載名 *"
          value={newTitle}
          onChange={(e) => onChangeTitle(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="new-series-desc" className="sr-only">
          連載の説明（任意）
        </label>
        <textarea
          id="new-series-desc"
          className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          placeholder="連載の説明（任意）"
          rows={3}
          value={newDesc}
          onChange={(e) => onChangeDesc(e.target.value)}
        />
      </div>
      <CollaboratorSelect
        value={newCollaboratorIds}
        onChange={onChangeCollaboratorIds}
        excludeUserIds={excludeUserIds}
        label="共同編集者（任意）"
      />
      <button
        onClick={onCreate}
        disabled={saving}
        className="w-full bg-blue-500 text-white font-bold py-3 rounded-xl hover:bg-blue-600 disabled:opacity-50"
      >
        {saving ? "作成中..." : "連載を作成"}
      </button>
    </div>
  );
};
