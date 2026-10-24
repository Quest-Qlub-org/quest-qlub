// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import {
  fetchProfilesListWithFallback,
  fetchSingleProfileWithFallback,
  applyProfileRoleOverrides,
} from "./profileQueries";
import { supabase } from "../supabase";
import { setLocalRolesOverride } from "./roles";

describe("profileQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("applyProfileRoleOverrides", () => {
    it("applies local override when exists", () => {
      setLocalRolesOverride("u-1", ["editor", "writer"]);
      const p = {
        id: "u-1",
        role: "viewer" as const,
        roles: ["viewer"],
        display_name: "Test",
        username: "test",
        avatar_url: null,
      };
      const res = applyProfileRoleOverrides(p);
      expect(res.roles).toEqual(["editor", "writer"]);
    });

    it("returns original profile when no local override exists", () => {
      const p = {
        id: "u-2",
        role: "viewer" as const,
        roles: ["viewer"],
        display_name: "Test",
        username: "test",
        avatar_url: null,
      };
      const res = applyProfileRoleOverrides(p);
      expect(res.roles).toEqual(["viewer"]);
    });
  });

  describe("fetchProfilesListWithFallback", () => {
    it("returns profiles on successful query", async () => {
      const mockData = [
        {
          id: "u-1",
          role: "writer",
          roles: ["writer"],
          display_name: "Writer 1",
          username: "w1",
        },
      ];

      const chain: any = {
        select: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: mockData, error: null })),
      };

      vi.spyOn(supabase, "from").mockReturnValue(chain as any);

      const res = await fetchProfilesListWithFallback({
        inRole: ["writer"],
        order: { column: "created_at", ascending: false },
        range: { from: 0, to: 9 },
      });

      expect(res).toBeDefined();
      expect(res?.length).toBe(1);
      expect(res?.[0].id).toBe("u-1");
    });

    it("falls back to base fields when 42703 error occurs", async () => {
      let attempt = 0;
      const createMockChain = () => {
        const chain: any = {
          select: vi.fn(() => chain),
          in: vi.fn(() => chain),
          order: vi.fn(() => chain),
          range: vi.fn(() => {
            attempt++;
            if (attempt === 1) {
              return Promise.resolve({
                data: null,
                error: { code: "42703", message: "column 'roles' does not exist" },
              });
            }
            return Promise.resolve({
              data: [
                {
                  id: "u-2",
                  role: "editor",
                  display_name: "Editor 2",
                  username: "ed2",
                },
              ],
              error: null,
            });
          }),
        };
        return chain;
      };

      vi.spyOn(supabase, "from").mockReturnValue(createMockChain() as any);

      const res = await fetchProfilesListWithFallback({
        range: { from: 0, to: 9 },
      });
      expect(res).toBeDefined();
      expect(res?.length).toBe(1);
      expect(res?.[0].roles).toContain("editor");
    });
  });

  describe("fetchSingleProfileWithFallback", () => {
    it("fetches single profile by id", async () => {
      const mockProfile = {
        id: "u-target",
        role: "writer",
        roles: ["writer"],
        display_name: "Target",
        username: "target",
      };

      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
      };

      vi.spyOn(supabase, "from").mockReturnValue(chain as any);

      const res = await fetchSingleProfileWithFallback({ id: "u-target" });
      expect(res?.id).toBe("u-target");
    });
  });
});
