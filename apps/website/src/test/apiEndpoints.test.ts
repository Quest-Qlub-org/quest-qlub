import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import {
  SUPABASE_FETCH_TIMEOUT_MS,
  buildPublishedOrDueFilter,
  escapeHtml,
  escapeXml,
  fetchWithTimeout,
  getSiteUrl,
  getSupabaseConfig,
  isBotUserAgent,
  isSafeImageUrl,
  isUndefinedColumnResponse,
  renderOgpHtml,
  sendOgpHtmlResponse,
} from "../../api/_shared";
import sitemapHandler from "../../api/sitemap";
import articleOgpHandler, { BOT_USER_AGENTS } from "../../api/article-ogp";
import writerOgpHandler, { BOT_USER_AGENTS as WRITER_BOT_USER_AGENTS } from "../../api/writer-ogp";
import robotsTxt from "../../public/robots.txt?raw";
import vercelConfig from "../../vercel.json";

declare const process: {
  env: Record<string, string | undefined>;
};

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    send(data: string) {
      this.body = data;
      return this;
    },
    redirect(statusOrUrl: number | string, url?: string) {
      if (typeof statusOrUrl === "number") {
        this.statusCode = statusOrUrl;
        this.redirectUrl = url;
      } else {
        this.statusCode = 302;
        this.redirectUrl = statusOrUrl;
      }
      return this;
    },
  };
  return res;
}

