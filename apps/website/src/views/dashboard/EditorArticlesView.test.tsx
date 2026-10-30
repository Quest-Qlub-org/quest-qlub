// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { EditorArticlesView } from "./EditorArticlesView";
import * as AppContextModule from "../../context/AppContext";
import { renderWithRouter } from "../../test/test-utils";
import { supabase } from "../../supabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EditorArticlesView", () => {
  const mockShowToast = vi.fn();
  const mockSetArticles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders articles and allows toggling status between published and draft", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "art-pub",
                  title: "公開中の記事",
                  status: "published",
                  writer_id: "w-1",
                  created_at: new Date().toISOString(),
                },
              ],
              error: null,
            }),
          }),
          update: mockUpdate,
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      getFontSizeClass: () => "text-base",
      showToast: mockShowToast,
      setArticles: mockSetArticles,
    } as any);

    let container: HTMLElement = document.createElement("div");

    await act(async () => {
      const rendered = renderWithRouter(<EditorArticlesView />);
      container = rendered.container;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("公開中の記事");

    // 「非公開」ボタンをクリック
    const unpublishBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "非公開",
    );
    expect(unpublishBtn).toBeDefined();

    await act(async () => {
      unpublishBtn!.click();
    });

    expect(mockUpdate).toHaveBeenCalledWith({ status: "draft" });
    expect(mockShowToast).toHaveBeenCalledWith("記事を非公開（下書き）にしました");
  });

  it("lazy loads article content when opening inline preview", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { content: "<p>遅延取得された記事本文</p>", summary: "要約" },
      error: null,
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields.includes("content")) {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: mockMaybeSingle,
                }),
              };
            }
            return {
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "art-lazy",
                    title: "遅延読み込みテスト記事",
                    status: "published",
                    writer_id: "w-1",
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      getFontSizeClass: () => "text-base",
      showToast: mockShowToast,
      setArticles: mockSetArticles,
    } as any);

    let container: HTMLElement = document.createElement("div");

    await act(async () => {
      const rendered = renderWithRouter(<EditorArticlesView />);
      container = rendered.container;
      await Promise.resolve();
      await Promise.resolve();
    });

    const titleBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("遅延読み込みテスト記事"),
    );
    expect(titleBtn).toBeDefined();

    await act(async () => {
      titleBtn!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockMaybeSingle).toHaveBeenCalled();
    expect(document.body.textContent).toContain("遅延取得された記事本文");
  });
});
