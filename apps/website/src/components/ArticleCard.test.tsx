// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ArticleCard } from "./ArticleCard";
import * as AppContextModule from "../context/AppContext";
import { createTestArticle, createTestProfile } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ArticleCard", () => {
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

  function setupAppMock(
    options: {
      writers?: ReturnType<typeof createTestProfile>[];
      favorites?: string[];
    } = {},
  ) {
    const { writers = [], favorites = [] } = options;
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      writers,
      favorites,
      navigate: mockNavigate,
    } as unknown as ReturnType<typeof AppContextModule.useApp>);
  }

  it("renders article title and writer display_name correctly", () => {
    const mockWriter = createTestProfile({ id: "writer-1", display_name: "山田太郎" });
    const mockArticle = createTestArticle({
      id: "art-1",
      title: "楽しく学ぶ天文学入門",
      writerId: "writer-1",
    });

    setupAppMock({ writers: [mockWriter], favorites: [] });

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    expect(container.textContent).toContain("楽しく学ぶ天文学入門");
    expect(container.textContent).toContain("山田太郎");
  });

  it("falls back to @username when display_name is not set", () => {
    const mockWriter = createTestProfile({
      id: "writer-2",
      display_name: null,
      username: "astronomer",
    });
    const mockArticle = createTestArticle({
      id: "art-2",
      title: "星空観察ガイド",
      writerId: "writer-2",
    });

    setupAppMock({ writers: [mockWriter], favorites: [] });

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    expect(container.textContent).toContain("@astronomer");
  });

  it("falls back to '名称未設定' when writer is not found", () => {
    const mockArticle = createTestArticle({
      id: "art-3",
      title: "未知の記事",
      writerId: "unknown-writer",
    });

    setupAppMock({ writers: [], favorites: [] });

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    expect(container.textContent).toContain("名称未設定");
  });

  it("renders thumbnail image when thumbnailUrl is provided", () => {
    const mockArticle = createTestArticle({
      id: "art-thumb",
      thumbnailUrl: "https://example.com/thumb.jpg",
    });

    setupAppMock();

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/thumb.jpg");
    expect(img?.getAttribute("alt")).toBe(mockArticle.title);
  });

  it("renders thumbnail color fallback when thumbnailUrl is null", () => {
    const mockArticle = createTestArticle({
      id: "art-color",
      thumbnailUrl: null,
      thumbnailColor: "green",
    });

    setupAppMock();

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    // green の背景色クラス bg-green-100 が付与されていること
    expect(container.querySelector(".bg-green-100")).not.toBeNull();
    // ロゴ画像 (LogoIcon) が描画されること
    const logoImg = container.querySelector('img[alt="Logo"]');
    expect(logoImg).not.toBeNull();
  });

  it("displays filled star icon when article is favorited", () => {
    const mockArticle = createTestArticle({ id: "art-fav-1" });

    // お気に入りに含まれている場合
    setupAppMock({ favorites: ["art-fav-1"] });

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    // CustomStarIcon の active クラス（ring-yellow-400）の存在を検証
    const starImg = container.querySelector('img[alt="Star"]');
    expect(starImg).not.toBeNull();
    expect(starImg?.className).toContain("ring-yellow-400");
  });

  it("calls navigate with article id when clicked", () => {
    const mockArticle = createTestArticle({ id: "art-clickable" });

    setupAppMock();

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    const card = container.firstElementChild as HTMLElement;
    act(() => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockNavigate).toHaveBeenCalledWith("article", "art-clickable");
  });

  it("applies horizontal and vertical layout styles", () => {
    const mockArticle = createTestArticle();
    setupAppMock();

    // 1. horizontal (デフォルト)
    act(() => {
      root!.render(<ArticleCard article={mockArticle} layout="horizontal" />);
    });
    expect((container.firstElementChild as HTMLElement).className).toContain("flex h-28");
    const contentDiv = container.firstElementChild?.lastElementChild as HTMLElement;
    expect(contentDiv.className).toContain("flex-1 min-w-0");

    // 2. vertical
    act(() => {
      root!.render(<ArticleCard article={mockArticle} layout="vertical" />);
    });
    expect((container.firstElementChild as HTMLElement).className).toContain("flex flex-col");
  });

  it("renders formatted publication date when createdAt is present", () => {
    const mockArticle = createTestArticle({
      id: "art-date",
      createdAt: "2026-10-24T10:00:00",
    });
    setupAppMock();

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    expect(container.textContent).toContain("2026/10/24");
  });
});
