// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";

let mockIsDevelopment = true;

vi.mock("../supabaseConfig", () => ({
  get isDevelopment() {
    return mockIsDevelopment;
  },
}));

import { EnvironmentBanner } from "./EnvironmentBanner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EnvironmentBanner", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockIsDevelopment = true;
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

  it("does not render in production mode", () => {
    mockIsDevelopment = false;

    act(() => {
      root!.render(<EnvironmentBanner />);
    });

    expect(container.textContent).toBe("");
  });

  it("renders safe development DB banner in dev mode when not connected to prod", () => {
    act(() => {
      root!.render(<EnvironmentBanner />);
    });

    expect(container.textContent).toContain("開発・検証用データベースに接続しています");
  });

  it("dismisses banner when close button is clicked", () => {
    act(() => {
      root!.render(<EnvironmentBanner />);
    });

    const closeButton = container.querySelector('button[aria-label="バナーを閉じる"]');
    expect(closeButton).not.toBeNull();
    expect(closeButton?.getAttribute("type")).toBe("button");

    act(() => {
      closeButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toBe("");
  });
});
