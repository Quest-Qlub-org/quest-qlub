// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { FavoritesView } from "./FavoritesView";
import * as AppContextModule from "../context/AppContext";
import { createTestArticle, createTestProfile } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("FavoritesView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  const mockNavigate = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockNavigate.mockReset();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  function setupAppMock(overrides: Partial<ReturnType<typeof AppContextModule.useApp>> = {}) {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles: [],
      articlesLoading: false,
      favorites: [],
      navigate: mockNavigate,
      userRole: "viewer",
      authLoading: false,
      writers: [],
      ...overrides,
    } as unknown as ReturnType<typeof AppContextModule.useApp>);
  }

  it("shows login prompt when user is a guest", () => {
    setupAppMock({
      userRole: "guest",
      authLoading: false,
    });

    act(() => {
      root!.render(<FavoritesView />);
    });

    expect(container.textContent).toContain("ログインが必要です");
    expect(container.textContent).toContain("お気に入り機能を利用するには");

    const loginButton = container.querySelector("button");
    expect(loginButton?.textContent).toContain("ログインする");

    act(() => {
      loginButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("shows empty state when user has no favorites", () => {
    setupAppMock({
      userRole: "viewer",
      authLoading: false,
      favorites: [],
      articles: [],
    });

    act(() => {
      root!.render(<FavoritesView />);
    });

    expect(container.textContent).toContain("登録されている記事がありません");
    expect(container.textContent).toContain("好きな記事を見つけて☆アイコンをタップしましょう");

    const searchButton = container.querySelector("button");
    expect(searchButton?.textContent).toContain("記事を探す");

    act(() => {
      searchButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("renders list of favorited articles when favorites exist", () => {
    const writer = createTestProfile({ id: "writer-fav", display_name: "人気ライター" });
    const article1 = createTestArticle({
      id: "fav-art-1",
      title: "お気に入り記事その1",
      writerId: "writer-fav",
      status: "published",
    });
    const article2 = createTestArticle({
      id: "fav-art-2",
      title: "お気に入り記事その2",
      writerId: "writer-fav",
      status: "published",
    });
    const unFavoritedArticle = createTestArticle({
      id: "other-art",
      title: "対象外の記事",
      writerId: "writer-fav",
      status: "published",
    });

    setupAppMock({
      userRole: "viewer",
      authLoading: false,
      writers: [writer],
      articles: [article1, article2, unFavoritedArticle],
      favorites: ["fav-art-1", "fav-art-2"],
    });

    act(() => {
      root!.render(<FavoritesView />);
    });

    expect(container.textContent).toContain("お気に入り記事その1");
    expect(container.textContent).toContain("お気に入り記事その2");
    expect(container.textContent).not.toContain("対象外の記事");
  });
});
