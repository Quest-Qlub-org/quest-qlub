import {
  BOT_USER_AGENTS,
  fetchWithTimeout,
  getSiteUrl,
  getSupabaseConfig,
  isBotUserAgent,
  isSafeImageUrl,
  renderOgpHtml,
  sendOgpHtmlResponse,
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

  res.setHeader("Vary", "User-Agent");

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

      const response = await fetchWithTimeout(
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

  const html = renderOgpHtml({
    title,
    description,
    ogType: "profile",
    twitterCard,
    canonicalUrl: writerUrl,
    directUrl: directWriterUrl,
    imageUrl,
    found: profileFound,
    fallbackLinkLabel: "プロフィールを見る",
  });

  return sendOgpHtmlResponse(res, html, profileFound);
}
