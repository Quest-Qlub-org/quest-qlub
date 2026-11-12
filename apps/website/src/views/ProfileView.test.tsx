// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { ProfileView } from "./ProfileView";
import { renderWithRouter, createTestProfile, createTestArticle } from "../test/test-utils";
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
let mockGlobalArticles: any[] = [];

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ username: "writer-user" }),
  };
});

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    writers: [
      mockWriter,
      createTestProfile({ id: "other-writer", username: "other", display_name: "他ライター" }),
    ],
    writersLoading: false,
    articles: mockGlobalArticles,
    favorites: [],
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
let lastArticlesOrCondition = "";
let mockArticlesData: any[] = [];
let mockArticlesError: any = null;

vi.mock("../supabase", () => {
  return {
    supabase: {
      from: (table: string) => ({
        select: (fields: string) => {
          if (table === "articles") {
            lastArticlesSelectFields = fields;
          }
          const createBuilder = () => {
            const builder: any = {
              eq: vi.fn(() => builder),
              or: vi.fn((cond: string) => {
                lastArticlesOrCondition = cond;
                return builder;
              }),
              order: vi.fn(() => {
                if (mockArticlesError) {
                  const err = mockArticlesError;
                  mockArticlesError = null;
                  return Promise.resolve({ data: null, error: err });
                }
                return Promise.resolve({ data: mockArticlesData, error: null });
              }),
            };
            return builder;
          };
          return createBuilder();
        },
      }),
    },
  };
});

describe("ProfileView (Follow counts and owner-only detailed lists)", () => {
  let unmountFn: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockGlobalArticles = [];
    lastArticlesSelectFields = "";
    lastArticlesOrCondition = "";
    mockArticlesData = [];
    mockArticlesError = null;
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

  it("queries writer articles using or condition with writer_id and collaborator_ids", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;

    const { unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastArticlesSelectFields).toBe(ARTICLE_LIST_FIELDS);
    expect(lastArticlesOrCondition).toBe('writer_id.eq.writer-1,collaborator_ids.cs.{"writer-1"}');
  });

  it("displays co-authored articles with '共同執筆' badge on profile view", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;
    mockArticlesData = [
      {
        id: "art-primary",
        title: "主執筆記事タイトル",
        writer_id: "writer-1",
        status: "published",
        created_at: "2026-11-01T00:00:00Z",
        collaborator_ids: [],
      },
      {
        id: "art-collab",
        title: "共同執筆参加記事タイトル",
        writer_id: "other-writer",
        status: "published",
        created_at: "2026-11-02T00:00:00Z",
        collaborator_ids: ["writer-1"],
      },
    ];

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("この人の記事 (2件)");
    expect(container.textContent).toContain("主執筆記事タイトル");
    expect(container.textContent).toContain("共同執筆参加記事タイトル");

    // 共同執筆バッジが表示されていることを確認
    const badges = container.querySelectorAll('[data-testid="collaborator-badge"]');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toBe("共同執筆");
  });

  it("falls back to writer_id query when or query fails with schema error", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;
    mockArticlesError = { code: "42703", message: 'column "collaborator_ids" does not exist' };
    mockArticlesData = [
      {
        id: "art-fallback",
        title: "フォールバックで取得された単独記事",
        writer_id: "writer-1",
        status: "published",
        created_at: "2026-11-01T00:00:00Z",
      },
    ];

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("フォールバックで取得された単独記事");
    expect(container.querySelector('[data-testid="collaborator-badge"]')).toBeNull();
  });

  it("falls back to global articles including co-authored articles when DB returns empty", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;
    mockArticlesData = [];
    mockGlobalArticles = [
      createTestArticle({
        id: "global-1",
        title: "グローバル主執筆記事",
        writerId: "writer-1",
        status: "published",
      }),
      createTestArticle({
        id: "global-2",
        title: "グローバル共同執筆記事",
        writerId: "other-writer",
        collaboratorIds: ["writer-1"],
        status: "published",
      }),
      createTestArticle({
        id: "global-3",
        title: "関係ない記事",
        writerId: "other-writer",
        collaboratorIds: ["other-2"],
        status: "published",
      }),
    ];

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("この人の記事 (2件)");
    expect(container.textContent).toContain("グローバル主執筆記事");
    expect(container.textContent).toContain("グローバル共同執筆記事");
    expect(container.textContent).not.toContain("関係ない記事");

    const badges = container.querySelectorAll('[data-testid="collaborator-badge"]');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toBe("共同執筆");
  });

  it("sets canonical URL, ProfilePage + BreadcrumbList JSON-LD, h1/h2 hierarchy, and avatar alt (#99, #100, #102, #104)", async () => {
    mockCurrentUser = null;
    mockCurrentProfile = null;
    mockWriter = createTestProfile({
      id: "writer-1",
      username: "writer-user",
      display_name: "テストライター",
      avatar_url: "https://example.com/avatar.png",
      x_account: "@test_x_user",
      bio: "ライターの自己紹介",
      role: "writer",
    });

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe("テストライター");
    const h2 = container.querySelector("h2");
    expect(h2?.textContent).toContain("この人の記事");

    const avatarImg = container.querySelector("img");
    expect(avatarImg?.getAttribute("alt")).toBe("テストライターのアバター");

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://quest-qlub.vercel.app/writers/writer-user",
    );
    expect(document.querySelector('meta[name="twitter:creator"]')?.getAttribute("content")).toBe(
      "@test_x_user",
    );

    const script = document.getElementById("structured-data-json-ld");
    expect(script).not.toBeNull();
    const schemas = JSON.parse(script?.textContent || "[]");
    const profileSchema = schemas.find((s: any) => s["@type"] === "ProfilePage");
    const breadcrumbSchema = schemas.find((s: any) => s["@type"] === "BreadcrumbList");

    expect(profileSchema).toBeDefined();
    expect(profileSchema.mainEntity.name).toBe("テストライター");
    expect(profileSchema.mainEntity.sameAs).toEqual(["https://x.com/test_x_user"]);

    expect(breadcrumbSchema).toBeDefined();
    expect(breadcrumbSchema.itemListElement).toHaveLength(3);
  });

  it("supports Escape close, aria-labelledby, close aria-label, and Link rows in follow modal (#108, #112)", async () => {
    mockCurrentUser = { id: "writer-1" };
    mockCurrentProfile = mockWriter;

    const { container, unmount } = renderWithRouter(<ProfileView />);
    unmountFn = unmount;

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const openFollowersBtn = container.querySelector(
      '[data-testid="open-followers-list"]',
    ) as HTMLButtonElement;
    await act(async () => {
      openFollowersBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const labelledBy = dialog?.getAttribute("aria-labelledby");
    expect(labelledBy).toBe("follow-modal-title");
    expect(container.querySelector(`#${labelledBy}`)?.textContent).toBe("フォロー・フォロワー管理");

    const closeBtn = dialog?.querySelector('button[aria-label="閉じる"]');
    expect(closeBtn).not.toBeNull();

    const userLink = dialog?.querySelector('a[href="/writers/bob"]');
    expect(userLink).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