describe("api/article-ogp", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_ANON_KEY: "mock-key",
      SITE_URL: "https://quest-qlub.vercel.app",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("includes linespider/line-poker, bluesky, mastodon, threads, applebot crawlers and excludes generic line, googlebot, bingbot in BOT_USER_AGENTS (#126)", () => {
    expect(BOT_USER_AGENTS).not.toContain("line");
    expect(BOT_USER_AGENTS).toContain("linespider");
    expect(BOT_USER_AGENTS).toContain("line-poker");
    expect(BOT_USER_AGENTS).toContain("bluesky");
    expect(BOT_USER_AGENTS).toContain("cardyb");
    expect(BOT_USER_AGENTS).toContain("mastodon");
    expect(BOT_USER_AGENTS).toContain("threads");
    expect(BOT_USER_AGENTS).toContain("applebot");
    expect(BOT_USER_AGENTS).not.toContain("googlebot");
    expect(BOT_USER_AGENTS).not.toContain("bingbot");
    expect(WRITER_BOT_USER_AGENTS).toEqual(BOT_USER_AGENTS);
  });

  it("redirects LINE in-app browser users to SPA instead of serving OGP HTML (#126)", async () => {
    const req: any = {
      query: { id: "article-line-webview" },
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.1.0",
      },
    };
    const res = createMockRes();

    await articleOgpHandler(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toBe(
      "https://quest-qlub.vercel.app/articles/article-line-webview?direct=1",
    );
  });

  it("redirects normal browser user agents to SPA article route with direct parameter", async () => {
    const req: any = {
      query: { id: "article-123" },
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
      },
    };
    const res = createMockRes();

    await articleOgpHandler(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toBe("https://quest-qlub.vercel.app/articles/article-123?direct=1");
  });

  it("redirects immediately to SPA when direct query parameter is present", async () => {
    const req: any = {
      query: { id: "article-123", direct: "1" },
      headers: {
        "user-agent": "line-poker/1.0",
      },
    };
    const res = createMockRes();

    await articleOgpHandler(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toBe("https://quest-qlub.vercel.app/articles/article-123?direct=1");
  });

  it("renders CSP-safe OGP HTML for bot crawlers with meta refresh and direct fallback link without inline script (#143)", async () => {
    const req: any = {
      query: { id: "article-123" },
      headers: {
        "user-agent": "facebookexternalhit/1.1;line-poker/1.0",
      },
    };
    const res = createMockRes();

    const mockArticle = [
      {
        title: "LINEシェア確認記事",
        summary: "LINEで綺麗にプレビューされるかテスト",
        thumbnail_url: "https://example.com/line-thumb.png",
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockArticle,
      }),
    );

    await articleOgpHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["vary"]).toBe("User-Agent");
    expect(res.headers["cache-control"]).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(res.body).toContain("<title>LINEシェア確認記事 | Quest Qlub</title>");
    expect(res.body).toContain(
      '<meta property="og:title" content="LINEシェア確認記事 | Quest Qlub">',
    );
    expect(res.body).toContain(
      '<meta property="og:image" content="https://example.com/line-thumb.png">',
    );
    expect(res.body).toContain(
      '<meta http-equiv="refresh" content="0;url=https://quest-qlub.vercel.app/articles/article-123?direct=1">',
    );
    // Human fallback direct link without inline script (CSP script-src 'self' compatible)
    expect(res.body).toContain(
      'href="https://quest-qlub.vercel.app/articles/article-123?direct=1"',
    );
    expect(res.body).not.toMatch(/<script\b/i);
  });

  it("normalizes SITE_URL with trailing slash in OGP output", async () => {
    process.env.SITE_URL = "https://quest-qlub.vercel.app/";
    const req: any = {
      query: { id: "article-456" },
      headers: {
        "user-agent": "twitterbot/1.0",
      },
    };
    const res = createMockRes();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ title: "テスト記事", summary: "概要" }],
      }),
    );

    await articleOgpHandler(req, res);

    expect(res.body).toContain('content="https://quest-qlub.vercel.app/articles/article-456"');
    expect(res.body).not.toContain("https://quest-qlub.vercel.app//articles");
  });

  it("does not leak metadata for future scheduled articles (security: prevents premature info disclosure)", async () => {
    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString(); // 2日後
    const req: any = {
      query: { id: "article-future" },
      headers: {
        "user-agent": "twitterbot/1.0",
      },
    };
    const res = createMockRes();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            title: "極秘の未来記事タイトル",
            summary: "まだ公開してはいけない極秘要約",
            thumbnail_url: "https://example.com/secret.png",
            scheduled_at: futureDate,
          },
        ],
      }),
    );

    await articleOgpHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(res.body).toContain('<meta name="robots" content="noindex">');
    // 未来の記事内容は一切漏洩せず、サイト標準のタイトル・サマリー・画像にフォールバックすること
    expect(res.body).not.toContain("極秘の未来記事タイトル");
    expect(res.body).not.toContain("まだ公開してはいけない極秘要約");
    expect(res.body).not.toContain("https://example.com/secret.png");
    expect(res.body).toContain("<title>Quest Qlub | 学びの「楽しい！」をつなげる</title>");
    expect(res.body).toContain(
      '<meta property="og:description" content="Quest Qlubは、学びの「楽しい！」をつなげる記事プラットフォームです。">',
    );
    expect(res.body).toContain(
      '<meta property="og:image" content="https://quest-qlub.vercel.app/ogp.png">',
    );
  });

  it("returns 404 with noindex and no-store cache-control for non-existent articles (#102)", async () => {
    const req: any = {
      query: { id: "missing-article" },
      headers: {
        "user-agent": "twitterbot/1.0",
      },
    };
    const res = createMockRes();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );

    await articleOgpHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(res.body).toContain('<meta name="robots" content="noindex">');
    expect(res.body).not.toContain('<link rel="canonical"');
  });

  it("displays article metadata for already reached scheduled articles", async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1日前
    const req: any = {
      query: { id: "article-published-sched" },
      headers: {
        "user-agent": "twitterbot/1.0",
      },
    };
    const res = createMockRes();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            title: "公開済み予約記事",
            summary: "既に公開日を迎えた記事の概要",
            thumbnail_url: "https://example.com/thumb.png",
            scheduled_at: pastDate,
          },
        ],
      }),
    );

    await articleOgpHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>公開済み予約記事 | Quest Qlub</title>");
    expect(res.body).toContain(
      '<meta property="og:description" content="既に公開日を迎えた記事の概要">',
    );
    expect(res.body).toContain(
      '<meta property="og:image" content="https://example.com/thumb.png">',
    );
  });

  it("handles schema drift gracefully when scheduled_at column does not exist in DB (HTTP 400 fallback)", async () => {
    const req: any = {
      query: { id: "article-drift" },
      headers: {
        "user-agent": "twitterbot/1.0",
      },
    };
    const res = createMockRes();

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      // 最初の scheduled_at カラム付きリクエストは 400 Bad Request（カラム未存在）
      if (url.includes("scheduled_at")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            code: "42703",
            message: "column articles.scheduled_at does not exist",
          }),
        };
      }
      // フォールバックのクエリは成功
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            title: "スキーマドリフト環境の記事",
            summary: "安全にフォールバックして取得された概要",
            thumbnail_url: "https://example.com/drift.png",
          },
        ],
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await articleOgpHandler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>スキーマドリフト環境の記事 | Quest Qlub</title>");
    expect(res.body).toContain(
      '<meta property="og:description" content="安全にフォールバックして取得された概要">',
    );
  });

  it("rejects unsafe thumbnail_url schemes like javascript: and falls back to default ogp.png", async () => {
    const req: any = {
      query: { id: "article-unsafe-img" },
      headers: {
        "user-agent": "twitterbot/1.0",
      },
    };
    const res = createMockRes();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            title: "安全な記事",
            summary: "画像に不正スキームが含まれる記事",
            thumbnail_url: "javascript:alert(1)",
          },
        ],
      }),
    );

    await articleOgpHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("javascript:alert(1)");
    expect(res.body).toContain(
      '<meta property="og:image" content="https://quest-qlub.vercel.app/ogp.png">',
    );
  });
});

