// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { ProfileView } from "./ProfileView";
import { renderWithRouter, createTestProfile } from "../test/test-utils";
import { ARTICLE_LIST_FIELDS } from "../context/DataContext";
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
let mockIsAuthenticated = true;

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
    isAuthenticated: mockIsAuthenticated && Boolean(mockCurrentUser?.id),
    currentUserId: mockCurrentUser?.id ?? null,
  }),
  fetchFollowCounts: (...args: unknown[]) => mockFetchFollowCounts(...args),
  fetchFollowDetails: (...args: unknown[]) => mockFetchFollowDetails(...args),
}));

let lastArticlesSelectFields = "";

vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: (fields: string) => {
        if (table === "articles") {
          lastArticlesSelectFields = fields;
        }
        return {
          eq: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      },
    }),
  },
}));

describe("ProfileView (Follow counts and owner-only detailed lists)", () => {
  let unmountFn: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockToggleFollow.mockResolvedValue(true);
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

  it("プロフィールにフォロー中の人数は表示されずフォロワー数のみ表示され、他人や未ログイン時は詳細一覧を開けないこと", async () => {
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
    // フォロー中の人数は表示されないこと
    expect(followingEl).toBeNull();
    // フォロワー数は表示されること
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

    // フォロー中の人数ボタンはプロフィールに表示されないこと
    expect(openFollowingBtn).toBeNull();
    // フォロワー数のボタンは表示されること
    expect(openFollowersBtn).not.toBeNull();
    expect(openFollowersBtn?.textContent).toContain("28");

    await act(async () => {
      openFollowersBtn?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchFollowDetails).toHaveBeenCalledWith("writer-1", "writer-1");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("ボブ");

    // フォロー中タブに切り替え
    const modalButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    );
    const followingTabBtn = modalButtons.find((b) => b.textContent?.includes("フォロー中 (1)"));
    expect(followingTabBtn).toBeDefined();

    await act(async () => {
      followingTabBtn?.click();
    });

    expect(container.textContent).toContain("アリス");
  });

  it("queries writer articles using ARTICLE_LIST_FIELDS without comments_enabled", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;

    const { unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastArticlesSelectFields).toBe(ARTICLE_LIST_FIELDS);
    expect(lastArticlesSelectFields).not.toContain("comments_enabled");
  });

  it("allows logged-in user to follow without redirecting to login", async () => {
    mockCurrentUser = { id: "user-2" };
    mockCurrentProfile = createTestProfile({ id: "user-2", role: "viewer" });
    mockIsAuthenticated = true;
    mockToggleFollow.mockResolvedValue(true);

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const followButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followButton).toBeDefined();

    await act(async () => {
      followButton?.click();
      await Promise.resolve();
    });

    expect(mockToggleFollow).toHaveBeenCalledWith("writer-1");
    expect(mockNavigate).not.toHaveBeenCalledWith("login");
    expect(mockShowToast).toHaveBeenCalledWith("ライターをフォローしました");
  });

  it("redirects guest user to login when clicking follow", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;
    mockIsAuthenticated = false;

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const followButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followButton).toBeDefined();

    await act(async () => {
      followButton?.click();
      await Promise.resolve();
    });

    expect(mockToggleFollow).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("login");
    expect(mockShowToast).toHaveBeenCalledWith("フォローするにはログインが必要です");
  });

  it("shows error toast without redirecting to login when toggleFollow fails for logged in user", async () => {
    mockCurrentUser = { id: "user-2" };
    mockCurrentProfile = createTestProfile({ id: "user-2", role: "viewer" });
    mockIsAuthenticated = true;
    mockToggleFollow.mockResolvedValue(false);

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const followButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followButton).toBeDefined();

    await act(async () => {
      followButton?.click();
      await Promise.resolve();
    });

    expect(mockToggleFollow).toHaveBeenCalledWith("writer-1");
    expect(mockNavigate).not.toHaveBeenCalledWith("login");
    expect(mockShowToast).toHaveBeenCalledWith("フォロー処理に失敗しました");
  });
});
