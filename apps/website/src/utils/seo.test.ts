// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import {
  updateMetaTags,
  resetMetaTags,
  toCanonicalUrl,
  generateArticleJsonLd,
  generateBreadcrumbJsonLd,
  generateProfileJsonLd,
  generateWebSiteJsonLd,
  generateOrganizationJsonLd,
  generateHomeJsonLd,
  DEFAULT_META,
} from "./seo";

describe("seo utility", () => {
  beforeEach(() => {
    document.title = "";
    document.head.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("updates title, meta tags, and open graph tags", () => {
    updateMetaTags({
      title: "記事タイトル",
      description: "記事の説明文です",
      image: "https://example.com/thumbnail.png",
      url: "https://quest-qlub.vercel.app/articles/123",
      type: "article",
    });

    expect(document.title).toBe("記事タイトル | Quest Qlub");

    const descMeta = document.querySelector('meta[name="description"]')?.getAttribute("content");
    expect(descMeta).toBe("記事の説明文です");

    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
    expect(ogTitle).toBe("記事タイトル | Quest Qlub");

    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
    expect(ogImage).toBe("https://example.com/thumbnail.png");

    const twitterCard = document
      .querySelector('meta[name="twitter:card"]')
      ?.getAttribute("content");
    expect(twitterCard).toBe("summary_large_image");

    const robotsMeta = document.querySelector('meta[name="robots"]')?.getAttribute("content");
    expect(robotsMeta).toBe("index, follow");
  });

  it("resets meta tags to default", () => {
    updateMetaTags({ title: "個別記事" });
    expect(document.title).toBe("個別記事 | Quest Qlub");

    resetMetaTags();
    expect(document.title).toBe(DEFAULT_META.title);
    const robotsMeta = document.querySelector('meta[name="robots"]')?.getAttribute("content");
    expect(robotsMeta).toBe("index, follow");
  });

  it("handles title formatting without duplicating Quest Qlub suffix", () => {
    updateMetaTags({ title: "Quest Qlub | 学びの「楽しい！」をつなげる" });
    expect(document.title).toBe("Quest Qlub | 学びの「楽しい！」をつなげる");

    updateMetaTags({ title: "Quest Qlubについて" });
    expect(document.title).toBe("Quest Qlubについて | Quest Qlub");

    updateMetaTags({ title: "既にあるタイトル | Quest Qlub" });
    expect(document.title).toBe("既にあるタイトル | Quest Qlub");

    updateMetaTags({ title: "オフライン - Quest Qlub" });
    expect(document.title).toBe("オフライン - Quest Qlub");

    updateMetaTags({ title: "Quest Qlub - サブページ" });
    expect(document.title).toBe("Quest Qlub - サブページ");
  });

  it("sets author, article:author, article:published_time, twitter:site, and twitter:creator, and cleans them up on reset", () => {
    updateMetaTags({
      title: "著者テスト記事",
      type: "article",
      author: "田中花子",
      publishedTime: "2026-11-01T10:00:00Z",
      twitterCreator: "hanako_writer",
    });

    expect(document.querySelector('meta[name="author"]')?.getAttribute("content")).toBe("田中花子");
    expect(document.querySelector('meta[property="article:author"]')?.getAttribute("content")).toBe(
      "田中花子",
    );
    expect(
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
    ).toBe("2026-11-01T10:00:00Z");
    expect(document.querySelector('meta[name="twitter:site"]')?.getAttribute("content")).toBe(
      "@QuestQlub",
    );
    expect(document.querySelector('meta[name="twitter:creator"]')?.getAttribute("content")).toBe(
      "@hanako_writer",
    );

    resetMetaTags();
    expect(document.querySelector('meta[name="author"]')?.getAttribute("content")).toBe(
      "Quest Qlub",
    );
    expect(document.querySelector('meta[property="article:author"]')).toBeNull();
    expect(document.querySelector('meta[property="article:published_time"]')).toBeNull();
    expect(document.querySelector('meta[name="twitter:creator"]')).toBeNull();
    expect(document.querySelector('meta[name="twitter:site"]')?.getAttribute("content")).toBe(
      "@QuestQlub",
    );
  });

  it("canonicalizes URLs to production host and strips query parameters and hashes", () => {
    expect(toCanonicalUrl("/articles/123?utm_source=x&gclid=abc#section")).toBe(
      "https://quest-qlub.vercel.app/articles/123",
    );
    expect(toCanonicalUrl("https://quest-qlub-git-feat.vercel.app/writers/alice?ref=share")).toBe(
      "https://quest-qlub.vercel.app/writers/alice",
    );
    expect(toCanonicalUrl("http://localhost:5173/")).toBe("https://quest-qlub.vercel.app/");

    vi.stubEnv("VITE_SITE_URL", "https://custom.questqlub.example/");
    expect(toCanonicalUrl("/about?utm_medium=social")).toBe(
      "https://custom.questqlub.example/about",
    );
  });

  it("strips query params and preview origin in canonical and og:url during updateMetaTags", () => {
    updateMetaTags({
      title: "テスト",
      url: "https://preview-branch.vercel.app/articles/999?utm_source=line",
    });

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://quest-qlub.vercel.app/articles/999",
    );
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(
      "https://quest-qlub.vercel.app/articles/999",
    );
  });

  it("controls robots meta tag with noindex option", () => {
    updateMetaTags({
      title: "ログイン",
      noindex: true,
    });

    let robotsMeta = document.querySelector('meta[name="robots"]')?.getAttribute("content");
    expect(robotsMeta).toBe("noindex, nofollow");

    // Switching to another page without noindex restores index, follow
    updateMetaTags({
      title: "公開ページ",
      noindex: false,
    });
    robotsMeta = document.querySelector('meta[name="robots"]')?.getAttribute("content");
    expect(robotsMeta).toBe("index, follow");
  });

  it("generates and mounts JSON-LD structured data for Article with mainEntityOfPage, dateModified, and author.url", () => {
    const jsonLd = generateArticleJsonLd({
      title: "テスト記事",
      description: "説明文",
      url: "/articles/abc",
      authorName: "山田太郎",
      authorUrl: "/writers/yamada",
      datePublished: "2026-10-01T00:00:00Z",
      dateModified: "2026-10-05T12:00:00Z",
    });

    updateMetaTags({
      title: "テスト記事",
      jsonLd,
    });

    const script = document.getElementById("structured-data-json-ld");
    expect(script).not.toBeNull();
    const parsed = JSON.parse(script?.textContent || "{}");
    expect(parsed["@type"]).toBe("Article");
    expect(parsed.headline).toBe("テスト記事");
    expect(parsed.url).toBe("https://quest-qlub.vercel.app/articles/abc");
    expect(parsed.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": "https://quest-qlub.vercel.app/articles/abc",
    });
    expect(parsed.datePublished).toBe("2026-10-01T00:00:00Z");
    expect(parsed.dateModified).toBe("2026-10-05T12:00:00Z");
    expect(parsed.author).toEqual({
      "@type": "Person",
      name: "山田太郎",
      url: "https://quest-qlub.vercel.app/writers/yamada",
    });
  });

  it("generates BreadcrumbList JSON-LD schema", () => {
    const breadcrumb = generateBreadcrumbJsonLd([
      { name: "Quest Qlub", url: "/" },
      { name: "記事", url: "/search" },
      { name: "記事タイトル", url: "/articles/123" },
    ]);

    expect(breadcrumb["@context"]).toBe("https://schema.org");
    expect(breadcrumb["@type"]).toBe("BreadcrumbList");
    expect(breadcrumb.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Quest Qlub",
        item: "https://quest-qlub.vercel.app/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "記事",
        item: "https://quest-qlub.vercel.app/search",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "記事タイトル",
        item: "https://quest-qlub.vercel.app/articles/123",
      },
    ]);
  });

  it("generates ProfilePage + Person JSON-LD schema with x_account sameAs", () => {
    const profileLd = generateProfileJsonLd({
      name: "テストライター",
      url: "/writers/test_writer",
      image: "https://example.com/avatar.png",
      description: "自己紹介テキスト",
      xAccount: "@test_writer_x",
    });

    expect(profileLd["@context"]).toBe("https://schema.org");
    expect(profileLd["@type"]).toBe("ProfilePage");
    expect(profileLd.url).toBe("https://quest-qlub.vercel.app/writers/test_writer");
    expect(profileLd.mainEntity).toEqual({
      "@type": "Person",
      name: "テストライター",
      url: "https://quest-qlub.vercel.app/writers/test_writer",
      image: "https://example.com/avatar.png",
      description: "自己紹介テキスト",
      sameAs: ["https://x.com/test_writer_x"],
    });
  });

  it("generates WebSite and Organization JSON-LD schemas for HomeView", () => {
    const singleSite = generateWebSiteJsonLd();
    expect(singleSite["@type"]).toBe("WebSite");
    expect(singleSite.name).toBe("Quest Qlub");

    const singleOrg = generateOrganizationJsonLd();
    expect(singleOrg["@type"]).toBe("Organization");
    expect(singleOrg.name).toBe("Quest Qlub");

    const homeJsonLd = generateHomeJsonLd();
    expect(homeJsonLd["@context"]).toBe("https://schema.org");
    expect(Array.isArray(homeJsonLd["@graph"])).toBe(true);

    const siteSchema = homeJsonLd["@graph"][0] as ReturnType<typeof generateWebSiteJsonLd>;
    expect(siteSchema["@type"]).toBe("WebSite");
    expect(siteSchema.potentialAction["@type"]).toBe("SearchAction");
    expect(siteSchema.potentialAction.target.urlTemplate).toContain("/search?q={search_term}");

    const orgSchema = homeJsonLd["@graph"][1] as ReturnType<typeof generateOrganizationJsonLd>;
    expect(orgSchema["@type"]).toBe("Organization");
    expect(orgSchema.name).toBe("Quest Qlub");
    expect(orgSchema.logo).toContain("/brand_logo.jpg");
  });
});
