// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useFollows, fetchFollowCounts, fetchFollowDetails } from "./useFollows";
import * as AuthContextModule from "../context/AuthContext";
import { supabase } from "../supabase";
import { createTestProfile } from "../test/test-utils";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let currentHook: ReturnType<typeof useFollows>;

function HookTester() {
  currentHook = useFollows();
  return null;
}

describe("useFollows hook & follow privacy rules", () => {
  let container: HTMLDivElement;
  let mockFollowsDb: { follower_id: string; following_id: string }[];

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);

    mockFollowsDb = [
      { follower_id: "user-1", following_id: "writer-1" },
      { follower_id: "user-2", following_id: "user-1" },
    ];

    vi.spyOn(supabase, "rpc").mockImplementation(((fnName: string, args: any) => {
      if (fnName === "get_follow_counts") {
        const targetId = args.target_user_id;
        const followingCount = mockFollowsDb.filter((f) => f.follower_id === targetId).length;
        const followersCount = mockFollowsDb.filter((f) => f.following_id === targetId).length;
        return Promise.resolve({
          data: [{ following_count: followingCount, followers_count: followersCount }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }) as any);

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "user_follows") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(async (col: string, val: string) => ({
              data: mockFollowsDb.filter((r: any) => r[col] === val),
              error: null,
            })),
          }),
          insert: vi.fn().mockImplementation(async (payload: any) => {
            mockFollowsDb.push({
              follower_id: payload.follower_id,
              following_id: payload.following_id,
            });
            return { error: null };
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col1: string, val1: string) => ({
              eq: vi.fn().mockImplementation(async (col2: string, val2: string) => {
                mockFollowsDb = mockFollowsDb.filter(
                  (r: any) => !(r[col1] === val1 && r[col2] === val2),
                );
                return { error: null };
              }),
            })),
          }),
        } as any;
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation(async (_col: string, ids: string[]) => ({
              data: ids.map((id) =>
                createTestProfile({ id, display_name: `プロフィール_${id}`, username: id }),
              ),
              error: null,
            })),
          }),
        } as any;
      }
      return {} as any;
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("blocks guest (unauthenticated) users from following and returns false", async () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: null,
      profile: null,
      setProfile: vi.fn(),
      userRole: "guest",
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<HookTester />);
    });

    expect(currentHook.followedIds).toEqual([]);
    expect(currentHook.isFollowing("writer-1")).toBe(false);

    let result: boolean | undefined;
    await act(async () => {
      result = await currentHook.toggleFollow("writer-1");
    });

    expect(result).toBe(false);
    expect(currentHook.followedIds).toEqual([]);
    root.unmount();
  });

  it("loads followedIds from DB for authenticated user and toggles follow in DB", async () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: { id: "user-1", email: "u1@example.com" } as any,
      profile: createTestProfile({ id: "user-1", role: "viewer" }),
      setProfile: vi.fn(),
      userRole: "viewer",
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<HookTester />);
      await Promise.resolve();
    });

    expect(currentHook.isFollowing("writer-1")).toBe(true);

    // 新たに writer-2 をフォロー
    await act(async () => {
      await currentHook.toggleFollow("writer-2");
    });

    expect(currentHook.isFollowing("writer-2")).toBe(true);

    // writer-1 のフォローを解除
    await act(async () => {
      await currentHook.toggleFollow("writer-1");
    });

    expect(currentHook.isFollowing("writer-1")).toBe(false);
    root.unmount();
  });

  it("allows ANY user (including guests) to check follower and following counts of any account", async () => {
    const counts = await fetchFollowCounts("user-1");
    expect(counts).toEqual({ followingCount: 1, followersCount: 1 });
  });

  it("allows ONLY the account owner to fetch detailed following and followers profile lists", async () => {
    // 1. 他人（または未ログイン）が user-1 の詳細リストを取得しようとした場合は拒否され空リストになること
    const unauthorizedDetails = await fetchFollowDetails("user-1", "other-user-999");
    expect(unauthorizedDetails.allowed).toBe(false);
    expect(unauthorizedDetails.following).toEqual([]);
    expect(unauthorizedDetails.followers).toEqual([]);

    // 2. 本人（currentUserId === targetUserId）が取得した場合は詳細プロフィール一覧が返ること
    const ownDetails = await fetchFollowDetails("user-1", "user-1");
    expect(ownDetails.allowed).toBe(true);
    expect(ownDetails.following.map((p) => p.id)).toEqual(["writer-1"]);
    expect(ownDetails.followers.map((p) => p.id)).toEqual(["user-2"]);
  });

  it("prevents user from following themselves and returns false", async () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: { id: "user-1", email: "u1@example.com" } as any,
      profile: createTestProfile({ id: "user-1", role: "viewer" }),
      setProfile: vi.fn(),
      userRole: "viewer",
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<HookTester />);
      await Promise.resolve();
    });

    let res: boolean | undefined;
    await act(async () => {
      res = await currentHook.toggleFollow("user-1");
    });

    expect(res).toBe(false);
    expect(currentHook.isFollowing("user-1")).toBe(false);
    root.unmount();
  });

  it("falls back to localStorage when user_follows table is missing (PGRST205 schema drift)", async () => {
    // 欠損テーブルエラー (PGRST205) を模倣
    const schemaError = {
      code: "PGRST205",
      message: "Could not find the table 'public.user_follows' in the schema cache",
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "user_follows") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: schemaError,
            }),
          }),
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: schemaError,
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: schemaError,
              }),
            }),
          }),
        } as any;
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation(async (_col: string, ids: string[]) => ({
              data: ids.map((id) =>
                createTestProfile({ id, display_name: `プロフィール_${id}`, username: id }),
              ),
              error: null,
            })),
          }),
        } as any;
      }
      return {} as any;
    });

    // RPC get_follow_counts も失敗する状態を模倣
    vi.spyOn(supabase, "rpc").mockImplementation(((fnName: string) => {
      if (fnName === "get_follow_counts") {
        return Promise.resolve({
          data: null,
          error: { code: "42883", message: "function get_follow_counts does not exist" },
        });
      }
      return Promise.resolve({ data: null, error: null });
    }) as any);

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: { id: "user-fallback", email: "fallback@example.com" } as any,
      profile: createTestProfile({ id: "user-fallback", role: "viewer" }),
      setProfile: vi.fn(),
      userRole: "viewer",
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<HookTester />);
      await Promise.resolve();
    });

    expect(currentHook.followedIds).toEqual([]);

    // user_follows テーブルが存在しなくても toggleFollow が成功 (true) し、localStorage に保存されること
    let res: boolean | undefined;
    await act(async () => {
      res = await currentHook.toggleFollow("writer-drift");
    });

    expect(res).toBe(true);
    expect(currentHook.isFollowing("writer-drift")).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem("quest_qlub_user_follows_user-fallback") || "[]"),
    ).toEqual(["writer-drift"]);

    // 再マウント時も localStorage から復元されること
    root.unmount();
    const root2 = createRoot(container);
    await act(async () => {
      root2.render(<HookTester />);
      await Promise.resolve();
    });

    expect(currentHook.isFollowing("writer-drift")).toBe(true);
    expect(currentHook.followedIds).toEqual(["writer-drift"]);

    // fetchFollowCounts もローカル保存値をフォールバック反映すること
    const counts = await fetchFollowCounts("user-fallback");
    expect(counts.followingCount).toBe(1);

    // fetchFollowDetails もローカル保存値から対象プロフィールを取得できること
    const details = await fetchFollowDetails("user-fallback", "user-fallback");
    expect(details.allowed).toBe(true);
    expect(details.following.map((p) => p.id)).toEqual(["writer-drift"]);

    // フォロー解除も localStorage に反映され成功すること
    await act(async () => {
      res = await currentHook.toggleFollow("writer-drift");
    });
    expect(res).toBe(true);
    expect(currentHook.isFollowing("writer-drift")).toBe(false);
    expect(
      JSON.parse(window.localStorage.getItem("quest_qlub_user_follows_user-fallback") || "[]"),
    ).toEqual([]);

    root2.unmount();
  });
});
