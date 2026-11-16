// メモリ内プライベートステート（ブラウザコンソールやDevToolsからの改ざんを完全防止）
let inMemorySudoAuthorized = false;
let lastSudoAuthorizedAt = 0;
let sudoMfaHandshakeUntil = 0;

export const SUDO_TIMEOUT_MS = 15 * 60 * 1000; // 15分
export const SUDO_MFA_HANDSHAKE_GRACE_MS = 3 * 60 * 1000; // Sudoパスワード検証直後の2FA入力猶予（3分）

export function checkIsSudoActive(): boolean {
  if (!inMemorySudoAuthorized) return false;
  return Date.now() - lastSudoAuthorizedAt < SUDO_TIMEOUT_MS;
}

export function setInMemorySudoAuthorized(active: boolean, isMfaHandshake = false): void {
  inMemorySudoAuthorized = active;
  lastSudoAuthorizedAt = active ? Date.now() : 0;
  sudoMfaHandshakeUntil = active && isMfaHandshake ? Date.now() + SUDO_MFA_HANDSHAKE_GRACE_MS : 0;
}

export function isSudoMfaHandshakeActive(): boolean {
  return Date.now() < sudoMfaHandshakeUntil;
}

export function getSudoRemainingMs(): number {
  return Math.max(0, lastSudoAuthorizedAt + SUDO_TIMEOUT_MS - Date.now());
}
