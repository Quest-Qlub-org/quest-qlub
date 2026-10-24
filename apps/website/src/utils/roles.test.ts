import { describe, it, expect } from "vite-plus/test";
import {
  getProfileRoles,
  profileHasRole,
  getPrimaryRole,
  getRoleLabel,
  getRoleBadgeClass,
  getRoleOrder,
  isStaffRole,
  formatMemberName,
} from "./roles";

describe("roles utility", () => {
  describe("getProfileRoles", () => {
    it("returns empty array for null/undefined profile", () => {
      expect(getProfileRoles(null)).toEqual([]);
      expect(getProfileRoles(undefined)).toEqual([]);
    });

    it("uses roles array when present and non-empty", () => {
      const profile = { role: "writer", roles: ["writer", "engineer"] };
      expect(getProfileRoles(profile)).toEqual(["writer", "engineer"]);
    });

    it("deduplicates and trims roles array", () => {
      const profile = { role: "writer", roles: [" writer ", "engineer", "writer", ""] };
      expect(getProfileRoles(profile)).toEqual(["writer", "engineer"]);
    });

    it("falls back to role column when roles is empty array or null", () => {
      expect(getProfileRoles({ role: "editor", roles: [] })).toEqual(["editor"]);
      expect(getProfileRoles({ role: "editor", roles: null })).toEqual(["editor"]);
      expect(getProfileRoles({ role: "editor" })).toEqual(["editor"]);
    });

    it("returns empty array when neither role nor roles is set", () => {
      expect(getProfileRoles({ role: null, roles: null })).toEqual([]);
      expect(getProfileRoles({ role: undefined, roles: [] })).toEqual([]);
    });
  });

  describe("profileHasRole", () => {
    it("checks role presence accurately", () => {
      const profile = { role: "writer", roles: ["writer", "engineer"] };
      expect(profileHasRole(profile, "writer")).toBe(true);
      expect(profileHasRole(profile, "engineer")).toBe(true);
      expect(profileHasRole(profile, "editor")).toBe(false);
    });

    it("falls back to single role when roles is missing", () => {
      const profile = { role: "editor" };
      expect(profileHasRole(profile, "editor")).toBe(true);
      expect(profileHasRole(profile, "writer")).toBe(false);
    });
  });

  describe("getPrimaryRole", () => {
    it("prioritizes editor over writer and viewer", () => {
      expect(getPrimaryRole(["engineer", "editor", "writer"])).toBe("editor");
      expect(getPrimaryRole(["writer", "editor"])).toBe("editor");
    });

    it("prioritizes writer over viewer/engineer", () => {
      expect(getPrimaryRole(["engineer", "writer"])).toBe("writer");
      expect(getPrimaryRole(["writer"])).toBe("writer");
    });

    it("falls back to viewer when neither editor nor writer is present", () => {
      expect(getPrimaryRole(["engineer"])).toBe("viewer");
      expect(getPrimaryRole(["viewer"])).toBe("viewer");
      expect(getPrimaryRole([])).toBe("viewer");
    });
  });

  describe("getRoleLabel and getRoleBadgeClass", () => {
    it("returns configured labels for known roles", () => {
      expect(getRoleLabel("editor")).toBe("編集長");
      expect(getRoleLabel("writer")).toBe("ライター");
      expect(getRoleLabel("engineer")).toBe("エンジニア");
      expect(getRoleLabel("viewer")).toBe("一般読者");
    });

    it("returns the key itself as fallback for unknown roles", () => {
      expect(getRoleLabel("designer")).toBe("designer");
    });

    it("returns badge classes appropriately", () => {
      expect(getRoleBadgeClass("editor")).toContain("purple");
      expect(getRoleBadgeClass("writer")).toContain("blue");
      expect(getRoleBadgeClass("engineer")).toContain("emerald");
      expect(getRoleBadgeClass("unknown")).toContain("gray");
    });
  });

  describe("getRoleOrder", () => {
    it("orders known roles correctly", () => {
      expect(getRoleOrder("editor")).toBeLessThan(getRoleOrder("writer"));
      expect(getRoleOrder("writer")).toBeLessThan(getRoleOrder("engineer"));
      expect(getRoleOrder("engineer")).toBeLessThan(getRoleOrder("viewer"));
    });
  });

  describe("isStaffRole", () => {
    it("identifies staff vs non-staff roles", () => {
      expect(isStaffRole("editor")).toBe(true);
      expect(isStaffRole("writer")).toBe(true);
      expect(isStaffRole("engineer")).toBe(true);
      expect(isStaffRole("viewer")).toBe(false);
      expect(isStaffRole("guest")).toBe(false);
      // Custom roles default to staff if not viewer/guest
      expect(isStaffRole("designer")).toBe(true);
    });

    it("rejects empty or whitespace-only role strings", () => {
      expect(isStaffRole("")).toBe(false);
      expect(isStaffRole("   ")).toBe(false);
      expect(isStaffRole(null as unknown as string)).toBe(false);
      expect(isStaffRole(undefined as unknown as string)).toBe(false);
    });
  });

  describe("formatMemberName", () => {
    it("handles display_name and username without duplicating", () => {
      expect(formatMemberName({ display_name: "東雲　-Shinonome-", username: "shinonome" })).toBe(
        "東雲　-Shinonome-",
      );
      expect(formatMemberName({ display_name: "Noimzip", username: "noimzip" })).toBe("Noimzip");
    });

    it("appends @username if display_name does not mention username", () => {
      expect(formatMemberName({ display_name: "東雲", username: "shinonome" })).toBe(
        "東雲 (@shinonome)",
      );
    });

    it("falls back to @username if display_name is not set", () => {
      expect(formatMemberName({ display_name: null, username: "noimzip" })).toBe("@noimzip");
      expect(formatMemberName({ display_name: "", username: "noimzip" })).toBe("@noimzip");
    });

    it("falls back to default when neither is set", () => {
      expect(formatMemberName({ display_name: null, username: null })).toBe("名称未設定");
      expect(formatMemberName(null)).toBe("名称未設定");
      expect(formatMemberName(undefined)).toBe("名称未設定");
    });
  });
});
