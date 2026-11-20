// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AuthWeakPasswordError } from "@supabase/supabase-js";
import { SecuritySettingsSection } from "./SecuritySettingsSection";
import { supabase } from "../../supabase";
import { setNativeValue } from "../../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SecuritySettingsSection - Password Change", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  const mockShowToast = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();

    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    } as any);

    vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: null,
      error: null,
    } as any);
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

  it("renders password change card", async () => {
    await act(async () => {
      root!.render(<SecuritySettingsSection showToast={mockShowToast} />);
    });

    expect(container.querySelector('[data-testid="password-change-card"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="new-password-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="confirm-password-input"]')).not.toBeNull();
  });

  it("shows error when password is less than 8 characters or passwords do not match", async () => {
    await act(async () => {
      root!.render(<SecuritySettingsSection showToast={mockShowToast} />);
    });

    const newPasswordInput = container.querySelector(
      '[data-testid="new-password-input"]',
    ) as HTMLInputElement;
    const confirmPasswordInput = container.querySelector(
      '[data-testid="confirm-password-input"]',
    ) as HTMLInputElement;
    const submitBtn = container.querySelector(
      '[data-testid="password-change-card"] button[type="submit"]',
    ) as HTMLButtonElement;

    // 8文字未満
    act(() => {
      setNativeValue(newPasswordInput, "short");
      setNativeValue(confirmPasswordInput, "short");
    });

    await act(async () => {
      submitBtn.click();
    });

    expect(container.textContent).toContain("パスワードは8文字以上で入力してください");
    const errAlert = container.querySelector('[data-testid="password-error-message"]');
    expect(errAlert?.getAttribute("role")).toBe("alert");
    expect(newPasswordInput.getAttribute("aria-invalid")).toBe("true");
    expect(newPasswordInput.getAttribute("aria-describedby")).toBe("password-change-error");

    // 不一致
    act(() => {
      setNativeValue(newPasswordInput, "newPassword123!");
      setNativeValue(confirmPasswordInput, "differentPassword123!");
    });

    await act(async () => {
      submitBtn.click();
    });

    expect(container.textContent).toContain("パスワードが一致しません");
  });

  it("successfully updates password and shows success toast", async () => {
    const updateUserMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.spyOn(supabase.auth, "updateUser").mockImplementation(updateUserMock);

    await act(async () => {
      root!.render(<SecuritySettingsSection showToast={mockShowToast} />);
    });

    const newPasswordInput = container.querySelector(
      '[data-testid="new-password-input"]',
    ) as HTMLInputElement;
    const confirmPasswordInput = container.querySelector(
      '[data-testid="confirm-password-input"]',
    ) as HTMLInputElement;
    const submitBtn = container.querySelector(
      '[data-testid="password-change-card"] button[type="submit"]',
    ) as HTMLButtonElement;

    act(() => {
      setNativeValue(newPasswordInput, "securePassword2026!");
      setNativeValue(confirmPasswordInput, "securePassword2026!");
    });

    await act(async () => {
      submitBtn.click();
    });

    expect(updateUserMock).toHaveBeenCalledWith({ password: "securePassword2026!" });
    expect(mockShowToast).toHaveBeenCalledWith("パスワードを変更しました");
    expect(newPasswordInput.value).toBe("");
    expect(confirmPasswordInput.value).toBe("");
  });

  it("shows Auth's leaked-password rejection during a password change", async () => {
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: new AuthWeakPasswordError("Weak password", 422, ["pwned"]),
    });
    await act(async () => {
      root!.render(<SecuritySettingsSection showToast={mockShowToast} />);
    });

    const newPassword = container.querySelector<HTMLInputElement>(
      '[data-testid="new-password-input"]',
    )!;
    const confirmation = container.querySelector<HTMLInputElement>(
      '[data-testid="confirm-password-input"]',
    )!;
    act(() => {
      setNativeValue(newPassword, "password123");
      setNativeValue(confirmation, "password123");
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="password-change-card"] button[type="submit"]',
        )!
        .click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "漏えいが確認されています",
    );
    expect(mockShowToast).not.toHaveBeenCalledWith("パスワードを変更しました");
    expect(newPassword.value).toBe("password123");
  });

  it("shows the re-enrollment step when recovery invalidates the previous factors", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: { total: 0, remaining: 0, re_enroll_required: true },
      error: null,
    } as any);

    await act(async () => {
      root!.render(<SecuritySettingsSection showToast={mockShowToast} />);
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain("認証アプリを再登録");
    expect(container.textContent).toContain("有効にする");
  });

  it("unenrolls all verified TOTP factors and resets loading state on error", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: {
        all: [
          { id: "totp-1", factor_type: "totp", status: "verified", created_at: "" },
          { id: "totp-2", factor_type: "totp", status: "verified", created_at: "" },
        ],
        totp: [],
      },
      error: null,
    } as any);
    const unenrollSpy = vi
      .spyOn(supabase.auth.mfa, "unenroll")
      .mockResolvedValueOnce({ data: { id: "totp-1" }, error: null } as any)
      .mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      root!.render(<SecuritySettingsSection showToast={mockShowToast} />);
    });

    const disableBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("解除する"),
    ) as HTMLButtonElement;
    expect(disableBtn).toBeDefined();

    await act(async () => {
      disableBtn.click();
    });

    expect(unenrollSpy).toHaveBeenCalledWith({ factorId: "totp-1" });
    expect(unenrollSpy).toHaveBeenCalledWith({ factorId: "totp-2" });
    expect(mockShowToast).toHaveBeenCalledWith("2段階認証の解除中にエラーが発生しました");
    expect(disableBtn.disabled).toBe(false);
  });
});
