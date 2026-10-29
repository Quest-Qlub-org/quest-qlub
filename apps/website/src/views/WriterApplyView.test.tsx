// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { BrowserRouter } from "react-router-dom";
import { WriterApplyView } from "./WriterApplyView";
import * as AppContextModule from "../context/AppContext";
import { supabase } from "../supabase";
import { setNativeValue } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WriterApplyView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  const mockShowToast = vi.fn();
  const mockNavigate = vi.fn();

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

  function setupAppMock() {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      user: { id: "test-user-id", email: "apply@example.com" } as any,
      profile: { display_name: "応募者" } as any,
      showToast: mockShowToast,
      navigate: mockNavigate,
    } as any);
  }

  it("renders form elements properly", () => {
    setupAppMock();
    act(() => {
      root!.render(
        <BrowserRouter>
          <WriterApplyView />
        </BrowserRouter>,
      );
    });

    expect(container.textContent).toContain("ライター応募フォーム");
    expect(container.querySelector('input[placeholder="山田 太郎"]')).not.toBeNull();
  });

  it("shows error when both DB insert and Edge Function fail", async () => {
    setupAppMock();

    vi.spyOn(supabase, "from").mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: "DB Error" } }),
    } as any);

    vi.spyOn(supabase.functions, "invoke").mockResolvedValue({
      data: null,
      error: { message: "Function Error" } as any,
    });

    await act(async () => {
      root!.render(
        <BrowserRouter>
          <WriterApplyView />
        </BrowserRouter>,
      );
    });

    const nameInput = container.querySelector('input[placeholder="山田 太郎"]') as HTMLInputElement;
    const emailInput = container.querySelector(
      'input[placeholder="example@quest-qlub.com"]',
    ) as HTMLInputElement;
    const motivationInput = container.querySelector("textarea") as HTMLTextAreaElement;

    act(() => {
      setNativeValue(nameInput, "応募者 太郎");
      setNativeValue(emailInput, "taro@example.com");
      setNativeValue(motivationInput, "熱心に記事を書きたいです！");
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    for (let i = 0; i < 100; i++) {
      if (
        container.textContent?.includes("送信に失敗しました") ||
        !container.textContent?.includes("送信中...")
      )
        break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    // 虚偽の成功画面にならず、エラーメッセージが表示されること
    expect(container.textContent).toContain("送信に失敗しました");
    expect(mockShowToast).not.toHaveBeenCalledWith("ライター応募を受け付けました");
  });

  it("succeeds when DB insert succeeds even if Edge Function fails", async () => {
    setupAppMock();

    vi.spyOn(supabase, "from").mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as any);

    vi.spyOn(supabase.functions, "invoke").mockResolvedValue({
      data: null,
      error: { message: "Function Error" } as any,
    });

    await act(async () => {
      root!.render(
        <BrowserRouter>
          <WriterApplyView />
        </BrowserRouter>,
      );
    });

    const nameInput = container.querySelector('input[placeholder="山田 太郎"]') as HTMLInputElement;
    const emailInput = container.querySelector(
      'input[placeholder="example@quest-qlub.com"]',
    ) as HTMLInputElement;
    const motivationInput = container.querySelector("textarea") as HTMLTextAreaElement;

    act(() => {
      setNativeValue(nameInput, "応募者 太郎");
      setNativeValue(emailInput, "taro@example.com");
      setNativeValue(motivationInput, "熱心に記事を書きたいです！");
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    for (let i = 0; i < 100; i++) {
      if (
        container.textContent?.includes("ご応募ありがとうございます！") ||
        !container.textContent?.includes("送信中...")
      )
        break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(container.textContent).toContain("ご応募ありがとうございます！");
    expect(mockShowToast).toHaveBeenCalledWith("ライター応募を受け付けました");
  });
});
