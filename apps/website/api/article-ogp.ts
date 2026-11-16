import {
  BOT_USER_AGENTS,
  buildPublishedOrDueFilter,
  fetchWithTimeout,
  getSiteUrl,
  getSupabaseConfig,
  isBotUserAgent,
  isSafeImageUrl,
  isUndefinedColumnResponse,
  renderOgpHtml,
  sendOgpHtmlResponse,
  type VercelRequest,
  type VercelResponse,
} from "./_shared";

export { BOT_USER_AGENTS };

interface DbArticleOgpRow {
  title?: string | null;
  summary?: string | null;
  thumbnail_url?: string | null;
  scheduled_at?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawId = req.query.id;
  const articleId = Array.isArray(rawId) ? rawId[0] : rawId;
  const siteUrl = getSiteUrl();

  // パストラバーサル・改行・不正ID文字の検証（英数字・ハイフン・アンダースコアのみ許可）
  if (!articleId || !/^[a-zA-Z0-9_-]+$/.test(articleId)) {
    return res.redirect(302, siteUrl);
  }

  const directParam = Array.isArray(req.query.direct) ? req.query.direct[0] : req.query.direct;
  const uaHeader = req.headers["user-agent"];
  const userAgent = Array.isArray(uaHeader) ? uaHeader[0] : uaHeader || "";

  const encodedArticleId = encodeURIComponent(articleId);
  const articleUrl = `${siteUrl}/articles/${encodedArticleId}`;
  const directArticleUrl = `${articleUrl}?direct=1`;

  res.setHeader("Vary", "User-Agent");

  // 通常ブラウザや direct=1 クエリ付きアクセスは、即座に SPA 本体へ誘導
  if (directParam || !isBotUserAgent(userAgent)) {
    return res.redirect(302, directArticleUrl);
  }

  let title = "Quest Qlub | 学びの「楽しい！」をつなげる";
  let description = "Quest Qlubは、学びの「楽しい！」をつなげる記事プラットフォームです。";
  let imageUrl = `${siteUrl}/ogp.png`;
  let articleFound = false;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

  if (supabaseUrl && supabaseAnonKey) {
    try {
      // 1. 公開記事または公開予約時刻到来済み記事を取得 (scheduled_at カラムが存在する場合)
      const publishedOrDueFilter = buildPublishedOrDueFilter(nowIso);
      const authHeaders = {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      };
      let response = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/articles?id=eq.${encodedArticleId}&${publishedOrDueFilter}&select=title,summary,thumbnail_url,scheduled_at`,
        { headers: authHeaders },
      );

      // スキーマドリフト耐性: scheduled_at カラム未適用環境 (HTTP 400 / 42703) に限定して自動フォールバック
      if (await isUndefinedColumnResponse(response)) {
        response = await fetchWithTimeout(
          `${supabaseUrl}/rest/v1/articles?id=eq.${encodedArticleId}&status=eq.published&select=title,summary,thumbnail_url`,
          { headers: authHeaders },
        );
      }

      if (response.ok) {
        const data = (await response.json()) as DbArticleOgpRow[];
        if (Array.isArray(data) && data.length > 0) {
          const article = data[0];

          // セキュリティ: 公開予約日時が未来の記事は外部にメタデータを露出させない（情報漏洩防止）
          let isFutureScheduled = false;
          if (article.scheduled_at) {
            const targetMs = new Date(article.scheduled_at).getTime();
            if (!Number.isNaN(targetMs) && targetMs > nowMs) {
              isFutureScheduled = true;
            }
          }

          if (!isFutureScheduled) {
            articleFound = true;
            if (article.title) {
              title = article.title.includes("Quest Qlub")
                ? article.title
                : `${article.title} | Quest Qlub`;
            }
            if (article.summary) description = article.summary;
            if (isSafeImageUrl(article.thumbnail_url)) {
              const trimmedImg = article.thumbnail_url!.trim();
              imageUrl = trimmedImg.startsWith("/") ? `${siteUrl}${trimmedImg}` : trimmedImg;
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch article for OGP", err);
    }
  }

  const html = renderOgpHtml({
    title,
    description,
    ogType: "article",
    twitterCard: "summary_large_image",
    canonicalUrl: articleUrl,
    directUrl: directArticleUrl,
    imageUrl,
    found: articleFound,
    fallbackLinkLabel: "記事を読む",
  });

  return sendOgpHtmlResponse(res, html, articleFound);
}
