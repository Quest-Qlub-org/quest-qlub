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
  twitterCreator?: string;
  jsonLd?: Record<string, any> | Array<Record<string, any>>;
  noindex?: boolean;
}

export interface BreadcrumbItem {
  name: string;
  url?: string;
}

export function getSiteUrl(): string {
  const raw = (import.meta.env?.VITE_SITE_URL as string | undefined)?.trim();
  return (raw || "https://quest-qlub.vercel.app").replace(/\/+$/, "");
}

/**
 * 任意のパスや URL を本番正規ドメイン基準・クエリパラメータなしの Canonical URL に変換する
 */
export function toCanonicalUrl(pathOrUrl?: string): string {
  const base = getSiteUrl();
  const raw =
    pathOrUrl !== undefined && pathOrUrl !== ""
      ? pathOrUrl
      : typeof window !== "undefined"
        ? window.location.pathname
        : "/";

  try {
    const parsed = new URL(raw, base);
    return `${base}${parsed.pathname || "/"}`;
  } catch {
    return `${base}/`;
  }
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

function removeMeta(attrName: "name" | "property", attrValue: string): void {
  const element = document.querySelector<HTMLMetaElement>(`meta[${attrName}="${attrValue}"]`);
  if (element) {
    element.remove();
  }
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

function formatPageTitle(title?: string): string {
  if (!title) return DEFAULT_META.title;
  if (
    title === "Quest Qlub" ||
    title.startsWith("Quest Qlub | ") ||
    title.startsWith("Quest Qlub - ") ||
    title.endsWith(" | Quest Qlub") ||
    title.endsWith(" - Quest Qlub")
  ) {
    return title;
  }
  return `${title} | Quest Qlub`;
}

/**
 * ページごとのメタタグ・OGP・JSON-LD を更新する
 */
export function updateMetaTags(options: MetaTagsOptions): void {
  if (typeof document === "undefined") return;

  const fullTitle = formatPageTitle(options.title);

  const description = options.description ?? DEFAULT_META.description;
  const url = toCanonicalUrl(options.url);
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

  if (options.author) {
    setOrCreateMeta("name", "author", options.author);
    setOrCreateMeta("property", "article:author", options.author);
  } else {
    setOrCreateMeta("name", "author", "Quest Qlub");
    removeMeta("property", "article:author");
  }

  if (options.publishedTime) {
    setOrCreateMeta("property", "article:published_time", options.publishedTime);
  } else {
    removeMeta("property", "article:published_time");
  }

  // Open Graph
  setOrCreateMeta("property", "og:title", fullTitle);
  setOrCreateMeta("property", "og:description", description);
  setOrCreateMeta("property", "og:url", url);
  setOrCreateMeta("property", "og:image", image);
  setOrCreateMeta("property", "og:type", type);
  setOrCreateMeta("property", "og:site_name", "Quest Qlub");

  // Twitter Cards
  setOrCreateMeta("name", "twitter:card", twitterCard);
  setOrCreateMeta("name", "twitter:site", "@QuestQlub");
  const cleanCreator = options.twitterCreator?.replace(/^@/, "").trim();
  if (cleanCreator) {
    setOrCreateMeta("name", "twitter:creator", `@${cleanCreator}`);
  } else {
    removeMeta("name", "twitter:creator");
  }
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
  authorUrl,
  datePublished,
  dateModified,
}: {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  authorName?: string;
  authorUrl?: string;
  datePublished?: string;
  dateModified?: string;
}) {
  const canonicalUrl = toCanonicalUrl(url);
  const published = datePublished || new Date().toISOString();
  const modified = dateModified || published;
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    headline: title,
    description: description,
    url: canonicalUrl,
    image: image ? [image] : [`${siteUrl}/ogp.png`],
    datePublished: published,
    dateModified: modified,
    author: {
      "@type": "Person",
      name: authorName || "Quest Qlub Writer",
      ...(authorUrl ? { url: toCanonicalUrl(authorUrl) } : {}),
    },
    publisher: {
      "@type": "Organization",
      name: "Quest Qlub",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/brand_logo.jpg`,
      },
    },
  };
}

/**
 * パンくずリスト (BreadcrumbList) 構造化データを生成
 */
export function generateBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: toCanonicalUrl(item.url) } : {}),
    })),
  };
}

/**
 * ライタープロフィール (ProfilePage + Person) 構造化データを生成
 */
export function generateProfileJsonLd({
  name,
  url,
  image,
  description,
  xAccount,
}: {
  name: string;
  url: string;
  image?: string | null;
  description?: string | null;
  xAccount?: string | null;
}) {
  const canonicalUrl = toCanonicalUrl(url);
  const cleanX = xAccount ? xAccount.replace(/^@/, "").trim() : "";

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: canonicalUrl,
    mainEntity: {
      "@type": "Person",
      name,
      url: canonicalUrl,
      ...(image ? { image } : {}),
      ...(description ? { description } : {}),
      ...(cleanX ? { sameAs: [`https://x.com/${encodeURIComponent(cleanX)}`] } : {}),
    },
  };
}
