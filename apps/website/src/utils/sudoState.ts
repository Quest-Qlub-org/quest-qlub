import { supabase } from "../supabase";

export const SUDO_TIMEOUT_MS = 15 * 60 * 1000;
export const SUDO_MFA_HANDSHAKE_GRACE_MS = 3 * 60 * 1000;

let sudoExpiresAt = 0;
let pendingHandshake: { id: string; pathname: string; expiresAt: number } | null = null;

export function setInMemorySudoAuthorized(active: boolean): void {
  sudoExpiresAt = active ? Date.now() + SUDO_TIMEOUT_MS : 0;
  pendingHandshake = null;
}

export async function beginSudoMfaHandshake(): Promise<boolean> {
  const pathname = window.location.pathname;
  const { data, error } = await supabase.rpc("begin_sudo_session");
  if (error || typeof data !== "string" || window.location.pathname !== pathname) return false;

  pendingHandshake = {
    id: data,
    pathname,
    expiresAt: Date.now() + SUDO_MFA_HANDSHAKE_GRACE_MS,
  };
  return true;
}

export function isSudoMfaHandshakeActive(): boolean {
  return (
    pendingHandshake !== null &&
    pendingHandshake.pathname === window.location.pathname &&
    pendingHandshake.expiresAt > Date.now()
  );
}

export function getSudoRemainingMs(): number {
  return Math.max(0, sudoExpiresAt - Date.now());
}

export function checkIsSudoActive(): boolean {
  return getSudoRemainingMs() > 0;
}

export async function confirmServerSudoSession(): Promise<boolean> {
  const attempt = pendingHandshake;
  if (!attempt || !isSudoMfaHandshakeActive()) return false;

  const { data, error } = await supabase.rpc("confirm_sudo_session", {
    p_challenge_id: attempt.id,
  });
  const expiresAt = typeof data === "string" ? Date.parse(data) : 0;
  if (error || !(expiresAt > Date.now())) return false;

  if (attempt !== pendingHandshake || !isSudoMfaHandshakeActive()) {
    await supabase.rpc("revoke_sudo_session");
    return false;
  }

  sudoExpiresAt = expiresAt;
  pendingHandshake = null;
  return true;
}

export function lockSudoSession(): void {
  const hadGrant = sudoExpiresAt !== 0 || pendingHandshake !== null;
  setInMemorySudoAuthorized(false);
  if (hadGrant) {
    void Promise.resolve(supabase.rpc("revoke_sudo_session")).catch(() => {});
  }
}
