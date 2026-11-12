// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { HomeView } from "./HomeView";
import * as AppContextModule from "../context/AppContext";
import { renderWithRouter, createTestArticle, createTestProfile } from "../test/test-utils";
import * as FollowsHook from "../hooks/useFollows";

describe("HomeView", () => {
  let unmountFn: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (unmountFn) {
      unmountFn();
      unmountFn = null;
    }
    vi.restoreAllMocks();
  });

  function setupMocks(
    options: {
      articles?: ReturnType<typeof createTestArticle>[];
      writers?: ReturnType<typeof createTestProfile>[];
      followedIds?: string[];
    } = {},
  ) {
    const { articles = [], writers = [], followedIds = [] } = options;
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles,
      articlesLoading: false,
      hasMoreArticles: false,
      loadingMoreArticles: false,
      loadMoreArticles: vi.fn(),
      navigate: vi.fn(),
      writers,
      favorites: [],
    } as unknown as ReturnType<typeof AppContextModule.useApp>);

    vi.spyOn(FollowsHook, "useFollows").mockReturnValue({
      followedIds,
      isFollowing: () => false,
      toggleFollow: vi.fn(),
      isAuthenticated: false,
      currentUserId: null,
    } as unknown as ReturnType<typeof FollowsHook.useFollows>);
  }

  it("renders a single h1 in the hero section followed by h2 section headings without skipping levels", () => {
    const article = createTestArticle({
      id: "art-1",
      title: "テスト記事",
      isRecommended: true,
      isPopular: true,
      status: "published",
    });
    setupMocks({ articles: [article] });

    const { container, unmount } = renderWithRouter(<HomeView />);
    unmountFn = unmount;

    const h1s = container.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    const heroImg = h1s[0]?.querySelector("img");
    expect(heroImg?.getAttribute("alt")).toContain("Quest Qlub");

    const h2Texts = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent?.trim());
    expect(h2Texts).toContain("おすすめの記事");
    expect(h2Texts).toContain("人気の記事");
    expect(h2Texts).toContain("新着・記事一覧");
  });

  it("uses WCAG AA contrast classes for empty messages and article count label", () => {
    setupMocks({ articles: [], followedIds: ["w-1"] });

    const { container, unmount } = renderWithRouter(<HomeView />);
    unmountFn = unmount;

    const emptyTexts = [
      "まだおすすめ記事はありません",
      "まだ人気記事はありません",
      "フォロー中のライターの公開記事はまだありません",
      "まだ公開記事はありません",
      "0 件表示中",
    ];

    for (const text of emptyTexts) {
      const el = Array.from(container.querySelectorAll("p, span, div.border-dashed")).find(
        (node) => node.textContent?.trim() === text,
      );
      expect(el).toBeDefined();
      expect(el?.classList.contains("text-gray-500")).toBe(true);
      expect(el?.classList.contains("dark:text-gray-400")).toBe(true);
      expect(el?.classList.contains("text-gray-400")).toBe(false);
      expect(el?.classList.contains("dark:text-gray-500")).toBe(false);
    }
  });
});
