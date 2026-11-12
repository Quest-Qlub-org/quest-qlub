// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vite-plus/test";
import {
  verifySpamCheck,
  getRemainingCooldownSeconds,
  recordSubmissionTimestamp,
  COMMENT_COOLDOWN_KEY,
  COMMENT_COOLDOWN_DURATION_MS,
} from "./antiSpam";

describe("antiSpam utility", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe("verifySpamCheck", () => {
    it("returns isSpam=true when honeypot has a value", () => {
      const result = verifySpamCheck({
        honeypotValue: "bot-entered-text",
        loadedAt: 1000,
        now: 5000,
      });
      expect(result.isSpam).toBe(true);
      expect(result.reason).toBe("honeypot");
    });

    it("returns isSpam=true when submission is too fast (< 2000ms)", () => {
      const result = verifySpamCheck({
        honeypotValue: "",
        loadedAt: 1000,
        now: 1500, // 500ms elapsed
      });
      expect(result.isSpam).toBe(true);
      expect(result.reason).toBe("too_fast");
    });

    it("returns isSpam=false when honeypot is empty and submission time is normal", () => {
      const result = verifySpamCheck({
        honeypotValue: "",
        loadedAt: 1000,
        now: 4000, // 3000ms elapsed
      });
      expect(result.isSpam).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("cooldown functions", () => {
    it("returns 0 remaining seconds when no submission has been made", () => {
      expect(getRemainingCooldownSeconds("test_key")).toBe(0);
    });

    it("records submission timestamp and calculates remaining cooldown", () => {
      const now = 100000;
      vi.spyOn(Date, "now").mockReturnValue(now);

      recordSubmissionTimestamp("test_key");

      // 10 seconds later (within 30s window)
      vi.spyOn(Date, "now").mockReturnValue(now + 10000);
      expect(getRemainingCooldownSeconds("test_key", 30000)).toBe(20);

      // 31 seconds later (expired)
      vi.spyOn(Date, "now").mockReturnValue(now + 31000);
      expect(getRemainingCooldownSeconds("test_key", 30000)).toBe(0);
    });

    it("supports comment cooldown key and 15-second duration", () => {
      const now = 200000;
      vi.spyOn(Date, "now").mockReturnValue(now);

      recordSubmissionTimestamp(COMMENT_COOLDOWN_KEY);

      vi.spyOn(Date, "now").mockReturnValue(now + 5000);
      expect(getRemainingCooldownSeconds(COMMENT_COOLDOWN_KEY, COMMENT_COOLDOWN_DURATION_MS)).toBe(
        10,
      );

      vi.spyOn(Date, "now").mockReturnValue(now + 15000);
      expect(getRemainingCooldownSeconds(COMMENT_COOLDOWN_KEY, COMMENT_COOLDOWN_DURATION_MS)).toBe(
        0,
      );
    });
  });
});
