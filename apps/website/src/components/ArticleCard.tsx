import type { Article } from "../types";
import { useApp } from "../context/AppContext";
import { getThumbnailColor } from "../types";
import { LogoIcon, CustomUserIcon, CustomStarIcon } from "./icons/NavIcons";
import { formatArticleDate } from "../utils/date";

export const ArticleCard = ({
  article,
  layout = "horizontal",
}: {
  article: Article;
  layout?: "horizontal" | "vertical";
}) => {
  const { writers, favorites, navigate } = useApp();
  const writer = writers.find((w) => w.id === article.writerId);
  const isFav = favorites.includes(article.id);
  const color = getThumbnailColor(article.thumbnailColor ?? null);
  const formattedDate = formatArticleDate(article.createdAt);

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700/80 overflow-hidden cursor-pointer active:scale-[0.98] transition-all hover:border-gray-300 dark:hover:border-gray-600 ${
        layout === "horizontal" ? "flex h-28" : "flex flex-col w-full h-full"
      }`}
      onClick={() => navigate("article", article.id)}
    >
      {article.thumbnailUrl ? (
        <div
          className={`${
            layout === "horizontal"
              ? "w-1/3 min-w-[110px] max-w-[130px] h-full"
              : "w-full max-h-44 md:max-h-48"
          } overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center shrink-0`}
          style={layout !== "horizontal" ? { aspectRatio: "16/9" } : {}}
        >
          <img
            src={article.thumbnailUrl}
            alt={article.title}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div
          className={`${color.bg} ${
            layout === "horizontal"
              ? "w-1/3 min-w-[110px] max-w-[130px] h-full"
              : "w-full max-h-44 md:max-h-48"
          } flex items-center justify-center shrink-0`}
          style={layout !== "horizontal" ? { aspectRatio: "16/9" } : {}}
        >
          <LogoIcon className="w-10 h-10 opacity-40" />
        </div>
      )}
      <div
        className={`p-3 flex flex-col justify-between ${
          layout === "horizontal" ? "flex-1 min-w-0" : "w-full flex-1"
        }`}
      >
        <h3 className="font-bold text-gray-800 dark:text-gray-100 line-clamp-2 text-sm md:text-base leading-snug">
          {article.title}
        </h3>
        <div className="flex items-center justify-between mt-2 pt-1">
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1 truncate">
              <CustomUserIcon className="w-4 h-4 shrink-0" />{" "}
              <span className="truncate">
                {writer?.display_name ?? (writer?.username ? `@${writer.username}` : "名称未設定")}
              </span>
            </span>
            {formattedDate && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 select-none">
                {formattedDate}
              </span>
            )}
          </div>
          <CustomStarIcon className="w-5 h-5 shrink-0" active={isFav} />
        </div>
      </div>
    </div>
  );
};
