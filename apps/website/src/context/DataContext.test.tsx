// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { DataProvider, useData, ARTICLE_LIST_FIELDS } from "./DataContext";
import { AuthContext } from "./AuthContext";
import { UIProvider } from "./UIContext";
import { supabase } from "../supabase";
import { createTestProfile } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DataContext", () => {
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

  it("fetches only published articles and filters out drafts", async () => {
    const eqCalls: [string, any][] = [];

    const createQueryChain = (data: any[] = []) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: any) => {
          eqCalls.push([col, val]);
          return chain;
        }),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data, error: null })),
      };
      return chain;
    };

    const mockArticles = [
      {
        id: "art-pub-1",
        title: "公開記事1",
        status: "published",
        writer_id: "w-1",
        views: 10,
        likes: 5,
        created_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return createQueryChain(mockArticles);
      }
      return createQueryChain([]);
    });

    const mockProfile = createTestProfile({ role: "writer" });
    const mockAuthContextValue = {
      user: { id: "w-1", email: "writer@example.com" } as any,
      profile: mockProfile,
      setProfile: vi.fn(),
      userRole: "writer" as const,
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    };

    let dataState!: ReturnType<typeof useData>;
    const TestConsumer = () => {
      dataState = useData();
      return <div>Articles count: {dataState.articles.length}</div>;
    };

    await act(async () => {
      root!.render(
        <AuthContext.Provider value={mockAuthContextValue}>
          <UIProvider>
            <DataProvider>
              <TestConsumer />
            </DataProvider>
          </UIProvider>
        </AuthContext.Provider>,
      );
    });

    // fetchArticles 内で status='published' の条件が適用されたことを検証
    expect(eqCalls).toContainEqual(["status", "published"]);
    expect(dataState.articles.length).toBe(1);
    expect(dataState.articles[0].status).toBe("published");
  });

  it("ensures ARTICLE_LIST_FIELDS excludes comments_enabled to remain resilient against schema drift", () => {
    expect(ARTICLE_LIST_FIELDS).not.toContain("comments_enabled");
    expect(ARTICLE_LIST_FIELDS).toContain("id");
    expect(ARTICLE_LIST_FIELDS).toContain("title");
    expect(ARTICLE_LIST_FIELDS).toContain("status");
  });

  it("defaults commentsEnabled to true when database response does not have comments_enabled column", async () => {
    let articleSelectFields = "";
    const createQueryChain = (data: any[] = [], isArticleTable = false) => {
      const chain: any = {
        select: vi.fn((fields: string) => {
          if (isArticleTable) {
            articleSelectFields = fields;
          }
          return chain;
        }),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data, error: null })),
      };
      return chain;
    };

    const mockArticleWithoutCommentsEnabled = {
      id: "art-legacy-1",
      title: "古いスキーマの記事",
      status: "published",
      writer_id: "w-1",
      views: 0,
      likes: 0,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return createQueryChain([mockArticleWithoutCommentsEnabled], true);
      }
      return createQueryChain([]);
    });

    const mockAuthContextValue = {
      user: null,
      profile: null,
      setProfile: vi.fn(),
      userRole: "guest" as const,
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    };

    let dataState!: ReturnType<typeof useData>;
    const TestConsumer = () => {
      dataState = useData();
      return <div>Count: {dataState.articles.length}</div>;
    };

    await act(async () => {
      root!.render(
        <AuthContext.Provider value={mockAuthContextValue}>
          <UIProvider>
            <DataProvider>
              <TestConsumer />
            </DataProvider>
          </UIProvider>
        </AuthContext.Provider>,
      );
    });

    expect(articleSelectFields).toBe(ARTICLE_LIST_FIELDS);
    expect(dataState.articles.length).toBe(1);
    expect(dataState.articles[0].id).toBe("art-legacy-1");
    // カラムが存在しない場合でも commentsEnabled は true にデフォルト設定される
    expect(dataState.articles[0].commentsEnabled).toBe(true);
  });

  it("fetches team members and filters out pure viewer accounts", async () => {
    const mockProfiles = [
      createTestProfile({
        id: "p-editor",
        role: "editor",
        roles: ["editor"],
        display_name: "編集長A",
      }),
      createTestProfile({
        id: "p-writer",
        role: "writer",
        roles: ["writer", "engineer"],
        display_name: "エンジニア兼ライターB",
      }),
      createTestProfile({
        id: "p-viewer",
        role: "viewer",
        roles: ["viewer"],
        display_name: "一般読者C",
      }),
    ];

    const createQueryChain = (data: any[] = []) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve({ data, error: null })),
        range: vi.fn(() => Promise.resolve({ data, error: null })),
      };
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        return createQueryChain(mockProfiles);
      }
      return createQueryChain([]);
    });

    const mockAuthContextValue = {
      user: null,
      profile: null,
      setProfile: vi.fn(),
      userRole: "guest" as const,
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    };

    let dataState!: ReturnType<typeof useData>;
    const TestConsumer = () => {
      dataState = useData();
      return <div>Team count: {dataState.teamMembers.length}</div>;
    };

    await act(async () => {
      root!.render(
        <AuthContext.Provider value={mockAuthContextValue}>
          <UIProvider>
            <DataProvider>
              <TestConsumer />
            </DataProvider>
          </UIProvider>
        </AuthContext.Provider>,
      );
    });

    // 一般読者C は除外され、編集長A と エンジニア兼ライターB の2名のみ抽出される
    expect(dataState.teamMembers.length).toBe(2);
    expect(dataState.teamMembers.map((m) => m.id)).toEqual(["p-editor", "p-writer"]);
  });

  it("optimistically increments and decrements article likes when toggling favorite, rolling back on error", async () => {
    const mockArticles = [
      {
        id: "art-fav-1",
        title: "いいね対象記事",
        status: "published",
        writer_id: "w-1",
        views: 10,
        likes: 3,
        created_at: new Date().toISOString(),
      },
    ];

    let favoriteInsertCalled = false;
    let shouldFail = false;

    const createQueryChain = (data: any[] = []) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({ data, error: null })),
        insert: vi.fn(() => {
          favoriteInsertCalled = true;
          if (shouldFail) {
            return Promise.resolve({ error: { message: "Network error" } });
          }
          return Promise.resolve({ error: null });
        }),
        delete: vi.fn(() => {
          if (shouldFail) {
            return {
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: { message: "Delete error" } }),
              })),
            };
          }
          return {
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
        }),
      };
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") return createQueryChain(mockArticles);
      if (table === "favorites") return createQueryChain([]);
      return createQueryChain([]);
    });

    const mockProfile = createTestProfile({ id: "user-fav", role: "viewer" });
    const mockAuthContextValue = {
      user: { id: "user-fav", email: "viewer@example.com" } as any,
      profile: mockProfile,
      setProfile: vi.fn(),
      userRole: "viewer" as const,
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    };

    let dataState!: ReturnType<typeof useData>;
    const TestConsumer = () => {
      dataState = useData();
      return (
        <div>
          Likes: {dataState.articles[0]?.likes} Favs: {dataState.favorites.length}
        </div>
      );
    };

    await act(async () => {
      root!.render(
        <AuthContext.Provider value={mockAuthContextValue}>
          <UIProvider>
            <DataProvider>
              <TestConsumer />
            </DataProvider>
          </UIProvider>
        </AuthContext.Provider>,
      );
    });

    expect(dataState.articles[0]?.likes).toBe(3);
    expect(dataState.favorites).toEqual([]);

    // お気に入り登録 (+1)
    await act(async () => {
      await dataState.toggleFavorite("art-fav-1");
    });

    expect(favoriteInsertCalled).toBe(true);
    expect(dataState.articles[0]?.likes).toBe(4);
    expect(dataState.favorites).toContain("art-fav-1");

    // 失敗時のロールバック検証
    shouldFail = true;
    await act(async () => {
      await dataState.toggleFavorite("art-fav-1");
    });

    expect(dataState.articles[0]?.likes).toBe(4);
    expect(dataState.favorites).toContain("art-fav-1");
  });

  it("awaits publish_due_scheduled_articles RPC before querying published articles", async () => {
    const callOrder: string[] = [];

    const mockRpc = vi.spyOn(supabase, "rpc").mockImplementation(((fn: string) => {
      callOrder.push(`rpc:${fn}`);
      return Promise.resolve({ error: null });
    }) as any);

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                range: vi.fn(() => {
                  callOrder.push("select:articles");
                  return Promise.resolve({ data: [], error: null });
                }),
              })),
            })),
          })),
        } as any;
      }
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      } as any;
    });

    const mockAuthContextValue: any = {
      user: null,
      setUser: vi.fn(),
      profile: null,
      setProfile: vi.fn(),
      userRole: "guest" as const,
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    };

    const TestConsumer = () => {
      useData();
      return <div>Ready</div>;
    };

    await act(async () => {
      root!.render(
        <AuthContext.Provider value={mockAuthContextValue}>
          <UIProvider>
            <DataProvider>
              <TestConsumer />
            </DataProvider>
          </UIProvider>
        </AuthContext.Provider>,
      );
      await Promise.resolve();
    });

    expect(mockRpc).toHaveBeenCalledWith("publish_due_scheduled_articles");
    expect(callOrder[0]).toBe("rpc:publish_due_scheduled_articles");
    expect(callOrder[1]).toBe("select:articles");
  });
});
