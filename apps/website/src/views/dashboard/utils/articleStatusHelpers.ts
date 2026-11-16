import { supabase } from "../../../supabase";
import { mapDbArticleToArticle } from "../../../types";
import type { Article } from "../../../types";
import {
  enrichArticleWithSchedule,
  isArticleScheduledFuture,
} from "../../../utils/scheduledArticles";
import { isArticleOptionalColumnSchemaError } from "../../../utils/supabaseErrors";

/**
 * プレビューモーダル表示時に本文が未取得の記事の詳細（content/summary等）を遅延取得する。
 */
export async function fetchArticlePreviewDetails(
  article: Article,
  selectFields: "*" | "content, summary" = "*",
): Promise<Article | null> {
  try {
    const query = supabase.from("articles").select(selectFields);
    if (query && typeof (query as { eq?: unknown }).eq === "function") {
      const eqQuery = query.eq("id", article.id);
      if (eqQuery && typeof (eqQuery as { maybeSingle?: unknown }).maybeSingle === "function") {
        const { data, error } = await eqQuery.maybeSingle();
        if (!error && data) {
          if (selectFields === "*") {
            const row = data as Parameters<typeof mapDbArticleToArticle>[0] &
              Record<string, unknown>;
            if (typeof row.id === "string" && typeof row.title === "string") {
              return enrichArticleWithSchedule(mapDbArticleToArticle(row));
            }
          }
          const row = data as Record<string, unknown>;
          return enrichArticleWithSchedule({
            ...article,
            content: typeof row.content === "string" ? row.content : article.content,
            summary: typeof row.summary === "string" ? row.summary : article.summary,
          });
        }
      }
    }
  } catch {
    // 既存サマリー/フィールドでプレビュー表示を継続
  }
  return null;
}

/**
 * 記事のステータス・予約日時更新を実行し、予約投稿を誤って公開しない範囲でのみ
 * scheduled_at カラム未適用エラー（42703 等）にフォールバックする。
 */
export async function updateArticleStatusSafe(
  articleId: string,
  payload: Record<string, unknown>,
  options: { isFutureSchedule?: boolean } = {},
) {
  let { error } = await supabase.from("articles").update(payload).eq("id", articleId);

  const isFuture =
    options.isFutureSchedule ??
    isArticleScheduledFuture(
      typeof payload.scheduled_at === "string" ? payload.scheduled_at : null,
    );

  if (
    error &&
    isArticleOptionalColumnSchemaError(error) &&
    !isFuture &&
    payload.status !== "scheduled" &&
    "scheduled_at" in payload
  ) {
    const { scheduled_at: _s, ...fallbackPayload } = payload;
    const retry = await supabase.from("articles").update(fallbackPayload).eq("id", articleId);
    error = retry.error;
  }

  return { error };
}
