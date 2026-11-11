// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { BrowserRouter } from "react-router-dom";
import { waitFor } from "@testing-library/react";
import { WriterApplyView } from "./WriterApplyView";
import * as AppContextModule from "../context/AppContext";
import * as AntiSpamModule from "../utils/antiSpam";
import { supabase } from "../supabase";
import { setNativeValue } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../utils/antiSpam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/antiSpam")>();
  return {
    ...actual,
    verifySpamCheck: vi.fn().mockReturnValue({ isSpam: false }),
    getRemainingCooldownSeconds: vi.fn().mockReturnValue(0),
    recordContactSubmission: vi.fn(),
  };
});

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
    vi.mocked(AntiSpamModule.verifySpamCheck).mockReturnValue({ isSpam: false });
    vi.mocked(AntiSpamModule.getRemainingCooldownSeconds).mockReturnValue(0);
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

  it("renders form elements properly including honeypot", () => {
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
    expect(container.querySelector('input[name="_hp"]')).not.toBeNull();
  });

  it("stealthily pretends success when honeypot is triggered", async () => {
    setupAppMock();
    vi.mocked(AntiSpamModule.verifySpamCheck).mockReturnValue({
      isSpam: true,
      reason: "honeypot",
    });

    const dbSpy = vi.spyOn(supabase, "from");
    const fnSpy = vi.spyOn(supabase.functions, "invoke");

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
      setNativeValue(nameInput, "ボット太郎");
      setNativeValue(emailInput, "bot@example.com");
      setNativeValue(motivationInput, "スパムメッセージです");
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("ご応募ありがとうございます！");
    });

    // DBやEdge Functionへは一切送信されていないこと（ステルス防御）
    expect(dbSpy).not.toHaveBeenCalled();
    expect(fnSpy).not.toHaveBeenCalled();
  });

  it("blocks submission and shows warning when submitted too fast", async () => {
    setupAppMock();
    vi.mocked(AntiSpamModule.verifySpamCheck).mockReturnValue({
      isSpam: true,
      reason: "too_fast",
    });

    const dbSpy = vi.spyOn(supabase, "from");

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
      setNativeValue(nameInput, "早打ち太郎");
      setNativeValue(emailInput, "fast@example.com");
      setNativeValue(motivationInput, "志望動機です");
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("送信が早すぎます");
    });

    expect(dbSpy).not.toHaveBeenCalled();
  });

  it("shows error when both DB insert and Edge Function fail", async () => {
    setupAppMock();

    vi.spyOn(supabase, "from").mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: "DB Error" } }),
    } as any);

    const fnSpy = vi.spyOn(supabase.functions, "invoke");

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

    await waitFor(
      () => {
        expect(container.textContent).toContain("送信に失敗しました");
      },
      { timeout: 10000, interval: 50 },
    );
    // DBエラー時はEdge Functionに無条件フォールバックせず直ちにエラー復帰すること
    expect(fnSpy).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalledWith("ライター応募を受け付けました");
  });

  it("shows rate limit error when DB trigger rejects rapid submissions", async () => {
    setupAppMock();

    vi.spyOn(supabase, "from").mockReturnValue({
      insert: vi
        .fn()
        .mockResolvedValue({ error: { code: "P0001", message: "10分間に3件までです" } }),
    } as any);

    const fnSpy = vi.spyOn(supabase.functions, "invoke");

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

    await waitFor(() => {
      expect(container.textContent).toContain("短時間に多数の送信が行われました");
    });

    // DBレート制限エラー時もEdge Functionをバイパス呼び出ししないこと
    expect(fnSpy).not.toHaveBeenCalled();
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

    await waitFor(
      () => {
        expect(container.textContent).toContain("ご応募ありがとうございます！");
      },
      { timeout: 10000, interval: 50 },
    );
    expect(mockShowToast).toHaveBeenCalledWith("ライター応募を受け付けました");
  });

  it("autofills name and email when profile and user load asynchronously", async () => {
    let mockContext: any = {
      user: null,
      profile: null,
      showToast: mockShowToast,
      navigate: mockNavigate,
    };

    const spy = vi.spyOn(AppContextModule, "useApp").mockImplementation(() => mockContext);

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

    expect(nameInput.value).toBe("");
    expect(emailInput.value).toBe("");

    // Simulate session resolving asynchronously
    mockContext = {
      user: { id: "resolved-user", email: "resolved@example.com" },
      profile: { display_name: "非同期表示名" },
      showToast: mockShowToast,
      navigate: mockNavigate,
    };

    // Re-render to propagate updated context
    await act(async () => {
      root!.render(
        <BrowserRouter>
          <WriterApplyView />
        </BrowserRouter>,
      );
    });

    expect(nameInput.value).toBe("非同期表示名");
    expect(emailInput.value).toBe("resolved@example.com");

    spy.mockRestore();
  });
});
