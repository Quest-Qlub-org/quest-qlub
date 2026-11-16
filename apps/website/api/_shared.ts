export interface VercelRequest {
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => VercelResponse | void;
  redirect: (statusOrUrl: number | string, url?: string) => VercelResponse | void;
}

declare const process: {
  env: Record<string, string | undefined>;
};

export const BOT_USER_AGENTS = [
  "twitterbot",
  "facebookexternalhit",
  "facebot",
  "slackbot",
  "linkedinbot",
  "discordbot",
  "whatsapp",
  "telegrambot",
  "pinterest",
  "linespider",
  "line-poker",
  "bluesky",
  "cardyb",
  "mastodon",
  "threads",
  "applebot",
];

export function isBotUserAgent(userAgent: string): boolean {
  const lower = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => lower.includes(bot));
}

export function getSiteUrl(): string {
  const raw = process.env.SITE_URL || process.env.VITE_SITE_URL || "https://quest-qlub.vercel.app";
  return raw.replace(/\/+$/, "");
}

export function getSupabaseConfig(): { url: string; key: string } {
  return {
    url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, ""),
    key: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
  };
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes("\n") || trimmed.includes("\r")) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildPublishedOrDueFilter(nowIso: string): string {
  return `or=(status.eq.published,and(status.eq.scheduled,scheduled_at.lte.${encodeURIComponent(nowIso)}))`;
}

export const SUPABASE_FETCH_TIMEOUT_MS = 5000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS,
): Promise<Response> {
  if (init.signal) {
    return fetch(url, init);
  }
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
  if (typeof AbortController !== "undefined") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return fetch(url, init);
}

export async function isUndefinedColumnResponse(
  response: Pick<Response, "ok" | "status"> & { json?: () => Promise<unknown> },
): Promise<boolean> {
  if (response.ok || response.status !== 400) {
    return false;
  }
  if (typeof response.json !== "function") {
    return false;
  }
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown } | null;
    if (!body || typeof body !== "object") {
      return false;
    }
    if (body.code === "42703") {
      return true;
    }
    return typeof body.message === "string" && /column\s+.*\s+does not exist/i.test(body.message);
  } catch {
    return false;
  }
}

export interface OgpHtmlOptions {
  title: string;
  description: string;
  ogType: "article" | "profile";
  twitterCard: "summary" | "summary_large_image";
  canonicalUrl: string;
  directUrl: string;
  imageUrl: string;
  found: boolean;
  fallbackLinkLabel: string;
}

export function renderOgpHtml({
  title,
  description,
  ogType,
  twitterCard,
  canonicalUrl,
  directUrl,
  imageUrl,
  found,
  fallbackLinkLabel,
}: OgpHtmlOptions): string {
  const robotsOrCanonicalTag = found
    ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`
    : `<meta name="robots" content="noindex">`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${robotsOrCanonicalTag}

  <!-- Open Graph -->
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:site_name" content="Quest Qlub">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">

  <meta http-equiv="refresh" content="0;url=${escapeHtml(directUrl)}">
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <a href="${escapeHtml(directUrl)}">${escapeHtml(fallbackLinkLabel)}</a>
</body>
</html>`;
}

export function sendOgpHtmlResponse(
  res: VercelResponse,
  html: string,
  found: boolean,
): VercelResponse | void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  if (found) {
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(html);
  }
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.status(404).send(html);
}
