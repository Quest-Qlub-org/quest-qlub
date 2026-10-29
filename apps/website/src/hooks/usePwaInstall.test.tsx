// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  usePwaInstall,
  type UsePwaInstallResult,
  type BeforeInstallPromptEvent,
  checkIsStandalone,
  checkIsIos,
  PWA_DISMISSED_STORAGE_KEY,
  setGlobalDeferredPromptForTesting,
  setGlobalIsInstalledForTesting,
} from "./usePwaInstall";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let currentHook: UsePwaInstallResult;

function HookTester() {
  currentHook = usePwaInstall();
  return null;
}

describe("usePwaInstall hook", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    setGlobalDeferredPromptForTesting(null);
    setGlobalIsInstalledForTesting(false);
    container = document.createElement("div");
    document.body.appendChild(container);

    // Default window.matchMedia mock
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setGlobalDeferredPromptForTesting(null);
    setGlobalIsInstalledForTesting(false);
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it("initializes with default values when in normal browser", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    expect(currentHook.isDismissed).toBe(false);
    expect(currentHook.isStandalone).toBe(false);
    expect(currentHook.isInstalled).toBe(false);
    expect(currentHook.canInstallPrompt).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("detects standalone display-mode", () => {
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (query: string) => ({
        matches: query.includes("standalone"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

    expect(checkIsStandalone()).toBe(true);

    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    expect(currentHook.isStandalone).toBe(true);
    expect(currentHook.isInstalled).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("detects iOS standalone from navigator.standalone", () => {
    Object.defineProperty(window.navigator, "standalone", {
      configurable: true,
      value: true,
    });

    expect(checkIsStandalone()).toBe(true);

    // Clean up
    delete (window.navigator as unknown as { standalone?: boolean }).standalone;
  });

  it("detects iOS device from userAgent", () => {
    const originalUa = navigator.userAgent;
    try {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      });

      expect(checkIsIos()).toBe(true);
    } finally {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: originalUa,
      });
    }
  });

  it("handles beforeinstallprompt event and triggers promptInstall", async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined);
    const mockChoice = { outcome: "accepted" as const, platform: "web" };

    const mockEvent = {
      preventDefault: vi.fn(),
      prompt: promptMock,
      userChoice: Promise.resolve(mockChoice),
      platforms: ["web"],
    } as unknown as BeforeInstallPromptEvent;

    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    expect(currentHook.canInstallPrompt).toBe(false);

    act(() => {
      setGlobalDeferredPromptForTesting(mockEvent);
    });

    expect(currentHook.canInstallPrompt).toBe(true);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await currentHook.promptInstall();
    });

    expect(promptMock).toHaveBeenCalled();
    expect(outcome).toBe("accepted");
    expect(currentHook.isInstalled).toBe(true);
    expect(currentHook.canInstallPrompt).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("handles appinstalled event to mark isInstalled", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    expect(currentHook.isInstalled).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(currentHook.isInstalled).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("handles dismiss and resetDismissed with localStorage persistence", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    expect(currentHook.isDismissed).toBe(false);

    act(() => {
      currentHook.dismiss();
    });

    expect(currentHook.isDismissed).toBe(true);
    expect(localStorage.getItem(PWA_DISMISSED_STORAGE_KEY)).toBe("true");

    act(() => {
      currentHook.resetDismissed();
    });

    expect(currentHook.isDismissed).toBe(false);
    expect(localStorage.getItem(PWA_DISMISSED_STORAGE_KEY)).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("clears prompt and marks canInstallPrompt false when user dismisses prompt", async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined);
    const mockChoice = { outcome: "dismissed" as const, platform: "web" };

    const mockEvent = {
      preventDefault: vi.fn(),
      prompt: promptMock,
      userChoice: Promise.resolve(mockChoice),
      platforms: ["web"],
    } as unknown as BeforeInstallPromptEvent;

    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    act(() => {
      setGlobalDeferredPromptForTesting(mockEvent);
    });

    expect(currentHook.canInstallPrompt).toBe(true);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await currentHook.promptInstall();
    });

    expect(promptMock).toHaveBeenCalled();
    expect(outcome).toBe("dismissed");
    expect(currentHook.isInstalled).toBe(false);
    // Crucial: prompt must be consumed and canInstallPrompt must be false
    expect(currentHook.canInstallPrompt).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("handles promptInstall throwing error gracefully and clears prompt", async () => {
    const promptMock = vi.fn().mockRejectedValue(new Error("Prompt rejected"));
    const mockEvent = {
      preventDefault: vi.fn(),
      prompt: promptMock,
      userChoice: new Promise(() => {}),
      platforms: ["web"],
    } as unknown as BeforeInstallPromptEvent;

    const root = createRoot(container);
    act(() => {
      root.render(<HookTester />);
    });

    act(() => {
      setGlobalDeferredPromptForTesting(mockEvent);
    });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await currentHook.promptInstall();
    });

    expect(outcome).toBe("unavailable");
    expect(currentHook.canInstallPrompt).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("checkIsStandalone handles environments where window.matchMedia is undefined", () => {
    const originalMatchMedia = window.matchMedia;
    try {
      // @ts-expect-error simulating legacy/unsupported environment
      delete window.matchMedia;
      expect(() => checkIsStandalone()).not.toThrow();
      expect(checkIsStandalone()).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("syncs globalIsInstalled across hook mounts and updates isInstalled", () => {
    const root1 = createRoot(container);
    act(() => {
      root1.render(<HookTester />);
    });
    expect(currentHook.isInstalled).toBe(false);

    act(() => {
      setGlobalIsInstalledForTesting(true);
    });
    expect(currentHook.isInstalled).toBe(true);

    act(() => {
      root1.unmount();
    });

    // When mounting a new hook instance after installation, it should immediately initialize as installed
    const container2 = document.createElement("div");
    document.body.appendChild(container2);
    const root2 = createRoot(container2);
    act(() => {
      root2.render(<HookTester />);
    });
    expect(currentHook.isInstalled).toBe(true);

    act(() => {
      root2.unmount();
    });
    document.body.removeChild(container2);
  });
});
