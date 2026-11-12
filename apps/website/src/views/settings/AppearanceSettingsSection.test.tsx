// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AppearanceSettingsSection accessibility", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container?.parentNode) {
      document.body.removeChild(container);
      container = null;
    }
    vi.restoreAllMocks();
  });

  it("exposes radiogroup and aria-checked state for theme and font size options", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const setTheme = vi.fn();
    const setFontSize = vi.fn();
    const showToast = vi.fn();

    act(() => {
      root!.render(
        <AppearanceSettingsSection
          fontSize="medium"
          setFontSize={setFontSize}
          theme="light"
          setTheme={setTheme}
          showToast={showToast}
        />,
      );
    });

    const radiogroups = container.querySelectorAll('[role="radiogroup"]');
    expect(radiogroups.length).toBe(2);

    const radios = Array.from(container.querySelectorAll('[role="radio"]'));
    const checkedRadios = radios.filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checkedRadios.some((el) => el.textContent?.includes("ライト"))).toBe(true);
    expect(checkedRadios.some((el) => el.textContent?.includes("中（標準）"))).toBe(true);

    const darkRadio = radios.find((el) => el.textContent?.includes("ダーク")) as HTMLButtonElement;
    expect(darkRadio).toBeDefined();
    act(() => {
      darkRadio.click();
    });
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
