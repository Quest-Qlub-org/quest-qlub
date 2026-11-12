// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { NAV_ITEMS } from "./navItems";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Header navigation", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
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
  });

  function renderHeader(initialPath: string = "/") {
    let currentPath = initialPath;

    const LocationWatcher = () => {
      const location = useLocation();
      currentPath = location.pathname;
      return <span data-testid="current-path">{location.pathname}</span>;
    };

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <Header />
          <LocationWatcher />
          <Routes>
            <Route path="*" element={null} />
          </Routes>
        </MemoryRouter>,
      );
    });

    return {
      getCurrentPath: () => currentPath,
    };
  }

  it("renders brand logo and all navigation items", () => {
    renderHeader("/");

    // ブランド画像 (Quest Qlub)
    const logoImg = container.querySelector('img[alt="Quest Qlub"]');
    expect(logoImg).not.toBeNull();

    // 各ナビゲーション項目が表示されていること
    NAV_ITEMS.forEach((item) => {
      expect(container.textContent).toContain(item.label);
    });
  });

  it("renders main navigation landmark and semantic links with aria-current", () => {
    renderHeader("/search");

    const nav = container.querySelector('nav[aria-label="メインナビゲーション"]');
    expect(nav).not.toBeNull();

    const links = Array.from(nav!.querySelectorAll("a"));
    expect(links).toHaveLength(NAV_ITEMS.length);

    // 「探す」リンクが active スタイルと aria-current="page" を持っていること
    const searchLink = links.find((a) => a.textContent?.includes("探す"));
    expect(searchLink).toBeDefined();
    expect(searchLink?.getAttribute("href")).toBe("/search");
    expect(searchLink?.getAttribute("aria-current")).toBe("page");
    expect(searchLink?.querySelector(".text-blue-600")).not.toBeNull();

    // 「トップ」リンクは active ではないこと
    const homeLink = links.find((a) => a.textContent?.includes("トップ"));
    expect(homeLink?.getAttribute("href")).toBe("/");
    expect(homeLink?.getAttribute("aria-current")).toBeNull();
    expect(homeLink?.querySelector(".text-blue-600")).toBeNull();
  });

  it("navigates to target route when a nav link is clicked", () => {
    const { getCurrentPath } = renderHeader("/");
    expect(getCurrentPath()).toBe("/");

    // 「ライター」リンクをクリック
    const links = Array.from(container.querySelectorAll("nav a"));
    const writersLink = links.find((a) => a.textContent?.includes("ライター"));
    expect(writersLink).toBeDefined();

    act(() => {
      writersLink!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(getCurrentPath()).toBe("/writers");
  });

  it("navigates to root when brand logo link is clicked", () => {
    const { getCurrentPath } = renderHeader("/favorites");
    expect(getCurrentPath()).toBe("/favorites");

    // ロゴリンクをクリック
    const logoLink = container.querySelector('a[href="/"]') as HTMLElement;
    expect(logoLink).not.toBeNull();

    act(() => {
      logoLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(getCurrentPath()).toBe("/");
  });

  it("does not render theme toggle button in header", () => {
    act(() => {
      root!.render(
        <MemoryRouter initialEntries={["/"]}>
          <Header />
        </MemoryRouter>,
      );
    });

    const toggleBtn = container.querySelector('button[aria-label*="モードに切り替え"]');
    expect(toggleBtn).toBeNull();
  });
});
