import { isAuthWeakPasswordError, type AuthError } from "@supabase/supabase-js";

export function getPasswordAuthErrorMessage(error: AuthError, fallback: string): string {
  if (isAuthWeakPasswordError(error) && error.reasons.includes("pwned")) {
    return "このパスワードは漏えいが確認されています。別のパスワードを設定してください。";
  }
  return error.message || fallback;
}
