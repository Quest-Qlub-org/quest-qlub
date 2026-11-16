// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { MfaEnrollModal } from "./MfaEnrollModal";
import { supabase } from "../supabase";
import { setNativeValue } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MfaEnrollModal", () => {
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

  it("does not double-enroll under React StrictMode", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as any);
    const enrollSpy = vi.spyOn(supabase.auth.mfa, "enroll").mockResolvedValue({
      data: {
        id: "factor-strict-1",
        type: "totp",
        totp: {
          qr_code: "data:image/svg+xml;base64,PHN2Zz4=",
          secret: "SECRET123",
          uri: "otpauth://totp/test",
        },
      },
      error: null,
    } as any);

    await act(async () => {
      root!.render(
        <StrictMode>
          <MfaEnrollModal isOpen={true} onClose={vi.fn()} />
        </StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(enrollSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("SECRET123");
  });

  it("shows a warning instead of silently closing when backup code generation fails, and resets state on reopen", async () => {
    vi.spyOn(supabase, "rpc").mockImplementation(((fn: string) => {
      if (fn === "clean_unverified_mfa_factors") {
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === "generate_mfa_backup_codes") {
        return Promise.resolve({ data: null, error: { message: "RPC failed" } });
      }
      return Promise.resolve({ data: null, error: null });
    }) as any);

    vi.spyOn(supabase.auth.mfa, "enroll").mockResolvedValue({
      data: {
        id: "factor-warn-1",
        type: "totp",
        totp: {
          qr_code: "data:image/svg+xml;base64,PHN2Zz4=",
          secret: "SECRET_WARN",
          uri: "otpauth://totp/test",
        },
      },
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

    const onClose = vi.fn();
    const onEnrolled = vi.fn();

    await act(async () => {
      root!.render(<MfaEnrollModal isOpen={true} onClose={onClose} onEnrolled={onEnrolled} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const codeInput = container.querySelector("#mfa-enroll-code-input") as HTMLInputElement;
    act(() => {
      setNativeValue(codeInput, "123456");
    });

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // バックアップコード生成失敗時は無言で閉じず警告を表示すること
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "バックアップコードの自動生成に失敗しました",
    );

    const confirmBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("確認して閉じる"),
    )!;
    act(() => {
      confirmBtn.click();
    });
    expect(onEnrolled).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    // 再オープン時は step が "enroll" に初期化されていること
    await act(async () => {
      root!.render(<MfaEnrollModal isOpen={false} onClose={onClose} onEnrolled={onEnrolled} />);
    });
    await act(async () => {
      root!.render(<MfaEnrollModal isOpen={true} onClose={onClose} onEnrolled={onEnrolled} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("ステップ 1");
    expect(container.querySelector("#mfa-enroll-code-input")).not.toBeNull();
  });
});
