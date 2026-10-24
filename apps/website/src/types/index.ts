import { getLocalScheduledAt } from "../utils/scheduledArticles";

export type Series = {
  id: string;
  title: string;
  description?: string | null;
  writerId: string;
};

export type ArticleStatus = "draft" | "pending" | "scheduled" | "published";

export type Article = {
  id: string;
  title: string;
  thumbnail: string;
  thumbnailUrl: string | null;
  thumbnailColor: string | null;
  writerId: string;
  views: number;
  likes: number;
  tags: string[];
  isRecommended: boolean;
  isPopular: boolean;
  status: ArticleStatus;
  content?: string;
  summary?: string;
  seriesId?: string | null;
  episodeNumber?: number | null;
  commentsEnabled?: boolean;
  createdAt?: string | null;
  scheduledAt?: string | null;
};

export interface ThumbnailColorOption {
  id: string;
  label: string;
  bg: string;
  text: string;
}

export const THUMBNAIL_COLORS: ThumbnailColorOption[] = [
  { id: "blue", label: "ブルー", bg: "bg-blue-100", text: "text-blue-400" },
  { id: "green", label: "グリーン", bg: "bg-green-100", text: "text-green-400" },
  { id: "purple", label: "パープル", bg: "bg-purple-100", text: "text-purple-400" },
  { id: "orange", label: "オレンジ", bg: "bg-orange-100", text: "text-orange-400" },
  { id: "pink", label: "ピンク", bg: "bg-pink-100", text: "text-pink-400" },
  { id: "teal", label: "ティール", bg: "bg-teal-100", text: "text-teal-400" },
];

export const getThumbnailColor = (colorId: string | null): ThumbnailColorOption =>
  THUMBNAIL_COLORS.find((c) => c.id === colorId) ?? THUMBNAIL_COLORS[0];

export const MOCK_TAGS = ["理科", "歴史", "数学", "国語", "英語", "プログラミング", "雑学"];

export const ARTICLE_STATUS_CONFIG: Record<ArticleStatus, { label: string; badgeClass: string }> = {
  published: {
    label: "公開中",
    badgeClass: "bg-green-100 text-green-700",
  },
  scheduled: {
    label: "公開予約",
    badgeClass: "bg-purple-100 text-purple-700",
  },
  pending: {
    label: "承認待ち",
    badgeClass: "bg-orange-100 text-orange-700",
  },
  draft: {
    label: "下書き",
    badgeClass: "bg-gray-100 text-gray-600",
  },
};

export interface DbArticleRow {
  id: string;
  title: string;
  thumbnail: string;
  thumbnail_url?: string | null;
  thumbnail_color?: string | null;
  writer_id: string;
  views?: number | null;
  likes?: number | null;
  tags?: string[] | null;
  is_recommended?: boolean | null;
  is_popular?: boolean | null;
  status: ArticleStatus;
  content?: string | null;
  summary?: string | null;
  series_id?: string | null;
  episode_number?: number | null;
  comments_enabled?: boolean | null;
  created_at?: string | null;
  scheduled_at?: string | null;
}

export function mapDbArticleToArticle(a: DbArticleRow): Article {
  const scheduledAt = a.scheduled_at ?? getLocalScheduledAt(a.id) ?? null;
  return {
    id: a.id,
    title: a.title,
    thumbnail: a.thumbnail,
    thumbnailUrl: a.thumbnail_url ?? null,
    thumbnailColor: a.thumbnail_color ?? "blue",
    writerId: a.writer_id,
    views: a.views ?? 0,
    likes: a.likes ?? 0,
    tags: a.tags ?? [],
    isRecommended: Boolean(a.is_recommended),
    isPopular: Boolean(a.is_popular),
    status: a.status,
    content: a.content ?? undefined,
    summary: a.summary ?? undefined,
    seriesId: a.series_id ?? null,
    episodeNumber: a.episode_number ?? null,
    commentsEnabled: a.comments_enabled !== false,
    createdAt: a.created_at ?? null,
    scheduledAt,
  };
}
