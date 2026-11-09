import React from "react";
import { Users, X } from "lucide-react";
import { useApp } from "../context/AppContext";

export interface CollaboratorSelectProps {
  value: string[];
  onChange: (collaboratorIds: string[]) => void;
  excludeUserIds?: string[];
  label?: string;
  description?: string;
  className?: string;
  disabled?: boolean;
}

export const CollaboratorSelect: React.FC<CollaboratorSelectProps> = ({
  value,
  onChange,
  excludeUserIds = [],
  label = "共同編集者（任意）",
  description,
  className = "",
  disabled = false,
}) => {
  const { writers } = useApp();

  const availableWriters = (writers ?? []).filter(
    (w) =>
      !excludeUserIds.includes(w.id) &&
      !value.includes(w.id) &&
      (w.role === "writer" ||
        w.role === "editor" ||
        w.roles?.includes("writer") ||
        w.roles?.includes("editor")),
  );

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (!selectedId) return;
    if (!value.includes(selectedId)) {
      onChange([...value, selectedId]);
    }
  };

  const handleRemove = (idToRemove: string) => {
    onChange(value.filter((id) => id !== idToRemove));
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
          <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span>{label}</span>
        </label>
        {description && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{description}</span>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="selected-collaborators-list">
          {value.map((collabId) => {
            const writerObj = (writers ?? []).find((w) => w.id === collabId);
            const displayName =
              writerObj?.display_name ||
              (writerObj?.username ? `@${writerObj.username}` : collabId);

            return (
              <span
                key={collabId}
                data-testid={`collaborator-badge-${collabId}`}
                className="inline-flex items-center gap-1.5 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-full pl-1.5 pr-2 py-1 text-xs font-bold shadow-2xs"
              >
                {writerObj?.avatar_url ? (
                  <img
                    src={writerObj.avatar_url}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-200 flex items-center justify-center text-[10px] uppercase">
                    {(displayName || "U")[0]}
                  </span>
                )}
                <span className="truncate max-w-[140px]">{displayName}</span>
                {!disabled && (
                  <button
                    type="button"
                    data-testid={`remove-collaborator-${collabId}`}
                    onClick={() => handleRemove(collabId)}
                    className="hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full transition-colors focus:outline-none"
                    title="共同編集者を解除"
                    aria-label="共同編集者を解除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {!disabled && (
        <div>
          <select
            data-testid="collaborator-select-input"
            value=""
            onChange={handleSelect}
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
          >
            <option value="">＋ 共同編集者を追加...</option>
            {availableWriters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.display_name || (w.username ? `@${w.username}` : w.id)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
