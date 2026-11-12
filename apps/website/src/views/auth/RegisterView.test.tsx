/* eslint-disable @typescript-eslint/unbound-method */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { RegisterView } from "./RegisterView";
import { renderWithRouter, setNativeValue } from "../../test/test-utils";
import { supabase } from "../../supabase";
import * as AppContextModule from "../../context/AppContext";
import * as AntiSpamModule from "../../utils/antiSpam";

vi.mock("../../utils/antiSpam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/antiSpam")>();
  return {
    ...actual,
    verifySpamCheck: vi.fn().mockReturnValue({ isSpam: false }),
    getRemainingCooldownSeconds: vi.fn().mockReturnValue(0),
    recordSubmissionTimestamp: vi.fn(),
  };
});

describe("RegisterView", () => {
  const mockNavigate = vi.fn();
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AntiSpamModule.verifySpamCheck).mockReturnValue({ isSpam: false });
    vi.mocked(AntiSpamModule.getRemainingCooldownSeconds).mockReturnValue(0);
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      navigate: mockNavigate,
      showToast: mockShowToast,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders accessible labels, required attributes, and Terms/Privacy links", () => {
    const { container, unmount } = renderWithRouter(<RegisterView />, { route: "/register" });

    expect(container.querySelector('label[for="register-display-name"]')).not.toBeNull();
    expect(container.querySelector('label[for="register-username"]')).not.toBeNull();
    expect(container.querySelector('label[for="register-email"]')).not.toBeNull();
    expect(container.querySelector('label[for="register-password"]')).not.toBeNull();
    expect(container.querySelector('label[for="register-agree-terms"]')).not.toBeNull();

    const termsLink = container.querySelector('a[href="/terms"]');
    const privacyLink = container.querySelector('a[href="/privacy"]');
    expect(termsLink?.textContent).toBe("利用規約");
    expect(privacyLink?.textContent).toBe("プライバシーポリシー");

    const checkbox = container.querySelector("#register-agree-terms") as HTMLInputElement;
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.required).toBe(true);
    expect(checkbox.checked).toBe(false);

    unmount();
  });

  it("blocks registration with role=alert when Terms/Privacy checkbox is unchecked", async () => {
    const signUpSpy = vi.spyOn(supabase.auth, "signUp");
    const { container, unmount } = renderWithRouter(<RegisterView />, { route: "/register" });

    setNativeValue(
      container.querySelector("#register-display-name") as HTMLInputElement,
      "山田太郎",
    );
    setNativeValue(
      container.querySelector("#register-username") as HTMLInputElement,
      "taro_yamada",
    );
    setNativeValue(
      container.querySelector("#register-email") as HTMLInputElement,
      "taro@example.com",
    );
    setNativeValue(
      container.querySelector("#register-password") as HTMLInputElement,
      "Password123!",
    );

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain("利用規約およびプライバシーポリシーへの同意が必要です");
    expect(signUpSpy).not.toHaveBeenCalled();

    unmount();
  });

  it("submits registration when Terms/Privacy checkbox is checked", async () => {
    const signUpSpy = vi.spyOn(supabase.auth, "signUp").mockResolvedValue({
      data: { user: { id: "u1" }, session: null } as any,
      error: null,
    });
    const { container, unmount } = renderWithRouter(<RegisterView />, { route: "/register" });

    setNativeValue(
      container.querySelector("#register-display-name") as HTMLInputElement,
      "山田太郎",
    );
    setNativeValue(
      container.querySelector("#register-username") as HTMLInputElement,
      "taro_yamada",
    );
    setNativeValue(
      container.querySelector("#register-email") as HTMLInputElement,
      "taro@example.com",
    );
    setNativeValue(
      container.querySelector("#register-password") as HTMLInputElement,
      "Password123!",
    );

    const checkbox = container.querySelector("#register-agree-terms") as HTMLInputElement;
    act(() => {
      checkbox.click();
    });
    expect(checkbox.checked).toBe(true);

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(signUpSpy).toHaveBeenCalledWith({
      email: "taro@example.com",
      password: "Password123!",
      options: { data: { display_name: "山田太郎", username: "taro_yamada" } },
    });
    expect(mockNavigate).toHaveBeenCalledWith("login");

    unmount();
  });
});
