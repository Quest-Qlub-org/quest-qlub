// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
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

  function renderCard(ui: React.ReactElement) {
    act(() => {
      root!.render(<MemoryRouter>{ui}</MemoryRouter>);
    });
  }

  it("renders article title and writer display_name correctly", () => {
    const mockWriter = createTestProfile({ id: "writer-1", display_name: "山田太郎" });
    const mockArticle = createTestArticle({
      id: "art-1",
      title: "楽しく学ぶ天文学入門",
      writerId: "writer-1",
    });

    setupAppMock({ writers: [mockWriter], favorites: [] });

    renderCard(<ArticleCard article={mockArticle} />);

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

    renderCard(<ArticleCard article={mockArticle} />);

    expect(container.textContent).toContain("@astronomer");
  });

  it("falls back to '名称未設定' when writer is not found", () => {
    const mockArticle = createTestArticle({
      id: "art-3",
      title: "未知の記事",
      writerId: "unknown-writer",
    });

    setupAppMock({ writers: [], favorites: [] });

    renderCard(<ArticleCard article={mockArticle} />);

    expect(container.textContent).toContain("名称未設定");
  });

  it("renders thumbnail image with lazy loading and async decoding when thumbnailUrl is provided", () => {
    const mockArticle = createTestArticle({
      id: "art-thumb",
      thumbnailUrl: "https://example.com/thumb.jpg",
    });

    setupAppMock();

    renderCard(<ArticleCard article={mockArticle} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/thumb.jpg");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");
  });

  it("renders thumbnail color fallback when thumbnailUrl is null", () => {
    const mockArticle = createTestArticle({
      id: "art-color",
      thumbnailUrl: null,
      thumbnailColor: "green",
    });

    setupAppMock();

    renderCard(<ArticleCard article={mockArticle} />);

    // green の背景色クラス bg-green-100 が付与されていること
    const bgContainer = container.querySelector(".bg-green-100");
    expect(bgContainer).not.toBeNull();
    // ロゴ画像 (LogoIcon) が描画されること
    const logoImg = bgContainer?.querySelector("img");
    expect(logoImg).not.toBeNull();
  });

  it("displays filled star icon when article is favorited", () => {
    const mockArticle = createTestArticle({ id: "art-fav-1" });

    // お気に入りに含まれている場合
    setupAppMock({ favorites: ["art-fav-1"] });

    renderCard(<ArticleCard article={mockArticle} />);

    // CustomStarIcon の active クラス（ring-yellow-400）の存在を検証
    const starImg = container.querySelector("img.ring-yellow-400");
    expect(starImg).not.toBeNull();
  });

  it("renders as an anchor link to /articles/:id and navigates on click", () => {
    const mockArticle = createTestArticle({ id: "art-clickable" });
    let currentPathname = "";

    const LocationProbe = () => {
      currentPathname = useLocation().pathname;
      return null;
    };

    setupAppMock();

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={["/"]}>
          <ArticleCard article={mockArticle} />
          <LocationProbe />
        </MemoryRouter>,
      );
    });

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/articles/art-clickable");

    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(currentPathname).toBe("/articles/art-clickable");
  });

  it("falls back to navigate when rendered outside router context", () => {
    const mockArticle = createTestArticle({ id: "art-outside-router" });
    setupAppMock();

    act(() => {
      root!.render(<ArticleCard article={mockArticle} />);
    });

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/articles/art-outside-router");

    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(mockNavigate).toHaveBeenCalledWith("article", "art-outside-router");
  });

  it("applies horizontal and vertical layout styles", () => {
    const mockArticle = createTestArticle();
    setupAppMock();

    // 1. horizontal (デフォルト)
    renderCard(<ArticleCard article={mockArticle} layout="horizontal" />);
    expect((container.firstElementChild as HTMLElement).className).toContain("flex h-28");
    const contentDiv = container.firstElementChild?.lastElementChild as HTMLElement;
    expect(contentDiv.className).toContain("flex-1 min-w-0");

    // 2. vertical
    renderCard(<ArticleCard article={mockArticle} layout="vertical" />);
    expect((container.firstElementChild as HTMLElement).className).toContain("flex flex-col");
  });

  it("renders formatted publication date with WCAG AA contrast classes when createdAt is present", () => {
    const mockArticle = createTestArticle({
      id: "art-date",
      createdAt: "2026-10-24T10:00:00",
    });
    setupAppMock();

    renderCard(<ArticleCard article={mockArticle} />);

    expect(container.textContent).toContain("2026/10/24");
    const dateSpan = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "2026/10/24",
    );
    expect(dateSpan?.classList.contains("text-gray-500")).toBe(true);
    expect(dateSpan?.classList.contains("dark:text-gray-400")).toBe(true);
    expect(dateSpan?.classList.contains("text-gray-400")).toBe(false);
    expect(dateSpan?.classList.contains("dark:text-gray-500")).toBe(false);
  });

  it("renders 共同執筆 badge when isCollaborator is true", () => {
    const mockArticle = createTestArticle({
      id: "art-collab",
      title: "共同執筆した記事タイトル",
    });
    setupAppMock();

    renderCard(<ArticleCard article={mockArticle} isCollaborator={true} />);

    const badge = container.querySelector('[data-testid="collaborator-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("共同執筆");
  });

  it("does not render 共同執筆 badge when isCollaborator is false or undefined", () => {
    const mockArticle = createTestArticle({
      id: "art-solo",
      title: "単独執筆した記事タイトル",
    });
    setupAppMock();

    renderCard(<ArticleCard article={mockArticle} />);

    expect(container.querySelector('[data-testid="collaborator-badge"]')).toBeNull();
    expect(container.textContent).not.toContain("共同執筆");
  });
});
