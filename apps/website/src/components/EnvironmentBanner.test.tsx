// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";

let mockIsDev = true;
let mockIsConnectedToProductionDb = true;

vi.mock("../supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../supabase")>();
  return {
    ...actual,
    get isDev() {
      return mockIsDev;
    },
    get isConnectedToProductionDb() {
      return mockIsConnectedToProductionDb;
    },
  };
});

import { EnvironmentBanner } from "./EnvironmentBanner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EnvironmentBanner", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockIsDev = true;
    mockIsConnectedToProductionDb = true;
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

  it("renders production DB warning banner in dev mode when connected to production DB", () => {
    mockIsDev = true;
    mockIsConnectedToProductionDb = true;

    act(() => {
      root!.render(<EnvironmentBanner />);
    });

    expect(container.textContent).toContain("本番用Supabaseデータベース");
    expect(container.textContent).toContain("データ作成・削除操作は本番環境に反映されます");
  });

  it("renders safe development DB banner in dev mode when not connected to prod", () => {
    mockIsDev = true;
    mockIsConnectedToProductionDb = false;

    act(() => {
      root!.render(<EnvironmentBanner />);
    });

    expect(container.textContent).toContain("開発・検証用データベースに接続しています");
  });

  it("dismisses banner when close button is clicked", () => {
    mockIsDev = true;
    mockIsConnectedToProductionDb = false;

    act(() => {
      root!.render(<EnvironmentBanner />);
    });

    const closeButton = container.querySelector('button[title="バナーを閉じる"]');
    expect(closeButton).not.toBeNull();

    act(() => {
      closeButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toBe("");
  });
});
