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
});
