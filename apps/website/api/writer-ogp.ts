import {
  BOT_USER_AGENTS,
  escapeHtml,
  getSiteUrl,
  getSupabaseConfig,
  isBotUserAgent,
  isSafeImageUrl,
  type VercelRequest,
  type VercelResponse,
} from "./_shared";

export { BOT_USER_AGENTS };

interface DbWriterOgpRow {
  display_name?: string | null;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawUsername = req.query.username;
  const target = Array.isArray(rawUsername) ? rawUsername[0] : rawUsername;
  const siteUrl = getSiteUrl();

  const cleanTarget = (target || "").replace(/^@/, "").trim();
  if (!cleanTarget || (!UUID_PATTERN.test(cleanTarget) && !USERNAME_PATTERN.test(cleanTarget))) {
    return res.redirect(302, siteUrl);
  }

  const directParam = Array.isArray(req.query.direct) ? req.query.direct[0] : req.query.direct;
  const uaHeader = req.headers["user-agent"];
  const userAgent = Array.isArray(uaHeader) ? uaHeader[0] : uaHeader || "";

  const encodedTarget = encodeURIComponent(cleanTarget);
  const writerUrl = `${siteUrl}/writers/${encodedTarget}`;
  const directWriterUrl = `${writerUrl}?direct=1`;

  if (directParam || !isBotUserAgent(userAgent)) {
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
