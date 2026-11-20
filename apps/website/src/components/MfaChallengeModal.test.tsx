// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MfaChallengeModal } from "./MfaChallengeModal";
import { supabase } from "../supabase";
import { setNativeValue } from "../test/test-utils";

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
      'input[placeholder="保存したバックアップコード"]',
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

  it("exposes accessible labels, role='alert' error region, aria-invalid, and aria-describedby", async () => {
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: { all: [], totp: [] },
      error: { message: "failed" },
    } as any);

    await act(async () => {
      root!.render(<MfaChallengeModal onSuccess={vi.fn()} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.id).toBe("mfa-challenge-error");

    const totpInput = container.querySelector(
      "#mfa-challenge-totp-input",
    ) as HTMLInputElement | null;
    expect(totpInput).not.toBeNull();
    expect(totpInput?.getAttribute("aria-invalid")).toBe("true");
    expect(totpInput?.getAttribute("aria-describedby")).toBe("mfa-challenge-error");
    expect(container.querySelector('label[for="mfa-challenge-totp-input"]')).not.toBeNull();

    const backupModeBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("バックアップコード"),
    );
    act(() => {
      backupModeBtn!.click();
    });

    const backupInput = container.querySelector(
      "#mfa-challenge-backup-input",
    ) as HTMLInputElement | null;
    expect(backupInput).not.toBeNull();
    expect(container.querySelector('label[for="mfa-challenge-backup-input"]')).not.toBeNull();
  });

  it("ignores unverified TOTP factors and resets loading/mode state after success and reopen", async () => {
    // 1. unverified ファクターしかない場合はエラー表示して無効化すること
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValueOnce({
      data: { all: [], totp: [{ id: "unverified-1", status: "unverified" }] },
      error: null,
    } as any);

    await act(async () => {
      root!.render(<MfaChallengeModal isOpen={true} onSuccess={vi.fn()} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "有効な2要素認証ファクターが見つかりませんでした",
    );

    // 2. verified ファクターで成功後に loading が false に戻り、再オープンで totp モードに戻ること
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: { all: [], totp: [{ id: "verified-1", status: "verified" }] },
      error: null,
    } as any);
    vi.spyOn(supabase.auth.mfa, "challenge").mockResolvedValue({
      data: { id: "chal-1", factor_type: "totp", expires_at: 999999 },
      error: null,
    } as any);
    vi.spyOn(supabase.auth.mfa, "verify").mockResolvedValue({
      data: { user: {}, session: {} },
      error: null,
    } as any);

    const onSuccess = vi.fn();
    await act(async () => {
      root!.render(<MfaChallengeModal isOpen={false} onSuccess={onSuccess} />);
    });
    await act(async () => {
      root!.render(<MfaChallengeModal isOpen={true} onSuccess={onSuccess} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const totpInput = container.querySelector("#mfa-challenge-totp-input") as HTMLInputElement;
    act(() => {
      setNativeValue(totpInput, "654321");
    });

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.textContent).toContain("認証して進む");
    expect(submitBtn.disabled).toBe(false);
  });
});
