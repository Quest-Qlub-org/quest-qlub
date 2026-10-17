// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vite-plus/test";
import { updateMetaTags, resetMetaTags, generateArticleJsonLd, DEFAULT_META } from "./seo";

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
      url: "https://share-quest.vercel.app/articles/123",
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
  });

  it("resets meta tags to default", () => {
    updateMetaTags({ title: "個別記事" });
    expect(document.title).toBe("個別記事 | Quest Qlub");

    resetMetaTags();
    expect(document.title).toBe(DEFAULT_META.title);
  });

  it("generates and mounts JSON-LD structured data", () => {
    const jsonLd = generateArticleJsonLd({
      title: "テスト記事",
      description: "説明文",
      url: "https://share-quest.vercel.app/articles/abc",
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
});
