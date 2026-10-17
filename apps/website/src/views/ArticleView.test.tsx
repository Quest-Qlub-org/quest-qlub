// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ArticleView } from "./ArticleView";
import { AppProviders } from "../context/AppContext";
import { supabase } from "../supabase";
import { createTestArticle } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ArticleView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
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

  it("calls increment_views RPC with correct parameter p_article_id", async () => {
    const testArticle = createTestArticle({
      id: "art-test-123",
      title: "テスト記事詳細",
      content: "<p>テスト記事の本文です</p>",
      status: "published",
    });

    // チェーン可能な汎用クエリビルダーモック
    const createQueryChain = (data: any = null) => {
      const promise = Promise.resolve({ data: data ? [data] : [], error: null });
      const chain: any = Object.assign(promise, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
        single: vi.fn(() => Promise.resolve({ data, error: null })),
      });
      return chain;
    };

    const articleData = {
      id: testArticle.id,
      title: testArticle.title,
      content: testArticle.content,
      status: "published",
      writer_id: "writer-1",
      thumbnail_color: "blue",
      thumbnail_url: null,
      views: 10,
      likes: 2,
      tags: ["IT"],
      summary: "要約",
      created_at: new Date().toISOString(),
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return createQueryChain(articleData);
      }
      return createQueryChain(null);
    });

    const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as any);

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-test-123"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    // 記事本文が表示されることを確認
    expect(container.textContent).toContain("テスト記事詳細");

    // RPCが正しい引数名 p_article_id で呼び出されたことを検証
    expect(rpcSpy).toHaveBeenCalledWith("increment_views", { p_article_id: "art-test-123" });
  });
});
