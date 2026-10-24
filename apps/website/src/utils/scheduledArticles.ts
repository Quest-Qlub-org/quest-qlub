import type { Article, ArticleStatus } from "../types";

const SCHEDULED_STORAGE_KEY = "quest_qlub_scheduled_articles_v1";

export function getLocalScheduledMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SCHEDULED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getLocalScheduledAt(articleId: string): string | null {
  if (!articleId) return null;
  const map = getLocalScheduledMap();
  return map[articleId] ?? null;
}

export function setLocalScheduledAt(articleId: string, scheduledAt: string | null): void {
  if (!articleId) return;
  try {
    const map = getLocalScheduledMap();
    if (scheduledAt) {
      map[articleId] = scheduledAt;
    } else {
      delete map[articleId];
    }
    localStorage.setItem(SCHEDULED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

/**
 * 記事に未来の公開予約日時が設定されているか判定
 */
export function isArticleScheduledFuture(
  articleOrIso: string | { status?: string; scheduledAt?: string | null } | null | undefined,
  nowMs = Date.now(),
): boolean {
  const iso = typeof articleOrIso === "string" ? articleOrIso : articleOrIso?.scheduledAt;
  if (!iso) return false;
  const targetMs = new Date(iso).getTime();
  if (Number.isNaN(targetMs)) return false;
  return targetMs > nowMs;
}

/**
 * 記事が現在時点で一般公開（公開済み、または予約日時到来済み）であるか判定
 */
export function isArticlePubliclyVisible(
  article: { status?: string; scheduledAt?: string | null } | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!article) return false;
  if (article.status === "published") {
    if (article.scheduledAt) {
      const targetMs = new Date(article.scheduledAt).getTime();
      if (!Number.isNaN(targetMs) && targetMs > nowMs) {
        return false;
      }
    }
    return true;
  }
  if (article.status === "scheduled" && article.scheduledAt) {
    const targetMs = new Date(article.scheduledAt).getTime();
    if (!Number.isNaN(targetMs) && targetMs <= nowMs) {
      return true;
    }
  }
  return false;
}

/**
 * 表示用の実効ステータスを取得（予約日時到来前なら scheduled、到来後なら published）
 */
export function getEffectiveArticleStatus(
  article: Pick<Article, "status" | "scheduledAt">,
  nowMs = Date.now(),
): ArticleStatus {
  if (article.status === "scheduled") {
    if (article.scheduledAt) {
      const targetMs = new Date(article.scheduledAt).getTime();
      if (!Number.isNaN(targetMs) && targetMs <= nowMs) {
        return "published";
      }
    }
    return "scheduled";
  }
  if (article.status === "published" && article.scheduledAt) {
    const targetMs = new Date(article.scheduledAt).getTime();
    if (!Number.isNaN(targetMs) && targetMs > nowMs) {
      return "scheduled";
    }
  }
  return article.status;
}

/**
 * ISO日時文字列を <input type="datetime-local"> 用の YYYY-MM-DDTHH:mm に変換
 */
export function toDatetimeLocalValue(isoOrLocal: string | null | undefined): string {
  if (!isoOrLocal) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(isoOrLocal)) {
    return isoOrLocal;
  }
  const d = new Date(isoOrLocal);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * 予約日時の人間向け表示フォーマット (YYYY/MM/DD HH:mm)
 */
export function formatScheduledDateTime(isoOrLocal: string | null | undefined): string {
  if (!isoOrLocal) return "";
  const d = new Date(isoOrLocal);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

/**
 * 入力文字列を安全に ISO-8601 文字列に変換（不正な日付値は null を返す）
 */
export function toSafeIsoString(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== "string" || !dateStr.trim()) return null;
  const trimmed = dateStr.trim();
  if (
    trimmed.endsWith("-") ||
    trimmed.endsWith("T") ||
    trimmed.endsWith(":") ||
    trimmed.length < 8
  ) {
    return null;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * 記事データにローカルストレージの予約日時と実効ステータスを補完
 */
export function enrichArticleWithSchedule(article: Article): Article {
  const localSched = getLocalScheduledAt(article.id);
  const scheduledAt = article.scheduledAt ?? localSched ?? null;
  return {
    ...article,
    scheduledAt,
    status: getEffectiveArticleStatus({ ...article, scheduledAt }),
  };
}
