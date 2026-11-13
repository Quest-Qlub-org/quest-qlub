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
  return raw.replace(/\/$/, "");
}

export function getSupabaseConfig(): { url: string; key: string } {
  return {
    url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, ""),
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
  if (!trimmed) return false;
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
