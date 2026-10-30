// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { SearchView } from "./SearchView";
import * as AppContextModule from "../context/AppContext";
import { createTestArticle, createTestProfile, setNativeValue } from "../test/test-utils";
import { supabase } from "../supabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SearchView", () => {
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

  function setupAppMock(
    options: {
      articles?: ReturnType<typeof createTestArticle>[];
      writers?: ReturnType<typeof createTestProfile>[];
    } = {},
  ) {
    const { articles = [], writers = [] } = options;
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles,
      writers,
      favorites: [],
      navigate: vi.fn(),
    } as unknown as ReturnType<typeof AppContextModule.useApp>);
  }

  function renderSearchView(initialRoute = "/search") {
    act(() => {
      root!.render(
        <MemoryRouter initialEntries={[initialRoute]}>
          <SearchView />
        </MemoryRouter>,
      );
    });
  }

  it("renders search input, tags, and writers initially without results area", () => {
    const writer = createTestProfile({ id: "w-1", display_name: "ライター1" });
    const article1 = createTestArticle({
      id: "art-1",
      title: "物理学の基本",
      tags: ["理科"],
      status: "published",
      writerId: "w-1",
    });

    setupAppMock({ articles: [article1], writers: [writer] });

    renderSearchView();

    // 検索入力、タグ、ライター選択が表示されていること
    expect(container.querySelector('input[placeholder="キーワードで検索"]')).not.toBeNull();
    expect(container.textContent).toContain("タグでしぼる");
    expect(container.textContent).toContain("ライターでしぼる");
    expect(container.textContent).toContain("ライター1");

    // フィルター未指定時は検索結果エリアが表示されない仕様
    expect(container.textContent).not.toContain("検索結果 (");
    expect(container.textContent).not.toContain("物理学の基本");
  });

  it("filters articles by keyword input in title, content, or writer name", () => {
    const writer = createTestProfile({ id: "w-1", display_name: "佐藤健一" });
    const article1 = createTestArticle({
      id: "art-1",
      title: "量子力学の不思議",
      content: "<p>光と電子の実験</p>",
      status: "published",
      writerId: "w-1",
    });
    const article2 = createTestArticle({
      id: "art-2",
      title: "平安時代の文学",
      content: "<p>紫式部と源氏物語</p>",
      status: "published",
      writerId: "w-1",
    });

    setupAppMock({ articles: [article1, article2], writers: [writer] });

    renderSearchView();

    const searchInput = container.querySelector(
      'input[placeholder="キーワードで検索"]',
    ) as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // 「量子」で検索
    act(() => {
      setNativeValue(searchInput, "量子");
    });

    expect(container.textContent).toContain("検索結果 (1件)");
    expect(container.textContent).toContain("量子力学の不思議");
    expect(container.textContent).not.toContain("平安時代の文学");

    // クリアボタン (X) でリセット
    const clearButton = container.querySelector(".relative button") as HTMLButtonElement;
    expect(clearButton).not.toBeNull();

    act(() => {
      clearButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(searchInput.value).toBe("");
    // フィルターなしに戻るため検索結果は非表示
    expect(container.textContent).not.toContain("検索結果 (");
  });

  it("filters articles by tag selection and writer selection", () => {
    const writerScience = createTestProfile({
      id: "w-sci",
      display_name: "理科先生",
      role: "writer",
    });
    const writerHistory = createTestProfile({
      id: "w-his",
      display_name: "歴史先生",
      role: "writer",
    });

    const articleScience = createTestArticle({
      id: "art-sci",
      title: "科学の実験",
      tags: ["理科"],
      status: "published",
      writerId: "w-sci",
    });
    const articleHistory = createTestArticle({
      id: "art-his",
      title: "歴史の旅",
      tags: ["歴史"],
      status: "published",
      writerId: "w-his",
    });

    setupAppMock({
      articles: [articleScience, articleHistory],
      writers: [writerScience, writerHistory],
    });

    renderSearchView();

    // 「#理科」タグボタンをクリック
    const buttons = Array.from(container.querySelectorAll("button"));
    const scienceTagButton = buttons.find((btn) => btn.textContent?.includes("#理科"));
    expect(scienceTagButton).toBeDefined();

    act(() => {
      scienceTagButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("検索結果 (1件)");
    expect(container.textContent).toContain("科学の実験");
    expect(container.textContent).not.toContain("歴史の旅");

    // 「フィルターをリセット」ボタンをクリック
    const resetButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("フィルターをリセット"),
    );
    expect(resetButton).toBeDefined();

    act(() => {
      resetButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).not.toContain("検索結果 (");
  });

  it("shows empty state when no articles match filter", () => {
    const article = createTestArticle({
      id: "art-1",
      title: "通常記事",
      status: "published",
    });

    setupAppMock({ articles: [article], writers: [] });

    renderSearchView();

    const searchInput = container.querySelector(
      'input[placeholder="キーワードで検索"]',
    ) as HTMLInputElement;

    act(() => {
      setNativeValue(searchInput, "該当なしのキーワードxyz999");
    });

    expect(container.textContent).toContain("検索結果 (0件)");
    expect(container.textContent).toContain("該当する記事が見つかりませんでした");
  });

  it("does not show tags from draft or pending articles in candidate tags", () => {
    const publishedArticle = createTestArticle({
      id: "pub-1",
      title: "公開済み記事",
      tags: ["公開タグ"],
      status: "published",
    });
    const draftArticle = createTestArticle({
      id: "draft-1",
      title: "下書き記事",
      tags: ["秘密の下書きタグ"],
      status: "draft",
    });
    const pendingArticle = createTestArticle({
      id: "pending-1",
      title: "申請中記事",
      tags: ["未承認タグ"],
      status: "pending",
    });

    setupAppMock({ articles: [publishedArticle, draftArticle, pendingArticle], writers: [] });

    renderSearchView();

    expect(container.textContent).toContain("#公開タグ");
    expect(container.textContent).not.toContain("#秘密の下書きタグ");
    expect(container.textContent).not.toContain("#未承認タグ");
  });

  it("automatically selects tag and filters articles when tag is in URL query parameters", () => {
    const publishedArticle1 = createTestArticle({
      id: "pub-math",
      title: "楽しい数学の世界",
      tags: ["数学"],
      status: "published",
    });
    const publishedArticle2 = createTestArticle({
      id: "pub-history",
      title: "歴史の謎",
      tags: ["歴史"],
      status: "published",
    });

    setupAppMock({ articles: [publishedArticle1, publishedArticle2], writers: [] });

    renderSearchView("/search?tag=%E6%95%B0%E5%AD%A6");

    // 検索結果に「楽しい数学の世界」が表示され、「歴史の謎」は表示されない
    expect(container.textContent).toContain("検索結果 (1件)");
    expect(container.textContent).toContain("楽しい数学の世界");
    expect(container.textContent).not.toContain("歴史の謎");
  });

  it("includes multi-role members having writer or editor in roles array in the writer filter", () => {
    const multiRoleWriter = createTestProfile({
      id: "multi-writer",
      display_name: "マルチロールライター",
      role: "viewer",
      roles: ["viewer", "writer"],
    });
    const regularViewer = createTestProfile({
      id: "regular-viewer",
      display_name: "ただの読者",
      role: "viewer",
      roles: ["viewer"],
    });

    setupAppMock({ articles: [], writers: [multiRoleWriter, regularViewer] });

    renderSearchView();

    expect(container.textContent).toContain("マルチロールライター");
    expect(container.textContent).not.toContain("ただの読者");
  });

  it("paginates results when matching articles exceed 12 items and loads more on button click", () => {
    const articles = Array.from({ length: 15 }, (_, i) =>
      createTestArticle({
        id: `art-${i + 1}`,
        title: `テスト記事第${i + 1}話`,
        tags: ["連載"],
        status: "published",
      }),
    );

    setupAppMock({ articles, writers: [] });

    renderSearchView("/search?tag=%E9%80%A3%E8%BC%89");

    expect(container.textContent).toContain("検索結果 (15件)");
    expect(container.textContent).toContain("テスト記事第1話");
    expect(container.textContent).toContain("テスト記事第12話");
    expect(container.textContent).not.toContain("テスト記事第13話");

    const loadMoreButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("さらに表示する"),
    );
    expect(loadMoreButton).toBeDefined();
    expect(loadMoreButton?.textContent).toContain("残り 3 件");

    act(() => {
      loadMoreButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("テスト記事第13話");
    expect(container.textContent).toContain("テスト記事第15話");
    expect(container.textContent).not.toContain("さらに表示する");
  });

  it("fetches server tags and displays them in tag list", async () => {
    const createChain = (data: any[]) => {
      const p = Promise.resolve({ data, error: null });
      const chain: any = Object.assign(p, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        overlaps: vi.fn(() => chain),
        order: vi.fn(() => chain),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return createChain([{ tags: ["サーバー独自タグA", "サーバー独自タグB"] }]);
      }
      return createChain([]);
    });

    setupAppMock({ articles: [], writers: [] });

    await act(async () => {
      renderSearchView();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("サーバー独自タグA");
    expect(container.textContent).toContain("サーバー独自タグB");
  });

  it("executes server-side search and matches keyword in article content", async () => {
    const serverArticle = {
      id: "art-server-content",
      title: "量子技術の基礎",
      summary: "概要説明",
      content: "<p>この記事は超電導量子ビットの詳細解説です</p>",
      tags: ["科学"],
      writer_id: "w-1",
      status: "published",
      views: 10,
      likes: 2,
      created_at: new Date().toISOString(),
    };

    const createChain = (data: any[]) => {
      const p = Promise.resolve({ data, error: null });
      const chain: any = Object.assign(p, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        overlaps: vi.fn(() => chain),
        order: vi.fn(() => chain),
      });
      return chain;
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return createChain([serverArticle]);
      }
      return createChain([]);
    });

    setupAppMock({ articles: [], writers: [] });

    renderSearchView("/search?q=%E8%B6%85%E9%9B%BB%E5%B0%8E");

    for (let i = 0; i < 50; i++) {
      if (container.textContent?.includes("量子技術の基礎")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
    }

    expect(container.textContent).toContain("量子技術の基礎");
    expect(container.textContent).toContain("検索結果 (1件)");
  });
});
