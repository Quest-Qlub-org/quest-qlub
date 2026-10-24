// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { WriterDashboard } from "./WriterDashboard";
import { renderWithRouter, createTestProfile } from "../../test/test-utils";
import { ARTICLE_LIST_FIELDS } from "../../context/DataContext";
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

  it("queries writer articles using ARTICLE_LIST_FIELDS without comments_enabled", async () => {
    const { container } = renderWithRouter(<WriterDashboard />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastSelectFields).toBe(ARTICLE_LIST_FIELDS);
    expect(lastSelectFields).not.toContain("comments_enabled");
    expect(container.textContent).toContain("マイ記事");
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
});
