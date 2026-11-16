import { Share2 } from "lucide-react";

interface ArticleShareSectionProps {
  title: string;
  writerName: string;
  articleUrl: string;
  showToast: (msg: string) => void;
}

/**
 * 記事詳細ページの SNS 共有・URL コピーボタン群。
 */
export function ArticleShareSection({
  title,
  writerName,
  articleUrl,
  showToast,
}: ArticleShareSectionProps) {
  const shareText = `${title} | ${writerName} From Quest Qlub`;

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 pt-8 pb-4 space-y-4">
      <p className="font-bold text-gray-800 dark:text-gray-200 text-center">この記事を共有</p>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        <button
          type="button"
          aria-label="Xで共有"
          onClick={() =>
            window.open(
              `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                shareText,
              )}&url=${encodeURIComponent(articleUrl)}&via=QuestQlub`,
              "_blank",
              "noopener,noreferrer",
            )
          }
          className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center hover:opacity-80 shadow-md cursor-pointer"
        >
          <span className="font-bold text-2xl">X</span>
        </button>
        <button
          type="button"
          aria-label="LINEで共有"
          onClick={() =>
            window.open(
              `https://line.me/R/msg/text/?${encodeURIComponent(`${shareText}\n${articleUrl}`)}`,
              "_blank",
              "noopener,noreferrer",
            )
          }
          className="w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center hover:opacity-80 shadow-md cursor-pointer"
        >
          <span className="font-bold text-sm">LINE</span>
        </button>
        <button
          type="button"
          aria-label="記事のリンクをコピー"
          onClick={async () => {
            try {
              if (!navigator.clipboard?.writeText) {
                throw new Error("Clipboard unavailable");
              }
              await navigator.clipboard.writeText(articleUrl);
              showToast("リンクをコピーしました");
            } catch {
              showToast("リンクのコピーに失敗しました");
            }
          }}
          className="w-14 h-14 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm cursor-pointer"
        >
          <Share2 className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
