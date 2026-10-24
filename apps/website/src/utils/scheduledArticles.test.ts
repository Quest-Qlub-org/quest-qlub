// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vite-plus/test";
import {
  getLocalScheduledMap,
  getLocalScheduledAt,
  setLocalScheduledAt,
  isArticleScheduledFuture,
  isArticlePubliclyVisible,
  getEffectiveArticleStatus,
  toDatetimeLocalValue,
  formatScheduledDateTime,
  toSafeIsoString,
  enrichArticleWithSchedule,
} from "./scheduledArticles";

describe("scheduledArticles utils", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("local storage mapping", () => {
    it("returns empty object when storage is empty or invalid JSON", () => {
      expect(getLocalScheduledMap()).toEqual({});
      localStorage.setItem("quest_qlub_scheduled_articles_v1", "invalid-json");
      expect(getLocalScheduledMap()).toEqual({});
    });

    it("saves and retrieves scheduledAt per articleId", () => {
      setLocalScheduledAt("art-1", "2026-12-31T12:00:00.000Z");
      expect(getLocalScheduledAt("art-1")).toBe("2026-12-31T12:00:00.000Z");
      expect(getLocalScheduledAt("art-2")).toBeNull();

      // Clear when null
      setLocalScheduledAt("art-1", null);
      expect(getLocalScheduledAt("art-1")).toBeNull();
    });

    it("ignores empty articleId", () => {
      setLocalScheduledAt("", "2026-12-31T12:00:00.000Z");
      expect(getLocalScheduledAt("")).toBeNull();
    });
  });

  describe("isArticleScheduledFuture", () => {
    const fixedNow = new Date("2026-10-24T12:00:00.000Z").getTime();

    it("returns false for falsy or invalid inputs", () => {
      expect(isArticleScheduledFuture(null, fixedNow)).toBe(false);
      expect(isArticleScheduledFuture(undefined, fixedNow)).toBe(false);
      expect(isArticleScheduledFuture("", fixedNow)).toBe(false);
      expect(isArticleScheduledFuture("invalid-date", fixedNow)).toBe(false);
      expect(isArticleScheduledFuture({ scheduledAt: null }, fixedNow)).toBe(false);
    });

    it("correctly compares future and past dates against nowMs", () => {
      expect(isArticleScheduledFuture("2026-10-24T12:01:00.000Z", fixedNow)).toBe(true);
      expect(isArticleScheduledFuture("2026-10-24T12:00:00.000Z", fixedNow)).toBe(false);
      expect(isArticleScheduledFuture("2026-10-24T11:59:00.000Z", fixedNow)).toBe(false);
    });
  });

  describe("isArticlePubliclyVisible", () => {
    const fixedNow = new Date("2026-10-24T12:00:00.000Z").getTime();

    it("returns false for null or draft/pending articles", () => {
      expect(isArticlePubliclyVisible(null, fixedNow)).toBe(false);
      expect(isArticlePubliclyVisible({ status: "draft" }, fixedNow)).toBe(false);
      expect(isArticlePubliclyVisible({ status: "pending" }, fixedNow)).toBe(false);
    });

    it("returns true for published articles without scheduledAt", () => {
      expect(isArticlePubliclyVisible({ status: "published", scheduledAt: null }, fixedNow)).toBe(
        true,
      );
    });

    it("hides published articles whose scheduledAt is in the future", () => {
      expect(
        isArticlePubliclyVisible(
          { status: "published", scheduledAt: "2026-10-24T13:00:00.000Z" },
          fixedNow,
        ),
      ).toBe(false);
    });

    it("shows published articles whose scheduledAt is in the past", () => {
      expect(
        isArticlePubliclyVisible(
          { status: "published", scheduledAt: "2026-10-24T11:00:00.000Z" },
          fixedNow,
        ),
      ).toBe(true);
    });

    it("shows scheduled articles whose scheduledAt has arrived", () => {
      expect(
        isArticlePubliclyVisible(
          { status: "scheduled", scheduledAt: "2026-10-24T11:59:00.000Z" },
          fixedNow,
        ),
      ).toBe(true);
    });

    it("hides scheduled articles whose scheduledAt is in the future", () => {
      expect(
        isArticlePubliclyVisible(
          { status: "scheduled", scheduledAt: "2026-10-24T12:01:00.000Z" },
          fixedNow,
        ),
      ).toBe(false);
    });
  });

  describe("getEffectiveArticleStatus", () => {
    const fixedNow = new Date("2026-10-24T12:00:00.000Z").getTime();

    it("promotes scheduled to published when scheduled time is past", () => {
      expect(
        getEffectiveArticleStatus(
          { status: "scheduled", scheduledAt: "2026-10-24T11:00:00.000Z" },
          fixedNow,
        ),
      ).toBe("published");
    });

    it("maintains scheduled status when scheduled time is future", () => {
      expect(
        getEffectiveArticleStatus(
          { status: "scheduled", scheduledAt: "2026-10-24T13:00:00.000Z" },
          fixedNow,
        ),
      ).toBe("scheduled");
    });

    it("demotes published to scheduled when scheduled time is in future", () => {
      expect(
        getEffectiveArticleStatus(
          { status: "published", scheduledAt: "2026-10-24T13:00:00.000Z" },
          fixedNow,
        ),
      ).toBe("scheduled");
    });

    it("retains draft status as draft", () => {
      expect(
        getEffectiveArticleStatus(
          { status: "draft", scheduledAt: "2026-10-24T13:00:00.000Z" },
          fixedNow,
        ),
      ).toBe("draft");
    });
  });

  describe("toDatetimeLocalValue and formatScheduledDateTime", () => {
    it("handles null/undefined gracefully", () => {
      expect(toDatetimeLocalValue(null)).toBe("");
      expect(toDatetimeLocalValue("")).toBe("");
      expect(formatScheduledDateTime(null)).toBe("");
      expect(formatScheduledDateTime("invalid")).toBe("");
    });

    it("preserves already formatted datetime-local string", () => {
      expect(toDatetimeLocalValue("2026-10-24T15:30")).toBe("2026-10-24T15:30");
    });

    it("converts ISO date to local string and formatted label", () => {
      const d = new Date(2026, 9, 24, 15, 30);
      const iso = d.toISOString();
      const localVal = toDatetimeLocalValue(iso);
      expect(localVal).toBe("2026-10-24T15:30");

      const label = formatScheduledDateTime(iso);
      expect(label).toBe("2026/10/24 15:30");
    });
  });

  describe("toSafeIsoString", () => {
    it("returns null for empty, null, undefined or invalid date strings", () => {
      expect(toSafeIsoString(null)).toBeNull();
      expect(toSafeIsoString(undefined)).toBeNull();
      expect(toSafeIsoString("")).toBeNull();
      expect(toSafeIsoString("   ")).toBeNull();
      expect(toSafeIsoString("invalid-date")).toBeNull();
      expect(toSafeIsoString("2026-")).toBeNull();
    });

    it("returns valid ISO string for valid date inputs without throwing", () => {
      const iso = toSafeIsoString("2026-10-24T15:30");
      expect(iso).not.toBeNull();
      expect(new Date(iso!).getFullYear()).toBe(2026);
    });
  });

  describe("enrichArticleWithSchedule", () => {
    it("enriches article with local schedule and effective status", () => {
      setLocalScheduledAt("art-enrich-1", "2099-01-01T00:00:00.000Z");
      const baseArticle: any = {
        id: "art-enrich-1",
        title: "Test",
        status: "published",
        scheduledAt: null,
      };

      const enriched = enrichArticleWithSchedule(baseArticle);
      expect(enriched.scheduledAt).toBe("2099-01-01T00:00:00.000Z");
      expect(enriched.status).toBe("scheduled");
    });
  });
});
