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

  it("highlights active navigation item based on current location", () => {
    renderHeader("/search");

    // 「探す」ボタンが active スタイル (text-blue-600) を持っていること
    const buttons = Array.from(container.querySelectorAll("button"));
    const searchButton = buttons.find((btn) => btn.textContent?.includes("探す"));
    expect(searchButton).toBeDefined();
    expect(searchButton?.querySelector(".text-blue-600")).not.toBeNull();

    // 「トップ」ボタンは active ではないこと
    const homeButton = buttons.find((btn) => btn.textContent?.includes("トップ"));
    expect(homeButton?.querySelector(".text-blue-600")).toBeNull();
  });

  it("navigates to target route when a nav button is clicked", () => {
    const { getCurrentPath } = renderHeader("/");
    expect(getCurrentPath()).toBe("/");

    // 「ライター」ボタンをクリック
    const buttons = Array.from(container.querySelectorAll("button"));
    const writersButton = buttons.find((btn) => btn.textContent?.includes("ライター"));
    expect(writersButton).toBeDefined();

    act(() => {
      writersButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getCurrentPath()).toBe("/writers");
  });

  it("navigates to root when brand logo is clicked", () => {
    const { getCurrentPath } = renderHeader("/favorites");
    expect(getCurrentPath()).toBe("/favorites");

    // ロゴ要素をクリック
    const logoContainer = container.querySelector(".cursor-pointer") as HTMLElement;
    expect(logoContainer).not.toBeNull();

    act(() => {
      logoContainer.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
