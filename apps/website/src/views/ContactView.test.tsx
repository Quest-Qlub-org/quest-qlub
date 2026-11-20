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

  it("completes after the receipt RPC and leaves notification to the server", async () => {
    const receipt = vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: "test-contact-receipt",
      error: null,
    } as any);
    const legacyInsert = vi.spyOn(supabase, "from");
    const invokeMock = vi.spyOn(supabase.functions, "invoke");

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

    expect(receipt).toHaveBeenCalledWith("submit_contact_message", {
      sender_name: "山田太郎",
      sender_email: "yamada@example.com",
      message_subject: "問い合わせ件名",
      message_body: "問い合わせ本文です。よろしくお願いいたします。",
      honeypot: "",
    });
    expect(legacyInsert).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("送信完了");
    expect(container.textContent).toContain("お問い合わせを受け付けました");
    expect(container.textContent).not.toContain("メールの送信処理に失敗しました");
  });

  it("shows an error when the receipt fails and does not fall back for permission errors", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Permission denied" },
    } as any);
    const legacyInsert = vi.spyOn(supabase, "from");

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
    expect(legacyInsert).not.toHaveBeenCalled();
  });

  it("renders accessible heading, associated labels, required attributes, and alert error state", async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ContactView />
        </MemoryRouter>,
      );
    });

    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe("お問い合わせ");

    const nameInput = container.querySelector("#contact-name") as HTMLInputElement;
    const emailInput = container.querySelector("#contact-email") as HTMLInputElement;
    const subjectInput = container.querySelector("#contact-subject") as HTMLInputElement;
    const bodyTextarea = container.querySelector("#contact-body") as HTMLTextAreaElement;

    expect(container.querySelector('label[for="contact-name"]')).not.toBeNull();
    expect(container.querySelector('label[for="contact-email"]')).not.toBeNull();
    expect(container.querySelector('label[for="contact-subject"]')).not.toBeNull();
    expect(container.querySelector('label[for="contact-body"]')).not.toBeNull();

    expect(nameInput.required).toBe(true);
    expect(emailInput.required).toBe(true);
    expect(subjectInput.required).toBe(true);
    expect(bodyTextarea.required).toBe(true);
    expect(nameInput.getAttribute("aria-required")).toBe("true");
    expect(nameInput.getAttribute("aria-invalid")).toBe("false");

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.id).toBe("contact-form-error");
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(nameInput.getAttribute("aria-describedby")).toBe("contact-form-error");
  });

  it("blocks spoofing writer application subject prefix via general contact form (#139)", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(supabase, "from").mockReturnValue({
      insert: insertMock,
    } as any);

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ContactView />
        </MemoryRouter>,
      );
    });

    const nameInput = container.querySelector("#contact-name") as HTMLInputElement;
    const emailInput = container.querySelector("#contact-email") as HTMLInputElement;
    const subjectInput = container.querySelector("#contact-subject") as HTMLInputElement;
    const bodyTextarea = container.querySelector("#contact-body") as HTMLTextAreaElement;

    act(() => {
      setNativeValue(nameInput, "なりすまし太郎");
      setNativeValue(emailInput, "spoof@example.com");
      setNativeValue(subjectInput, "【ライター応募】なりすまし太郎様より");
      setNativeValue(bodyTextarea, "お問い合わせから偽装します。");
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(insertMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("専用の「ライター応募はこちら」フォーム");
  });
});