describe("api/sitemap", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_ANON_KEY: "mock-key",
      SITE_URL: "https://quest-qlub.vercel.app",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("generates sitemap.xml with static pages and dynamic published articles and writers", async () => {
    const req: any = { query: {}, headers: {} };
    const res = createMockRes();

    const mockArticles = [
      { id: "art-1", created_at: "2026-10-20T10:00:00Z" },
      { id: "art-2", scheduled_at: "2026-10-22T12:00:00Z", created_at: "2026-10-19T10:00:00Z" },
    ];
    const mockProfiles = [
      { username: "alice", created_at: "2026-10-15T08:00:00Z" },
      { username: "@bob", created_at: "2026-10-16T09:00:00Z" },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/rest/v1/articles?")) {
          return Promise.resolve({
            ok: true,
            json: async () => mockArticles,
          });
        }
        if (url.includes("/rest/v1/profiles?")) {
          return Promise.resolve({
            ok: true,
            json: async () => mockProfiles,
          });
        }
        return Promise.resolve({ ok: false, json: async () => [] });
      }),
    );

    await sitemapHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/xml; charset=utf-8");
    expect(res.body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(res.body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

    // Static pages (/search is excluded per #102)
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writers</loc>");
    expect(res.body).not.toContain("<loc>https://quest-qlub.vercel.app/search</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/about</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/contact</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writer-apply</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/terms</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/privacy</loc>");

    // Dynamic articles
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/articles/art-1</loc>");
    expect(res.body).toContain("<lastmod>2026-10-20</lastmod>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/articles/art-2</loc>");
    expect(res.body).toContain("<lastmod>2026-10-22</lastmod>");

    // Dynamic writers
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writers/alice</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writers/bob</loc>");
  });

  it("handles schema drift gracefully when scheduled_at column does not exist (HTTP 400 fallback)", async () => {
    const req: any = { query: {}, headers: {} };
    const res = createMockRes();

    const fallbackArticles = [{ id: "art-legacy-1", created_at: "2026-10-18T05:00:00Z" }];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        // First query with scheduled_at fails with 400 (42703 column does not exist)
        if (url.includes("scheduled_at")) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({
              code: "42703",
              message: "column articles.scheduled_at does not exist",
            }),
          });
        }
        // Second query without scheduled_at succeeds
        if (url.includes("/rest/v1/articles?") && url.includes("select=id,created_at,updated_at")) {
          return Promise.resolve({
            ok: true,
            json: async () => fallbackArticles,
          });
        }
        if (url.includes("profiles?role=in.(writer,editor)")) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          });
        }
        return Promise.resolve({ ok: false, json: async () => [] });
      }),
    );

    await sitemapHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/articles/art-legacy-1</loc>");
    expect(res.body).toContain("<lastmod>2026-10-18</lastmod>");
  });

  it("filters out future scheduled articles and prevents duplicate entries", async () => {
    const req: any = { query: {}, headers: {} };
    const res = createMockRes();

    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString(); // 5 days in the future
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    const mockArticles = [
      { id: "art-future", scheduled_at: futureDate, created_at: pastDate },
      { id: "art-visible", scheduled_at: pastDate, created_at: pastDate },
      { id: "art-visible", scheduled_at: pastDate, created_at: pastDate }, // Duplicate ID
    ];

    const mockProfiles = [
      { username: "sameuser", created_at: pastDate },
      { username: "sameuser", created_at: pastDate }, // Duplicate username
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/rest/v1/articles?")) {
          return Promise.resolve({
            ok: true,
            json: async () => mockArticles,
          });
        }
        if (url.includes("/rest/v1/profiles?")) {
          return Promise.resolve({
            ok: true,
            json: async () => mockProfiles,
          });
        }
        return Promise.resolve({ ok: false, json: async () => [] });
      }),
    );

    await sitemapHandler(req, res);

    expect(res.statusCode).toBe(200);
    // Future article must NOT be present
    expect(res.body).not.toContain("art-future");
    // Visible article must be present exactly once
    const matchesArticle = res.body.match(/articles\/art-visible/g);
    expect(matchesArticle?.length).toBe(1);
    // Duplicate writer must be present exactly once
    const matchesWriter = res.body.match(/writers\/sameuser/g);
    expect(matchesWriter?.length).toBe(1);
  });

  it("includes multi-role writers and editors from profiles.roles even when primary role is viewer or engineer (#95)", async () => {
    const req: any = { query: {}, headers: {} };
    const res = createMockRes();

    const mockProfiles = [
      {
        username: "multi_writer",
        created_at: "2026-10-15T08:00:00Z",
        role: "viewer",
        roles: ["viewer", "writer"],
      },
      {
        username: "eng_editor",
        created_at: "2026-10-16T08:00:00Z",
        role: "engineer",
        roles: ["engineer", "editor"],
      },
      {
        username: "legacy_writer",
        created_at: "2026-10-17T08:00:00Z",
        role: "writer",
        roles: [],
      },
      {
        username: "viewer_only",
        created_at: "2026-10-18T08:00:00Z",
        role: "viewer",
        roles: ["viewer"],
      },
    ];

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/rest/v1/articles?")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes("/rest/v1/profiles?") && url.includes("roles.cs.")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockProfiles,
        });
      }
      return Promise.resolve({ ok: false, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sitemapHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writers/multi_writer</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writers/eng_editor</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writers/legacy_writer</loc>");
    expect(res.body).not.toContain("<loc>https://quest-qlub.vercel.app/writers/viewer_only</loc>");
  });

  it("falls back to single role query when profiles.roles column does not exist (42703 schema drift, #95)", async () => {
    const req: any = { query: {}, headers: {} };
    const res = createMockRes();

    const fallbackProfiles = [
      {
        username: "fallback_writer",
        created_at: "2026-10-15T08:00:00Z",
        role: "writer",
      },
    ];

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/rest/v1/articles?")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes("/rest/v1/profiles?") && url.includes("roles")) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            code: "42703",
            message: "column profiles.roles does not exist",
          }),
        });
      }
      if (url.includes("profiles?role=in.(writer,editor)")) {
        return Promise.resolve({
          ok: true,
          json: async () => fallbackProfiles,
        });
      }
      return Promise.resolve({ ok: false, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sitemapHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writers/fallback_writer</loc>");
  });

  it("uses updated_at for article <lastmod> when newer than created_at and scheduled_at (#103)", async () => {
    const req: any = { query: {}, headers: {} };
    const res = createMockRes();

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const mockArticles = [
      {
        id: "art-updated",
        created_at: "2026-10-10T10:00:00Z",
        scheduled_at: "2026-10-12T10:00:00Z",
        updated_at: "2026-10-25T15:30:00Z",
      },
      {
        id: "art-sched-newer",
        created_at: "2026-10-10T10:00:00Z",
        scheduled_at: "2026-10-20T10:00:00Z",
        updated_at: "2026-10-15T10:00:00Z",
      },
      {
        id: "art-future-updated",
        created_at: "2026-10-18T10:00:00Z",
        updated_at: futureDate,
      },
    ];

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/rest/v1/articles?") && url.includes("updated_at")) {
        return Promise.resolve({ ok: true, json: async () => mockArticles });
      }
      if (url.includes("/rest/v1/profiles?")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: false, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sitemapHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(
      "<loc>https://quest-qlub.vercel.app/articles/art-updated</loc>\n    <lastmod>2026-10-25</lastmod>",
    );
    expect(res.body).toContain(
      "<loc>https://quest-qlub.vercel.app/articles/art-sched-newer</loc>\n    <lastmod>2026-10-20</lastmod>",
    );
    expect(res.body).toContain(
      "<loc>https://quest-qlub.vercel.app/articles/art-future-updated</loc>\n    <lastmod>2026-10-18</lastmod>",
    );
  });

  it("keeps updated_at when falling back from missing scheduled_at column (#103)", async () => {
    const req: any = { query: {}, headers: {} };
    const res = createMockRes();

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/rest/v1/articles?") && url.includes("scheduled_at")) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            code: "42703",
            message: "column articles.scheduled_at does not exist",
          }),
        });
      }
      if (url.includes("/rest/v1/articles?") && url.includes("updated_at")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: "art-prod-updated",
              created_at: "2026-10-10T10:00:00Z",
              updated_at: "2026-10-28T12:00:00Z",
            },
          ],
        });
      }
      if (url.includes("/rest/v1/profiles?")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: false, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sitemapHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(
      "<loc>https://quest-qlub.vercel.app/articles/art-prod-updated</loc>\n    <lastmod>2026-10-28</lastmod>",
    );
  });

  it("queries due scheduled articles (status=scheduled & scheduled_at <= now) in sitemap (#126)", async () => {
    const req: any = { query: {}, headers: {} };
    const res = createMockRes();

    let capturedArticleUrl = "";
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/rest/v1/articles?")) {
        capturedArticleUrl = url;
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: "art-due-sched",
              created_at: "2026-10-10T10:00:00Z",
              scheduled_at: "2026-10-12T10:00:00Z",
            },
          ],
        });
      }
      if (url.includes("/rest/v1/profiles?")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: false, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sitemapHandler(req, res);

    expect(capturedArticleUrl).toContain("status.eq.scheduled");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/articles/art-due-sched</loc>");
  });
});

