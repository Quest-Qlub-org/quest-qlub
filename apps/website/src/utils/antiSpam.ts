/**
 * スパム・ボット対策用ユーティリティ
 */

export const CONTACT_COOLDOWN_KEY = "share_quest_contact_last_sent";
export const REGISTER_COOLDOWN_KEY = "share_quest_register_last_sent";
export const FORGOT_PASSWORD_COOLDOWN_KEY = "share_quest_forgot_password_last_sent";
export const COMMENT_COOLDOWN_KEY = "quest_qlub_comment_last_sent";
export const MINIMUM_SUBMISSION_TIME_MS = 2000; // 人間が入力を終えるまでの最低時間（2秒）
export const COOLDOWN_DURATION_MS = 30 * 1000; // 送信後のクールダウン（30秒）
export const COMMENT_COOLDOWN_DURATION_MS = 15 * 1000; // コメント投稿後のクールダウン（15秒）

export interface SpamCheckParams {
  honeypotValue: string;
  loadedAt: number;
  now?: number;
}

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: "honeypot" | "too_fast";
}

/**
 * ハニーポットおよび所要時間によるスパム判定
 */
export function verifySpamCheck({
  honeypotValue,
  loadedAt,
  now = Date.now(),
}: SpamCheckParams): SpamCheckResult {
  // ハニーポットに値が入っている場合はボット
  if (honeypotValue && honeypotValue.trim().length > 0) {
    return { isSpam: true, reason: "honeypot" };
  }

  // フォーム読み込みから送信までの時間が極端に短い場合はボット
  if (now - loadedAt < MINIMUM_SUBMISSION_TIME_MS) {
    return { isSpam: true, reason: "too_fast" };
  }

  return { isSpam: false };
}

/**
 * クライアント側クールダウン状態のチェック
 */
export function getRemainingCooldownSeconds(
  storageKey: string = CONTACT_COOLDOWN_KEY,
  cooldownMs: number = COOLDOWN_DURATION_MS,
): number {
  if (typeof window === "undefined" || !window.sessionStorage) return 0;
  const lastSentStr = window.sessionStorage.getItem(storageKey);
  if (!lastSentStr) return 0;
  const lastSent = parseInt(lastSentStr, 10);
  if (isNaN(lastSent)) return 0;

  const elapsed = Date.now() - lastSent;
  if (elapsed < cooldownMs) {
    return Math.ceil((cooldownMs - elapsed) / 1000);
  }
  return 0;
}

/**
 * クライアント側クールダウン時刻の記録
 */
export function recordSubmissionTimestamp(storageKey: string = CONTACT_COOLDOWN_KEY): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  window.sessionStorage.setItem(storageKey, Date.now().toString());
}
