// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { UIProvider, useUI } from "./UIContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("UIContext", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.useFakeTimers();
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("throws error when useUI is called outside UIProvider", () => {
    const TestConsumer = () => {
      useUI();
      return null;
    };

    // React はレンダー時のエラーを console.error に出力するためモック
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      act(() => {
        root!.render(<TestConsumer />);
      });
    }).toThrow("useUI must be used within a UIProvider");

    spy.mockRestore();
  });

  it("provides default font size and updates when changed", () => {
    let contextValue!: ReturnType<typeof useUI>;

    const TestConsumer = () => {
      contextValue = useUI();
      return (
        <div>
          <span data-testid="size">{contextValue.fontSize}</span>
          <span data-testid="class">{contextValue.getFontSizeClass()}</span>
          <button onClick={() => contextValue.setFontSize("large")}>Large</button>
          <button onClick={() => contextValue.setFontSize("small")}>Small</button>
          <button onClick={() => contextValue.setFontSize("xlarge")}>XLarge</button>
        </div>
      );
    };

    act(() => {
      root!.render(
        <UIProvider>
          <TestConsumer />
        </UIProvider>,
      );
    });

    expect(contextValue.fontSize).toBe("medium");
    expect(contextValue.getFontSizeClass()).toBe("text-base leading-relaxed");

    // large に変更
    act(() => {
      contextValue.setFontSize("large");
    });
    expect(contextValue.fontSize).toBe("large");
    expect(contextValue.getFontSizeClass()).toBe("text-lg leading-loose");
    expect(localStorage.getItem("preferred_font_size")).toBe("large");

    // small に変更
    act(() => {
      contextValue.setFontSize("small");
    });
    expect(contextValue.fontSize).toBe("small");
    expect(contextValue.getFontSizeClass()).toBe("text-sm leading-relaxed");
    expect(localStorage.getItem("preferred_font_size")).toBe("small");

    // xlarge に変更
    act(() => {
      contextValue.setFontSize("xlarge");
    });
    expect(contextValue.fontSize).toBe("xlarge");
    expect(contextValue.getFontSizeClass()).toBe("text-xl leading-loose");
    expect(localStorage.getItem("preferred_font_size")).toBe("xlarge");
  });

  it("loads initial font size from localStorage if present", () => {
    localStorage.setItem("preferred_font_size", "large");

    let contextValue!: ReturnType<typeof useUI>;
    const TestConsumer = () => {
      contextValue = useUI();
      return null;
    };

    act(() => {
      root!.render(
        <UIProvider>
          <TestConsumer />
        </UIProvider>,
      );
    });

    expect(contextValue.fontSize).toBe("large");
    expect(contextValue.getFontSizeClass()).toBe("text-lg leading-loose");
  });

  it("handles toast show and hide with timeout", () => {
    let contextValue!: ReturnType<typeof useUI>;

    const TestConsumer = () => {
      contextValue = useUI();
      return <div>{contextValue.toastMessage}</div>;
    };

    act(() => {
      root!.render(
        <UIProvider>
          <TestConsumer />
        </UIProvider>,
      );
    });

    expect(contextValue.toastMessage).toBe("");

    // トースト表示
    act(() => {
      contextValue.showToast("記事を保存しました");
    });
    expect(contextValue.toastMessage).toBe("記事を保存しました");

    // 4000ms 経過で自動消去
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(contextValue.toastMessage).toBe("");

    // 手動非表示 (hideToast)
    act(() => {
      contextValue.showToast("別メッセージ");
    });
    expect(contextValue.toastMessage).toBe("別メッセージ");

    act(() => {
      contextValue.hideToast();
    });
    expect(contextValue.toastMessage).toBe("");
  });

  it("handles theme selection, toggling, and document element classes", () => {
    let contextValue!: ReturnType<typeof useUI>;

    const TestConsumer = () => {
      contextValue = useUI();
      return (
        <div>
          <span data-testid="theme">{contextValue.theme}</span>
          <span data-testid="effectiveTheme">{contextValue.effectiveTheme}</span>
          <button onClick={() => contextValue.setTheme("dark")}>Dark</button>
          <button onClick={() => contextValue.setTheme("light")}>Light</button>
          <button onClick={() => contextValue.toggleTheme()}>Toggle</button>
        </div>
      );
    };

    act(() => {
      root!.render(
        <UIProvider>
          <TestConsumer />
        </UIProvider>,
      );
    });

    // デフォルトは system (jsdom では window.matchMedia が未定義か false なので light に判定)
    expect(contextValue.theme).toBe("system");
    expect(contextValue.effectiveTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // dark に変更
    act(() => {
      contextValue.setTheme("dark");
    });
    expect(contextValue.theme).toBe("dark");
    expect(contextValue.effectiveTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("preferred_theme")).toBe("dark");

    // toggleTheme で light に切り替え
    act(() => {
      contextValue.toggleTheme();
    });
    expect(contextValue.theme).toBe("light");
    expect(contextValue.effectiveTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("preferred_theme")).toBe("light");

    // toggleTheme で再度 dark に切り替え
    act(() => {
      contextValue.toggleTheme();
    });
    expect(contextValue.theme).toBe("dark");
    expect(contextValue.effectiveTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