describe("public/robots.txt", () => {
  it("disallows parameterized search URLs (/search?*) while keeping sitemap reference (#102)", () => {
    expect(robotsTxt).toContain("Disallow: /search?*");
    expect(robotsTxt).toContain("Sitemap: https://quest-qlub.vercel.app/sitemap.xml");
  });
});

describe("api/writer-ogp", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_ANON_KEY: "mock-key",
      SITE_URL: "https://quest-qlub.vercel.app",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("redirects normal browser user agents to SPA writer profile route with direct parameter (#97)", async () => {
    const req: any = {
      query: { username: "alice" },
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
      },
    };
    const res = createMockRes();

    await writerOgpHandler(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toBe("https://quest-qlub.vercel.app/writers/alice?direct=1");
  });

  it("renders profile OGP HTML for social bots including Bluesky, Mastodon, and Applebot (#97)", async () => {
    const botAgents = [
      "Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)",
      "http.rb/5.1.1 (Mastodon/4.2.0; +https://mastodon.social/)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1)",
    ];

    for (const ua of botAgents) {
      const req: any = {
        query: { username: "@alice" },
        headers: { "user-agent": ua },
      };
      const res = createMockRes();

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => [
            {
              display_name: "アリス",
              username: "alice",
              bio: "記事を書いています。",
              avatar_url: "https://example.com/alice.png",
            },
          ],
        }),
      );

      await writerOgpHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(res.headers["cache-control"]).toBe(
        "public, s-maxage=3600, stale-while-revalidate=86400",
      );
      expect(res.body).toContain("<title>アリスのプロフィール | Quest Qlub</title>");
      expect(res.body).toContain('<meta property="og:type" content="profile">');
      expect(res.body).toContain(
        '<meta property="og:title" content="アリスのプロフィール | Quest Qlub">',
      );
      expect(res.body).toContain('<meta property="og:description" content="記事を書いています。">');
      expect(res.body).toContain(
        '<meta property="og:image" content="https://example.com/alice.png">',
      );
      expect(res.body).toContain(
        '<link rel="canonical" href="https://quest-qlub.vercel.app/writers/alice">',
      );
      expect(res.body).toContain('content="https://quest-qlub.vercel.app/writers/alice"');
    }
  });

  it("escapes XSS payloads in display_name/bio and rejects unsafe avatar_url schemes (#97)", async () => {
    const req: any = {
      query: { username: "xssuser" },
      headers: { "user-agent": "twitterbot/1.0" },
    };
    const res = createMockRes();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            display_name: 'Bob<script>alert("x")</script>',
            username: "xssuser",
            bio: 'Bio with "quotes" & <tags>',
            avatar_url: "javascript:alert(1)",
          },
        ],
      }),
    );

    await writerOgpHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("<script>alert");
    expect(res.body).not.toContain("javascript:alert(1)");
    expect(res.body).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(res.body).toContain(
      '<meta property="og:image" content="https://quest-qlub.vercel.app/ogp.png">',
    );
  });

  it("returns 404 with noindex and no-store cache-control when writer profile is not found (#97)", async () => {
    const req: any = {
      query: { username: "unknown-writer" },
      headers: { "user-agent": "twitterbot/1.0" },
    };
    const res = createMockRes();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );

    await writerOgpHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(res.body).toContain('<meta name="robots" content="noindex">');
    expect(res.body).not.toContain('<link rel="canonical"');
  });

  it("redirects to site root when username parameter is invalid (#97)", async () => {
    const req: any = {
      query: { username: "../etc/passwd" },
      headers: { "user-agent": "twitterbot/1.0" },
    };
    const res = createMockRes();

    await writerOgpHandler(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toBe("https://quest-qlub.vercel.app");
  });
});

