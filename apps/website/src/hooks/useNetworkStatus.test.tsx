// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useNetworkStatus, type NetworkStatus } from "./useNetworkStatus";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let currentHook: NetworkStatus;

function HookTester() {
  currentHook = useNetworkStatus();
  return null;
}

describe("useNetworkStatus hook", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);

    Object.defineProperty(navigator, "onLine", {
      writable: true,
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it("initializes with current navigator.onLine value (online)", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    expect(currentHook.isOnline).toBe(true);
    expect(currentHook.wasOffline).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("updates to offline when offline event is fired", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(currentHook.isOnline).toBe(false);
    expect(currentHook.wasOffline).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("marks wasOffline true when online event is fired, and resets after 3s", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(currentHook.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(currentHook.isOnline).toBe(true);
    expect(currentHook.wasOffline).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(currentHook.wasOffline).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("removes event listeners on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    act(() => {
      root.unmount();
    });

    expect(removeEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });
});
