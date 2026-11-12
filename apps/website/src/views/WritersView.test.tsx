// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { WritersView } from "./WritersView";
import { renderWithRouter, createTestProfile } from "../test/test-utils";
import type { Profile } from "../supabase";

const mockNavigate = vi.fn();
const mockShowToast = vi.fn();
const mockToggleFollow = vi.fn();
const mockIsFollowing = vi.fn(() => false);

let mockWriters: Profile[] = [];
let mockCurrentUserId: string | null = null;
let mockIsAuthenticated = false;

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    writers: mockWriters,
    writersLoading: false,
    hasMoreWriters: false,
    loadingMoreWriters: false,
    loadMoreWriters: vi.fn(),
    navigate: mockNavigate,
    showToast: mockShowToast,
  }),
}));

vi.mock("../hooks/useFollows", () => ({
  useFollows: () => ({
    isFollowing: mockIsFollowing,
    toggleFollow: mockToggleFollow,
    isAuthenticated: mockIsAuthenticated,
    currentUserId: mockCurrentUserId,
  }),
}));

describe("WritersView (Follow actions and self-row protection)", () => {
  let unmountFn: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriters = [
      createTestProfile({
        id: "writer-1",
        display_name: "ライター1",
        username: "writer1",
        role: "writer",
      }),
      createTestProfile({
        id: "editor-1",
        display_name: "編集長1",
        username: "editor1",
        role: "editor",
      }),
    ];
    mockCurrentUserId = null;
    mockIsAuthenticated = false;
    mockToggleFollow.mockResolvedValue(true);
    mockIsFollowing.mockReturnValue(false);
  });

  afterEach(() => {
    if (unmountFn) {
      unmountFn();
      unmountFn = null;
    }
  });

  it("redirects guest user to login when clicking follow button", async () => {
    mockIsAuthenticated = false;
    mockCurrentUserId = null;

    const { container, unmount } = renderWithRouter(<WritersView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const followButtons = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followButtons.length).toBe(2);

    await act(async () => {
      followButtons[0]?.click();
      await Promise.resolve();
    });

    expect(mockToggleFollow).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("login");
    expect(mockShowToast).toHaveBeenCalledWith("フォローするにはログインが必要です");
  });

  it("allows logged-in user to follow without redirecting to login", async () => {
    mockIsAuthenticated = true;
    mockCurrentUserId = "user-other";
    mockToggleFollow.mockResolvedValue(true);

    const { container, unmount } = renderWithRouter(<WritersView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const followButtons = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followButtons.length).toBe(2);

    await act(async () => {
      followButtons[0]?.click();
      await Promise.resolve();
    });

    expect(mockToggleFollow).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith("login");
    expect(mockShowToast).toHaveBeenCalledWith("ライターをフォローしました");
  });

  it("hides follow button for current user's own writer row", async () => {
    mockIsAuthenticated = true;
    mockCurrentUserId = "writer-1"; // writer-1 本人としてログイン中

    const { container, unmount } = renderWithRouter(<WritersView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    // 2人中1人は自分自身なので、フォローボタンは1つだけ表示されること
    const followButtons = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followButtons.length).toBe(1);
  });

  it("shows error toast without redirecting to login when toggleFollow fails for logged in user", async () => {
    mockIsAuthenticated = true;
    mockCurrentUserId = "user-other";
    mockToggleFollow.mockResolvedValue(false);

    const { container, unmount } = renderWithRouter(<WritersView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const followButtons = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("フォロー"),
    );

    await act(async () => {
      followButtons[0]?.click();
      await Promise.resolve();
    });

    expect(mockToggleFollow).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith("login");
    expect(mockShowToast).toHaveBeenCalledWith("フォロー処理に失敗しました");
  });

  it("renders writer rows as Link anchors to /writers/:username and prevents navigation when clicking follow button", async () => {
    mockIsAuthenticated = true;
    mockCurrentUserId = "user-other";
    mockIsFollowing.mockImplementation((id?: string) => id === "editor-1");

    const { container, unmount } = renderWithRouter(<WritersView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const links = Array.from(container.querySelectorAll("a"));
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/writers/editor1");
    expect(hrefs).toContain("/writers/writer1");

    const followButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followButton).toBeDefined();
    expect(followButton?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      followButton?.click();
      await Promise.resolve();
    });

    expect(mockToggleFollow).toHaveBeenCalledWith("editor-1");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders writer avatar with descriptive alt text and lazy loading attributes", async () => {
    mockWriters = [
      createTestProfile({
        id: "writer-avatar",
        display_name: "アバター太郎",
        username: "avatar_taro",
        role: "writer",
        avatar_url: "https://example.com/avatar.jpg",
      }),
    ];

    const { container, unmount } = renderWithRouter(<WritersView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const img = container.querySelector('img[src="https://example.com/avatar.jpg"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toContain("アバター太郎");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");
  });

  it("uses WCAG AA contrast classes for empty writers message", async () => {
    mockWriters = [];

    const { container, unmount } = renderWithRouter(<WritersView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
    });

    const emptyMsg = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("ライターがまだいません"),
    );
    expect(emptyMsg).toBeDefined();
    expect(emptyMsg?.classList.contains("text-gray-500")).toBe(true);
    expect(emptyMsg?.classList.contains("dark:text-gray-400")).toBe(true);
    expect(emptyMsg?.classList.contains("text-gray-400")).toBe(false);
    expect(emptyMsg?.classList.contains("dark:text-gray-500")).toBe(false);
  });
});