describe("vercel.json routing config", () => {
  it("configures bot rewrites for /articles/:id and /writers/:username including Bluesky/Mastodon/Threads/Applebot (#97)", () => {
    const articleRewrite = vercelConfig.rewrites.find((r: any) => r.source === "/articles/:id");
    const writerRewrite = vercelConfig.rewrites.find((r: any) => r.source === "/writers/:username");

    expect(articleRewrite).toBeDefined();
    expect(writerRewrite).toBeDefined();
    expect(writerRewrite?.destination).toBe("/api/writer-ogp?username=:username");

    for (const rewrite of [articleRewrite, writerRewrite]) {
      const uaRule = rewrite?.has?.find((h: any) => h.key === "user-agent");
      expect(uaRule?.value).toContain("linespider");
      expect(uaRule?.value).toContain("line-poker");
      expect(uaRule?.value).not.toContain("|line|");
      expect(uaRule?.value).toContain("bluesky");
      expect(uaRule?.value).toContain("mastodon");
      expect(uaRule?.value).toContain("threads");
      expect(uaRule?.value).toContain("applebot");
    }
  });

  it("configures X-Robots-Tag: noindex, nofollow for non-production preview hosts (#104)", () => {
    const previewNoindexRule = vercelConfig.headers.find(
      (rule: any) =>
        Array.isArray(rule.headers) &&
        rule.headers.some((h: any) => h.key === "X-Robots-Tag" && h.value === "noindex, nofollow"),
    );

    expect(previewNoindexRule).toBeDefined();
    expect(previewNoindexRule?.source).toBe("/(.*)");
    expect(previewNoindexRule?.missing).toEqual([
      {
        type: "host",
        value: "^quest-qlub\\.vercel\\.app$",
      },
    ]);
  });

  it("enforces CSP script-src 'self' without unsafe-inline and OGP HTML stays CSP-compliant (#143)", async () => {
    const globalSecurityRule = vercelConfig.headers.find(
      (rule: any) =>
        rule.source === "/(.*)" &&
        !rule.missing &&
        Array.isArray(rule.headers) &&
        rule.headers.some((h: any) => h.key === "Content-Security-Policy"),
    );
    const cspHeader = globalSecurityRule?.headers?.find(
      (h: any) => h.key === "Content-Security-Policy",
    )?.value;

    expect(cspHeader).toBeDefined();
    expect(cspHeader).toContain("script-src 'self'");
    const scriptSrcDirective = cspHeader
      ?.split(";")
      .map((s: string) => s.trim())
      .find((s: string) => s.startsWith("script-src"));
    expect(scriptSrcDirective).toBe("script-src 'self'");
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'");

    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_ANON_KEY: "mock-key",
      SITE_URL: "https://quest-qlub.vercel.app",
    };

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => [],
        }),
      );

      for (const [handler, query] of [
        [articleOgpHandler, { id: "missing-article" }],
        [writerOgpHandler, { username: "missing-writer" }],
      ] as const) {
        const res = createMockRes();
        await handler({ query: { ...query }, headers: { "user-agent": "twitterbot/1.0" } }, res);
        expect(res.body).not.toMatch(/<script\b/i);
        expect(res.body).not.toMatch(/\son[a-z]+\s*=/i);
        expect(res.body).toContain('<meta http-equiv="refresh"');
      }
    } finally {
      process.env = originalEnv;
      vi.restoreAllMocks();
    }
  });
});

