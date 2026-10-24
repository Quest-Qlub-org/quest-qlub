// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { ProfileView } from "./ProfileView";
import { renderWithRouter, createTestProfile } from "../test/test-utils";
import type { Profile } from "../supabase";

const mockNavigate = vi.fn();
const mockShowToast = vi.fn();
const mockToggleFollow = vi.fn();
const mockIsFollowing = vi.fn(() => false);
const mockFetchFollowCounts = vi.fn();
const mockFetchFollowDetails = vi.fn();

let mockWriter: Profile;
let mockCurrentUser: { id: string } | null = null;
let mockCurrentProfile: Profile | null = null;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ username: "writer-user" }),
  };
});

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    writers: [mockWriter],
    writersLoading: false,
    articles: [],
    navigate: mockNavigate,
    viewParam: "writer-user",
    showToast: mockShowToast,
    profile: mockCurrentProfile,
    user: mockCurrentUser,
  }),
}));

vi.mock("../hooks/useFollows", () => ({
  useFollows: () => ({
    isFollowing: mockIsFollowing,
    toggleFollow: mockToggleFollow,
  }),
  fetchFollowCounts: (...args: unknown[]) => mockFetchFollowCounts(...args),
  fetchFollowDetails: (...args: unknown[]) => mockFetchFollowDetails(...args),
}));

vi.mock("../supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

describe("ProfileView (Follow counts and owner-only detailed lists)", () => {
  let unmountFn: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriter = createTestProfile({
      id: "writer-1",
      username: "writer-user",
      display_name: "テストライター",
      role: "writer",
    });
    mockFetchFollowCounts.mockResolvedValue({
      followingCount: 14,
      followersCount: 28,
    });
    mockFetchFollowDetails.mockResolvedValue({
      allowed: true,
      following: [
        createTestProfile({
          id: "followed-1",
          username: "alice",
          display_name: "アリス",
        }),
      ],
      followers: [
        createTestProfile({
          id: "follower-1",
          username: "bob",
          display_name: "ボブ",
        }),
      ],
    });
  });

  afterEach(() => {
    if (unmountFn) {
      unmountFn();
      unmountFn = null;
    }
  });

  it("誰もがフォロー中・フォロワーの件数を確認でき、他人や未ログイン時は詳細一覧を開けないこと", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const followingEl = container.querySelector('[data-testid="public-following-count"]');
    const followersEl = container.querySelector('[data-testid="public-followers-count"]');
    expect(followingEl?.textContent).toContain("14");
    expect(followersEl?.textContent).toContain("28");

    // 本人以外の閲覧時は詳細ボタンが存在しない
    expect(container.querySelector('[data-testid="open-following-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="open-followers-list"]')).toBeNull();
  });

  it("未ログイン時にフォローボタンを押すとログイン誘導されること", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;
    mockToggleFollow.mockResolvedValue(false);

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const followBtn = buttons.find((b) => b.textContent?.includes("フォロー"));
    expect(followBtn).toBeDefined();

    await act(async () => {
      followBtn?.click();
      await Promise.resolve();
    });

    expect(mockShowToast).toHaveBeenCalledWith("フォローするにはログインが必要です");
    expect(mockNavigate).toHaveBeenCalledWith("login");
  });

  it("本人が自分のプロフィールを閲覧した時のみ、フォロー中・フォロワーの詳細アカウント一覧モーダルを確認できること", async () => {
    mockCurrentUser = { id: "writer-1" };
    mockCurrentProfile = mockWriter;

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const openFollowingBtn = container.querySelector(
      '[data-testid="open-following-list"]',
    ) as HTMLButtonElement | null;
    const openFollowersBtn = container.querySelector(
      '[data-testid="open-followers-list"]',
    ) as HTMLButtonElement | null;

    expect(openFollowingBtn).not.toBeNull();
    expect(openFollowersBtn).not.toBeNull();
    expect(openFollowingBtn?.textContent).toContain("14");
    expect(openFollowersBtn?.textContent).toContain("28");

    await act(async () => {
      openFollowingBtn?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchFollowDetails).toHaveBeenCalledWith("writer-1", "writer-1");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("アリス");

    // フォロワータブに切り替え
    const modalButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    );
    const followersTabBtn = modalButtons.find((b) => b.textContent?.includes("フォロワー (1)"));
    expect(followersTabBtn).toBeDefined();

    await act(async () => {
      followersTabBtn?.click();
    });

    expect(container.textContent).toContain("ボブ");
  });
});
