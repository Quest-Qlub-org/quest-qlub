// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { WriterSeriesPage } from "./WriterSeriesPage";
import * as AppContextModule from "../../context/AppContext";
import { createTestProfile, createTestSeries, setNativeValue } from "../../test/test-utils";
import { supabase } from "../../supabase";
import { ARTICLE_LIST_FIELDS, WRITER_ARTICLE_LIST_FIELDS } from "../../context/DataContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WriterSeriesPage", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  const mockShowToast = vi.fn();
  const mockSetSeriesList = vi.fn();
  const mockSetArticles = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    localStorage.clear();
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

  it("renders series list and allows starting and canceling edit mode", async () => {
    const mockWriter = createTestProfile({ id: "writer-1", role: "writer" });
    const mockSeries = createTestSeries({
      id: "series-1",
      title: "TypeScript実践講座",
      description: "実践的な型システム解説",
      writerId: "writer-1",
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-1",
                  title: "TypeScript実践講座",
                  description: "実践的な型システム解説",
                  writer_id: "writer-1",
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    expect(container.textContent).toContain("TypeScript実践講座");
    expect(container.textContent).toContain("実践的な型システム解説");

    // 「編集」ボタンをクリック
    const editBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "編集",
    );
    expect(editBtn).toBeDefined();

    act(() => {
      editBtn!.click();
    });

    // 編集フォームが表示されること
    expect(container.textContent).toContain("連載を編集");
    const titleInput = container.querySelector(
      '[data-testid="edit-series-title"]',
    ) as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    expect(titleInput.value).toBe("TypeScript実践講座");

    // 「キャンセル」ボタンをクリック
    const cancelBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "キャンセル",
    );
    expect(cancelBtn).toBeDefined();

    act(() => {
      cancelBtn!.click();
    });

    // 通常表示に戻ること
    expect(container.textContent).not.toContain("連載を編集");
    expect(container.textContent).toContain("TypeScript実践講座");
  });

  it("updates series when saving edit changes", async () => {
    const mockWriter = createTestProfile({ id: "writer-1", role: "writer" });
    const mockSeries = createTestSeries({
      id: "series-1",
      title: "旧連載タイトル",
      description: "旧説明",
      writerId: "writer-1",
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-1",
                  title: "旧連載タイトル",
                  description: "旧説明",
                  writer_id: "writer-1",
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
      profile: mockWriter,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    // 編集モードに入る
    const editBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "編集",
    );
    act(() => {
      editBtn!.click();
    });

    // タイトルと説明を変更
    const titleInput = Array.from(container.querySelectorAll("input")).find(
      (i) => i.value === "旧連載タイトル",
    ) as HTMLInputElement;
    expect(titleInput).toBeDefined();

    act(() => {
      setNativeValue(titleInput, "新・実践連載");
    });

    // 「変更を保存」ボタンをクリック
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "変更を保存",
    );
    expect(saveBtn).toBeDefined();

    await act(async () => {
      saveBtn!.click();
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      title: "新・実践連載",
      description: "旧説明",
    });
    expect(mockShowToast).toHaveBeenCalledWith("連載を更新しました");
  });

  it("creates a new series and updates list immediately", async () => {
    const mockWriter = createTestProfile({ id: "writer-1", role: "writer" });

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "series-new",
            title: "新規連載タイトル",
            description: "新規連載の説明文",
            writer_id: "writer-1",
          },
          error: null,
        }),
      }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
          insert: mockInsert,
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      seriesList: [],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    expect(container.textContent).toContain("連載はまだありません");

    // 連載名と説明を入力
    const titleInput = container.querySelector('input[placeholder="連載名 *"]') as HTMLInputElement;
    const descInput = container.querySelector(
      'textarea[placeholder="連載の説明（任意）"]',
    ) as HTMLTextAreaElement;

    act(() => {
      setNativeValue(titleInput, "新規連載タイトル");
      setNativeValue(descInput, "新規連載の説明文");
    });

    // 「連載を作成」ボタンをクリック
    const createBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "連載を作成",
    );
    expect(createBtn).toBeDefined();

    await act(async () => {
      createBtn!.click();
    });

    expect(mockInsert).toHaveBeenCalledWith({
      title: "新規連載タイトル",
      description: "新規連載の説明文",
      writer_id: "writer-1",
    });
    expect(mockShowToast).toHaveBeenCalledWith("連載を作成しました");
    expect(container.textContent).toContain("新規連載タイトル");
  });

  it("deletes a series and removes it from list immediately", async () => {
    const mockWriter = createTestProfile({ id: "writer-1", role: "writer" });
    const mockSeries = createTestSeries({
      id: "series-del-1",
      title: "削除予定連載",
      writerId: "writer-1",
    });

    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-del-1",
                  title: "削除予定連載",
                  description: null,
                  writer_id: "writer-1",
                },
              ],
              error: null,
            }),
          }),
          delete: mockDelete,
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
    } as any);

    vi.spyOn(window, "confirm").mockReturnValue(true);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    expect(container.textContent).toContain("削除予定連載");

    // 「削除」ボタンをクリック
    const deleteBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "削除",
    );
    expect(deleteBtn).toBeDefined();

    await act(async () => {
      deleteBtn!.click();
    });

    expect(mockDelete).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith("連載を削除しました");
    expect(container.textContent).not.toContain("削除予定連載");
  });

  it("allows editing episode numbers, adding articles to a series, and removing articles from a series", async () => {
    const mockWriter = createTestProfile({ id: "writer-1", role: "writer" });
    const mockSeries = createTestSeries({
      id: "series-manage-1",
      title: "記事管理テスト連載",
      writerId: "writer-1",
    });

    const mockArticleUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-manage-1",
                  title: "記事管理テスト連載",
                  description: "説明",
                  writer_id: "writer-1",
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      if (table === "articles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "art-in-series",
                    title: "連載中の記事1",
                    series_id: "series-manage-1",
                    episode_number: 1,
                    writer_id: "writer-1",
                    status: "published",
                  },
                  {
                    id: "art-unassigned",
                    title: "未所属の記事2",
                    series_id: null,
                    episode_number: null,
                    writer_id: "writer-1",
                    status: "draft",
                  },
                ],
                error: null,
              }),
            }),
          }),
          update: mockArticleUpdate,
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    // 「1件の記事▼」ボタンをクリックしてアコーディオンを展開
    const expandBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("件の記事"),
    );
    expect(expandBtn).toBeDefined();
    act(() => {
      expandBtn!.click();
    });

    expect(container.textContent).toContain("連載中の記事1");

    // 話数を 1 -> 3 に変更して blur
    const epInput = container.querySelector(
      '[data-testid="episode-input-art-in-series"]',
    ) as HTMLInputElement;
    expect(epInput).not.toBeNull();
    act(() => {
      setNativeValue(epInput, "3");
    });
    await act(async () => {
      epInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(mockArticleUpdate).toHaveBeenCalledWith({ episode_number: 3 });

    // 未所属の記事を連載に追加
    const addSelect = container.querySelector(
      '[data-testid="add-article-select-series-manage-1"]',
    ) as HTMLSelectElement;
    expect(addSelect).not.toBeNull();
    act(() => {
      addSelect.value = "art-unassigned";
      addSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const addBtn = container.querySelector(
      '[data-testid="add-article-btn-series-manage-1"]',
    ) as HTMLButtonElement;
    expect(addBtn).not.toBeNull();
    await act(async () => {
      addBtn.click();
    });

    expect(mockArticleUpdate).toHaveBeenCalledWith({
      series_id: "series-manage-1",
      episode_number: 2,
    });
    expect(mockShowToast).toHaveBeenCalledWith("連載に記事を追加しました");

    // 連載から外すボタンをクリック
    const removeBtn = container.querySelector(
      '[data-testid="remove-from-series-art-in-series"]',
    ) as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    await act(async () => {
      removeBtn.click();
    });

    expect(mockArticleUpdate).toHaveBeenCalledWith({
      series_id: null,
      episode_number: null,
    });
  });

  it("prioritizes freshly fetched writerArticles over stale cached articles in AppContext", async () => {
    const mockWriter = createTestProfile({ id: "writer-1", role: "writer" });
    const mockSeries = createTestSeries({
      id: "series-priority-1",
      title: "最新連載",
      writerId: "writer-1",
    });

    // Stale cached article with seriesId = null
    const staleCachedArticle = {
      id: "art-stale",
      title: "更新された記事",
      seriesId: null,
      episodeNumber: null,
      writerId: "writer-1",
      status: "published" as const,
      thumbnail: "",
      views: 0,
      likes: 0,
      tags: [],
      isRecommended: false,
      isPopular: false,
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-priority-1",
                  title: "最新連載",
                  writer_id: "writer-1",
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      if (table === "articles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "art-stale",
                    title: "更新された記事",
                    series_id: "series-priority-1",
                    episode_number: 1,
                    writer_id: "writer-1",
                    status: "published",
                  },
                ],
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [staleCachedArticle],
      setArticles: mockSetArticles,
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    // 「1件の記事」と表示され、連載に所属していることが認識されること
    expect(container.textContent).toContain("1件の記事");
  });

  it("shows loading indicator while authLoading is true or profile.id is undefined", async () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: null,
      authLoading: true,
      seriesList: [],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    expect(container.textContent).toContain("読み込み中...");
    expect(container.textContent).not.toContain("新しい連載を作成");
  });

  it("strictly filters merged articles to only the current writer's articles", async () => {
    const mockWriter = createTestProfile({ id: "writer-me", role: "writer" });
    const otherArticle = {
      id: "art-other",
      title: "他ライターの秘密記事",
      writerId: "writer-other",
      status: "published",
      seriesId: null,
      episodeNumber: null,
    };
    const myArticle = {
      id: "art-mine",
      title: "自分の記事",
      writerId: "writer-me",
      status: "published",
      seriesId: null,
      episodeNumber: null,
    };

    const mockSeries = createTestSeries({
      id: "series-my-1",
      title: "マイ連載",
      writerId: "writer-me",
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-my-1",
                  title: "マイ連載",
                  writer_id: "writer-me",
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      authLoading: false,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [otherArticle, myArticle],
      setArticles: mockSetArticles,
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    // 連載のアコーディオンを展開
    const expandBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("件の記事"),
    );
    expect(expandBtn).toBeDefined();

    await act(async () => {
      expandBtn!.click();
    });

    // 記事追加のセレクトボックスの選択肢に「自分の記事」はあり、「他ライターの秘密記事」は存在しないこと
    const options = Array.from(container.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("自分の記事");
    expect(options).not.toContain("他ライターの秘密記事");
  });

  it("allows creating a new series with collaborators", async () => {
    const mockWriter = createTestProfile({ id: "writer-me", role: "writer" });
    const mockCollab = createTestProfile({
      id: "writer-collab-1",
      role: "writer",
      display_name: "協力ライター",
    });

    let insertedPayload: any = null;
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          insert: vi.fn((payload) => {
            insertedPayload = payload;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "series-new-1",
                    title: payload.title,
                    description: payload.description,
                    writer_id: payload.writer_id,
                    collaborator_ids: payload.collaborator_ids,
                  },
                  error: null,
                }),
              }),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      authLoading: false,
      seriesList: [],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
      writers: [mockWriter, mockCollab],
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    const titleInput = container.querySelector("input[placeholder='連載名 *']") as HTMLInputElement;
    act(() => {
      setNativeValue(titleInput, "共同連載プロジェクト");
    });

    // 共同編集者を選択
    const select = container.querySelector(
      "select[data-testid='collaborator-select-input']",
    ) as HTMLSelectElement;
    act(() => {
      setNativeValue(select, "writer-collab-1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 「連載を作成」ボタンをクリック
    const createBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "連載を作成",
    );
    await act(async () => {
      createBtn!.click();
    });

    expect(insertedPayload).toEqual({
      title: "共同連載プロジェクト",
      description: null,
      writer_id: "writer-me",
      collaborator_ids: ["writer-collab-1"],
    });
    expect(mockShowToast).toHaveBeenCalledWith("連載を作成しました");
  });

  it("displays 共同編集 badge and hides delete button when current user is a collaborator", async () => {
    const mockWriter = createTestProfile({ id: "writer-me", role: "writer" });
    const mockSeries = createTestSeries({
      id: "series-collab-1",
      title: "共同制作連載",
      description: "複数人で執筆する連載です",
      writerId: "primary-writer",
      collaboratorIds: ["writer-me"],
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-collab-1",
                  title: "共同制作連載",
                  description: "複数人で執筆する連載です",
                  writer_id: "primary-writer",
                  collaborator_ids: ["writer-me"],
                },
              ],
              error: null,
            }),
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-collab-1",
                  title: "共同制作連載",
                  description: "複数人で執筆する連載です",
                  writer_id: "primary-writer",
                  collaborator_ids: ["writer-me"],
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      authLoading: false,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
      writers: [mockWriter],
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    // 共同編集バッジが表示されること
    const badge = container.querySelector("[data-testid='collaborator-series-badge']");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("共同編集");

    // 編集ボタンは存在するが、削除ボタンは非表示であること（主作成者のみ）
    const buttons = Array.from(container.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(buttons).toContain("編集");
    expect(buttons).not.toContain("削除");
  });

  it("shows series articles for collaborative series even when authored by primary writer", async () => {
    const mockWriter = createTestProfile({ id: "writer-me", role: "writer" });
    const mockSeries = createTestSeries({
      id: "series-collab-1",
      title: "共同制作連載",
      writerId: "primary-writer",
      collaboratorIds: ["writer-me"],
    });

    // 記事はprimary-writerが書いたもの（writer-meは記事のcollaboratorではない）
    const seriesArticle = {
      id: "art-primary-1",
      title: "連載の第1話",
      writerId: "primary-writer",
      seriesId: "series-collab-1",
      episodeNumber: 1,
      status: "published" as const,
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-collab-1",
                  title: "共同制作連載",
                  writer_id: "primary-writer",
                  collaborator_ids: ["writer-me"],
                },
              ],
              error: null,
            }),
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-collab-1",
                  title: "共同制作連載",
                  writer_id: "primary-writer",
                  collaborator_ids: ["writer-me"],
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      authLoading: false,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [seriesArticle],
      setArticles: mockSetArticles,
      writers: [mockWriter],
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    // 連載の記事数表示に「1件の記事」が表示されること
    expect(container.textContent).toContain("1件の記事");

    // アコーディオンを開く
    const expandBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("1件の記事"),
    );
    expect(expandBtn).toBeDefined();

    act(() => {
      expandBtn!.click();
    });

    // 連載内の記事タイトルが表示されること
    expect(container.textContent).toContain("連載の第1話");
  });

  it("allows editor to see delete button even if not the primary writer", async () => {
    const mockEditor = createTestProfile({ id: "editor-user", role: "editor" });
    const mockSeries = createTestSeries({
      id: "series-other-1",
      title: "他人の連載",
      writerId: "someone-else",
      collaboratorIds: [],
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-other-1",
                  title: "他人の連載",
                  writer_id: "someone-else",
                  collaborator_ids: [],
                },
              ],
              error: null,
            }),
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-other-1",
                  title: "他人の連載",
                  writer_id: "someone-else",
                  collaborator_ids: [],
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockEditor,
      authLoading: false,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
      writers: [mockEditor],
      userRole: "editor",
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    const buttons = Array.from(container.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(buttons).toContain("削除");
  });

  it("gracefully falls back to ARTICLE_LIST_FIELDS when querying writer articles if 42703 schema drift occurs", async () => {
    const mockWriter = createTestProfile({ id: "writer-fallback-user", role: "writer" });
    const queriedArticleFields: string[] = [];

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "series") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-fb-1",
                  title: "テスト連載",
                  writer_id: "writer-fallback-user",
                  collaborator_ids: [],
                },
              ],
              error: null,
            }),
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "series-fb-1",
                  title: "テスト連載",
                  writer_id: "writer-fallback-user",
                  collaborator_ids: [],
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      if (table === "articles") {
        return {
          select: vi.fn((fields: string) => {
            queriedArticleFields.push(fields);
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockImplementation(() => {
                  if (fields.includes("collaborator_ids")) {
                    return Promise.resolve({
                      data: null,
                      error: { code: "42703", message: 'column "collaborator_ids" does not exist' },
                    });
                  }
                  return Promise.resolve({
                    data: [
                      {
                        id: "art-series-fb-1",
                        title: "フォールバック記事",
                        status: "published",
                        writer_id: "writer-fallback-user",
                        created_at: new Date().toISOString(),
                      },
                    ],
                    error: null,
                  });
                }),
              }),
              or: vi.fn().mockReturnValue({
                order: vi.fn().mockImplementation(() => {
                  if (fields.includes("collaborator_ids")) {
                    return Promise.resolve({
                      data: null,
                      error: { code: "42703", message: 'column "collaborator_ids" does not exist' },
                    });
                  }
                  return Promise.resolve({
                    data: [],
                    error: null,
                  });
                }),
              }),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      authLoading: false,
      seriesList: [],
      setSeriesList: mockSetSeriesList,
      showToast: mockShowToast,
      navigate: mockNavigate,
      articles: [],
      setArticles: mockSetArticles,
      writers: [mockWriter],
      userRole: "writer",
    } as any);

    await act(async () => {
      root!.render(<WriterSeriesPage />);
    });

    expect(queriedArticleFields).toContain(WRITER_ARTICLE_LIST_FIELDS);
    expect(queriedArticleFields).toContain(ARTICLE_LIST_FIELDS);
    expect(queriedArticleFields[queriedArticleFields.length - 1]).toBe(ARTICLE_LIST_FIELDS);
    expect(queriedArticleFields[queriedArticleFields.length - 1]).not.toContain("collaborator_ids");
  });
});
