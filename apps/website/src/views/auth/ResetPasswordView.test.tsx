// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { ResetPasswordView } from "./ResetPasswordView";
import { renderWithRouter, setNativeValue } from "../../test/test-utils";
import { supabase } from "../../supabase";
import * as AppContextModule from "../../context/AppContext";

describe("ResetPasswordView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      navigate: vi.fn(),
      showToast: vi.fn(),
    } as any);
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { user: { id: "u1" } } as any },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("associates labels with password inputs and announces mismatch via role=alert", async () => {
    let result!: ReturnType<typeof renderWithRouter>;
    await act(async () => {
      result = renderWithRouter(<ResetPasswordView />, { route: "/reset-password" });
    });
    const { container, unmount } = result;

    expect(container.querySelector('label[for="reset-password"]')).not.toBeNull();
    expect(container.querySelector('label[for="reset-password-confirm"]')).not.toBeNull();

    const passInput = container.querySelector("#reset-password") as HTMLInputElement;
    const confirmInput = container.querySelector("#reset-password-confirm") as HTMLInputElement;
    expect(passInput.required).toBe(true);
    expect(confirmInput.required).toBe(true);

    act(() => {
      setNativeValue(passInput, "Password123!");
      setNativeValue(confirmInput, "Different123!");
    });

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl?.id).toBe("reset-password-error");
    expect(alertEl?.textContent).toContain("パスワードが一致しません");
    expect(passInput.getAttribute("aria-invalid")).toBe("true");
    expect(confirmInput.getAttribute("aria-describedby")).toBe("reset-password-error");

    unmount();
  });

  it("authorizes reset via PASSWORD_RECOVERY auth event and recovers loading state on updateUser rejection", async () => {
    let authCb: ((event: string, session: unknown) => void) | null = null;
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((cb: any) => {
      authCb = cb;
      return {
        data: { subscription: { unsubscribe: vi.fn(), id: "sub-rp", callback: vi.fn() } },
      };
    });
    vi.spyOn(supabase.auth, "updateUser").mockRejectedValue(new Error("Network error"));

    let result!: ReturnType<typeof renderWithRouter>;
    await act(async () => {
      result = renderWithRouter(<ResetPasswordView />, { route: "/reset-password" });
    });
    const { container, unmount } = result;

    // 初期状態は未認可エラー表示
    expect(container.querySelector("#reset-password")).toBeNull();

    // PASSWORD_RECOVERY イベントで入力フォームが有効化されること
    await act(async () => {
      authCb?.("PASSWORD_RECOVERY", { user: { id: "u-rec" } });
    });

    const passInput = container.querySelector("#reset-password") as HTMLInputElement;
    const confirmInput = container.querySelector("#reset-password-confirm") as HTMLInputElement;
    expect(passInput).not.toBeNull();

    act(() => {
      setNativeValue(passInput, "Password123!");
      setNativeValue(confirmInput, "Password123!");
    });

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "パスワードの更新中にエラーが発生しました",
    );

    unmount();
  });
});
