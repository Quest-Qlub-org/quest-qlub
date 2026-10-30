// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
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
});
