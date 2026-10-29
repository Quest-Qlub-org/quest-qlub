import { useState, useEffect, useCallback } from "react";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const PWA_DISMISSED_STORAGE_KEY = "quest_qlub_pwa_install_dismissed";

export function checkIsStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const isStandaloneMedia =
    Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches) ||
    Boolean(window.matchMedia?.("(display-mode: fullscreen)")?.matches) ||
    Boolean(window.matchMedia?.("(display-mode: minimal-ui)")?.matches);
  const isNavigatorStandalone = Boolean(
    (window.navigator as unknown as { standalone?: boolean })?.standalone,
  );
  return isStandaloneMedia || isNavigatorStandalone;
}

export function checkIsIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isAppleDevice = /iPad|iPhone|iPod/.test(ua);
  const isIpadOS =
    typeof navigator.platform === "string" &&
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  return isAppleDevice || isIpadOS;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let globalIsInstalled = false;
const globalListeners = new Set<() => void>();

function notifyGlobalListeners() {
  for (const listener of globalListeners) {
    listener();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyGlobalListeners();
  });

  window.addEventListener("appinstalled", () => {
    globalDeferredPrompt = null;
    globalIsInstalled = true;
    notifyGlobalListeners();
  });
}

export function setGlobalDeferredPromptForTesting(prompt: BeforeInstallPromptEvent | null) {
  globalDeferredPrompt = prompt;
  notifyGlobalListeners();
}

export function setGlobalIsInstalledForTesting(installed: boolean) {
  globalIsInstalled = installed;
  notifyGlobalListeners();
}

export interface UsePwaInstallResult {
  isStandalone: boolean;
  isInstalled: boolean;
  isIos: boolean;
  isDismissed: boolean;
  canInstallPrompt: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  dismiss: () => void;
  resetDismissed: () => void;
}

export function usePwaInstall(): UsePwaInstallResult {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => checkIsStandalone());
  const [isInstalled, setIsInstalled] = useState<boolean>(
    () => checkIsStandalone() || globalIsInstalled,
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt,
  );
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PWA_DISMISSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isIos] = useState<boolean>(() => checkIsIos());

  useEffect(() => {
    const standalone = checkIsStandalone();
    setIsStandalone(standalone);
    if (standalone || globalIsInstalled) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(globalDeferredPrompt);
    };

    const handleAppInstalled = () => {
      globalDeferredPrompt = null;
      globalIsInstalled = true;
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    const handleGlobalSync = () => {
      setDeferredPrompt(globalDeferredPrompt);
      if (globalIsInstalled) {
        setIsInstalled(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    globalListeners.add(handleGlobalSync);

    let mediaQuery: MediaQueryList | null = null;
    let handleMediaChange: ((e: MediaQueryListEvent) => void) | null = null;
    if (typeof window !== "undefined" && window.matchMedia) {
      try {
        mediaQuery = window.matchMedia("(display-mode: standalone)");
        handleMediaChange = (e: MediaQueryListEvent) => {
          if (e.matches) {
            setIsStandalone(true);
            setIsInstalled(true);
            globalIsInstalled = true;
          }
        };
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener("change", handleMediaChange);
        } else if (
          (
            mediaQuery as unknown as {
              addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
            }
          ).addListener
        ) {
          (
            mediaQuery as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }
          ).addListener(handleMediaChange);
        }
      } catch {
        // matchMedia may not support addEventListener in some environments
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      globalListeners.delete(handleGlobalSync);
      if (mediaQuery && handleMediaChange) {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener("change", handleMediaChange);
        } else if (
          (
            mediaQuery as unknown as {
              removeListener?: (cb: (e: MediaQueryListEvent) => void) => void;
            }
          ).removeListener
        ) {
          (
            mediaQuery as unknown as {
              removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
            }
          ).removeListener(handleMediaChange);
        }
      }
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const prompt = deferredPrompt || globalDeferredPrompt;
    if (!prompt) {
      return "unavailable";
    }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        globalIsInstalled = true;
      }
      // Regardless of accepted or dismissed, the prompt event has been consumed and cannot be reused
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
      notifyGlobalListeners();
      return choice.outcome;
    } catch (err) {
      console.error("Failed to prompt PWA install:", err);
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
      notifyGlobalListeners();
      return "unavailable";
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(PWA_DISMISSED_STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  }, []);

  const resetDismissed = useCallback(() => {
    setIsDismissed(false);
    try {
      localStorage.removeItem(PWA_DISMISSED_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return {
    isStandalone,
    isInstalled,
    isIos,
    isDismissed,
    canInstallPrompt: Boolean(deferredPrompt || globalDeferredPrompt),
    promptInstall,
    dismiss,
    resetDismissed,
  };
}
