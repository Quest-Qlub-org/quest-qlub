// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SudoConfirmModal } from "./SudoConfirmModal";
import { supabase } from "../supabase";
import { setNativeValue } from "../test/test-utils";
import * as AuthContextModule from "../context/AuthContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SudoConfirmModal", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  const mockSetMfaChallengeRequired = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      setMfaChallengeRequired: mockSetMfaChallengeRequired,
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

  it("uses WCAG AA compliant contrast classes for password, TOTP inputs, and cancel button", async () => {
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "u-1" }, session: {} },
      error: null,
    } as any);
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    } as any);
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: { all: [], totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    } as any);

    act(() => {
      root!.render(
        <SudoConfirmModal userEmail="editor@example.com" onSuccess={vi.fn()} onCancel={vi.fn()} />,
      );
    });

    const passwordInput = container.querySelector(
      'input[placeholder="現在のパスワード"]',
    ) as HTMLInputElement;
    expect(passwordInput.className).toContain("placeholder-gray-500");
    expect(passwordInput.className).toContain("dark:placeholder-gray-400");
    expect(passwordInput.className).not.toMatch(/(?:^|\s)placeholder-gray-400(?:\s|$)/);
    expect(passwordInput.className).not.toContain("dark:placeholder-gray-500");

    const cancelBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("キャンセルして戻る"),
    );
    expect(cancelBtn?.className).toContain("text-gray-500");
    expect(cancelBtn?.className).toContain("dark:text-gray-400");
    expect(cancelBtn?.className).not.toMatch(/(?:^|\s)text-gray-400(?:\s|$)/);

    act(() => {
      setNativeValue(passwordInput, "secret-pass");
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const totpInput = container.querySelector('input[placeholder="123456"]') as HTMLInputElement;
    expect(totpInput).not.toBeNull();
    expect(totpInput.className).toContain("placeholder-gray-500");
    expect(totpInput.className).toContain("dark:placeholder-gray-400");
    expect(totpInput.className).not.toMatch(/(?:^|\s)placeholder-gray-400(?:\s|$)/);
    expect(totpInput.className).not.toContain("dark:placeholder-gray-500");
  });
});
