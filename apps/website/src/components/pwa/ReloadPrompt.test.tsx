// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { act } from "react";
import * as PwaRegister from "virtual:pwa-register/react";
import { ReloadPrompt } from "./ReloadPrompt";
import { renderWithRouter } from "../../test/test-utils";

describe("ReloadPrompt component", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when needRefresh is false", () => {
    vi.spyOn(PwaRegister, "useRegisterSW").mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(<ReloadPrompt />);
    expect(container.querySelector('[data-testid="pwa-reload-prompt"]')).toBeNull();
    unmount();
  });

  it("renders update prompt when needRefresh is true", () => {
    vi.spyOn(PwaRegister, "useRegisterSW").mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(<ReloadPrompt />);
    const prompt = container.querySelector('[data-testid="pwa-reload-prompt"]');
    expect(prompt).not.toBeNull();
    expect(prompt?.textContent).toContain("新しいバージョンが利用可能です");
    expect(prompt?.textContent).toContain("更新する");
    expect(prompt?.textContent).toContain("あとで");
    unmount();
  });

  it("calls updateServiceWorker(true) when clicking '更新する'", async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(PwaRegister, "useRegisterSW").mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    });

    const { container, unmount } = renderWithRouter(<ReloadPrompt />);
    const updateBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("更新する"),
    );
    expect(updateBtn).not.toBeUndefined();

    await act(async () => {
      updateBtn?.click();
    });

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    unmount();
  });

  it("closes prompt when clicking 'あとで' or the close button", async () => {
    const setNeedRefresh = vi.fn();
    vi.spyOn(PwaRegister, "useRegisterSW").mockReturnValue({
      needRefresh: [true, setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(<ReloadPrompt />);
    const laterBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("あとで"),
    );
    expect(laterBtn).not.toBeUndefined();

    await act(async () => {
      laterBtn?.click();
    });

    expect(setNeedRefresh).toHaveBeenCalledWith(false);

    const closeBtn = container.querySelector(
      'button[aria-label="プロンプトを閉じる"]',
    ) as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn?.click();
    });

    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    unmount();
  });

  it("registers registration callback and triggers update periodically when online", () => {
    vi.useFakeTimers();
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const mockRegistration = { update: updateMock } as unknown as ServiceWorkerRegistration;

    vi.spyOn(PwaRegister, "useRegisterSW").mockImplementation((options) => {
      // simulate onRegistered callback
      options?.onRegistered?.(mockRegistration);
      return {
        needRefresh: [false, vi.fn()],
        offlineReady: [false, vi.fn()],
        updateServiceWorker: vi.fn(),
      };
    });

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });

    const { unmount } = renderWithRouter(<ReloadPrompt />);

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });

    expect(updateMock).toHaveBeenCalledTimes(1);

    unmount();

    // After unmount, timer should be cleared
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(updateMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
