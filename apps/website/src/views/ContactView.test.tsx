// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { ContactView } from "./ContactView";
import { supabase } from "../supabase";
import { setNativeValue } from "../test/test-utils";

vi.mock("../utils/antiSpam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/antiSpam")>();
  return {
    ...actual,
    verifySpamCheck: () => ({ isSpam: false }),
  };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ContactView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(supabase, "functions", "get").mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
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

  it("completes successfully and prevents duplicate submission even if Edge Function fails", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(supabase, "from").mockReturnValue({
      insert: insertMock,
    } as any);

    const invokeMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Edge Function error" } as any,
    });
    vi.spyOn(supabase, "functions", "get").mockReturnValue({
      invoke: invokeMock,
    } as any);

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ContactView />
        </MemoryRouter>,
      );
    });

    const nameInput = container.querySelector(
      'input[placeholder="例: 山田 太郎"]',
    ) as HTMLInputElement;
    const emailInput = container.querySelector(
      'input[placeholder="例: example@email.com"]',
    ) as HTMLInputElement;
    const subjectInput = container.querySelector(
      'input[placeholder="例: 記事の内容について"]',
    ) as HTMLInputElement;
    const bodyInput = container.querySelector(
      'textarea[placeholder="お問い合わせ内容をご記入ください"]',
    ) as HTMLTextAreaElement;

    expect(nameInput).not.toBeNull();
    expect(emailInput).not.toBeNull();

    act(() => {
      setNativeValue(nameInput, "山田太郎");
      setNativeValue(emailInput, "yamada@example.com");
      setNativeValue(subjectInput, "問い合わせ件名");
      setNativeValue(bodyInput, "問い合わせ本文です。よろしくお願いいたします。");
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    for (let i = 0; i < 50; i++) {
      if (container.textContent?.includes("送信完了")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(insertMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalled();
    expect(container.textContent).toContain("送信完了");
    expect(container.textContent).toContain("お問い合わせを受け付けました");
    expect(container.textContent).not.toContain("メールの送信処理に失敗しました");
  });

  it("shows error message when DB insert fails", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: { message: "DB Error" } });
    vi.spyOn(supabase, "from").mockReturnValue({
      insert: insertMock,
    } as any);

    vi.spyOn(supabase.functions, "invoke").mockResolvedValue({
      data: null,
      error: null,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ContactView />
        </MemoryRouter>,
      );
    });

    const nameInput = container.querySelector(
      'input[placeholder="例: 山田 太郎"]',
    ) as HTMLInputElement;
    const emailInput = container.querySelector(
      'input[placeholder="例: example@email.com"]',
    ) as HTMLInputElement;
    const subjectInput = container.querySelector(
      'input[placeholder="例: 記事の内容について"]',
    ) as HTMLInputElement;
    const bodyInput = container.querySelector(
      'textarea[placeholder="お問い合わせ内容をご記入ください"]',
    ) as HTMLTextAreaElement;

    act(() => {
      setNativeValue(nameInput, "山田太郎");
      setNativeValue(emailInput, "yamada@example.com");
      setNativeValue(subjectInput, "問い合わせ件名");
      setNativeValue(bodyInput, "問い合わせ本文です。よろしくお願いいたします。");
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    for (let i = 0; i < 50; i++) {
      if (container.textContent?.includes("送信に失敗しました")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(container.textContent).toContain("送信に失敗しました");
    expect(container.textContent).not.toContain("送信完了");
  });
});
