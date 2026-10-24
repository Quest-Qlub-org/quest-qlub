import imgRecommend from "../assets/recommend_icon.png";
import imgPopular from "../assets/popular_icon.png";
import imgTitleDetail from "../assets/brand_title_detail.png";
import { useApp } from "../context/AppContext";
import { LogoIcon } from "../components/icons/NavIcons";
import { ArticleCard } from "../components/ArticleCard";
import { ArticleCardSkeleton } from "../components/Skeleton";
import { Loader2, Users } from "lucide-react";
import { useFollows } from "../hooks/useFollows";
import { isArticlePubliclyVisible } from "../utils/scheduledArticles";

export const HomeView = () => {
  const {
    articles,
    articlesLoading,
    hasMoreArticles,
    loadingMoreArticles,
    loadMoreArticles,
    navigate,
  } = useApp();
  const { followedIds } = useFollows();

  const published = articles.filter(isArticlePubliclyVisible);
  const recommended = published.filter((a) => a.isRecommended);
  const popular = published.filter((a) => a.isPopular);
  const followedArticles = published.filter((a) => followedIds.includes(a.writerId));

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-300">
      <div className="text-center py-6 px-4 bg-blue-50 rounded-2xl border border-blue-100 relative overflow-hidden shadow-sm">
        <LogoIcon className="absolute -right-4 -bottom-4 w-28 h-28 opacity-10" />
        <img
          src={imgTitleDetail}
          alt="Quest Qlub - 学びの『楽しい！』をつなげる -"
          className="h-20 md:h-24 object-contain mx-auto mb-1"
        />
        <p className="text-xs text-blue-500 mt-1">
          実践的なナレッジや知見が集まるナレッジシェアプラットフォーム
        </p>
        <button
          onClick={() => navigate("/about")}
          className="text-xs text-blue-600 font-bold underline mt-3 hover:text-blue-800 transition-colors inline-block"
        >
          Quest Qlubとは？
        </button>
      </div>

      {/* おすすめ記事セクション */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <img src={imgRecommend} className="w-5 h-5 object-contain" alt="おすすめ" />
          <span>おすすめの記事</span>
        </h2>
        {articlesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ArticleCardSkeleton layout="vertical" />
            <ArticleCardSkeleton layout="vertical" />
            <ArticleCardSkeleton layout="vertical" />
          </div>
        ) : recommended.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">まだおすすめ記事はありません</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
            {recommended.map((article) => (
              <div key={article.id} className="min-w-[260px] snap-start md:min-w-0">
                <ArticleCard article={article} layout="vertical" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 人気記事セクション */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <img src={imgPopular} className="w-5 h-5 object-contain" alt="人気" />
          <span>人気の記事</span>
        </h2>
        {articlesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ArticleCardSkeleton />
            <ArticleCardSkeleton />
          </div>
        ) : popular.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">まだ人気記事はありません</p>
        ) : (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {popular.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </section>

      {/* フォロー中ライターの記事セクション */}
      {followedIds.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="p-1 bg-blue-100 text-blue-600 rounded-lg">
              <Users className="w-4 h-4" />
            </span>
            <span>フォロー中ライターの記事</span>
          </h2>
          {followedArticles.length === 0 ? (
            <div className="bg-white p-6 rounded-xl border border-dashed border-gray-300 text-center text-sm text-gray-400">
              フォロー中のライターの公開記事はまだありません
            </div>
          ) : (
            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
              {followedArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 記事一覧セクション（ページネーション対応） */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">新着・記事一覧</h2>
          <span className="text-xs text-gray-400 font-medium">{published.length} 件表示中</span>
        </div>

        {articlesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ArticleCardSkeleton />
            <ArticleCardSkeleton />
            <ArticleCardSkeleton />
            <ArticleCardSkeleton />
          </div>
        ) : published.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-400 text-sm font-medium">まだ公開記事はありません</p>
          </div>
        ) : (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {published.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}

        {/* Issue #24: ページネーション（さらに読み込むボタン） */}
        {!articlesLoading && hasMoreArticles && (
          <div className="text-center pt-6">
            <button
              onClick={() => void loadMoreArticles()}
              disabled={loadingMoreArticles}
              className="px-6 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-bold rounded-xl transition-all shadow-sm hover:border-gray-400 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loadingMoreArticles ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>読み込み中...</span>
                </>
              ) : (
                <span>さらに記事を読み込む</span>
              )}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
