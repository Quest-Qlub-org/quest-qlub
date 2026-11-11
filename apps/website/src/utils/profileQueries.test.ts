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

    it("filters profiles with inIds option", async () => {
      const mockData = [
        {
          id: "u-1",
          role: "writer",
          roles: ["writer"],
          display_name: "Writer 1",
          username: "w1",
        },
        {
          id: "u-2",
          role: "viewer",
          roles: ["viewer"],
          display_name: "Viewer 2",
          username: "v2",
        },
      ];

      const inMock = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const chain: any = {
        select: vi.fn(() => chain),
        in: inMock,
      };

      vi.spyOn(supabase, "from").mockReturnValue(chain as any);

      const res = await fetchProfilesListWithFallback({
        inIds: ["u-1", "u-2"],
      });

      expect(inMock).toHaveBeenCalledWith("id", ["u-1", "u-2"]);
      expect(res).toHaveLength(2);
      expect(res?.[0].id).toBe("u-1");
      expect(res?.[1].id).toBe("u-2");
    });

    it("filters profiles with custom in option", async () => {
      const mockData = [
        {
          id: "u-1",
          role: "writer",
          roles: ["writer"],
          display_name: "Writer 1",
          username: "w1",
        },
      ];

      const inMock = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const chain: any = {
        select: vi.fn(() => chain),
        in: inMock,
      };

      vi.spyOn(supabase, "from").mockReturnValue(chain as any);

      const res = await fetchProfilesListWithFallback({
        in: { column: "username", values: ["w1"] },
      });

      expect(inMock).toHaveBeenCalledWith("username", ["w1"]);
      expect(res).toHaveLength(1);
    });

    it("applies local role overrides to fetched profiles", async () => {
      setLocalRolesOverride("u-1", ["editor", "writer"]);
      const mockData = [
        {
          id: "u-1",
          role: "viewer",
          roles: ["viewer"],
          display_name: "Viewer 1",
          username: "v1",
        },
      ];

      const chain: any = {
        select: vi.fn(() => chain),
        in: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };

      vi.spyOn(supabase, "from").mockReturnValue(chain as any);

      const res = await fetchProfilesListWithFallback({
        inIds: ["u-1"],
      });

      expect(res?.[0].roles).toEqual(["editor", "writer"]);
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
