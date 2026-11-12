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
  "bluesky",
  "cardyb",
  "mastodon",
  "threads",
  "applebot",
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

function isSafeImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  // http, https, または絶対パス（/から始まる）のみ許可し、javascript: や data: などのスキームを排除
  return /^https?:\/\/[^\s"'<>]+$/i.test(trimmed) || /^\/[^\s"'<>]+$/.test(trimmed);
}

// ユーザー名 / UUID パラメータは安全な文字のみ許可する
const WRITER_TARGET_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DbWriterOgpRow {
  display_name?: string | null;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const siteUrl = getSiteUrl();
  const rawParam = req.query.username;
  const rawTarget = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  const cleanTarget = rawTarget ? rawTarget.replace(/^@/, "").trim() : "";

  if (!cleanTarget || !WRITER_TARGET_PATTERN.test(cleanTarget)) {
    return res.redirect(302, siteUrl);
  }

  const writerUrl = `${siteUrl}/writers/${encodeURIComponent(cleanTarget)}`;
  const directWriterUrl = `${writerUrl}?direct=1`;

  // direct パラメータ付きアクセスの場合は SPA クライアントルートへ即座にリダイレクト
  if (req.query.direct) {
    return res.redirect(302, directWriterUrl);
  }

  const rawUa = req.headers["user-agent"];
  const userAgent = (Array.isArray(rawUa) ? rawUa.join(" ") : rawUa || "").toLowerCase();
  const isBot = BOT_USER_AGENTS.some((bot) => userAgent.includes(bot));

  // 人間のブラウザからのアクセスの場合は、SPAのクライアントルートへリダイレクト
  if (!isBot && !req.query.force_ogp) {
    return res.redirect(302, directWriterUrl);
  }

  let title = "Quest Qlub | 学びの「楽しい！」をつなげる";
  let description = "Quest Qlubは、学びの「楽しい！」をつなげる記事プラットフォームです。";
  let imageUrl = `${siteUrl}/ogp.png`;
  let twitterCard: "summary" | "summary_large_image" = "summary_large_image";
  let profileFound = false;

  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const encodedTarget = encodeURIComponent(cleanTarget);
      const encodedAtTarget = encodeURIComponent(`@${cleanTarget}`);
      const filter = UUID_PATTERN.test(cleanTarget)
        ? `id=eq.${encodedTarget}`
        : `or=(username.eq.${encodedTarget},username.eq.${encodedAtTarget})`;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/profiles?${filter}&select=display_name,username,bio,avatar_url&limit=1`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        },
      );

      if (response.ok) {
        const data = (await response.json()) as DbWriterOgpRow[];
        if (Array.isArray(data) && data.length > 0) {
          const profile = data[0];
          profileFound = true;

          const cleanUsername = (profile.username || cleanTarget).replace(/^@/, "").trim();
          const writerName =
            profile.display_name?.trim() || (cleanUsername ? `@${cleanUsername}` : "ライター");

          title = `${writerName}のプロフィール | Quest Qlub`;
          description = profile.bio?.trim() || `${writerName} さんのプロフィールと記事一覧です。`;

          if (isSafeImageUrl(profile.avatar_url)) {
            const trimmedImg = profile.avatar_url!.trim();
            imageUrl = trimmedImg.startsWith("/") ? `${siteUrl}${trimmedImg}` : trimmedImg;
            twitterCard = "summary";
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch writer profile for OGP", err);
    }
  }

  const robotsOrCanonicalTag = profileFound
    ? `<link rel="canonical" href="${escapeHtml(writerUrl)}">`
    : `<meta name="robots" content="noindex">`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${robotsOrCanonicalTag}

  <!-- Open Graph -->
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(writerUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:site_name" content="Quest Qlub">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <a href="${escapeHtml(directWriterUrl)}">プロフィールを見る</a>
  <script>
    if (typeof window !== "undefined" && !/(bot|spider|crawl|poker)/i.test(navigator.userAgent)) {
      window.location.replace("${escapeHtml(directWriterUrl)}");
    }
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (profileFound) {
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(html);
  }
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.status(404).send(html);
}
