// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ArticleEditorPage } from "./ArticleEditorView";
import * as AppContextModule from "../../context/AppContext";
import { supabase } from "../../supabase";
import { createTestProfile, setNativeValue } from "../../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockRouterNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockRouterNavigate,
  };
});

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
    expect(mockRouterNavigate).toHaveBeenCalledWith("/writer-dash/edit/art-autosave-new", {
      replace: true,
    });
    expect(mockShowToast).toHaveBeenCalledWith("自動保存しました");
    // setLoadedArticle が同期されて effectiveEditingArticle が更新されたため、ヘッダーが「記事を編集」になる
    expect(container.textContent).toContain("記事を編集");

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

  it("intercepts external navigation clicks with confirm dialog when unsaved changes exist", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    vi.spyOn(supabase, "from").mockImplementation(
      () =>
        ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }) as any,
    );

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

    // Create a mock header navigation button outside the editor
    const mockHeader = document.createElement("header");
    const mockNavButton = document.createElement("button");
    mockNavButton.textContent = "記事を探す";
    let navClicked = false;
    mockNavButton.onclick = () => {
      navClicked = true;
    };
    mockHeader.appendChild(mockNavButton);
    document.body.appendChild(mockHeader);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId={null} />);
    });

    // Make the form dirty
    const titleInput = container.querySelector(
      'input[placeholder="読者の目を引くタイトルを入力..."]',
    ) as HTMLInputElement;
    act(() => {
      setNativeValue(titleInput, "未保存のタイトル変更");
    });

    // Click external navigation button while dirty and user cancels confirm
    act(() => {
      mockNavButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(confirmSpy).toHaveBeenCalledWith("保存されていない変更があります。ページを離れますか？");
    expect(navClicked).toBe(false);

    // If user accepts confirm
    confirmSpy.mockReturnValue(true);
    act(() => {
      mockNavButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(navClicked).toBe(true);

    document.body.removeChild(mockHeader);
  });

  it("saves collaborator_ids in article insert payload", async () => {
    let insertedPayload: any = null;
    const insertMock = vi.fn((payload: any) => {
      insertedPayload = payload;
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "new-collab-art", title: payload.title, writer_id: "writer-1" },
            error: null,
          }),
        }),
      };
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return { insert: insertMock } as any;
      }
      return {} as any;
    });

    const mockWriter = createTestProfile({ id: "writer-1", role: "writer" });
    const mockCoAuthor = createTestProfile({
      id: "writer-2",
      role: "writer",
      display_name: "共同執筆者",
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      userRole: "writer",
      articles: [],
      setArticles: mockSetArticles,
      seriesList: [],
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
      writers: [mockWriter, mockCoAuthor],
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId={null} />);
    });

    const titleInput = container.querySelector(
      'input[placeholder="読者の目を引くタイトルを入力..."]',
    ) as HTMLInputElement;
    act(() => {
      setNativeValue(titleInput, "共同執筆テスト記事");
    });

    // Select co-author
    const collabSelect = container.querySelector(
      "select[data-testid='collaborator-select-input']",
    ) as HTMLSelectElement;
    expect(collabSelect).toBeTruthy();

    act(() => {
      setNativeValue(collabSelect, "writer-2");
      collabSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Save draft
    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("下書き保存"),
    );
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      saveBtn!.click();
    });

    expect(insertedPayload).toBeTruthy();
    expect(insertedPayload.collaborator_ids).toEqual(["writer-2"]);
    expect(mockShowToast).toHaveBeenCalledWith("下書きを保存しました");
  });

  it("retries insert without collaborator_ids when Supabase returns 42703 column does not exist", async () => {
    const insertedPayloads: any[] = [];
    const insertMock = vi.fn((payload: any) => {
      insertedPayloads.push(payload);
      if ("collaborator_ids" in payload && payload.collaborator_ids?.length > 0) {
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: "42703",
                message: 'column "collaborator_ids" of relation "articles" does not exist',
              },
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "art-fallback", title: payload.title, writer_id: "writer-1" },
            error: null,
          }),
        }),
      };
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return { insert: insertMock } as any;
      }
      return {} as any;
    });

    const mockWriter = createTestProfile({ id: "writer-1", role: "writer" });
    const mockCoAuthor = createTestProfile({
      id: "writer-2",
      role: "writer",
      display_name: "共同執筆者",
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockWriter,
      userRole: "writer",
      articles: [],
      setArticles: mockSetArticles,
      seriesList: [],
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
      writers: [mockWriter, mockCoAuthor],
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId={null} />);
    });

    const titleInput = container.querySelector(
      'input[placeholder="読者の目を引くタイトルを入力..."]',
    ) as HTMLInputElement;
    act(() => {
      setNativeValue(titleInput, "フォールバックテスト");
    });

    const collabSelect = container.querySelector(
      "select[data-testid='collaborator-select-input']",
    ) as HTMLSelectElement;

    act(() => {
      setNativeValue(collabSelect, "writer-2");
      collabSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("下書き保存"),
    );

    await act(async () => {
      saveBtn!.click();
    });

    expect(insertedPayloads.length).toBe(2);
    expect("collaborator_ids" in insertedPayloads[0]).toBe(true);
    expect("collaborator_ids" in insertedPayloads[1]).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith("下書きを保存しました");
  });

  it("allows editor to directly publish a pending article and restricts CollaboratorSelect for non-owner collaborators (#129)", async () => {
    const updatedPayloads: any[] = [];
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          update: vi.fn((payload: any) => {
            updatedPayloads.push(payload);
            return { eq: vi.fn().mockResolvedValue({ error: null }) };
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "art-pending-1",
                  title: "審査待ち記事",
                  content: "<p>本文</p>",
                  status: "pending",
                  writer_id: "other-writer",
                  collaborator_ids: ["collab-1"],
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const mockCoAuthor = createTestProfile({ id: "collab-1", role: "writer" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockCoAuthor,
      userRole: "writer",
      articles: [],
      setArticles: mockSetArticles,
      seriesList: [],
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
      writers: [mockCoAuthor],
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId="art-pending-1" />);
    });

    // 共同執筆者は CollaboratorSelect を変更できないこと
    expect(container.querySelector("select[data-testid='collaborator-select-input']")).toBeNull();
    expect(container.textContent).toContain(
      "共同執筆者の設定は主作成者または編集長のみ変更できます",
    );

    // 編集長として再マウントすると直接公開ボタンが表示されること
    const mockEditor = createTestProfile({ id: "ed-1", role: "editor" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockEditor,
      userRole: "editor",
      articles: [],
      setArticles: mockSetArticles,
      seriesList: [],
      showToast: mockShowToast,
      navigate: mockNavigate,
      getFontSizeClass: () => "text-base",
      writers: [mockEditor],
    } as any);

    await act(async () => {
      root!.render(<ArticleEditorPage editingId="art-pending-1" />);
    });

    const publishBtn = container.querySelector(
      '[data-testid="editor-direct-publish-btn"]',
    ) as HTMLButtonElement;
    expect(publishBtn).not.toBeNull();

    await act(async () => {
      publishBtn.click();
    });

    expect(updatedPayloads.some((p) => p.status === "published" && p.scheduled_at === null)).toBe(
      true,
    );
  });
});
