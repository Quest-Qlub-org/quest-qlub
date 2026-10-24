import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import sitemapHandler from "../../api/sitemap";
import articleOgpHandler, { BOT_USER_AGENTS } from "../../api/article-ogp";

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

  it("includes line crawlers and excludes googlebot and bingbot in BOT_USER_AGENTS", () => {
    expect(BOT_USER_AGENTS).toContain("line");
    expect(BOT_USER_AGENTS).toContain("linespider");
    expect(BOT_USER_AGENTS).toContain("line-poker");
    expect(BOT_USER_AGENTS).not.toContain("googlebot");
    expect(BOT_USER_AGENTS).not.toContain("bingbot");
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

  it("renders OGP HTML for bot crawlers like LINE or Twitter without refresh tag and with direct fallback link", async () => {
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
    expect(res.body).toContain("<title>LINEシェア確認記事 | Quest Qlub</title>");
    expect(res.body).toContain(
      '<meta property="og:title" content="LINEシェア確認記事 | Quest Qlub">',
    );
    expect(res.body).toContain(
      '<meta property="og:image" content="https://example.com/line-thumb.png">',
    );
    expect(res.body).not.toContain('http-equiv="refresh"');
    // Human fallback direct link and script
    expect(res.body).toContain(
      'href="https://quest-qlub.vercel.app/articles/article-123?direct=1"',
    );
    expect(res.body).toContain(
      'window.location.replace("https://quest-qlub.vercel.app/articles/article-123?direct=1")',
    );
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

    expect(res.statusCode).toBe(200);
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
        if (url.includes("articles?status=eq.published")) {
          return Promise.resolve({
            ok: true,
            json: async () => mockArticles,
          });
        }
        if (url.includes("profiles?role=in.(writer,editor)")) {
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

    // Static pages
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/writers</loc>");
    expect(res.body).toContain("<loc>https://quest-qlub.vercel.app/search</loc>");
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
        if (url.includes("articles?status=eq.published&select=id,created_at")) {
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
        if (url.includes("articles?status=eq.published")) {
          return Promise.resolve({
            ok: true,
            json: async () => mockArticles,
          });
        }
        if (url.includes("profiles?role=in.(writer,editor)")) {
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
});
