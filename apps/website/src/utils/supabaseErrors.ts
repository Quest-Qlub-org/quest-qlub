/**
 * Supabase / PostgreSQL のスキーマエラー（スキーマドリフト・未適用マイグレーション対策）判定ユーティリティ
 */

export interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * 42703 (undefined_column) または特定のカラム未存在エラーであるかを判定
 */
export function isUndefinedColumnError(err: unknown, columnName?: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as SupabaseErrorLike;
  const is42703 = e.code === "42703";
  if (columnName) {
    const hasColMessage = typeof e.message === "string" && e.message.includes(columnName);
    return is42703 || hasColMessage;
  }
  return is42703;
}

/**
 * roles 列が存在しない場合（42703 または message に "roles" 含む）の判定
 */
export function isRolesColumnSchemaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as SupabaseErrorLike;
  return e.code === "42703" || (typeof e.message === "string" && e.message.includes("roles"));
}

/**
 * 記事保存時のオプショナルカラム（comments_enabled / scheduled_at）未存在エラー判定
 */
export function isArticleOptionalColumnSchemaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as SupabaseErrorLike;
  return (
    e.code === "42703" ||
    (typeof e.message === "string" &&
      (e.message.includes("comments_enabled") || e.message.includes("scheduled_at")))
  );
}
