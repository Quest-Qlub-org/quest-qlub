// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { EditorDashboard } from "./EditorDashboard";
import { renderWithRouter, createTestProfile, setNativeValue } from "../../test/test-utils";
import * as AppContextModule from "../../context/AppContext";
import { supabase } from "../../supabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EditorDashboard", () => {
  const mockShowToast = vi.fn();
  const mockNavigate = vi.fn();
  const mockSetArticles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("directly fetches pending articles on mount and opens inline preview modal with immediate approve/reject actions", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "art-pending-1",
                  title: "審査待ちテスト記事",
                  excerpt: "概要テスト",
                  content: "<p>審査対象の本文コンテンツです</p>",
                  status: "pending",
                  writer_id: "w-1",
                  views: 0,
                  likes: 0,
                  tags: ["React"],
                  created_at: new Date().toISOString(),
                },
              ],
              error: null,
            }),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { content: "<p>審査対象の本文コンテンツです</p>" },
                error: null,
              }),
            }),
          }),
          update: mockUpdate,
        } as any;
      }
      if (table === "writer_applications") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 2 }),
          }),
        } as any;
      }
      if (table === "contact_messages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 1 }),
          }),
        } as any;
      }
      return {} as any;
    });

    const mockEditor = createTestProfile({ id: "ed-1", role: "editor", display_name: "編集長" });
    const mockWriter = createTestProfile({ id: "w-1", role: "writer", display_name: "ライターA" });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles: [], // DataContext only has published articles, so EditorDashboard must fetch pending directly
      setArticles: mockSetArticles,
      writers: [mockWriter],
      showToast: mockShowToast,
      navigate: mockNavigate,
      profile: mockEditor,
    } as any);

    const { container, unmount } = renderWithRouter(<EditorDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("審査待ちテスト記事");

    // 「内容確認」ボタンでその場プレビューモーダルを開く
    const previewBtn = container.querySelector(
      '[data-testid="preview-pending-art-pending-1"]',
    ) as HTMLButtonElement;
    expect(previewBtn).not.toBeNull();

    await act(async () => {
      previewBtn.click();
    });

    const modal = container.querySelector('[data-testid="editor-inline-preview-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain("審査対象の本文コンテンツです");

    // モーダル内の「許可 (公開)」ボタンで即座に承認できること
    const approveBtn = container.querySelector(
      '[data-testid="modal-approve-btn"]',
    ) as HTMLButtonElement;
    expect(approveBtn).not.toBeNull();

    await act(async () => {
      approveBtn.click();
    });

    expect(mockUpdate).toHaveBeenCalledWith({ status: "published" });
    expect(mockShowToast).toHaveBeenCalledWith("記事を公開しました");
    expect(container.querySelector('[data-testid="editor-inline-preview-modal"]')).toBeNull();

    unmount();
  });

  it("supports approving an article as scheduled publish from the inline preview modal", async () => {
    const updatedPayloads: any[] = [];
    const mockUpdate = vi.fn((payload: any) => {
      updatedPayloads.push(payload);
      return {
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "articles") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "art-pending-sched",
                  title: "予約承認テスト記事",
                  content: "<p>予約公開用の本文</p>",
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
          update: mockUpdate,
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      } as any;
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      articles: [],
      setArticles: mockSetArticles,
      writers: [],
      showToast: mockShowToast,
      navigate: mockNavigate,
      profile: createTestProfile({ id: "ed-1", role: "editor" }),
    } as any);

    const { container, unmount } = renderWithRouter(<EditorDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const previewBtn = container.querySelector(
      '[data-testid="preview-pending-art-pending-sched"]',
    ) as HTMLButtonElement;
    await act(async () => {
      previewBtn.click();
    });

    const schedInput = container.querySelector(
      '[data-testid="editor-preview-schedule-input"]',
    ) as HTMLInputElement;
    expect(schedInput).not.toBeNull();

    act(() => {
      setNativeValue(schedInput, "2099-12-31T12:00");
    });

    const schedApproveBtn = container.querySelector(
      '[data-testid="modal-schedule-approve-btn"]',
    ) as HTMLButtonElement;
    expect(schedApproveBtn).not.toBeNull();

    await act(async () => {
      schedApproveBtn.click();
    });

    expect(updatedPayloads.length).toBeGreaterThan(0);
    expect(updatedPayloads[0].status).toBe("scheduled");
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining("公開予約（"));

    unmount();
  });
});
