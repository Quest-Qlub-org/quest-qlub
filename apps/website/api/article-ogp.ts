export interface VercelRequest {
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  send(body: string): VercelResponse;
  setHeader(name: string, value: string): VercelResponse;
  redirect(status: number, url: string): VercelResponse;
}

declare const process: {
  env: Record<string, string | undefined>;
};

function getSiteUrl(): string {
  const raw = process.env.SITE_URL || "https://quest-qlub.vercel.app";
  return raw.replace(/\/+$/, "");
}

export const BOT_USER_AGENTS = [
  "twitterbot",
  "facebookexternalhit",
  "facebot",
  "slackbot",
  "linkedinbot",
  "discordbot",
  "whatsapp",
  "telegrambot",
  "pinterest",
  "line",
  "linespider",
  "line-poker",
];

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  return { url, key };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 記事IDはURLのパスに埋め込むため、安全な文字のみ許可する
const ARTICLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const siteUrl = getSiteUrl();
  const { id } = req.query;
  const articleId = Array.isArray(id) ? id[0] : id;

  if (!articleId || !ARTICLE_ID_PATTERN.test(articleId)) {
    return res.redirect(302, siteUrl);
  }

  const articleUrl = `${siteUrl}/articles/${encodeURIComponent(articleId)}`;
  const directArticleUrl = `${articleUrl}?direct=1`;

  // direct パラメータ付きアクセスの場合は SPA クライアントルートへ即座にリダイレクト
  if (req.query.direct) {
    return res.redirect(302, directArticleUrl);
  }

  const rawUa = req.headers["user-agent"];
  const userAgent = (Array.isArray(rawUa) ? rawUa.join(" ") : rawUa || "").toLowerCase();
  const isBot = BOT_USER_AGENTS.some((bot) => userAgent.includes(bot));

  // 人間のブラウザからのアクセスの場合は、SPAのクライアントルートへリダイレクト
  if (!isBot && !req.query.force_ogp) {
    return res.redirect(302, directArticleUrl);
  }

  let title = "Quest Qlub | 学びの「楽しい！」をつなげる";
  let description = "Quest Qlubは、学びの「楽しい！」をつなげる記事プラットフォームです。";
  let imageUrl = `${siteUrl}/ogp.png`;

  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/articles?id=eq.${encodeURIComponent(articleId)}&status=eq.published&select=title,summary,thumbnail_url`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const article = data[0];
          if (article.title) {
            title = article.title.includes("Quest Qlub")
              ? article.title
              : `${article.title} | Quest Qlub`;
          }
          if (article.summary) description = article.summary;
          if (article.thumbnail_url) imageUrl = article.thumbnail_url;
        }
      }
    } catch (err) {
      console.error("Failed to fetch article for OGP", err);
    }
  }

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(articleUrl)}">

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
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(html);
}
