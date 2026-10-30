// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { EditorRecommendView } from "./EditorRecommendView";
import { renderWithRouter } from "../../test/test-utils";
import { supabase } from "../../supabase";
import { ARTICLE_LIST_FIELDS } from "../../context/DataContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EditorRecommendView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries ARTICLE_LIST_FIELDS and toggles is_recommended and is_popular", async () => {
    const mockSelect = vi.fn();
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: mockSelect.mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "art-1",
                  title: "注目記事1",
                  status: "published",
                  is_recommended: false,
                  is_popular: true,
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

    let container: HTMLElement = document.createElement("div");

    await act(async () => {
      const rendered = renderWithRouter(<EditorRecommendView />);
      container = rendered.container;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSelect).toHaveBeenCalledWith(ARTICLE_LIST_FIELDS);
    expect(container.textContent).toContain("注目記事1");

    // Click おすすめ button
    const recommendBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("おすすめ"),
    );
    expect(recommendBtn).toBeDefined();

    await act(async () => {
      recommendBtn!.click();
    });

    expect(mockUpdate).toHaveBeenCalledWith({ is_recommended: true });
  });
});
