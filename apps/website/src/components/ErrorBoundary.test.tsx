// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { renderWithRouter } from "../test/test-utils";

function ProblematicComponent({
  shouldThrow,
  errorMessage,
}: {
  shouldThrow: boolean;
  errorMessage?: string;
}) {
  if (shouldThrow) {
    throw new Error(errorMessage || "Render error occurred");
  }
  return <div>Normal Content</div>;
}

describe("ErrorBoundary component", () => {
  const originalLocation = window.location;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "http://localhost/",
        reload: reloadMock,
      },
    });
    // Suppress console.error in tests for expected thrown errors
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("renders children when no error occurs", () => {
    const { container, unmount } = renderWithRouter(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(container.textContent).toContain("Normal Content");
    unmount();
  });

  it("renders general error fallback with reload button on regular errors", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });

    const { container, unmount } = renderWithRouter(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={true} errorMessage="Generic runtime crash" />
      </ErrorBoundary>,
    );

    expect(container.textContent).toContain("問題が発生しました");
    expect(container.textContent).toContain("再読み込み");

    const reloadBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("再読み込み"),
    );
    expect(reloadBtn).not.toBeUndefined();

    await act(async () => {
      reloadBtn?.click();
    });

    expect(reloadMock).toHaveBeenCalled();
    unmount();
  });

  it("renders OfflineFallbackView when offline or chunk error occurs", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const { container, unmount } = renderWithRouter(
      <ErrorBoundary>
        <ProblematicComponent
          shouldThrow={true}
          errorMessage="Failed to fetch dynamically imported module: /assets/SomeView.js"
        />
      </ErrorBoundary>,
    );

    expect(container.textContent).toContain("オフラインです");
    expect(container.textContent).toContain("再試行");
    expect(container.textContent).toContain("トップへ戻る");
    unmount();
  });
});
