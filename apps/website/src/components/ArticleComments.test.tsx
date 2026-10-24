// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { ArticleComments } from "./ArticleComments";
import { renderWithRouter, setNativeValue, createTestProfile } from "../test/test-utils";
import * as AuthContextModule from "../context/AuthContext";
import { supabase } from "../supabase";

describe("ArticleComments (DB-backed, Auth-required, Role permissions, Pinning & Edit History)", () => {
  const articleId = "article-100";
  const writerId = "writer-owner-1";

  let mockCommentsDb: any[];
  let mockHistoryDb: any[];

  beforeEach(() => {
    localStorage.clear();
    mockCommentsDb = [
      {
        id: "c-1",
        article_id: articleId,
        author_id: "viewer-1",
        author_name: "読者イチロー",
        content: "最初のコメントです",
        is_pinned: false,
        created_at: "2026-10-17T10:00:00.000Z",
        updated_at: "2026-10-17T10:00:00.000Z",
      },
      {
        id: "c-2",
        article_id: articleId,
        author_id: "viewer-2",
        author_name: "読者ジロー",
        content: "編集後のコメント本文",
        is_pinned: true,
        created_at: "2026-10-17T11:00:00.000Z",
        updated_at: "2026-10-17T12:00:00.000Z",
      },
    ];
    mockHistoryDb = [
      {
        id: "h-1",
        comment_id: "c-2",
        previous_content: "編集前の初期コメント本文",
        edited_at: "2026-10-17T12:00:00.000Z",
      },
    ];

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "article_comments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockImplementation(async () => ({
                  data: [...mockCommentsDb],
                  error: null,
                })),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            const row = {
              id: `c-${Date.now()}`,
              article_id: payload.article_id,
              author_id: payload.author_id,
              author_name: payload.author_name,
              content: payload.content,
              is_pinned: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            mockCommentsDb.push(row);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              }),
            };
          }),
          update: vi.fn().mockImplementation((updates: any) => ({
            eq: vi.fn().mockImplementation(async (_col: string, id: string) => {
              const target = mockCommentsDb.find((c) => c.id === id);
              if (target) {
                if (updates.content && updates.content !== target.content) {
                  mockHistoryDb.unshift({
                    id: `h-${Date.now()}`,
                    comment_id: id,
                    previous_content: target.content,
                    edited_at: new Date().toISOString(),
                  });
                  target.content = updates.content;
                  target.updated_at = new Date().toISOString();
                }
                if (typeof updates.is_pinned === "boolean") {
                  target.is_pinned = updates.is_pinned;
                }
              }
              return { data: target, error: null };
            }),
          })),
          delete: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(async (_col: string, id: string) => {
              mockCommentsDb = mockCommentsDb.filter((c) => c.id !== id);
              return { error: null };
            }),
          })),
        } as any;
      }

      if (table === "comment_edit_history") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, commentId: string) => ({
              order: vi.fn().mockResolvedValue({
                data: mockHistoryDb.filter((h) => h.comment_id === commentId),
                error: null,
              }),
            })),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }

      return {} as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockAuth(
    role: "guest" | "viewer" | "writer" | "editor",
    userId?: string,
    name?: string,
  ) {
    const profile =
      role === "guest"
        ? null
        : createTestProfile({
            id: userId || `${role}-id`,
            role: role,
            display_name: name || `${role}ユーザー`,
          });
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: profile ? ({ id: profile.id, email: "test@example.com" } as any) : null,
      profile,
      setProfile: vi.fn(),
      userRole: role,
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });
  }

  it("requires account registration (login) to post a comment", async () => {
    mockAuth("guest");

    const { container, unmount } = renderWithRouter(
      <ArticleComments articleId={articleId} writerId={writerId} commentsEnabled={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    // 未ログイン時は textarea が存在せず、ログイン案内が表示されること
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("ログイン");
    // 公開中のコメント自体は閲覧可能
    expect(container.textContent).toContain("最初のコメントです");

    unmount();
  });

  it("completely hides all comments (including past comments) from regular viewers and guests when commentsEnabled is false", async () => {
    mockAuth("viewer", "viewer-1", "読者イチロー");

    const { container, unmount } = renderWithRouter(
      <ArticleComments articleId={articleId} writerId={writerId} commentsEnabled={false} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    // コメントオフ時は一般読者には過去のコメントも含めて一切表示されないこと
    expect(container.textContent).not.toContain("最初のコメントです");
    expect(container.textContent).not.toContain("編集後のコメント本文");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("コメント");

    unmount();
  });

  it("allows article writer and editor to view past comments and toggle commentsEnabled even when commentsEnabled is false", async () => {
    mockAuth("writer", writerId, "記事執筆ライター");
    const onToggleCommentsEnabled = vi.fn();

    const { container, unmount } = renderWithRouter(
      <ArticleComments
        articleId={articleId}
        writerId={writerId}
        commentsEnabled={false}
        onToggleCommentsEnabled={onToggleCommentsEnabled}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    // ライター本人はコメントオフ時でも過去コメントを閲覧・管理できること
    expect(container.textContent).toContain("最初のコメントです");

    const toggleBtn = container.querySelector(
      '[data-testid="toggle-comments-enabled"]',
    ) as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();

    await act(async () => {
      toggleBtn.click();
    });

    expect(onToggleCommentsEnabled).toHaveBeenCalledWith(true);

    unmount();
  });

  it("allows only the article writer (NOT editor or others) to pin comments, up to 3 maximum", async () => {
    // 1. 編集長（記事のライターではない）で表示した場合、ピン留めボタンは表示されないが削除ボタンは表示されること
    mockAuth("editor", "editor-admin-1", "編集長");

    const { container: editorContainer, unmount: unmountEditor } = renderWithRouter(
      <ArticleComments articleId={articleId} writerId={writerId} commentsEnabled={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(editorContainer.querySelector('[data-testid="pin-comment-c-1"]')).toBeNull();
    expect(editorContainer.querySelector('[data-testid="delete-comment-c-1"]')).not.toBeNull();
    unmountEditor();

    // 2. 記事のライター本人で表示した場合、ピン留めボタンが表示され、最大3件までピン留めできること
    mockCommentsDb.push(
      {
        id: "c-3",
        article_id: articleId,
        author_id: "viewer-3",
        author_name: "読者サブロー",
        content: "3つ目のコメント",
        is_pinned: true,
        created_at: "2026-10-17T13:00:00.000Z",
        updated_at: "2026-10-17T13:00:00.000Z",
      },
      {
        id: "c-4",
        article_id: articleId,
        author_id: "viewer-4",
        author_name: "読者シロー",
        content: "4つ目のコメント",
        is_pinned: true,
        created_at: "2026-10-17T14:00:00.000Z",
        updated_at: "2026-10-17T14:00:00.000Z",
      },
    );
    // 現在 c-2, c-3, c-4 の計3件がピン留め済み

    mockAuth("writer", writerId, "記事ライター本人");
    const { container: writerContainer, unmount: unmountWriter } = renderWithRouter(
      <ArticleComments articleId={articleId} writerId={writerId} commentsEnabled={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const pinBtnC1 = writerContainer.querySelector(
      '[data-testid="pin-comment-c-1"]',
    ) as HTMLButtonElement;
    expect(pinBtnC1).not.toBeNull();

    // すでに3件ピン留めされている状態で4件目(c-1)をピン留めしようとすると制限エラーメッセージが表示されること
    await act(async () => {
      pinBtnC1.click();
    });

    expect(writerContainer.textContent).toContain("最大3件");
    expect(mockCommentsDb.find((c) => c.id === "c-1")?.is_pinned).toBe(false);

    unmountWriter();
  });

  it("allows comment author to edit their own comment and allows ANY user to view edit history", async () => {
    mockAuth("viewer", "viewer-1", "読者イチロー");

    const { container, unmount } = renderWithRouter(
      <ArticleComments articleId={articleId} writerId={writerId} commentsEnabled={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    // 自分のコメント(c-1)には編集ボタンがあり、他人のコメント(c-2)には編集ボタンがないこと
    const editBtnC1 = container.querySelector(
      '[data-testid="edit-comment-c-1"]',
    ) as HTMLButtonElement;
    const editBtnC2 = container.querySelector('[data-testid="edit-comment-c-2"]');
    expect(editBtnC1).not.toBeNull();
    expect(editBtnC2).toBeNull();

    // c-1 を編集
    await act(async () => {
      editBtnC1.click();
    });

    const editTextarea = container.querySelector(
      '[data-testid="edit-textarea-c-1"]',
    ) as HTMLTextAreaElement;
    expect(editTextarea).not.toBeNull();
    setNativeValue(editTextarea, "更新されたイチローのコメント");

    const saveEditBtn = container.querySelector(
      '[data-testid="save-edit-c-1"]',
    ) as HTMLButtonElement;
    await act(async () => {
      saveEditBtn.click();
    });

    expect(container.textContent).toContain("更新されたイチローのコメント");

    // 編集済みのコメント(c-2)の編集履歴ボタンをクリックすると、誰でも過去の編集履歴を確認できること
    const historyBtnC2 = container.querySelector(
      '[data-testid="view-history-c-2"]',
    ) as HTMLButtonElement;
    expect(historyBtnC2).not.toBeNull();

    await act(async () => {
      historyBtnC2.click();
    });

    expect(container.textContent).toContain("編集履歴");
    expect(container.textContent).toContain("編集前の初期コメント本文");

    unmount();
  });

  it("allows comment author, article writer, and editor to delete comments", async () => {
    mockAuth("viewer", "viewer-1", "読者イチロー");

    const { container, unmount } = renderWithRouter(
      <ArticleComments articleId={articleId} writerId={writerId} commentsEnabled={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    // 自分のコメント(c-1)のみ削除ボタンがあり、他人のコメント(c-2)には削除ボタンがないこと
    const deleteBtnC1 = container.querySelector(
      '[data-testid="delete-comment-c-1"]',
    ) as HTMLButtonElement;
    const deleteBtnC2 = container.querySelector('[data-testid="delete-comment-c-2"]');
    expect(deleteBtnC1).not.toBeNull();
    expect(deleteBtnC2).toBeNull();

    await act(async () => {
      deleteBtnC1.click();
    });

    expect(container.textContent).not.toContain("最初のコメントです");

    unmount();
  });

  it("gracefully falls back to localStorage when article_comments table has schema drift (PGRST205), persisting comments across remounts", async () => {
    mockAuth("viewer", "viewer-fallback-1", "フォールバック太郎");
    const schemaError = {
      code: "PGRST205",
      message: "Could not find the table 'public.article_comments' in the schema cache",
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "article_comments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: schemaError,
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: schemaError,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: schemaError,
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const { container, unmount } = renderWithRouter(
      <ArticleComments articleId="art-drift-99" writerId="writer-99" commentsEnabled={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    setNativeValue(textarea, "ローカル保存テストコメント");

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();

    await act(async () => {
      submitBtn.click();
      await Promise.resolve();
    });

    // コメントがUIに表示され、localStorage に保存されていること
    expect(container.textContent).toContain("ローカル保存テストコメント");
    expect(localStorage.getItem("quest_qlub_comments_art-drift-99")).toContain(
      "ローカル保存テストコメント",
    );

    // 画面再読み込み（アンマウント＆再マウント）後もコメントが消えずに保持されること
    unmount();

    const { container: container2, unmount: unmount2 } = renderWithRouter(
      <ArticleComments articleId="art-drift-99" writerId="writer-99" commentsEnabled={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(container2.textContent).toContain("ローカル保存テストコメント");
    expect(container2.textContent).toContain("ローカル保存モード");

    unmount2();
  });

  it("applies dark mode styling classes to container sections", async () => {
    mockAuth("viewer", "viewer-1", "一般読者");

    const { container, unmount } = renderWithRouter(
      <ArticleComments articleId={articleId} writerId={writerId} commentsEnabled={true} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const section = container.querySelector("section");
    expect(section).not.toBeNull();
    expect(section?.className).toContain("dark:bg-gray-800");
    expect(section?.className).toContain("dark:border-gray-700");

    unmount();
  });
});
