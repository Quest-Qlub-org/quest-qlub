import { describe, it, expect } from "vite-plus/test";
import { formatArticleDate } from "./date";

describe("formatArticleDate", () => {
  it("formats date string correctly into YYYY/MM/DD", () => {
    expect(formatArticleDate("2026-05-15T12:00:00Z")).toContain("2026/05/");
    expect(formatArticleDate("2026-10-24T12:00:00")).toBe("2026/10/24");
  });

  it("returns empty string for null, undefined, or empty string", () => {
    expect(formatArticleDate(null)).toBe("");
    expect(formatArticleDate(undefined)).toBe("");
    expect(formatArticleDate("")).toBe("");
  });

  it("returns empty string for invalid date string", () => {
    expect(formatArticleDate("invalid-date-format")).toBe("");
  });
});
