import { useState, useEffect, useCallback } from "react";
import {
  COOLDOWN_DURATION_MS,
  getRemainingCooldownSeconds,
  recordSubmissionTimestamp,
} from "../utils/antiSpam";

/**
 * スパム対策用の送信クールダウン秒数を管理するフック
 */
export function useSubmissionCooldown(
  storageKey: string,
  durationMs: number = COOLDOWN_DURATION_MS,
) {
  const [cooldown, setCooldown] = useState(() =>
    getRemainingCooldownSeconds(storageKey, durationMs),
  );
  const isCoolingDown = cooldown > 0;

  useEffect(() => {
    if (!isCoolingDown) return;
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
  }, [isCoolingDown]);

  const triggerCooldown = useCallback(() => {
    recordSubmissionTimestamp(storageKey);
    setCooldown(getRemainingCooldownSeconds(storageKey, durationMs));
  }, [storageKey, durationMs]);

  return { cooldown, isCoolingDown, triggerCooldown };
}
