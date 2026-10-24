export function ArticleCardSkeleton({
  layout = "horizontal",
}: {
  layout?: "horizontal" | "vertical";
}) {
  if (layout === "vertical") {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm animate-pulse flex flex-col h-full">
        <div className="w-full bg-gray-200 dark:bg-gray-700 aspect-video" />
        <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-full" />
            <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-5/6" />
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm animate-pulse flex gap-4">
      <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2.5">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
        <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-full" />
        <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-2/3" />
        <div className="flex items-center gap-4 pt-1">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12" />
        </div>
      </div>
    </div>
  );
}

export function WriterRowSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl m-2 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full shrink-0" />
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28" />
          <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-16" />
        </div>
      </div>
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
    </div>
  );
}
