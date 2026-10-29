// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { NotFoundView } from "./App";
import { renderWithRouter } from "./test/test-utils";
import * as NetworkStatusHook from "./hooks/useNetworkStatus";

describe("NotFoundView component", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 404 page when online", () => {
    vi.spyOn(NetworkStatusHook, "useNetworkStatus").mockReturnValue({
      isOnline: true,
      wasOffline: false,
    });

    const { container, unmount } = renderWithRouter(<NotFoundView />);
    expect(container.textContent).toContain("404");
    expect(container.textContent).toContain("ページが見つかりません");
    unmount();
  });

  it("renders OfflineFallbackView when offline", () => {
    vi.spyOn(NetworkStatusHook, "useNetworkStatus").mockReturnValue({
      isOnline: false,
      wasOffline: false,
    });

    const { container, unmount } = renderWithRouter(<NotFoundView />);
    expect(container.textContent).toContain("オフラインです");
    expect(container.textContent).toContain("通信状況を確認してもう一度お試しください");
    expect(container.textContent).not.toContain("404");
    unmount();
  });
});
