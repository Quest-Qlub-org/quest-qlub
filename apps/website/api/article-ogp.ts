import {
  BOT_USER_AGENTS,
  buildPublishedOrDueFilter,
  escapeHtml,
  getSiteUrl,
  getSupabaseConfig,
  isBotUserAgent,
  isSafeImageUrl,
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
      let response = await fetch(
        `${supabaseUrl}/rest/v1/articles?id=eq.${encodedArticleId}&${publishedOrDueFilter}&select=title,summary,thumbnail_url,scheduled_at`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        },
      );

      // スキーマドリフト耐性: scheduled_at カラム未適用環境 (400 Bad Request / 42703) の自動フォールバック
      if (!response.ok) {
        response = await fetch(
          `${supabaseUrl}/rest/v1/articles?id=eq.${encodedArticleId}&status=eq.published&select=title,summary,thumbnail_url`,
          {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
          },
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

  const robotsOrCanonicalTag = articleFound
    ? `<link rel="canonical" href="${escapeHtml(articleUrl)}">`
    : `<meta name="robots" content="noindex">`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${robotsOrCanonicalTag}

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(articleUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:site_name" content="Quest Qlub">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <a href="${escapeHtml(directArticleUrl)}">記事を読む</a>
  <script>
    if (typeof window !== "undefined" && !/(bot|spider|crawl|poker)/i.test(navigator.userAgent)) {
      window.location.replace("${escapeHtml(directArticleUrl)}");
    }
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (articleFound) {
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(html);
  }
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.status(404).send(html);
}
