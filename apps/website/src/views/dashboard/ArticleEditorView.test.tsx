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

  it("supports scheduled publishing with schedule-datetime-input and editor-submit-btn", async () => {
    const insertedPayloads: any[] = [];
    const insertMock = vi.fn((payload: any) => {
      insertedPayloads.push(payload);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "art-scheduled-1",
              title: payload.title,
              writer_id: payload.writer_id,
              status: payload.status,
              scheduled_at: payload.scheduled_at,
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

    const mockEditor = createTestProfile({ id: "ed-1", role: "editor" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles: [],
      setArticles: mockSetArticles,
      seriesList: [],
      profile: mockEditor,
      user: { id: "ed-1" } as any,
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId={null} />);
    });

    // タイトル入力
    const titleInput = container.querySelector(
      'input[placeholder="読者の目を引くタイトルを入力..."]',
    ) as HTMLInputElement;
    act(() => {
      setNativeValue(titleInput, "未来の公開予約記事");
    });

    // 予約日時入力
    const schedInput = container.querySelector(
      '[data-testid="schedule-datetime-input"]',
    ) as HTMLInputElement;
    expect(schedInput).not.toBeNull();
    act(() => {
      setNativeValue(schedInput, "2099-12-31T15:30");
    });

    // 「予約投稿申請」ボタン（editor-submit-btn）をクリック
    const submitBtn = container.querySelector(
      '[data-testid="editor-submit-btn"]',
    ) as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.textContent).toContain("予約投稿申請");

    await act(async () => {
      submitBtn.click();
    });

    expect(insertedPayloads.length).toBe(1);
    expect(insertedPayloads[0].status).toBe("scheduled");
    expect(typeof insertedPayloads[0].scheduled_at).toBe("string");
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining("公開予約（"));
  });

  it("shows toast warning when invalid schedule datetime is entered", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
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
      userRole: "writer",
      user: { id: "writer-1" } as any,
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId={null} />);
    });

    const titleInput = container.querySelector(
      'input[placeholder="読者の目を引くタイトルを入力..."]',
    ) as HTMLInputElement;
    act(() => {
      setNativeValue(titleInput, "テスト記事");
    });

    const schedInput = container.querySelector(
      '[data-testid="schedule-datetime-input"]',
    ) as HTMLInputElement;
    act(() => {
      schedInput.type = "text";
      setNativeValue(schedInput, "invalid-date-string");
    });

    const submitBtn = container.querySelector(
      '[data-testid="editor-submit-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    expect(mockShowToast).toHaveBeenCalledWith("有効な公開予約日時を入力してください");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("loads draft article from DB when not in articles cache, shows '記事を編集' header, and navigates to writerDash on update", async () => {
    const draftArticleData = {
      id: "draft-art-999",
      title: "下書きの記事タイトル",
      content: "<p>下書き本文</p>",
      status: "draft",
      writer_id: "writer-1",
      thumbnail_color: "blue",
      thumbnail_url: null,
      views: 0,
      likes: 0,
      tags: ["テスト"],
      summary: "下書き要約",
      created_at: new Date().toISOString(),
    };

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          update: updateMock,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: draftArticleData, error: null }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const mockProfile = createTestProfile({ id: "writer-1", role: "writer" });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles: [], // articles キャッシュは空（下書き記事は含まれない）
      setArticles: mockSetArticles,
      seriesList: [],
      profile: mockProfile,
      userRole: "writer",
      user: { id: "writer-1" } as any,
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId="draft-art-999" />);
    });

    // DBからの非同期取得完了を待つ
    for (let i = 0; i < 20; i++) {
      if (container.textContent?.includes("記事を編集")) break;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    // ヘッダーが「新規記事作成」ではなく「記事を編集」になっていること！
    expect(container.querySelector("h1")?.textContent).toContain("記事を編集");

    // 保存ボタンをクリックして更新
    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("更新する"),
    ) as HTMLButtonElement;
    expect(saveBtn).toBeDefined();

    await act(async () => {
      saveBtn.click();
    });

    expect(updateMock).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith("記事を更新しました");
    // 下書き記事編集保存後、確実にダッシュボードへ戻ること！
    expect(mockNavigate).toHaveBeenCalledWith("writerDash");
  });

  it("includes scheduled_at and replaces browser URL when auto-saving a new draft", async () => {
    vi.useFakeTimers();
    let insertedPayload: any = null;
    const insertMock = vi.fn((payload: any) => {
      insertedPayload = payload;
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "art-autosave-new",
              title: payload.title,
              writer_id: payload.writer_id,
              status: "draft",
              scheduled_at: payload.scheduled_at,
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

    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

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

    const titleInput = container.querySelector(
      'input[placeholder="読者の目を引くタイトルを入力..."]',
    ) as HTMLInputElement;
    act(() => {
      setNativeValue(titleInput, "自動保存タイトル");
    });

    // 予約日時を入力
    const scheduleInput = container.querySelector(
      'input[type="datetime-local"]',
    ) as HTMLInputElement;
    expect(scheduleInput).not.toBeNull();
    act(() => {
      setNativeValue(scheduleInput, "2026-11-01T15:30");
    });

    // 5秒タイマーを進める
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(insertedPayload).not.toBeNull();
    expect(insertedPayload.title).toBe("自動保存タイトル");
    expect(insertedPayload.scheduled_at).toContain("2026-11-01T");
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/writer-dash/edit/art-autosave-new");
    expect(mockShowToast).toHaveBeenCalledWith("自動保存しました");

    vi.useRealTimers();
  });

  it("navigates to editorArticles when editor saves another writer's article", async () => {
    const targetArticle = {
      id: "art-other-1",
      title: "他ライターの記事",
      writerId: "other-writer-id",
      status: "published",
      content: "<p>本文</p>",
      summary: "",
      tags: [],
      thumbnailColor: "blue",
      thumbnailUrl: null,
      seriesId: null,
      episodeNumber: null,
      commentsEnabled: true,
      scheduledAt: null,
      createdAt: new Date().toISOString(),
      views: 0,
      likes: 0,
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any;
      }
      return {} as any;
    });

    const mockProfile = createTestProfile({ id: "editor-user-id", role: "editor" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles: [targetArticle],
      setArticles: mockSetArticles,
      seriesList: [],
      profile: mockProfile,
      user: { id: "editor-user-id" } as any,
      userRole: "editor",
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId="art-other-1" />);
    });

    // 「更新する」ボタンをクリック
    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("更新する"),
    );
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.click();
      await Promise.resolve();
    });

    expect(mockNavigate).toHaveBeenCalledWith("editorArticles");
    expect(mockShowToast).toHaveBeenCalledWith("記事を更新しました");
  });
});
