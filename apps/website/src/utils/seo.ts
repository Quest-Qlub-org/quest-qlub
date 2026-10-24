/**
 * SEO & OGP メタタグ管理ユーティリティ
 */

export interface MetaTagsOptions {
  title?: string;
  description?: string;
  image?: string | null;
  url?: string;
  type?: "website" | "article" | "profile";
  twitterCard?: "summary" | "summary_large_image";
  author?: string;
  publishedTime?: string;
  jsonLd?: Record<string, any> | Array<Record<string, any>>;
  noindex?: boolean;
}

export const DEFAULT_META = {
  title: "Quest Qlub | 学びの「楽しい！」をつなげる",
  description:
    "Quest Qlubは、学びの「楽しい！」をつなげる記事プラットフォームです。ライターと読者をつなぎ、知識と好奇心を共有します。",
  url: "https://quest-qlub.vercel.app/",
  image: "https://quest-qlub.vercel.app/ogp.png",
  type: "website" as const,
  twitterCard: "summary_large_image" as const,
};

function setOrCreateMeta(attrName: "name" | "property", attrValue: string, content: string): void {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attrName}="${attrValue}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attrName, attrValue);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setOrCreateLink(rel: string, href: string): void {
  let element = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

/**
 * ページごとのメタタグ・OGP・JSON-LD を更新する
 */
export function updateMetaTags(options: MetaTagsOptions): void {
  if (typeof document === "undefined") return;

  const fullTitle = options.title
    ? options.title.startsWith("Quest Qlub | ") ||
      options.title.endsWith(" | Quest Qlub") ||
      options.title === "Quest Qlub"
      ? options.title
      : `${options.title} | Quest Qlub`
    : DEFAULT_META.title;

  const description = options.description ?? DEFAULT_META.description;
  const url =
    options.url ?? (typeof window !== "undefined" ? window.location.href : DEFAULT_META.url);
  const image = options.image || DEFAULT_META.image;
  const type = options.type ?? DEFAULT_META.type;
  const twitterCard = options.twitterCard ?? DEFAULT_META.twitterCard;

  // Title
  document.title = fullTitle;

  // Robots
  const robotsContent = options.noindex ? "noindex, nofollow" : "index, follow";
  setOrCreateMeta("name", "robots", robotsContent);

  // Standard Meta
  setOrCreateMeta("name", "description", description);
  setOrCreateLink("canonical", url);

  // Open Graph
  setOrCreateMeta("property", "og:title", fullTitle);
  setOrCreateMeta("property", "og:description", description);
  setOrCreateMeta("property", "og:url", url);
  setOrCreateMeta("property", "og:image", image);
  setOrCreateMeta("property", "og:type", type);
  setOrCreateMeta("property", "og:site_name", "Quest Qlub");

  // Twitter Cards
  setOrCreateMeta("name", "twitter:card", twitterCard);
  setOrCreateMeta("name", "twitter:title", fullTitle);
  setOrCreateMeta("name", "twitter:description", description);
  setOrCreateMeta("name", "twitter:image", image);

  // JSON-LD 構造化データ
  let jsonLdScript = document.getElementById("structured-data-json-ld");
  if (options.jsonLd) {
    if (!jsonLdScript) {
      jsonLdScript = document.createElement("script");
      jsonLdScript.id = "structured-data-json-ld";
      jsonLdScript.setAttribute("type", "application/ld+json");
      document.head.appendChild(jsonLdScript);
    }
    jsonLdScript.textContent = JSON.stringify(options.jsonLd);
  } else if (jsonLdScript) {
    jsonLdScript.remove();
  }
}

/**
 * デフォルトのメタタグに戻す
 */
export function resetMetaTags(): void {
  updateMetaTags({});
}

/**
 * サイト内検索 (SearchAction) を含む WebSite 構造化データ
 */
export function generateWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Quest Qlub",
    url: "https://quest-qlub.vercel.app/",
    description: "学びの「楽しい！」をつなげる記事プラットフォーム",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://quest-qlub.vercel.app/search?q={search_term}",
      },
      "query-input": "required name=search_term",
    },
  };
}

/**
 * 組織情報 (Organization) 構造化データ
 */
export function generateOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Quest Qlub",
    url: "https://quest-qlub.vercel.app/",
    logo: "https://quest-qlub.vercel.app/brand_logo.jpg",
    description: "学びの「楽しい！」をつなげる記事プラットフォーム",
  };
}

/**
 * トップページ用の構造化データ（WebSite + Organization）
 */
export function generateHomeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [generateWebSiteJsonLd(), generateOrganizationJsonLd()],
  };
}

/**
 * 記事詳細用の JSON-LD 構造化データを生成
 */
export function generateArticleJsonLd({
  title,
  description,
  url,
  image,
  authorName,
  datePublished,
}: {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  authorName?: string;
  datePublished?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: description,
    url: url,
    image: image ? [image] : [DEFAULT_META.image],
    datePublished: datePublished || new Date().toISOString(),
    author: {
      "@type": "Person",
      name: authorName || "Quest Qlub Writer",
    },
    publisher: {
      "@type": "Organization",
      name: "Quest Qlub",
      logo: {
        "@type": "ImageObject",
        url: "https://quest-qlub.vercel.app/brand_logo.jpg",
      },
    },
  };
}
