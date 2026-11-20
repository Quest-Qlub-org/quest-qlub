// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { EditorApplicationsView } from "./EditorApplicationsView";
import * as AppContextModule from "../../context/AppContext";
import { renderWithRouter, setNativeValue } from "../../test/test-utils";
import { supabase } from "../../supabase";

const application = {
  id: "msg-1",
  name: "山田花子",
  email: "hanako-at-application@example.test",
  subject: "【ライター応募】山田花子様より",
  body: "【志望動機・自己PR】:\nAIとWeb開発についての記事を書きたいです。",
  created_at: "2026-10-24T10:00:00Z",
  message_kind: "writer_application",
  application_user_id: "auth-hanako",
  review_status: "pending",
  account_display_name: "花子",
  account_username: "hanako",
  notification_status: "pending",
};
const generalContact = {
  id: "msg-2",
  name: "鈴木一郎",
  email: "contact@example.test",
  subject: "ライター応募について質問",
  body: "一般お問い合わせの本文です。",
  created_at: "2026-10-23T10:00:00Z",
  message_kind: "contact",
};

async function mountView() {
  let container = document.createElement("div");
  await act(async () => {
    container = renderWithRouter(<EditorApplicationsView />).container;
  });
  return container;
}

describe("EditorApplicationsView", () => {
  const showToast = vi.fn();

  beforeEach(() => {
    showToast.mockClear();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({ showToast } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies the account before promoting the verified receipt and shows the notification status", async () => {
    const rpc = vi.spyOn(supabase, "rpc").mockImplementation((name) => {
      return Promise.resolve({
        data: name === "admin_list_contact_receipts" ? [application, generalContact] : "approved",
        error: null,
      }) as any;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = await mountView();

    expect(container.textContent).toContain("山田花子");
    expect(container.textContent).toContain("受付時メール hanako-at-application@example.test");
    expect(container.textContent).toContain("@hanako");
    expect(container.textContent).toContain("auth-hanako");
    expect(container.textContent).toContain("通知待ち");
    expect(container.textContent).not.toContain("鈴木一郎");

    const allTab = Array.from(container.querySelectorAll('[role="tab"]')).find((item) =>
      item.textContent?.includes("すべて"),
    ) as HTMLButtonElement;
    await act(async () => allTab.click());
    expect(container.textContent).toContain("鈴木一郎");
    const search = container.querySelector("#applications-search-input") as HTMLInputElement;
    act(() => setNativeValue(search, "花子"));
    expect(container.textContent).not.toContain("鈴木一郎");

    const promote = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("ライターに昇格"),
    )!;
    await act(async () => promote.click());

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("@hanako (auth-hanako)"));
    expect(rpc).toHaveBeenCalledWith("admin_review_writer_application", {
      receipt_id: "msg-1",
      expected_account_id: "auth-hanako",
      decision: "approved",
    });
    expect(showToast).toHaveBeenCalledWith("ライターに昇格しました");
    expect(container.textContent).toContain("承認済み");
    expect(container.textContent).not.toContain("ライターに昇格");
  });

  it("uses WCAG AA compliant contrast classes for search input and empty state", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: [], error: null } as any);
    const container = await mountView();

    const searchInput = container.querySelector("#applications-search-input") as HTMLInputElement;
    expect(searchInput.className).toContain("placeholder-gray-500");
    expect(searchInput.className).toContain("dark:placeholder-gray-400");
    expect(searchInput.className).not.toMatch(/(?:^|\s)placeholder-gray-400(?:\s|$)/);
    expect(searchInput.className).not.toContain("dark:placeholder-gray-500");

    const emptyText = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("該当するメッセージはありません"),
    );
    expect(emptyText?.className).toContain("text-gray-500");
    expect(emptyText?.className).toContain("dark:text-gray-400");
    expect(emptyText?.className).not.toContain("dark:text-gray-500");
  });

  it("retains read-only legacy applications and classifies ordinary enquiries as contact", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: { code: "PGRST202" } } as any);
    const legacyApp = {
      ...application,
      message_kind: undefined,
      application_user_id: undefined,
      review_status: undefined,
    };
    vi.spyOn(supabase, "from").mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [legacyApp, generalContact], error: null }),
      }),
    } as any);

    const container = await mountView();
    expect(container.textContent).toContain(application.name);
    expect(container.textContent).toContain("ライター応募 (1)");
    expect(container.textContent).toContain("旧形式の応募");
    expect(container.textContent).not.toContain(generalContact.name);
    expect(container.textContent).not.toContain("ライターに昇格");
  });

  it("shows a reauthentication message without falling back to contact data on denial", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: { code: "42501" } } as any);
    const directRead = vi.spyOn(supabase, "from");
    const container = await mountView();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("再認証");
    expect(directRead).not.toHaveBeenCalled();
  });
});
