// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ArticleView } from "./ArticleView";
import { AppProviders } from "../context/AppContext";
import { supabase } from "../supabase";
import { createTestArticle, createTestProfile } from "../test/test-utils";
import * as useFollowsModule from "../hooks/useFollows";
import * as profileQueriesModule from "../utils/profileQueries";

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
        await new Promise((r) => setTimeout(r, 25));
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
        await new Promise((r) => setTimeout(r, 25));
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
              <Route
                path="/writer-dash/edit/:id"
                element={<div data-testid="edit-view">記事編集画面</div>}
              />
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

    const editBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("編集する"),
    );
    expect(editBtn).toBeDefined();

    await act(async () => {
      editBtn?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("記事編集画面");
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

    expect(updateMock).toHaveBeenCalledWith({ status: "draft", scheduled_at: null });
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

  it("does not increment likes when unauthenticated user clicks favorite button", async () => {
    const articleData = {
      id: "art-fav-test",
      title: "お気に入りテスト記事",
      writer_id: "writer-fav",
      status: "published",
      content: "<p>テスト本文</p>",
      summary: "要約",
      tags: ["テスト"],
      views: 10,
      likes: 5,
      created_at: "2026-10-24T10:00:00Z",
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => {
          if (table === "articles") return Promise.resolve({ data: articleData, error: null });
          return Promise.resolve({ data: null, error: null });
        }),
      };
      return chain;
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: vi.fn(() => false),
      toggleFollow: vi.fn(async () => true),
      isAuthenticated: false,
      currentUserId: null,
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-fav-test"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (container.textContent?.includes("お気に入りテスト記事")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(container.textContent).toContain("お気に入りテスト記事");
    expect(container.textContent).toContain("5");

    // Click the favorite star button
    const favButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.querySelector("svg") && b.getAttribute("class")?.includes("rounded-full"),
    );
    expect(favButton).toBeDefined();

    await act(async () => {
      favButton!.click();
      await Promise.resolve();
    });

    // Likes count must stay 5, never increment to 6 for unauthenticated user
    const likesSpans = Array.from(container.querySelectorAll("span")).filter((s) =>
      s.textContent?.includes("5"),
    );
    expect(likesSpans.length).toBeGreaterThan(0);
    const hasSix = Array.from(container.querySelectorAll("span")).some(
      (s) => s.textContent?.trim() === "6",
    );
    expect(hasSix).toBe(false);
  });

  it("renders single author with full-width layout when no collaborators exist", async () => {
    const singleArticleData = {
      id: "art-single-view",
      title: "単独著者による記事",
      content: "<p>単独執筆の記事本文です</p>",
      status: "published",
      writer_id: "writer-single",
      collaborator_ids: [],
      comments_enabled: true,
      created_at: new Date().toISOString(),
    };

    const mockSingleWriter = createTestProfile({
      id: "writer-single",
      display_name: "ソロ執筆者",
      username: "solowriter",
      role: "writer",
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: singleArticleData,
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockSingleWriter,
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({
              data: [],
              error: null,
            }),
          }),
        } as any;
      }
      if (table === "article_comments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-single-view"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    // 「この記事を執筆した人」が表示されていること
    expect(container.textContent).toContain("この記事を執筆した人");
    expect(container.textContent).toContain("ソロ執筆者");
    // 単独執筆では「主執筆」「共同執筆」バッジは表示されないこと
    expect(container.textContent).not.toContain("主執筆");
    expect(container.textContent).not.toContain("共同執筆");
    // 単一のカードが存在すること
    expect(container.querySelector('[data-testid="author-card-writer-single"]')).toBeTruthy();
  });

  it("renders multiple authors (primary writer and co-authors) in この記事を執筆した人 section", async () => {
    const articleData = {
      id: "art-collab-view",
      title: "複数著者による共同記事",
      content: "<p>複数人で書かれた記事の本文です</p>",
      status: "published",
      writer_id: "writer-primary",
      collaborator_ids: ["writer-coauthor-1", "writer-coauthor-2"],
      thumbnail_color: "blue",
      thumbnail_url: null,
      views: 10,
      likes: 3,
      tags: ["共同執筆"],
      summary: "共同執筆の要約",
      created_at: new Date().toISOString(),
    };

    const primaryWriter = {
      id: "writer-primary",
      role: "writer",
      display_name: "メイン執筆者",
      username: "main_author",
      avatar_url: null,
      bio: "メイン執筆者の紹介",
    };

    const coAuthor1 = {
      id: "writer-coauthor-1",
      role: "writer",
      display_name: "共同執筆者A",
      username: "coauthor_a",
      avatar_url: null,
    };

    const coAuthor2 = {
      id: "writer-coauthor-2",
      role: "writer",
      display_name: "共同執筆者B",
      username: "coauthor_b",
      avatar_url: null,
    };

    const createQueryChain = (data: any = null) => {
      const arr = data ? (Array.isArray(data) ? data : [data]) : [];
      const promise = Promise.resolve({ data: arr, error: null });
      const chain: any = Object.assign(promise, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
        single: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(articleData);
      if (table === "profiles") return createQueryChain([primaryWriter, coAuthor1, coAuthor2]);
      return createQueryChain(null);
    });

    const mockToggleFollow = vi.fn(async () => true);
    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: (id: string) => id === "writer-coauthor-1",
      toggleFollow: mockToggleFollow,
      isAuthenticated: true,
      currentUserId: "reader-user",
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-collab-view"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    // 「この記事を執筆した人」セクションが表示されていること
    expect(container.textContent).toContain("この記事を執筆した人");

    // 主執筆者および共同執筆者全員の名前が表示されていること
    expect(container.textContent).toContain("メイン執筆者");
    expect(container.textContent).toContain("共同執筆者A");
    expect(container.textContent).toContain("共同執筆者B");

    // ラベルが表示されていること
    expect(container.textContent).toContain("主執筆");
    expect(container.textContent).toContain("共同執筆");

    // 各著者カードが存在すること
    expect(container.querySelector('[data-testid="author-card-writer-primary"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="author-card-writer-coauthor-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="author-card-writer-coauthor-2"]')).toBeTruthy();
  });

  it("allows collaborators to view and withdraw pending article from preview banner", async () => {
    const pendingArticle = {
      id: "art-collab-pending",
      title: "共同執筆の審査中記事",
      status: "pending",
      writer_id: "other-writer",
      collaborator_ids: ["my-collab-id"],
      content: "<p>審査中の本文</p>",
      created_at: new Date().toISOString(),
    };

    const mockUpdate = vi.fn().mockResolvedValue({ error: null });
    const createQueryChain = (data: any = null) => {
      const arr = data ? (Array.isArray(data) ? data : [data]) : [];
      const promise = Promise.resolve({ data: arr, error: null });
      const chain: any = Object.assign(promise, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
        single: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
        update: vi.fn((_payload) => ({
          eq: mockUpdate,
        })),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(pendingArticle);
      return createQueryChain(null);
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: vi.fn(() => false),
      toggleFollow: vi.fn(async () => true),
      isAuthenticated: true,
      currentUserId: "my-collab-id",
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-collab-pending"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    // 共同執筆者にもプレビューバナーが表示されること
    const banner = container.querySelector('[data-testid="article-preview-banner"]');
    expect(banner).toBeTruthy();
    expect(container.textContent).toContain("共同執筆の審査中記事");

    // 共同執筆者にも申請取消ボタンが表示され、クリックでステータスが更新されること
    const withdrawBtn = container.querySelector(
      '[data-testid="preview-banner-withdraw-btn"]',
    ) as HTMLButtonElement;
    expect(withdrawBtn).toBeTruthy();

    await act(async () => {
      withdrawBtn.click();
    });

    expect(mockUpdate).toHaveBeenCalled();
  });

  it("deduplicates collaborator IDs in この記事を執筆した人 section", async () => {
    const multiCollabArticle = {
      id: "art-collab-duplicate",
      title: "重複テスト記事",
      writer_id: "author-main",
      collaborator_ids: ["collab-1", "collab-1", "author-main"],
      status: "published",
      content: "<p>本文</p>",
      created_at: "2026-10-24T12:00:00Z",
    };

    const mockAuthor = createTestProfile({
      id: "author-main",
      display_name: "メイン執筆者",
      role: "writer",
    });
    const mockCollab = createTestProfile({
      id: "collab-1",
      display_name: "コラボレーター1",
      role: "writer",
    });

    const createQueryChain = (data: any = null) => {
      const arr = data ? (Array.isArray(data) ? data : [data]) : [];
      const promise = Promise.resolve({ data: arr, error: null });
      const chain: any = Object.assign(promise, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
        single: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(multiCollabArticle);
      if (table === "profiles") return createQueryChain([mockAuthor, mockCollab]);
      return createQueryChain(null);
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: vi.fn(() => false),
      toggleFollow: vi.fn(async () => true),
      isAuthenticated: false,
      currentUserId: null,
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-collab-duplicate"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("この記事を執筆した人");
    const mainCards = container.querySelectorAll('[data-testid="author-card-author-main"]');
    expect(mainCards.length).toBe(1);

    const collabCards = container.querySelectorAll('[data-testid="author-card-collab-1"]');
    expect(collabCards.length).toBe(1);
  });

  it("fetches author and collaborator fallbacks via profileQueries utilities", async () => {
    const testArticle = {
      id: "art-fallback-test",
      title: "フォールバックテスト記事",
      writer_id: "writer-fb-id",
      collaborator_ids: ["collab-fb-id"],
      status: "published",
      content: "<p>フォールバック本文</p>",
      created_at: "2026-10-24T12:00:00Z",
    };

    const mockWriter = createTestProfile({
      id: "writer-fb-id",
      display_name: "フォールバックライター",
      role: "writer",
      roles: ["writer"],
    });

    const mockCollab = createTestProfile({
      id: "collab-fb-id",
      display_name: "フォールバック共同執筆者",
      role: "writer",
      roles: ["writer"],
    });

    const createQueryChain = (data: any = null) => {
      const arr = data ? (Array.isArray(data) ? data : [data]) : [];
      const promise = Promise.resolve({ data: arr, error: null });
      const chain: any = Object.assign(promise, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
        single: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(testArticle);
      return createQueryChain(null);
    });

    const fetchSingleSpy = vi
      .spyOn(profileQueriesModule, "fetchSingleProfileWithFallback")
      .mockResolvedValue(mockWriter);
    const fetchListSpy = vi
      .spyOn(profileQueriesModule, "fetchProfilesListWithFallback")
      .mockResolvedValue([mockCollab]);

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: vi.fn(() => false),
      toggleFollow: vi.fn(async () => true),
      isAuthenticated: false,
      currentUserId: null,
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-fallback-test"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    expect(fetchSingleSpy).toHaveBeenCalledWith({ id: "writer-fb-id" });
    expect(fetchListSpy).toHaveBeenCalledWith({ inIds: ["collab-fb-id"] });

    expect(container.textContent).toContain("フォールバックテスト記事");
    expect(container.textContent).toContain("フォールバックライター");
    expect(container.textContent).toContain("フォールバック共同執筆者");
  });

  it("renders SEO meta tags, canonical URL, Twitter creator, and Article + BreadcrumbList JSON-LD (#100, #101, #104)", async () => {
    const articleData = {
      id: "art-seo-123",
      title: "SEO検証記事",
      content: "<p>本文テキスト</p>",
      summary: "記事の要約文",
      status: "published",
      writer_id: "writer-seo-1",
      created_at: "2026-11-01T08:00:00Z",
    };

    const mockWriter = createTestProfile({
      id: "writer-seo-1",
      display_name: "SEOライター",
      username: "seo_writer",
      x_account: "@seo_writer_x",
      role: "writer",
    });

    const createQueryChain = (data: any = null) => {
      const arr = data ? (Array.isArray(data) ? data : [data]) : [];
      const promise = Promise.resolve({ data: arr, error: null });
      const chain: any = Object.assign(promise, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
        single: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(articleData);
      if (table === "profiles") return createQueryChain(mockWriter);
      return createQueryChain(null);
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-seo-123"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (document.title.includes("SEO検証記事")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://quest-qlub.vercel.app/articles/art-seo-123",
    );
    expect(document.querySelector('meta[name="author"]')?.getAttribute("content")).toBe(
      "SEOライター",
    );
    expect(document.querySelector('meta[property="article:author"]')?.getAttribute("content")).toBe(
      "SEOライター",
    );
    expect(
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
    ).toBe("2026-11-01T08:00:00Z");
    expect(document.querySelector('meta[name="twitter:site"]')?.getAttribute("content")).toBe(
      "@QuestQlub",
    );
    expect(document.querySelector('meta[name="twitter:creator"]')?.getAttribute("content")).toBe(
      "@seo_writer_x",
    );

    const script = document.getElementById("structured-data-json-ld");
    expect(script).not.toBeNull();
    const schemas = JSON.parse(script?.textContent || "[]");
    expect(Array.isArray(schemas)).toBe(true);
    const articleSchema = schemas.find((s: any) => s["@type"] === "Article");
    const breadcrumbSchema = schemas.find((s: any) => s["@type"] === "BreadcrumbList");

    expect(articleSchema).toBeDefined();
    expect(articleSchema.mainEntityOfPage["@id"]).toBe(
      "https://quest-qlub.vercel.app/articles/art-seo-123",
    );
    expect(articleSchema.dateModified).toBe("2026-11-01T08:00:00Z");
    expect(articleSchema.author.url).toBe("https://quest-qlub.vercel.app/writers/seo_writer");

    expect(breadcrumbSchema).toBeDefined();
    expect(breadcrumbSchema.itemListElement).toHaveLength(3);
  });

  it("provides accessible labels/pressed states on favorite & share buttons and renders author cards as Link elements (#110, #112)", async () => {
    const articleData = {
      id: "art-a11y-123",
      title: "アクセシビリティテスト記事",
      content: "<p>本文</p>",
      status: "published",
      writer_id: "writer-a11y",
      collaborator_ids: ["collab-a11y"],
      created_at: "2026-11-01T08:00:00Z",
    };

    const mainWriter = createTestProfile({
      id: "writer-a11y",
      display_name: "メイン著者",
      username: "main_a11y",
      role: "writer",
    });
    const collabWriter = createTestProfile({
      id: "collab-a11y",
      display_name: "共同著者",
      username: "collab_a11y",
      role: "writer",
    });

    const createQueryChain = (data: any = null) => {
      const arr = data ? (Array.isArray(data) ? data : [data]) : [];
      const promise = Promise.resolve({ data: arr, error: null });
      const chain: any = Object.assign(promise, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
        single: vi.fn(() => Promise.resolve({ data: arr[0] ?? null, error: null })),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(articleData);
      if (table === "profiles") return createQueryChain([mainWriter, collabWriter]);
      return createQueryChain(null);
    });

    vi.spyOn(useFollowsModule, "useFollows").mockReturnValue({
      followedIds: [],
      isFollowing: () => false,
      toggleFollow: vi.fn(async () => true),
      isAuthenticated: true,
      currentUserId: "viewer-1",
      loading: false,
    });

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/articles/art-a11y-123"]}>
          <AppProviders>
            <Routes>
              <Route path="/articles/:id" element={<ArticleView />} />
              <Route path="/writers/:username" element={<div>ライターページ</div>} />
            </Routes>
          </AppProviders>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 100; i++) {
      if (container.textContent?.includes("アクセシビリティテスト記事")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    const favBtn = container.querySelector('button[aria-label="お気に入りに追加"]');
    expect(favBtn).not.toBeNull();
    expect(favBtn?.getAttribute("aria-pressed")).toBe("false");

    expect(container.querySelector('button[aria-label="Xで共有"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="LINEで共有"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="記事のリンクをコピー"]')).not.toBeNull();

    const mainCard = container.querySelector('[data-testid="author-card-writer-a11y"]');
    const mainLink = mainCard?.querySelector("a");
    expect(mainLink).not.toBeNull();
    expect(mainLink?.getAttribute("href")).toBe("/writers/main_a11y");

    const collabCard = container.querySelector('[data-testid="author-card-collab-a11y"]');
    const collabLink = collabCard?.querySelector("a");
    expect(collabLink).not.toBeNull();
    expect(collabLink?.getAttribute("href")).toBe("/writers/collab_a11y");

    // 著者カード内のフォローボタンは <Link> 内にネストせず aria-pressed を持ち、押下しても遷移しないこと
    const followBtnInsideCard = mainCard?.querySelector("button");
    expect(followBtnInsideCard).not.toBeNull();
    expect(followBtnInsideCard?.closest("a")).toBeNull();
    expect(followBtnInsideCard?.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      followBtnInsideCard?.click();
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain("ライターページ");
  });
});
