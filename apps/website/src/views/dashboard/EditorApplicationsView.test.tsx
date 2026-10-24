// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { EditorApplicationsView } from "./EditorApplicationsView";
import * as AppContextModule from "../../context/AppContext";
import { renderWithRouter, setNativeValue } from "../../test/test-utils";
import { supabase } from "../../supabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EditorApplicationsView", () => {
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders writer applications and allows filtering and promoting applicant", async () => {
    const mockMessages = [
      {
        id: "msg-1",
        name: "山田花子",
        email: "hanako@example.com",
        subject: "【ライター応募】山田花子様より",
        body: "【志望動機・自己PR】:\nAIとWeb開発についての記事を書きたいです。",
        created_at: "2026-10-24T10:00:00Z",
      },
      {
        id: "msg-2",
        name: "鈴木一郎",
        email: "suzuki@example.com",
        subject: "サービスの使い方について質問",
        body: "アカウント設定について質問があります。",
        created_at: "2026-10-23T10:00:00Z",
      },
    ];

    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "contact_messages") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockMessages,
              error: null,
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(supabase, "rpc").mockImplementation(mockRpc);

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      showToast: mockShowToast,
    } as any);

    let container: HTMLElement = document.createElement("div");

    await act(async () => {
      const rendered = renderWithRouter(<EditorApplicationsView />);
      container = rendered.container;
      await Promise.resolve();
      await Promise.resolve();
    });

    // 初期状態は「ライター応募」のみ表示
    expect(container.textContent).toContain("山田花子");
    expect(container.textContent).toContain("hanako@example.com");
    expect(container.textContent).not.toContain("鈴木一郎");

    // 「すべて」タブに切り替え
    const allTabBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("すべて"),
    );
    expect(allTabBtn).toBeDefined();

    await act(async () => {
      allTabBtn!.click();
    });

    expect(container.textContent).toContain("鈴木一郎");

    // 検索バーで絞り込み
    const searchInput = container.querySelector(
      'input[placeholder="名前・メール・内容で検索"]',
    ) as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    act(() => {
      setNativeValue(searchInput, "花子");
    });

    expect(container.textContent).toContain("山田花子");
    expect(container.textContent).not.toContain("鈴木一郎");

    // 「ライターに昇格」ボタンをクリック
    const promoteBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ライターに昇格"),
    );
    expect(promoteBtn).toBeDefined();

    await act(async () => {
      promoteBtn!.click();
    });

    expect(mockRpc).toHaveBeenCalledWith("admin_promote_writer", {
      target_email: "hanako@example.com",
    });
    expect(mockShowToast).toHaveBeenCalledWith("hanako@example.com をライターに昇格しました");
  });
});
