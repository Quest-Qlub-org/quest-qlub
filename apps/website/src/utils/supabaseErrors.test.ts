import { describe, it, expect } from "vite-plus/test";
import {
  isUndefinedColumnError,
  isRolesColumnSchemaError,
  isArticleOptionalColumnSchemaError,
} from "./supabaseErrors";

describe("supabaseErrors", () => {
  describe("isUndefinedColumnError", () => {
    it("returns true for code 42703", () => {
      expect(isUndefinedColumnError({ code: "42703" })).toBe(true);
    });

    it("returns true when message includes specified column name", () => {
      expect(
        isUndefinedColumnError({ message: "column profiles.roles does not exist" }, "roles"),
      ).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isUndefinedColumnError({ code: "23505", message: "unique violation" })).toBe(false);
      expect(isUndefinedColumnError(null)).toBe(false);
      expect(isUndefinedColumnError("error")).toBe(false);
    });
  });

  describe("isRolesColumnSchemaError", () => {
    it("returns true for 42703 or message with roles", () => {
      expect(isRolesColumnSchemaError({ code: "42703" })).toBe(true);
      expect(isRolesColumnSchemaError({ message: "column 'roles' does not exist" })).toBe(true);
    });

    it("returns false for non-roles error", () => {
      expect(isRolesColumnSchemaError({ code: "PGRST116", message: "Not found" })).toBe(false);
      expect(isRolesColumnSchemaError(undefined)).toBe(false);
    });
  });

  describe("isArticleOptionalColumnSchemaError", () => {
    it("returns true for 42703, comments_enabled, or scheduled_at", () => {
      expect(isArticleOptionalColumnSchemaError({ code: "42703" })).toBe(true);
      expect(
        isArticleOptionalColumnSchemaError({
          message: "column articles.comments_enabled does not exist",
        }),
      ).toBe(true);
      expect(
        isArticleOptionalColumnSchemaError({
          message: "column articles.scheduled_at does not exist",
        }),
      ).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isArticleOptionalColumnSchemaError({ code: "42P01" })).toBe(false);
      expect(isArticleOptionalColumnSchemaError(null)).toBe(false);
    });
  });
});
