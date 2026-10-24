// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ArticleEditorPage } from "./ArticleEditorView";
import * as AppContextModule from "../../context/AppContext";
import { supabase } from "../../supabase";
import { createTestProfile, setNativeValue } from "../../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/RichTextEditor", () => ({
  default: ({ content, onChange }: { content: string; onChange: (c: string) => void }) => (
    <div data-testid="mock-rich-text-editor">
      <textarea
        data-testid="editor-content-input"
        value={content}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

describe("ArticleEditorView schema resilience", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  const mockShowToast = vi.fn();
  const mockNavigate = vi.fn();
  const mockSetArticles = vi.fn();

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

  it("retries insert without comments_enabled when Supabase returns 42703 column does not exist", async () => {
    const insertedPayloads: any[] = [];
    const insertMock = vi.fn((payload: any) => {
      insertedPayloads.push(payload);
      if ("comments_enabled" in payload) {
        // 最初の試行: DBにカラムが存在しないため 42703 エラー
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: "42703",
                message: "column articles.comments_enabled does not exist",
              },
            }),
          }),
        };
      }
      // フォールバック試行: comments_enabled が除外されているので成功
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "art-saved-1",
              title: payload.title,
              writer_id: payload.writer_id,
              status: "draft",
            },
            error: null,
          }),
        }),
      };
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          insert: insertMock,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const mockProfile = createTestProfile({ id: "writer-1", role: "writer" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles: [],
      setArticles: mockSetArticles,
      seriesList: [],
      profile: mockProfile,
      user: { id: "writer-1" } as any,
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId={null} />);
    });

    // タイトルを入力
    const titleInput = container.querySelector(
      'input[placeholder="読者の目を引くタイトルを入力..."]',
    ) as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    act(() => {
      setNativeValue(titleInput, "テスト記事タイトル");
    });

    // 「下書き保存」ボタンをクリック
    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("下書き保存"),
    );
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.click();
    });

    // 1回目は comments_enabled ありで失敗し、2回目は comments_enabled なしで再試行されたこと
    expect(insertedPayloads.length).toBe(2);
    expect("comments_enabled" in insertedPayloads[0]).toBe(true);
    expect("comments_enabled" in insertedPayloads[1]).toBe(false);

    // 最終的に保存成功トーストが表示されたこと
    expect(mockShowToast).toHaveBeenCalledWith("下書きを保存しました");
  });

  it("retries update without comments_enabled when updating an existing article and 42703 error occurs", async () => {
    const updatedPayloads: any[] = [];
    const updateMock = vi.fn((payload: any) => {
      updatedPayloads.push(payload);
      if ("comments_enabled" in payload) {
        return {
          eq: vi.fn().mockResolvedValue({
            error: {
              code: "42703",
              message: "column articles.comments_enabled does not exist",
            },
          }),
        };
      }
      return {
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          update: updateMock,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "art-edit-1",
                  title: "既存タイトル",
                  content: "<p>既存本文</p>",
                  thumbnail_color: "blue",
                  tags: [],
                  status: "published",
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const mockProfile = createTestProfile({ id: "writer-1", role: "writer" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles: [
        {
          id: "art-edit-1",
          title: "既存タイトル",
          writerId: "writer-1",
          status: "published",
        } as any,
      ],
      setArticles: mockSetArticles,
      seriesList: [],
      profile: mockProfile,
      user: { id: "writer-1" } as any,
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId="art-edit-1" />);
    });

    // 「更新する」ボタンをクリック
    const updateButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("更新する"),
    );
    expect(updateButton).toBeDefined();

    await act(async () => {
      updateButton!.click();
    });

    // 1回目は comments_enabled ありで失敗し、2回目は comments_enabled なしで再試行されたこと
    expect(updatedPayloads.length).toBe(2);
    expect("comments_enabled" in updatedPayloads[0]).toBe(true);
    expect("comments_enabled" in updatedPayloads[1]).toBe(false);

    // 最終的に更新成功トーストが表示されたこと
    expect(mockShowToast).toHaveBeenCalledWith("記事を更新しました");
    expect(mockNavigate).toHaveBeenCalledWith("writerDash");
  });
});
