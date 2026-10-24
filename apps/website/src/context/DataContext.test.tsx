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
});
