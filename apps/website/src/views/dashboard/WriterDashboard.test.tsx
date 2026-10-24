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
});
