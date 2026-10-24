import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export type ThemeMode = "light" | "dark" | "system";

export interface UIContextType {
  toastMessage: string;
  showToast: (message: string) => void;
  hideToast: () => void;
  fontSize: string;
  setFontSize: React.Dispatch<React.SetStateAction<string>>;
  getFontSizeClass: () => string;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  effectiveTheme: "light" | "dark";
  toggleTheme: () => void;
}

export const UIContext = createContext<UIContextType | undefined>(undefined);

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toastMessage, setToastMessage] = useState("");
  const [fontSize, setFontSize] = useState<string>(() => {
    return localStorage.getItem("preferred_font_size") || "medium";
  });
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("preferred_theme");
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
    return "system";
  });
  const [systemDark, setSystemDark] = useState<boolean>(getSystemPrefersDark);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    const timer = setTimeout(() => {
      setToastMessage("");
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const hideToast = useCallback(() => {
    setToastMessage("");
  }, []);

  useEffect(() => {
    localStorage.setItem("preferred_font_size", fontSize);
  }, [fontSize]);

  // OSのダークモード変更監視
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else if ("addListener" in mediaQuery) {
      // 古い Safari / 環境互換
      (mediaQuery as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(
        handler,
      );
      return () => {
        (
          mediaQuery as { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }
        ).removeListener(handler);
      };
    }
  }, []);

  const effectiveTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // テーマ適用 (html要素への .dark クラス付与 & meta theme-color 更新)
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    if (effectiveTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", effectiveTheme === "dark" ? "#111827" : "#bf783a");
    }
  }, [effectiveTheme]);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem("preferred_theme", newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    // 現在がダークならライトに、そうでなければダークに切り替え
    const nextTheme: ThemeMode = effectiveTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  }, [effectiveTheme, setTheme]);

  const getFontSizeClass = useCallback(() => {
    switch (fontSize) {
      case "small":
        return "text-sm leading-relaxed";
      case "large":
        return "text-lg leading-loose";
      case "xlarge":
        return "text-xl leading-loose";
      default:
        return "text-base leading-relaxed";
    }
  }, [fontSize]);

  const value: UIContextType = {
    toastMessage,
    showToast,
    hideToast,
    fontSize,
    setFontSize,
    getFontSizeClass,
    theme,
    setTheme,
    effectiveTheme,
    toggleTheme,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
}