describe("api/_shared utilities (#143)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("normalizes SITE_URL and Supabase config from env variables with fallbacks", () => {
    delete process.env.SITE_URL;
    delete process.env.VITE_SITE_URL;
    expect(getSiteUrl()).toBe("https://quest-qlub.vercel.app");

    process.env.VITE_SITE_URL = "https://preview.example.com///";
    expect(getSiteUrl()).toBe("https://preview.example.com");

    process.env.SITE_URL = "https://custom.example.com/";
    expect(getSiteUrl()).toBe("https://custom.example.com");

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_URL = "https://vite.supabase.co/";
    process.env.VITE_SUPABASE_ANON_KEY = "vite-anon";
    expect(getSupabaseConfig()).toEqual({
      url: "https://vite.supabase.co",
      key: "vite-anon",
    });

    process.env.SUPABASE_URL = "https://srv.supabase.co/";
    process.env.SUPABASE_ANON_KEY = "srv-anon";
    expect(getSupabaseConfig()).toEqual({
      url: "https://srv.supabase.co",
      key: "srv-anon",
    });
  });

  it("escapes HTML and XML special characters", () => {
    expect(escapeHtml(`<a title="x" data-x='y'>&</a>`)).toBe(
      "&lt;a title=&quot;x&quot; data-x=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
    expect(escapeXml(`<url attr="a" single='b'>&</url>`)).toBe(
      "&lt;url attr=&quot;a&quot; single=&apos;b&apos;&gt;&amp;&lt;/url&gt;",
    );
  });

  it("validates safe image URLs and rejects unsafe schemes, protocol-relative URLs, and newlines", () => {
    expect(isSafeImageUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isSafeImageUrl("http://cdn.example.com/a.png")).toBe(true);
    expect(isSafeImageUrl("/ogp.png")).toBe(true);
    expect(isSafeImageUrl("  /images/cover.webp  ")).toBe(true);

    expect(isSafeImageUrl(null)).toBe(false);
    expect(isSafeImageUrl("")).toBe(false);
    expect(isSafeImageUrl("   ")).toBe(false);
    expect(isSafeImageUrl("//evil.example.com/x.png")).toBe(false);
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("data:image/svg+xml,<svg/>")).toBe(false);
    expect(isSafeImageUrl("/ogp.png\nInjected: header")).toBe(false);
  });

  it("detects bot user agents case-insensitively without matching LINE WebView", () => {
    expect(isBotUserAgent("Twitterbot/1.0")).toBe(true);
    expect(isBotUserAgent("Line-Poker/1.0")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 ... Safari Line/14.1.0")).toBe(false);
    expect(isBotUserAgent("Googlebot/2.1")).toBe(false);
  });

  it("builds PostgREST published-or-due filter with URI-encoded timestamp", () => {
    expect(buildPublishedOrDueFilter("2026-11-16T10:00:00.000Z")).toBe(
      "or=(status.eq.published,and(status.eq.scheduled,scheduled_at.lte.2026-11-16T10%3A00%3A00.000Z))",
    );
  });

  it("identifies only HTTP 400 PostgREST undefined-column (42703) responses (#143)", async () => {
    expect(await isUndefinedColumnResponse({ ok: true, status: 200 })).toBe(false);
    expect(
      await isUndefinedColumnResponse({
        ok: false,
        status: 500,
        json: async () => ({ code: "42703", message: "column x does not exist" }),
      }),
    ).toBe(false);
    expect(
      await isUndefinedColumnResponse({
        ok: false,
        status: 429,
        json: async () => ({ message: "Too many requests" }),
      }),
    ).toBe(false);
    expect(
      await isUndefinedColumnResponse({
        ok: false,
        status: 400,
        json: async () => ({ code: "22P02", message: "invalid input syntax for type uuid" }),
      }),
    ).toBe(false);
    expect(
      await isUndefinedColumnResponse({
        ok: false,
        status: 400,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      }),
    ).toBe(false);
    expect(
      await isUndefinedColumnResponse({
        ok: false,
        status: 400,
        json: async () => ({
          code: "42703",
          message: "column articles.scheduled_at does not exist",
        }),
      }),
    ).toBe(true);
    expect(
      await isUndefinedColumnResponse({
        ok: false,
        status: 400,
        json: async () => ({ message: "column profiles.roles does not exist" }),
      }),
    ).toBe(true);
  });

  it("attaches an AbortSignal timeout in fetchWithTimeout and respects caller-supplied signal (#143)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("https://mock.supabase.co/rest/v1/articles", {
      headers: { apikey: "k" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({ apikey: "k" });
    expect(SUPABASE_FETCH_TIMEOUT_MS).toBe(5000);

    const customController = new AbortController();
    await fetchWithTimeout("https://mock.supabase.co/rest/v1/articles", {
      signal: customController.signal,
    });
    expect(fetchMock.mock.calls[1][1].signal).toBe(customController.signal);
  });

  it("renders escaped CSP-safe OGP HTML and sends response with Vary: User-Agent (#143)", () => {
    const html = renderOgpHtml({
      title: 'Title <script>"xss"</script>',
      description: "Desc & 'quote'",
      ogType: "article",
      twitterCard: "summary_large_image",
      canonicalUrl: "https://quest-qlub.vercel.app/articles/a1",
      directUrl: "https://quest-qlub.vercel.app/articles/a1?direct=1",
      imageUrl: "https://quest-qlub.vercel.app/ogp.png",
      found: true,
      fallbackLinkLabel: "記事を読む",
    });

    expect(html).not.toMatch(/<script\b/i);
    expect(html).toContain("&lt;script&gt;&quot;xss&quot;&lt;/script&gt;");
    expect(html).toContain("Desc &amp; &#39;quote&#39;");
    expect(html).toContain(
      '<meta http-equiv="refresh" content="0;url=https://quest-qlub.vercel.app/articles/a1?direct=1">',
    );

    const resOk = createMockRes();
    sendOgpHtmlResponse(resOk, html, true);
    expect(resOk.statusCode).toBe(200);
    expect(resOk.headers["vary"]).toBe("User-Agent");
    expect(resOk.headers["cache-control"]).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );

    const res404 = createMockRes();
    sendOgpHtmlResponse(res404, html, false);
    expect(res404.statusCode).toBe(404);
    expect(res404.headers["vary"]).toBe("User-Agent");
    expect(res404.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
  });
});

