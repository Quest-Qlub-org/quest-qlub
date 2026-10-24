// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { SearchView } from "./SearchView";
import * as AppContextModule from "../context/AppContext";
import { createTestArticle, createTestProfile, setNativeValue } from "../test/test-utils";

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
});
