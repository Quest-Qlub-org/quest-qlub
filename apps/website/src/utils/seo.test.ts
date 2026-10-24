// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vite-plus/test";
import {
  updateMetaTags,
  resetMetaTags,
  generateArticleJsonLd,
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

  it("generates and mounts JSON-LD structured data", () => {
    const jsonLd = generateArticleJsonLd({
      title: "テスト記事",
      description: "説明文",
      url: "https://quest-qlub.vercel.app/articles/abc",
      authorName: "山田太郎",
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
    expect(parsed.author.name).toBe("山田太郎");
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