describe("api/article-ogp #143 hardening", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_ANON_KEY: "mock-key",
      SITE_URL: "https://quest-qlub.vercel.app",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("sets Vary: User-Agent on 302 redirect and 404 bot responses (#143)", async () => {
    const browserRes = createMockRes();
    await articleOgpHandler(
      {
        query: { id: "article-1" },
        headers: { "user-agent": "Mozilla/5.0 Chrome/120.0" },
      },
      browserRes,
    );
    expect(browserRes.statusCode).toBe(302);
    expect(browserRes.headers["vary"]).toBe("User-Agent");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );

    const bot404Res = createMockRes();
    await articleOgpHandler(
      {
        query: { id: "missing" },
        headers: { "user-agent": "twitterbot/1.0" },
      },
      bot404Res,
    );
    expect(bot404Res.statusCode).toBe(404);
    expect(bot404Res.headers["vary"]).toBe("User-Agent");
    expect(bot404Res.body).not.toMatch(/<script\b/i);
  });

  it("does NOT retry schema fallback on 5xx, 429, or non-42703 400 errors and passes AbortSignal (#143)", async () => {
    for (const errorResponse of [
      { ok: false, status: 500, json: async () => ({ message: "Internal error" }) },
      { ok: false, status: 429, json: async () => ({ message: "Rate limit exceeded" }) },
      { ok: false, status: 400, json: async () => ({ code: "22P02", message: "bad syntax" }) },
    ]) {
      const fetchMock = vi.fn().mockResolvedValue(errorResponse);
      vi.stubGlobal("fetch", fetchMock);

      const res = createMockRes();
      await articleOgpHandler(
        {
          query: { id: "article-err" },
          headers: { "user-agent": "twitterbot/1.0" },
        },
        res,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
      expect(res.statusCode).toBe(404);
      expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
      expect(res.body).toContain('<meta name="robots" content="noindex">');
    }
  });

  it("handles fetch timeout/rejection gracefully and escapes XSS in article fields (#143)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );

    const timeoutRes = createMockRes();
    await articleOgpHandler(
      {
        query: { id: "article-timeout" },
        headers: { "user-agent": "twitterbot/1.0" },
      },
      timeoutRes,
    );

    expect(timeoutRes.statusCode).toBe(404);
    expect(consoleSpy).toHaveBeenCalled();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            title: 'Quest Qlub <script>alert("x")</script>',
            summary: 'Summary "quoted" & <b>bold</b>',
            thumbnail_url: "/covers/1.png",
          },
        ],
      }),
    );

    const xssRes = createMockRes();
    await articleOgpHandler(
      {
        query: { id: "article-xss" },
        headers: { "user-agent": "discordbot/2.0" },
      },
      xssRes,
    );

    expect(xssRes.statusCode).toBe(200);
    expect(xssRes.body).toContain(
      "<title>Quest Qlub &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</title>",
    );
    expect(xssRes.body).not.toContain("Quest Qlub | Quest Qlub");
    expect(xssRes.body).toContain(
      '<meta property="og:image" content="https://quest-qlub.vercel.app/covers/1.png">',
    );
  });

  it("redirects invalid article IDs (path traversal / CRLF) to site root", async () => {
    const res = createMockRes();
    await articleOgpHandler(
      {
        query: { id: "../secret" },
        headers: { "user-agent": "twitterbot/1.0" },
      },
      res,
    );
    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toBe("https://quest-qlub.vercel.app");
  });
});

