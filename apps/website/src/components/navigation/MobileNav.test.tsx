// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { MobileNav } from "./MobileNav";
import { NAV_ITEMS } from "./navItems";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MobileNav navigation", () => {
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

  function renderMobileNav(initialPath: string = "/") {
    let currentPath = initialPath;

    const LocationWatcher = () => {
      const location = useLocation();
      currentPath = location.pathname;
      return <span data-testid="current-path">{location.pathname}</span>;
    };

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <MobileNav />
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

  it("renders mobile navigation landmark with aria-label and semantic links", () => {
    renderMobileNav("/writers");

    const nav = container.querySelector('nav[aria-label="モバイルナビゲーション"]');
    expect(nav).not.toBeNull();

    const links = Array.from(nav!.querySelectorAll("a"));
    expect(links).toHaveLength(NAV_ITEMS.length);

    const writersLink = links.find((a) => a.textContent?.includes("ライター"));
    expect(writersLink?.getAttribute("href")).toBe("/writers");
    expect(writersLink?.getAttribute("aria-current")).toBe("page");

    const homeLink = links.find((a) => a.textContent?.includes("トップ"));
    expect(homeLink?.getAttribute("href")).toBe("/");
    expect(homeLink?.getAttribute("aria-current")).toBeNull();
  });

  it("navigates to target route when a mobile nav link is clicked", () => {
    const { getCurrentPath } = renderMobileNav("/");
    expect(getCurrentPath()).toBe("/");

    const searchLink = Array.from(container.querySelectorAll("nav a")).find((a) =>
      a.textContent?.includes("探す"),
    );
    expect(searchLink).toBeDefined();

    act(() => {
      searchLink!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(getCurrentPath()).toBe("/search");
  });
});
