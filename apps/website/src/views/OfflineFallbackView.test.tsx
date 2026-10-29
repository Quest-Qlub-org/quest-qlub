/* eslint-disable @typescript-eslint/unbound-method */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { OfflineFallbackView } from "./OfflineFallbackView";
import { renderWithRouter } from "../test/test-utils";

describe("OfflineFallbackView component", () => {
  const originalLocation = window.location;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "http://localhost/offline",
        pathname: "/offline",
        reload: reloadMock,
        assign: vi.fn(),
        replace: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("renders offline warning heading and description", () => {
    const { container, unmount } = renderWithRouter(<OfflineFallbackView />);
    expect(container.textContent).toContain("オフラインです");
    expect(container.textContent).toContain("通信状況を確認してもう一度お試しください");
    unmount();
  });

  it("calls window.location.reload when '再試行' is clicked", async () => {
    const { container, unmount } = renderWithRouter(<OfflineFallbackView />);
    const retryBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("再試行"),
    );
    expect(retryBtn).not.toBeUndefined();

    await act(async () => {
      retryBtn?.click();
    });

    expect(reloadMock).toHaveBeenCalled();
    unmount();
  });

  it("renders 'トップへ戻る' button", () => {
    const { container, unmount } = renderWithRouter(<OfflineFallbackView />);
    const homeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("トップへ戻る"),
    );
    expect(homeBtn).not.toBeUndefined();
    unmount();
  });
});
