import { describe, it, expect } from "vite-plus/test";
import {
  mapDbArticleToArticle,
  getThumbnailColor,
  THUMBNAIL_COLORS,
  ARTICLE_STATUS_CONFIG,
  type DbArticleRow,
} from "./index";

describe("types/index core logic", () => {
  describe("getThumbnailColor", () => {
    it("returns correct color configuration for valid color ID", () => {
      const green = getThumbnailColor("green");
      expect(green.id).toBe("green");
      expect(green.label).toBe("グリーン");
      expect(green.bg).toBe("bg-green-100");
    });

    it("falls back to default color (blue) when colorId is null, undefined, or invalid", () => {
      const defaultColor = THUMBNAIL_COLORS[0];
      expect(getThumbnailColor(null)).toEqual(defaultColor);
      expect(getThumbnailColor("invalid_color_xyz")).toEqual(defaultColor);
    });
  });

  describe("ARTICLE_STATUS_CONFIG", () => {
    it("has label and badgeClass for all article statuses", () => {
      expect(ARTICLE_STATUS_CONFIG.published.label).toBe("公開中");
      expect(ARTICLE_STATUS_CONFIG.pending.label).toBe("承認待ち");
      expect(ARTICLE_STATUS_CONFIG.draft.label).toBe("下書き");
    });
  });

  describe("mapDbArticleToArticle", () => {
    it("maps full DbArticleRow to Article domain model", () => {
      const row: DbArticleRow = {
        id: "art-1",
        title: "テスト記事タイトル",
        thumbnail: "thumb.png",
        thumbnail_url: "https://example.com/thumb.png",
        thumbnail_color: "orange",
        writer_id: "writer-1",
        views: 120,
        likes: 15,
        tags: ["数学", "理科"],
        is_recommended: true,
        is_popular: true,
        status: "published",
        content: "<p>本文です</p>",
        summary: "要約です",
        series_id: "series-1",
        episode_number: 3,
        collaborator_ids: ["writer-2", "writer-3"],
      };

      const article = mapDbArticleToArticle(row);

      expect(article.id).toBe("art-1");
      expect(article.title).toBe("テスト記事タイトル");
      expect(article.thumbnail).toBe("thumb.png");
      expect(article.thumbnailUrl).toBe("https://example.com/thumb.png");
      expect(article.thumbnailColor).toBe("orange");
      expect(article.writerId).toBe("writer-1");
      expect(article.collaboratorIds).toEqual(["writer-2", "writer-3"]);
      expect(article.views).toBe(120);
      expect(article.likes).toBe(15);
      expect(article.tags).toEqual(["数学", "理科"]);
      expect(article.isRecommended).toBe(true);
      expect(article.isPopular).toBe(true);
      expect(article.status).toBe("published");
      expect(article.content).toBe("<p>本文です</p>");
      expect(article.summary).toBe("要約です");
      expect(article.seriesId).toBe("series-1");
      expect(article.episodeNumber).toBe(3);
    });

    it("fills default values for null or missing optional fields", () => {
      const minimalRow: DbArticleRow = {
        id: "art-2",
        title: "最小記事",
        thumbnail: "default.png",
        writer_id: "writer-2",
        status: "draft",
      };

      const article = mapDbArticleToArticle(minimalRow);

      expect(article.thumbnailUrl).toBeNull();
      expect(article.thumbnailColor).toBe("blue");
      expect(article.views).toBe(0);
      expect(article.likes).toBe(0);
      expect(article.tags).toEqual([]);
      expect(article.isRecommended).toBe(false);
      expect(article.isPopular).toBe(false);
      expect(article.content).toBeUndefined();
      expect(article.summary).toBeUndefined();
      expect(article.seriesId).toBeNull();
      expect(article.episodeNumber).toBeNull();
      expect(article.collaboratorIds).toEqual([]);
    });
  });
});
