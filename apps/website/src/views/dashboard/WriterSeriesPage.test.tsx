// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { WriterSeriesPage } from "./WriterSeriesPage";
import * as AppContextModule from "../../context/AppContext";
import { createTestProfile, createTestSeries, setNativeValue } from "../../test/test-utils";
import { supabase } from "../../supabase";

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
});
