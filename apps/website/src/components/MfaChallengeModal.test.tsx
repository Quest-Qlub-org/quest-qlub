// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MfaChallengeModal } from "./MfaChallengeModal";
import { supabase } from "../supabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MfaChallengeModal", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
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
    vi.restoreAllMocks();
  });

  it("uses WCAG AA compliant contrast classes across loading, TOTP, and backup code modes", async () => {
    let resolveFactors!: (value: any) => void;
    const pendingFactors = new Promise((resolve) => {
      resolveFactors = resolve;
    });
    vi.spyOn(supabase.auth.mfa, "listFactors").mockReturnValue(pendingFactors as any);

    act(() => {
      root!.render(<MfaChallengeModal onSuccess={vi.fn()} />);
    });

    const loadingBox = Array.from(container.querySelectorAll("div")).find(
      (div) => div.className.includes("py-8") && div.textContent?.includes("認証設定を確認中..."),
    );
    expect(loadingBox?.className).toContain("text-gray-500");
    expect(loadingBox?.className).toContain("dark:text-gray-400");
    expect(loadingBox?.className).not.toContain("dark:text-gray-500");

    await act(async () => {
      resolveFactors({
        data: { all: [], totp: [{ id: "factor-1", status: "verified" }] },
        error: null,
      });
      await Promise.resolve();
    });

    const totpInput = container.querySelector('input[placeholder="123456"]') as HTMLInputElement;
    expect(totpInput.className).toContain("placeholder-gray-500");
    expect(totpInput.className).toContain("dark:placeholder-gray-400");
    expect(totpInput.className).not.toMatch(/(?:^|\s)placeholder-gray-400(?:\s|$)/);
    expect(totpInput.className).not.toContain("dark:placeholder-gray-500");

    const switchAccountBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("別のアカウントでログイン"),
    );
    expect(switchAccountBtn?.className).toContain("text-gray-500");
    expect(switchAccountBtn?.className).toContain("dark:text-gray-400");
    expect(switchAccountBtn?.className).not.toMatch(/(?:^|\s)text-gray-400(?:\s|$)/);

    const backupModeBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("バックアップコード"),
    );
    act(() => {
      backupModeBtn!.click();
    });

    const backupInput = container.querySelector(
      'input[placeholder="例: abcd-1234"]',
    ) as HTMLInputElement;
    expect(backupInput.className).toContain("placeholder-gray-500");
    expect(backupInput.className).toContain("dark:placeholder-gray-400");
    expect(backupInput.className).not.toMatch(/(?:^|\s)placeholder-gray-400(?:\s|$)/);
    expect(backupInput.className).not.toContain("dark:placeholder-gray-500");

    const backupSwitchBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("別のアカウントでログイン"),
    );
    expect(backupSwitchBtn?.className).toContain("text-gray-500");
    expect(backupSwitchBtn?.className).toContain("dark:text-gray-400");
  });
});
