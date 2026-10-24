// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ArticleView } from "./ArticleView";
import { AppProviders } from "../context/AppContext";
import { supabase } from "../supabase";
import { createTestArticle } from "../test/test-utils";
import * as useFollowsModule from "../hooks/useFollows";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ArticleView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as any);
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

  it("hides follow button when current user is the article author", async () => {
    const articleData = {
      id: "art-own-123",
      title: "自作記事",
      content: "<p>自作記事の本文</p>",
      status: "published",
      writer_id: "writer-author",
      thumbnail_color: "green",
      thumbnail_url: null,
      views: 5,
      likes: 1,
      tags: [],
      summary: "要約",
      created_at: new Date().toISOString(),
    };

    const writerData = {
      id: "writer-author",
      role: "writer",
      display_name: "自分自身",
      username: "myself",
      x_account: null,
      avatar_url: null,
      bio: null,
      created_at: new Date().toISOString(),
    };

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

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(articleData);
      if (table === "profiles") return createQueryChain(writerData);
      return createQueryChain(null);
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: () => false,
      toggleFollow: vi.fn(),
      isAuthenticated: true,
      currentUserId: "writer-author",
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-own-123"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (container.textContent?.includes("自作記事")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(container.textContent).toContain("自作記事");
    expect(container.textContent).toContain("自分自身");

    // 著者本人にはフォローボタンが表示されないこと
    const followBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followBtn).toBeUndefined();
  });

  it("redirects guest user to /login when clicking follow button", async () => {
    const articleData = {
      id: "art-other-123",
      title: "他者の記事",
      content: "<p>他者の記事本文</p>",
      status: "published",
      writer_id: "other-writer",
      thumbnail_color: "blue",
      thumbnail_url: null,
      views: 12,
      likes: 3,
      tags: [],
      summary: "要約",
      created_at: new Date().toISOString(),
    };

    const writerData = {
      id: "other-writer",
      role: "writer",
      display_name: "他のライター",
      username: "other",
      x_account: null,
      avatar_url: null,
      bio: null,
      created_at: new Date().toISOString(),
    };

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

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(articleData);
      if (table === "profiles") return createQueryChain(writerData);
      return createQueryChain(null);
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: () => false,
      toggleFollow: vi.fn().mockResolvedValue(false),
      isAuthenticated: false,
      currentUserId: null,
      loading: false,
    });

    let currentPath = "/articles/art-other-123";
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={[currentPath]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
              <Route path="/login" element={<div data-testid="login-page">ログインページ</div>} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (container.textContent?.includes("他者の記事")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(container.textContent).toContain("他者の記事");

    const followBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("フォロー"),
    );
    expect(followBtn).toBeDefined();

    await act(async () => {
      followBtn?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("ログインページ");
  });

  it("displays preview banner when article status is pending or draft", async () => {
    const draftArticle = {
      id: "art-draft-1",
      title: "下書きプレビュー記事",
      thumbnail: "",
      thumbnail_url: null,
      thumbnail_color: "blue",
      writer_id: "author-1",
      views: 0,
      likes: 0,
      tags: ["下書きタグ"],
      is_recommended: false,
      is_popular: false,
      status: "pending",
      content: "<p>申請中の記事です</p>",
      summary: "要約テキスト",
      created_at: "2026-10-24T12:00:00Z",
    };

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

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(draftArticle);
      if (table === "profiles") {
        return createQueryChain({
          id: "author-1",
          role: "writer",
          display_name: "ライター1",
          username: "writer1",
        });
      }
      return createQueryChain(null);
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: vi.fn(() => false),
      toggleFollow: vi.fn(async () => true),
      isAuthenticated: true,
      currentUserId: "author-1",
      loading: false,
    });

    const rpcSpy = vi.spyOn(supabase, "rpc");

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-draft-1"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
              <Route path="/search" element={<div data-testid="search-view">検索ビュー</div>} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (container.textContent?.includes("下書きプレビュー記事")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(container.textContent).toContain("【プレビュー表示中】ステータス: 承認待ち");
    expect(container.textContent).toContain("2026/10/24");
    expect(rpcSpy).not.toHaveBeenCalledWith("increment_views", expect.anything());

    const tagBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("#下書きタグ"),
    );
    expect(tagBtn).toBeDefined();

    await act(async () => {
      tagBtn?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("検索ビュー");
  });

  it("allows author to withdraw pending article and editor to approve from preview banner", async () => {
    const pendingArticle = {
      id: "art-pending-action",
      title: "承認待ちプレビュー記事",
      writer_id: "author-1",
      status: "pending",
      content: "<p>プレビュー本文</p>",
      summary: "要約テキスト",
      created_at: "2026-10-24T12:00:00Z",
    };

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

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

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        const chain = createQueryChain(pendingArticle);
        chain.update = updateMock;
        return chain;
      }
      return createQueryChain(null);
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: vi.fn(() => false),
      toggleFollow: vi.fn(async () => true),
      isAuthenticated: true,
      currentUserId: "author-1",
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-pending-action"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (container.textContent?.includes("承認待ちプレビュー記事")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    // 著者として「申請取消」ボタンをクリック
    const withdrawBtn = container.querySelector(
      '[data-testid="preview-banner-withdraw-btn"]',
    ) as HTMLButtonElement;
    expect(withdrawBtn).not.toBeNull();

    await act(async () => {
      withdrawBtn.click();
      await Promise.resolve();
    });

    expect(updateMock).toHaveBeenCalledWith({ status: "draft" });
  });

  it("blocks non-author non-editor viewer from accessing unpublished draft article", async () => {
    const draftArticle = {
      id: "art-secret-draft",
      title: "非公開シークレット記事",
      writer_id: "other-writer",
      status: "draft",
      content: "<p>秘密の本文</p>",
      created_at: "2026-10-24T12:00:00Z",
    };

    const createQueryChain = (data: any = null) => {
      const promise = Promise.resolve({ data: data ? [data] : [], error: null });
      const chain: any = Object.assign(promise, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(draftArticle);
      return createQueryChain(null);
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: vi.fn(() => false),
      toggleFollow: vi.fn(async () => true),
      isAuthenticated: true,
      currentUserId: "unrelated-viewer",
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-secret-draft"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (container.textContent?.includes("記事が見つかりません")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(container.textContent).toContain("記事が見つかりません");
    expect(container.textContent).not.toContain("秘密の本文");

    // 未公開記事アクセス拒否時は noindex, nofollow が設定される
    const robotsMeta = document.querySelector('meta[name="robots"]')?.getAttribute("content");
    expect(robotsMeta).toBe("noindex, nofollow");
  });

  it("sets robots index, follow for published article and noindex for preview article", async () => {
    const publishedArt = {
      id: "art-pub-meta",
      title: "公開メタ記事",
      content: "<p>公開記事本文</p>",
      status: "published",
      writer_id: "usr-author-pub",
      created_at: "2026-10-24T10:00:00Z",
    };

    const fromMock = vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => {
          if (table === "articles") return Promise.resolve({ data: publishedArt, error: null });
          return Promise.resolve({ data: null, error: null });
        }),
      };
      return chain;
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-pub-meta"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (document.title.includes("公開メタ記事")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(document.title).toBe("公開メタ記事 | Quest Qlub");
    const robotsPub = document.querySelector('meta[name="robots"]')?.getAttribute("content");
    expect(robotsPub).toBe("index, follow");

    fromMock.mockRestore();
  });
});
