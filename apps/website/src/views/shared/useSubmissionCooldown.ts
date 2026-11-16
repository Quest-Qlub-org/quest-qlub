import { useState, useEffect, useCallback } from "react";
import {
  getRemainingCooldownSeconds,
  recordSubmissionTimestamp,
  verifySpamCheck,
} from "../../utils/antiSpam";

/**
 * 連続送信防止クールダウン・スパム判定（ハニーポット/送信速度）を管理する共通フック。
 */
export function useSubmissionCooldown() {
  const [honeypot, setHoneypot] = useState("");
  const [loadedAt] = useState(() => Date.now());
  const [cooldown, setCooldown] = useState(() => getRemainingCooldownSeconds());

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const checkSubmissionGuard = useCallback(():
    | { ok: true }
    | { ok: false; stealthSuccess: boolean; errorMessage?: string } => {
    if (cooldown > 0) {
      return {
        ok: false,
        stealthSuccess: false,
        errorMessage: `連続送信を防ぐため、あと${cooldown}秒お待ちください。`,
      };
    }

    const spamCheck = verifySpamCheck({ honeypotValue: honeypot, loadedAt });
    if (spamCheck.isSpam) {
      if (spamCheck.reason === "honeypot") {
        return { ok: false, stealthSuccess: true };
      }
      if (spamCheck.reason === "too_fast") {
        return {
          ok: false,
          stealthSuccess: false,
          errorMessage: "送信が早すぎます。入力内容をご確認のうえ再度お試しください。",
        };
      }
    }

    return { ok: true };
  }, [cooldown, honeypot, loadedAt]);

  const markSubmitted = useCallback(() => {
    recordSubmissionTimestamp();
    setCooldown(getRemainingCooldownSeconds());
  }, []);

  return {
    honeypot,
    setHoneypot,
    cooldown,
    checkSubmissionGuard,
    markSubmitted,
  };
}