describe("api/writer-ogp #143 hardening", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_ANON_KEY: "mock-key",
      SITE_URL: "https://quest-qlub.vercel.app",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("sets Vary: User-Agent on 302 redirect and 200/404 bot responses without inline script (#143)", async () => {
    const browserRes = createMockRes();
    await writerOgpHandler(
      {
        query: { username: "alice" },
        headers: { "user-agent": "Mozilla/5.0 Chrome/120.0" },
      },
      browserRes,
    );
    expect(browserRes.statusCode).toBe(302);
    expect(browserRes.headers["vary"]).toBe("User-Agent");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: "",
          username: "alice",
          bio: "",
          avatar_url: null,
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const bot200Res = createMockRes();
    await writerOgpHandler(
      {
        query: { username: "alice" },
        headers: { "user-agent": "slackbot-linkexpanding/1.0" },
      },
      bot200Res,
    );

    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(bot200Res.statusCode).toBe(200);
    expect(bot200Res.headers["vary"]).toBe("User-Agent");
    expect(bot200Res.body).toContain("<title>@aliceのプロフィール | Quest Qlub</title>");
    expect(bot200Res.body).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(bot200Res.body).toContain(
      '<meta http-equiv="refresh" content="0;url=https://quest-qlub.vercel.app/writers/alice?direct=1">',
    );
    expect(bot200Res.body).toContain(
      '<a href="https://quest-qlub.vercel.app/writers/alice?direct=1">プロフィールを見る</a>',
    );
    expect(bot200Res.body).not.toMatch(/<script\b/i);
  });

  it("supports UUID writer identifiers and handles fetch errors gracefully with Vary header (#143)", async () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "DB error" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = createMockRes();
    await writerOgpHandler(
      {
        query: { username: uuid },
        headers: { "user-agent": "twitterbot/1.0" },
      },
      res,
    );

    expect(fetchMock.mock.calls[0][0]).toContain(`id=eq.${uuid}`);
    expect(res.statusCode).toBe(404);
    expect(res.headers["vary"]).toBe("User-Agent");
    expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
  });
});

describe("api/sitemap #143 hardening", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_ANON_KEY: "mock-key",
      SITE_URL: "https://quest-qlub.vercel.app",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does NOT trigger schema fallbacks on 500/429/non-42703 errors and passes AbortSignal (#143)", async () => {
    for (const errorResponse of [
      { ok: false, status: 500, json: async () => ({ message: "Server error" }) },
      { ok: false, status: 429, json: async () => ({ message: "Too many requests" }) },
      { ok: false, status: 400, json: async () => ({ code: "42501", message: "forbidden" }) },
    ]) {
      const fetchMock = vi.fn().mockResolvedValue(errorResponse);
      vi.stubGlobal("fetch", fetchMock);

      const res = createMockRes();
      await sitemapHandler({ query: {}, headers: {} }, res);

      // Exactly 1 fetch for articles + 1 fetch for profiles (no fallback retries)
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
      expect(fetchMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/</loc>");
    }
  });

  it("supports legacy article fallback when both scheduled_at and updated_at are missing (42703)", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/rest/v1/articles?") && url.includes("scheduled_at")) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            code: "42703",
            message: "column articles.scheduled_at does not exist",
          }),
        });
      }
      if (url.includes("/rest/v1/articles?") && url.includes("updated_at")) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            code: "42703",
            message: "column articles.updated_at does not exist",
          }),
        });
      }
      if (url.includes("/rest/v1/articles?")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: "legacy-only", created_at: "2026-10-01T00:00:00Z" }],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = createMockRes();
    await sitemapHandler({ query: {}, headers: {} }, res);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/articles/legacy-only</loc>");
    expect(res.body).toContain("<lastmod>2026-10-01</lastmod>");
  });
});
