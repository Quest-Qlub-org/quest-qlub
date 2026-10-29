// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { OfflineBanner } from "./OfflineBanner";
import { renderWithRouter } from "../../test/test-utils";
import * as NetworkStatusHook from "../../hooks/useNetworkStatus";

describe("OfflineBanner component", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when online and not recently offline", () => {
    vi.spyOn(NetworkStatusHook, "useNetworkStatus").mockReturnValue({
      isOnline: true,
      wasOffline: false,
    });

    const { container, unmount } = renderWithRouter(<OfflineBanner />);
    expect(container.querySelector('[data-testid="offline-banner"]')).toBeNull();
    expect(container.querySelector('[data-testid="reconnected-banner"]')).toBeNull();
    unmount();
  });

  it("renders offline warning banner when offline", () => {
    vi.spyOn(NetworkStatusHook, "useNetworkStatus").mockReturnValue({
      isOnline: false,
      wasOffline: false,
    });

    const { container, unmount } = renderWithRouter(<OfflineBanner />);
    const banner = container.querySelector('[data-testid="offline-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("現在オフラインです。一部の機能が制限されます");
    expect(banner?.getAttribute("role")).toBe("status");
    unmount();
  });

  it("renders reconnected banner when returning online", () => {
    vi.spyOn(NetworkStatusHook, "useNetworkStatus").mockReturnValue({
      isOnline: true,
      wasOffline: true,
    });

    const { container, unmount } = renderWithRouter(<OfflineBanner />);
    const banner = container.querySelector('[data-testid="reconnected-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("オンラインに復帰しました");
    expect(banner?.getAttribute("role")).toBe("status");
    unmount();
  });
});
