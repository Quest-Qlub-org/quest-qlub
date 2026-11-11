// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { WriterDashboard } from "./WriterDashboard";
import { renderWithRouter, createTestProfile } from "../../test/test-utils";
import { ARTICLE_LIST_FIELDS, WRITER_ARTICLE_LIST_FIELDS } from "../../context/DataContext";
import * as AppContextModule from "../../context/AppContext";
import { supabase } from "../../supabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WriterDashboard", () => {
  let lastSelectFields = "";

  beforeEach(() => {
    vi.clearAllMocks();
    lastSelectFields = "";

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn((fields: string) => {
            lastSelectFields = fields;
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "art-writer-1",
                      title: "マイ記事",
                      status: "draft",
                      writer_id: "w-1",
                      views: 0,
                      likes: 0,
                      created_at: new Date().toISOString(),
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    const mockProfile = createTestProfile({ id: "w-1", role: "writer" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockProfile,
      articles: [],
      setArticles: vi.fn(),
      showToast: vi.fn(),
      navigate: vi.fn(),
      authLoading: false,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries writer articles using WRITER_ARTICLE_LIST_FIELDS without comments_enabled", async () => {
    const { container } = renderWithRouter(<WriterDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastSelectFields).toBe(WRITER_ARTICLE_LIST_FIELDS);
    expect(lastSelectFields).not.toContain("comments_enabled");
    expect(container.textContent).toContain("マイ記事");
  });

  it("gracefully falls back to ARTICLE_LIST_FIELDS without collaborator_ids when primary query fails due to 42703 schema drift", async () => {
    const queriedFields: string[] = [];
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn((fields: string) => {
            queriedFields.push(fields);
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
                        id: "art-fallback-1",
                        title: "フォールバック記事",
                        status: "draft",
                        writer_id: "w-1",
                        views: 0,
                        likes: 0,
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

    const { container } = renderWithRouter(<WriterDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // 1回目の一次試行で WRITER_ARTICLE_LIST_FIELDS が呼ばれ、42703 エラー検知後に ARTICLE_LIST_FIELDS にフォールバックする
    expect(queriedFields).toContain(WRITER_ARTICLE_LIST_FIELDS);
    expect(queriedFields).toContain(ARTICLE_LIST_FIELDS);
    expect(queriedFields[queriedFields.length - 1]).toBe(ARTICLE_LIST_FIELDS);
    expect(queriedFields[queriedFields.length - 1]).not.toContain("collaborator_ids");
    expect(container.textContent).toContain("フォールバック記事");
  });

  it("navigates to article preview when clicking 確認 button", async () => {
    const mockNavigate = vi.fn();
    const mockProfile = createTestProfile({ id: "w-1", role: "writer" });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockProfile,
      articles: [],
      setArticles: vi.fn(),
      showToast: vi.fn(),
      navigate: mockNavigate,
      authLoading: false,
    } as any);

    const { container } = renderWithRouter(<WriterDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const previewBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("確認"),
    );
    expect(previewBtn).toBeDefined();

    act(() => {
      previewBtn!.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("article", "art-writer-1");
  });

  it("allows unpublishing published articles back to draft", async () => {
    const mockShowToast = vi.fn();
    const mockProfile = createTestProfile({ id: "w-1", role: "writer" });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "art-published-1",
                    title: "公開中の記事",
                    status: "published",
                    writer_id: "w-1",
                    views: 10,
                    likes: 5,
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          }),
          update: mockUpdate,
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockProfile,
      articles: [],
      setArticles: vi.fn(),
      showToast: mockShowToast,
      navigate: vi.fn(),
      authLoading: false,
    } as any);

    const { container } = renderWithRouter(<WriterDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const unpublishBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("非公開にする"),
    );
    expect(unpublishBtn).toBeDefined();

    await act(async () => {
      unpublishBtn!.click();
    });

    expect(mockUpdate).toHaveBeenCalledWith({ status: "draft" });
    expect(mockShowToast).toHaveBeenCalledWith("記事を非公開（下書き）に戻しました");
  });

  it("opens inline preview modal and allows withdrawing a pending article", async () => {
    const mockShowToast = vi.fn();
    const mockProfile = createTestProfile({ id: "w-1", role: "writer" });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn((fields: string) => {
            if (fields === "*") {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { content: "<p>申請中の記事プレビュー本文</p>" },
                    error: null,
                  }),
                }),
              };
            }
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "art-pending-w1",
                      title: "審査申請中の記事",
                      status: "pending",
                      writer_id: "w-1",
                      views: 0,
                      likes: 0,
                      created_at: new Date().toISOString(),
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }),
          update: mockUpdate,
        } as any;
      }
      return {} as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockProfile,
      articles: [],
      setArticles: vi.fn(),
      showToast: mockShowToast,
      navigate: vi.fn(),
      authLoading: false,
    } as any);

    const { container } = renderWithRouter(<WriterDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const inlinePreviewBtn = container.querySelector(
      '[data-testid="writer-inline-preview-art-pending-w1"]',
    ) as HTMLButtonElement;
    expect(inlinePreviewBtn).not.toBeNull();

    await act(async () => {
      inlinePreviewBtn.click();
    });

    const modal = container.querySelector('[data-testid="writer-inline-preview-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain("申請中の記事プレビュー本文");

    // 申請取消ボタンをクリック
    const withdrawBtn = container.querySelector(
      '[data-testid="withdraw-pending-art-pending-w1"]',
    ) as HTMLButtonElement;
    expect(withdrawBtn).not.toBeNull();

    await act(async () => {
      withdrawBtn.click();
    });

    expect(mockUpdate).toHaveBeenCalledWith({ status: "draft" });
    expect(mockShowToast).toHaveBeenCalledWith("投稿申請を取り消し、下書きに戻しました");
  });

  it("displays collaborative articles with 共同編集 badge", async () => {
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "art-collab-1",
                    title: "共同執筆された記事",
                    status: "draft",
                    writer_id: "other-writer",
                    collaborator_ids: ["w-1"],
                    views: 0,
                    likes: 0,
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "art-collab-1",
                    title: "共同執筆された記事",
                    status: "draft",
                    writer_id: "other-writer",
                    collaborator_ids: ["w-1"],
                    views: 0,
                    likes: 0,
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          })),
        } as any;
      }
      return {} as any;
    });

    const mockProfile = createTestProfile({ id: "w-1", role: "writer" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockProfile,
      articles: [],
      setArticles: vi.fn(),
      showToast: vi.fn(),
      navigate: vi.fn(),
      authLoading: false,
    } as any);

    const { container } = renderWithRouter(<WriterDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("共同執筆された記事");
    const badge = container.querySelector("[data-testid='collaborator-article-badge']");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("共同編集");

    // 共同編集者は削除ボタンが表示されないこと
    const buttons = Array.from(container.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(buttons).toContain("編集");
    expect(buttons).not.toContain("削除");
  });

  it("shows delete button for collaborative articles when user is an editor", async () => {
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "art-collab-1",
                    title: "共同執筆された記事",
                    status: "draft",
                    writer_id: "other-writer",
                    collaborator_ids: ["w-editor"],
                    views: 0,
                    likes: 0,
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "art-collab-1",
                    title: "共同執筆された記事",
                    status: "draft",
                    writer_id: "other-writer",
                    collaborator_ids: ["w-editor"],
                    views: 0,
                    likes: 0,
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          })),
        } as any;
      }
      return {} as any;
    });

    const mockProfile = createTestProfile({ id: "w-editor", role: "editor" });
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: mockProfile,
      articles: [],
      setArticles: vi.fn(),
      showToast: vi.fn(),
      navigate: vi.fn(),
      authLoading: false,
      userRole: "editor",
    } as any);

    const { container } = renderWithRouter(<WriterDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const buttons = Array.from(container.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(buttons).toContain("削除");
  });
});
