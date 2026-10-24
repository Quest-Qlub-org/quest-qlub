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

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  return { url, key };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
    return d.toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

interface StaticPage {
  loc: string;
  changefreq: string;
  priority: string;
}

function getStaticPages(siteUrl: string): StaticPage[] {
  return [
    { loc: `${siteUrl}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${siteUrl}/writers`, changefreq: "weekly", priority: "0.8" },
    { loc: `${siteUrl}/search`, changefreq: "weekly", priority: "0.7" },
    { loc: `${siteUrl}/about`, changefreq: "monthly", priority: "0.5" },
    { loc: `${siteUrl}/contact`, changefreq: "monthly", priority: "0.5" },
    { loc: `${siteUrl}/writer-apply`, changefreq: "monthly", priority: "0.5" },
    { loc: `${siteUrl}/terms`, changefreq: "yearly", priority: "0.3" },
    { loc: `${siteUrl}/privacy`, changefreq: "yearly", priority: "0.3" },
  ];
}

interface DbArticle {
  id: string;
  created_at?: string | null;
  scheduled_at?: string | null;
}

interface DbProfile {
  username?: string | null;
  created_at?: string | null;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const siteUrl = getSiteUrl();
  const nowMs = Date.now();
  let articles: DbArticle[] = [];
  let writers: DbProfile[] = [];

  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

  if (supabaseUrl && supabaseAnonKey) {
    try {
      // 1. 公開記事を取得 (scheduled_at カラムが存在する場合)
      let articlesRes = await fetch(
        `${supabaseUrl}/rest/v1/articles?status=eq.published&select=id,created_at,scheduled_at&order=created_at.desc&limit=5000`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        },
      );

      // スキーマドリフト耐性: scheduled_at カラム未適用環境 (400 Bad Request / 42703) の自動フォールバック
      if (!articlesRes.ok) {
        articlesRes = await fetch(
          `${supabaseUrl}/rest/v1/articles?status=eq.published&select=id,created_at&order=created_at.desc&limit=5000`,
          {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
          },
        );
      }

      if (articlesRes.ok) {
        const data = await articlesRes.json();
        if (Array.isArray(data)) {
          // 未来の公開予約記事は sitemap.xml に含めない（未公開コンテンツの漏洩および未来日 lastmod エラー防止）
          articles = data.filter((a) => {
            if (!a || !a.id) return false;
            if (a.scheduled_at) {
              const targetMs = new Date(a.scheduled_at).getTime();
              if (!Number.isNaN(targetMs) && targetMs > nowMs) {
                return false;
              }
            }
            return true;
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch articles for sitemap", err);
    }

    try {
      // 2. ライタープロフィールを取得（role in writer,editor かつ username が存在するユーザー）
      const writersRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?role=in.(writer,editor)&username=not.is.null&select=username,created_at&order=created_at.desc&limit=5000`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        },
      );
      if (writersRes.ok) {
        const data = await writersRes.json();
        if (Array.isArray(data)) {
          writers = data.filter((w) => Boolean(w && w.username && w.username.trim()));
        }
      }
    } catch (err) {
      console.error("Failed to fetch writers for sitemap", err);
    }
  }

  function getArticleLastmod(article: DbArticle): string {
    const dates: number[] = [];
    if (article.created_at) {
      const t = new Date(article.created_at).getTime();
      if (!Number.isNaN(t) && t <= nowMs) dates.push(t);
    }
    if (article.scheduled_at) {
      const t = new Date(article.scheduled_at).getTime();
      if (!Number.isNaN(t) && t <= nowMs) dates.push(t);
    }
    if (dates.length === 0) {
      return formatDate(article.scheduled_at || article.created_at);
    }
    const maxDate = Math.max(...dates);
    return new Date(maxDate).toISOString().split("T")[0];
  }

  // XML 生成
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  const seenUrls = new Set<string>();

  // 固定ページ
  const staticPages = getStaticPages(siteUrl);
  for (const page of staticPages) {
    if (seenUrls.has(page.loc)) continue;
    seenUrls.add(page.loc);
    xml += "  <url>\n";
    xml += `    <loc>${escapeXml(page.loc)}</loc>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += "  </url>\n";
  }

  // 公開記事
  for (const article of articles) {
    if (!article.id) continue;
    const loc = `${siteUrl}/articles/${encodeURIComponent(article.id)}`;
    if (seenUrls.has(loc)) continue;
    seenUrls.add(loc);
    const lastmod = getArticleLastmod(article);
    xml += "  <url>\n";
    xml += `    <loc>${escapeXml(loc)}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += "    <changefreq>weekly</changefreq>\n";
    xml += "    <priority>0.8</priority>\n";
    xml += "  </url>\n";
  }

  // ライタープロフィール
  for (const writer of writers) {
    if (!writer.username) continue;
    const cleanUsername = writer.username.replace(/^@/, "").trim();
    if (!cleanUsername) continue;
    const loc = `${siteUrl}/writers/${encodeURIComponent(cleanUsername)}`;
    if (seenUrls.has(loc)) continue;
    seenUrls.add(loc);
    const lastmod = formatDate(writer.created_at);
    xml += "  <url>\n";
    xml += `    <loc>${escapeXml(loc)}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += "    <changefreq>weekly</changefreq>\n";
    xml += "    <priority>0.6</priority>\n";
    xml += "  </url>\n";
  }

  xml += "</urlset>\n";

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
}
