import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { getThumbnailColor, ARTICLE_STATUS_CONFIG } from "../types";
import { mapDbArticleToArticle } from "../types";
import type { Article, ArticleStatus, Series } from "../types";
import { LogoIcon, CustomUserIcon, CustomStarIcon } from "../components/icons/NavIcons";
import {
  ChevronLeft,
  Share2,
  Eye,
  Loader2,
  UserPlus,
  UserCheck,
  Calendar,
  Check,
  Edit3,
  Clock,
} from "lucide-react";
import { sanitizeHtml } from "../utils/sanitize";
import { supabase } from "../supabase";
import type { Profile } from "../supabase";
import { ArticleComments } from "../components/ArticleComments";
import { useFollows } from "../hooks/useFollows";
import { updateMetaTags, resetMetaTags, generateArticleJsonLd } from "../utils/seo";
import { formatArticleDate } from "../utils/date";
import {
  formatScheduledDateTime,
  getEffectiveArticleStatus,
  getLocalScheduledAt,
  isArticlePubliclyVisible,
  setLocalScheduledAt,
} from "../utils/scheduledArticles";

export const ArticleView = () => {
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    articles,
    setArticles,
    writers,
    favorites,
    toggleFavorite,
    showToast,
    getFontSizeClass,
    viewParam,
    seriesList,
    userRole,
    profile,
    navigate: appNavigate,
  } = useApp();
  const { isFollowing, toggleFollow, isAuthenticated, currentUserId } = useFollows();

  const articleId = paramId || viewParam;

  // キャッシュまたは個別フェッチした記事データ
  const cachedArticle = articles.find((a) => a.id === articleId);
  const [detailedArticle, setDetailedArticle] = useState<Article | null>(
    cachedArticle && cachedArticle.content ? cachedArticle : null,
  );
  const [loading, setLoading] = useState(!cachedArticle || !cachedArticle.content);
  const [notFound, setNotFound] = useState(false);
  const [writerFallback, setWriterFallback] = useState<Profile | null>(null);
  const [seriesFallback, setSeriesFallback] = useState<Series | null>(null);

  // Issue #23: 一覧から除外された本文(content)を詳細画面で個別取得
  useEffect(() => {
    if (!articleId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let isMounted = true;

    // すでに本文がある場合はそれを使用
    if (cachedArticle?.content) {
      setDetailedArticle(cachedArticle);
      setLoading(false);
    } else {
      setDetailedArticle(null);
      setLoading(true);
    }

    const fetchFullArticle = async () => {
      try {
        const { data, error } = await supabase
          .from("articles")
          .select("*")
          .eq("id", articleId)
          .maybeSingle();

        if (!isMounted) return;

        if (error || !data) {
          if (!cachedArticle) setNotFound(true);
        } else {
          const mapped = mapDbArticleToArticle(data);
          const localSched = getLocalScheduledAt(mapped.id);
          const scheduledAt = mapped.scheduledAt ?? localSched ?? null;
          const enriched: Article = {
            ...mapped,
            scheduledAt,
            status: getEffectiveArticleStatus({ ...mapped, scheduledAt }),
          };
          setDetailedArticle(enriched);
          setNotFound(false);

          // ライター情報の単体フェッチ（writersキャッシュに無い場合のフォールバック）
          if (enriched.writerId) {
            const cachedW = writers.find((w) => w.id === enriched.writerId);
            if (!cachedW) {
              const { data: wData } = await supabase
                .from("profiles")
                .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
                .eq("id", enriched.writerId)
                .maybeSingle();
              if (isMounted && wData) {
                setWriterFallback(wData);
              }
            }
          }

          // 連載情報の単体フェッチ
          if (enriched.seriesId) {
            const cachedS = seriesList.find((s) => s.id === enriched.seriesId);
            if (!cachedS) {
              const { data: sData } = await supabase
                .from("series")
                .select("*")
                .eq("id", enriched.seriesId)
                .maybeSingle();
              if (isMounted && sData) {
                setSeriesFallback({
                  id: sData.id,
                  title: sData.title,
                  description: sData.description ?? null,
                  writerId: sData.writer_id,
                });
              }
            }
          }

          // 閲覧数インクリメント（公開済み記事のみ）
          if (enriched.status === "published") {
            try {
              await supabase.rpc("increment_views", { p_article_id: articleId });
            } catch {
              // 閲覧数インクリメントエラーは無視
            }
          }
        }
      } catch {
        if (!cachedArticle && isMounted) setNotFound(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchFullArticle();

    return () => {
      isMounted = false;
    };
  }, [articleId]);

  const rawArticle = detailedArticle || cachedArticle;
  const article = rawArticle
    ? (() => {
        const localSched = getLocalScheduledAt(rawArticle.id);
        const scheduledAt = rawArticle.scheduledAt ?? localSched ?? null;
        return {
          ...rawArticle,
          scheduledAt,
          status: getEffectiveArticleStatus({ ...rawArticle, scheduledAt }),
        };
      })()
    : undefined;

  // Issue #25 & #46: 個別記事のOGP・SEOメタタグ・JSON-LD構造化データの動的適用
  useEffect(() => {
    if (!article) return;
    const writerObj = writers.find((w) => w.id === article.writerId) || writerFallback;
    const authorName =
      writerObj?.display_name ||
      (writerObj?.username ? `@${writerObj.username}` : "Quest Qlub Writer");
    const description =
      article.summary ||
      (article.content
        ? article.content.replace(/<[^>]+>/g, "").slice(0, 120)
        : "Quest Qlubの記事です");
    const currentUrl = `${window.location.origin}/articles/${article.id}`;

    const jsonLd = generateArticleJsonLd({
      title: article.title,
      description,
      url: currentUrl,
      image: article.thumbnailUrl,
      authorName,
      datePublished: article.createdAt ?? undefined,
    });

    updateMetaTags({
      title: article.status !== "published" ? `[プレビュー] ${article.title}` : article.title,
      description,
      image: article.thumbnailUrl,
      url: currentUrl,
      type: "article",
      twitterCard: "summary_large_image",
      author: authorName,
      publishedTime: article.createdAt ?? undefined,
      jsonLd,
    });

    return () => {
      resetMetaTags();
    };
  }, [article, writers, writerFallback]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">記事を読み込んでいます...</p>
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-gray-500 text-base font-bold">記事が見つかりません</p>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors"
        >
          トップへ戻る
        </button>
      </div>
    );
  }

  const writer = writers.find((w) => w.id === article.writerId) || writerFallback;
  const isFav = favorites.includes(article.id);
  const articleUrl = `${window.location.origin}/articles/${article.id}`;
  const color = getThumbnailColor(article.thumbnailColor ?? null);
  const isAuthor = Boolean(
    (profile?.id && profile.id === article.writerId) ||
    (currentUserId && currentUserId === article.writerId),
  );
  const isEditor = userRole === "editor";

  if (!isArticlePubliclyVisible(article) && !isAuthor && !isEditor) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-gray-500 text-base font-bold">記事が見つかりません</p>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors"
        >
          トップへ戻る
        </button>
      </div>
    );
  }

  const handleQuickStatusChange = async (nextStatus: ArticleStatus) => {
    const { error } = await supabase
      .from("articles")
      .update({ status: nextStatus })
      .eq("id", article.id);
    if (!error) {
      if (nextStatus === "published" || nextStatus === "draft") {
        setLocalScheduledAt(article.id, null);
      }
      setDetailedArticle((prev) =>
        prev ? { ...prev, status: nextStatus, scheduledAt: null } : prev,
      );
      if (typeof setArticles === "function") {
        setArticles((prev) =>
          prev.map((a) =>
            a.id === article.id ? { ...a, status: nextStatus, scheduledAt: null } : a,
          ),
        );
      }
      if (nextStatus === "published") {
        showToast("記事を公開しました");
      } else if (nextStatus === "pending") {
        showToast("投稿申請しました");
      } else {
        showToast("下書きに戻しました");
      }
    } else {
      showToast("エラーが発生しました。もう一度お試しください。");
    }
  };

  return (
    <div className="animate-in slide-in-from-right-8 duration-300 bg-white min-h-screen">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b px-2 py-2 flex items-center">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100 flex items-center"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
          <span className="text-sm font-bold text-gray-600">戻る</span>
        </button>
      </div>

      {article.status !== "published" && (
        <div
          data-testid="article-preview-banner"
          className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-800 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-2 max-w-full"
        >
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-extrabold text-[10px]">
              PREVIEW
            </span>
            <span>
              【プレビュー表示中】ステータス:{" "}
              {ARTICLE_STATUS_CONFIG[article.status]?.label ?? article.status}
              （一般には公開されていません）
            </span>
            {formatScheduledDateTime(article.scheduledAt) && (
              <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" /> 公開予定:{" "}
                {formatScheduledDateTime(article.scheduledAt)}
              </span>
            )}
          </div>

          {/* プレビュー画面上でその場で操作できるアクションボタン (#54-12) */}
          {(isEditor || isAuthor) && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {(isAuthor || isEditor) && (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof appNavigate === "function") {
                      appNavigate("writerEdit", article.id);
                    } else {
                      void navigate(`/dashboard/writer/edit/${article.id}`);
                    }
                  }}
                  className="px-2.5 py-1.5 bg-white text-gray-700 border border-amber-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> 編集する
                </button>
              )}
              {isAuthor && article.status === "draft" && (
                <button
                  type="button"
                  onClick={() => void handleQuickStatusChange("pending")}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  投稿申請する
                </button>
              )}
              {isAuthor && !isEditor && article.status === "pending" && (
                <button
                  type="button"
                  data-testid="preview-banner-withdraw-btn"
                  onClick={() => void handleQuickStatusChange("draft")}
                  className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 cursor-pointer"
                >
                  申請取消
                </button>
              )}
              {isEditor && (
                <>
                  <button
                    type="button"
                    data-testid="preview-banner-approve-btn"
                    onClick={() => void handleQuickStatusChange("published")}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 inline-flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> 許可 (公開)
                  </button>
                  {article.status !== "draft" && (
                    <button
                      type="button"
                      data-testid="preview-banner-reject-btn"
                      onClick={() => void handleQuickStatusChange("draft")}
                      className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 cursor-pointer"
                    >
                      差し戻し
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 md:px-8 pt-4">
        {article.thumbnailUrl ? (
          <div className="w-full max-h-72 md:max-h-80 aspect-video rounded-2xl overflow-hidden bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto shadow-sm">
            <img
              src={article.thumbnailUrl}
              alt={article.title}
              className="w-full h-full object-contain max-h-72 md:max-h-80"
            />
          </div>
        ) : (
          <div
            className={`${color.bg} w-full max-h-64 aspect-video rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 mx-auto`}
          >
            <LogoIcon className="w-16 h-16 opacity-30" />
          </div>
        )}
      </div>

      <div className="p-4 md:p-8 space-y-5 max-w-3xl mx-auto">
        {article.seriesId &&
          (() => {
            const series = seriesList.find((s) => s.id === article.seriesId) || seriesFallback;
            if (!series) return null;
            return (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                  連載
                </span>
                <span className="text-sm font-bold text-blue-600">{series.title}</span>
                {article.episodeNumber != null && (
                  <span className="text-xs text-gray-400">第{article.episodeNumber}話</span>
                )}
              </div>
            );
          })()}

        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{article.title}</h1>

        {article.summary && (
          <div className="bg-blue-50 p-4 rounded-xl text-gray-700 border border-blue-100 font-medium">
            {article.summary}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            {formatArticleDate(article.createdAt) && (
              <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md text-xs text-gray-600">
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatArticleDate(article.createdAt)}</span>
              </span>
            )}
            <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md text-xs">
              <Eye className="w-4 h-4" /> {article.views}
            </span>
            <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md text-xs">
              <CustomStarIcon className="w-4 h-4" active={isFav} /> {article.likes}
            </span>
          </div>
          <button
            onClick={() => void toggleFavorite(article.id)}
            className={`p-2 rounded-full border shadow-sm transition-all ${
              isFav ? "bg-yellow-50 border-yellow-300 scale-110" : "bg-white border-gray-200"
            }`}
          >
            <CustomStarIcon className="w-6 h-6" active={isFav} />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(article.tags ?? []).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => navigate(`/search?tag=${encodeURIComponent(tag)}`)}
              className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors cursor-pointer"
            >
              #{tag}
            </button>
          ))}
        </div>

        {writer && (
          <div
            className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm cursor-pointer hover:bg-gray-50"
            onClick={() => navigate(`/writers/${writer.username || writer.id}`)}
          >
            <div className="flex items-center gap-3">
              <div className="bg-gray-100 p-2 rounded-full border border-gray-200">
                {writer.avatar_url ? (
                  <img
                    src={writer.avatar_url}
                    className="w-8 h-8 rounded-full object-cover"
                    alt=""
                  />
                ) : (
                  <CustomUserIcon className="w-8 h-8" />
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 font-bold mb-0.5">この記事を書いた人</p>
                <p className="font-bold text-gray-800">
                  {writer.display_name ?? (writer.username ? `@${writer.username}` : "名称未設定")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentUserId !== writer.id && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!isAuthenticated) {
                      showToast("フォローするにはログインが必要です");
                      void navigate("/login");
                      return;
                    }
                    if (currentUserId === writer.id) {
                      showToast("自分自身をフォローすることはできません");
                      return;
                    }
                    const wasFollowing = isFollowing(writer.id);
                    const ok = await toggleFollow(writer.id);
                    if (!ok) {
                      showToast("フォロー処理に失敗しました");
                      return;
                    }
                    showToast(
                      wasFollowing ? "フォローを解除しました" : "ライターをフォローしました",
                    );
                  }}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${
                    isFollowing(writer.id)
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {isFollowing(writer.id) ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>フォロー中</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>フォロー</span>
                    </>
                  )}
                </button>
              )}
              <span className="text-xs font-bold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-full hidden sm:inline-block">
                プロフィールへ
              </span>
            </div>
          </div>
        )}

        <div className={`py-4 text-gray-800 leading-loose article-content ${getFontSizeClass()}`}>
          {article.content ? (
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }} />
          ) : (
            <span className="text-gray-400 italic">本文はまだ書かれていません</span>
          )}
        </div>

        <div className="border-t pt-8 pb-4 space-y-4">
          <p className="font-bold text-gray-800 text-center">この記事を共有</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <button
              onClick={() =>
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                    `${article.title} | ${writer?.display_name ?? "Quest Qlub"} From Quest Qlub`,
                  )}&url=${encodeURIComponent(articleUrl)}&via=SHARE_Quest_Off`,
                  "_blank",
                )
              }
              className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center hover:opacity-80 shadow-md"
            >
              <span className="font-bold text-2xl">X</span>
            </button>
            <button
              onClick={() =>
                window.open(
                  `https://line.me/R/msg/text/?${encodeURIComponent(
                    `${article.title} | ${writer?.display_name ?? "Quest Qlub"} From Quest Qlub\n${articleUrl}`,
                  )}`,
                  "_blank",
                )
              }
              className="w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center hover:opacity-80 shadow-md"
            >
              <span className="font-bold text-sm">LINE</span>
            </button>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(articleUrl);
                showToast("リンクをコピーしました");
              }}
              className="w-14 h-14 bg-white border-2 border-gray-200 text-gray-600 rounded-full flex items-center justify-center hover:bg-gray-50 shadow-sm"
            >
              <Share2 className="w-6 h-6" />
            </button>
          </div>
        </div>

        <ArticleComments
          articleId={article.id}
          writerId={article.writerId}
          commentsEnabled={article.commentsEnabled !== false}
          onToggleCommentsEnabled={async (nextEnabled) => {
            const { error } = await supabase
              .from("articles")
              .update({ comments_enabled: nextEnabled })
              .eq("id", article.id);
            if (!error) {
              setDetailedArticle((prev) =>
                prev ? { ...prev, commentsEnabled: nextEnabled } : prev,
              );
              showToast(
                nextEnabled ? "コメント機能をオンにしました" : "コメント機能をオフにしました",
              );
            } else {
              if (
                (error as { code?: string; message?: string }).code === "42703" ||
                error.message?.includes("comments_enabled")
              ) {
                showToast("データベース更新準備中のため、コメント設定を変更できません");
              } else {
                showToast("コメント設定の更新に失敗しました");
              }
            }
          }}
        />
      </div>
    </div>
  );
};
