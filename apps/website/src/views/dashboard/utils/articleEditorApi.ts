import { supabase } from "../../../supabase";
import { isArticleScheduledFuture } from "../../../utils/scheduledArticles";
import { isArticleOptionalColumnSchemaError } from "../../../utils/supabaseErrors";

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface BaseArticlePayloadParams {
  title: string;
  content: string;
  summary: string;
  tags: string[];
  thumbnailColor: string;
  thumbnailUrl: string | null;
  seriesId: string;
  episodeNumber: string;
  commentsEnabled: boolean;
  scheduledAt?: string | null;
  collaboratorIds?: string[];
}

/** 記事の作成/更新・自動保存で共有するペイロードを構築する */
export function buildBaseArticlePayload(
  params: BaseArticlePayloadParams,
  includeCollaborators = true,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: params.title,
    content: params.content,
    summary: params.summary || null,
    tags: params.tags,
    thumbnail_color: params.thumbnailColor,
    thumbnail_url: params.thumbnailUrl,
    series_id: params.seriesId || null,
    episode_number: params.episodeNumber ? parseInt(params.episodeNumber, 10) : null,
    comments_enabled: params.commentsEnabled,
  };
  if (includeCollaborators) {
    payload.collaborator_ids = params.collaboratorIds ?? [];
  }
  if (params.scheduledAt !== undefined) {
    payload.scheduled_at = params.scheduledAt;
  }
  return payload;
}

/** オプショナルカラム未適用環境へのフォールバック付きで記事を更新する */
export async function updateArticleWithFallback(
  targetId: string,
  payload: Record<string, unknown>,
) {
  let { error } = await supabase.from("articles").update(payload).eq("id", targetId);
  if (error && isArticleOptionalColumnSchemaError(error)) {
    const isFuture = isArticleScheduledFuture(
      typeof payload.scheduled_at === "string" ? payload.scheduled_at : null,
    );
    if (payload.status === "scheduled" || isFuture) {
      // 予約公開カラム未適用環境で未来日時の記事を即時公開へダウングレードしない
      return { error };
    }
    const {
      comments_enabled: _c,
      scheduled_at: _s,
      collaborator_ids: _collab,
      ...safePayload
    } = payload;
    const retryRes = await supabase.from("articles").update(safePayload).eq("id", targetId);
    error = retryRes.error;
  }
  return { error };
}

/** オプショナルカラム未適用環境へのフォールバック付きで記事を新規作成する */
export async function insertArticleWithFallback(payload: Record<string, unknown>) {
  let { data, error } = await supabase.from("articles").insert(payload).select().single();
  if (error && isArticleOptionalColumnSchemaError(error)) {
    const isFuture = isArticleScheduledFuture(
      typeof payload.scheduled_at === "string" ? payload.scheduled_at : null,
    );
    if (payload.status === "scheduled" || isFuture) {
      // 予約公開カラム未適用環境で未来日時の記事を即時公開へダウングレードしない
      return { data: null, error };
    }
    const {
      comments_enabled: _c,
      scheduled_at: _s,
      collaborator_ids: _collab,
      ...safePayload
    } = payload;
    const retryRes = await supabase.from("articles").insert(safePayload).select().single();
    data = retryRes.data;
    error = retryRes.error;
  }
  return { data, error };
}

/** 記事用の画像を Supabase Storage へアップロードする */
export async function uploadArticleImageToStorage(
  file: File,
  userId: string | null,
  prefix = "thumb",
  showToast: (message: string) => void,
): Promise<string | null> {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    showToast("JPEG、PNG、WebP、GIF形式の画像を選択してください");
    return null;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast("10MB以下の画像を選択してください");
    return null;
  }
  const fileName = `${userId}/${prefix}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("thumbnails")
    .upload(fileName, file, { upsert: true });
  if (error) {
    showToast("画像のアップロードに失敗しました");
    return null;
  }
  const { data } = supabase.storage.from("thumbnails").getPublicUrl(fileName);
  return data.publicUrl;
}
