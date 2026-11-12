// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { EditorRecommendView } from "./EditorRecommendView";
import * as AppContextModule from "../../context/AppContext";
import { renderWithRouter } from "../../test/test-utils";
import { supabase } from "../../supabase";
import { ARTICLE_LIST_FIELDS } from "../../context/DataContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EditorRecommendView", () => {
  const mockSetGlobalArticles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries ARTICLE_LIST_FIELDS and toggles is_recommended and is_popular with global state sync", async () => {
    const mockSelect = vi.fn();
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      setArticles: mockSetGlobalArticles,
    } as any);

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
    expect(mockSetGlobalArticles).toHaveBeenCalled();
    const updaterRec = mockSetGlobalArticles.mock.calls[0][0];
    expect(typeof updaterRec).toBe("function");
    const updatedRec = updaterRec([{ id: "art-1", isRecommended: false, isPopular: true }]);
    expect(updatedRec[0].isRecommended).toBe(true);
    expect(updatedRec[0].isPopular).toBe(true);

    mockSetGlobalArticles.mockClear();

    // Click 人気 button
    const popularBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("人気"),
    );
    expect(popularBtn).toBeDefined();

    await act(async () => {
      popularBtn!.click();
    });

    expect(mockUpdate).toHaveBeenCalledWith({ is_popular: false });
    expect(mockSetGlobalArticles).toHaveBeenCalled();
    const updaterPop = mockSetGlobalArticles.mock.calls[0][0];
    expect(typeof updaterPop).toBe("function");
    const updatedPop = updaterPop([{ id: "art-1", isRecommended: true, isPopular: true }]);
    expect(updatedPop[0].isRecommended).toBe(true);
    expect(updatedPop[0].isPopular).toBe(false);
  });

  it("uses WCAG AA compliant contrast classes on loading and empty states", async () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      setArticles: mockSetGlobalArticles,
    } as any);
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
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

    const emptyHint = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("記事が公開されると、ここで設定できます"),
    );
    expect(emptyHint?.className).toContain("text-gray-500");
    expect(emptyHint?.className).toContain("dark:text-gray-400");
    expect(emptyHint?.className).not.toContain("dark:text-gray-500");
  });
});
