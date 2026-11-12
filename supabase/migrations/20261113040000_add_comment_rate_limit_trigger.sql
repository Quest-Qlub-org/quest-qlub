-- ============================================================================
-- Issue #93: 記事コメント投稿のスパム・連投防止（レート制限トリガー）
-- ----------------------------------------------------------------------------
-- 同一 author_id からの短時間連続コメント投稿（10秒以内の連投、または1分あたり
-- 5件以上の大量投稿）を DB レベルの BEFORE INSERT トリガーで拒否する。
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_article_comments_author_created_at
  ON public.article_comments (author_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_comment_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  recent_short_count integer;
  recent_minute_count integer;
BEGIN
  IF NEW.author_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO recent_short_count
  FROM public.article_comments
  WHERE author_id = NEW.author_id
    AND created_at > now() - interval '10 seconds';

  IF recent_short_count >= 1 THEN
    RAISE EXCEPTION 'コメントの連続投稿は制限されています。少し時間を置いてから再度お試しください。'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO recent_minute_count
  FROM public.article_comments
  WHERE author_id = NEW.author_id
    AND created_at > now() - interval '1 minute';

  IF recent_minute_count >= 5 THEN
    RAISE EXCEPTION '短時間に多数のコメントが投稿されています。1分ほど時間を置いてから再度お試しください。'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_comment_rate_limit ON public.article_comments;
CREATE TRIGGER trg_enforce_comment_rate_limit
  BEFORE INSERT ON public.article_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_comment_rate_limit();

-- トリガー関数の直接実行権限を剥奪（多層防御）
REVOKE EXECUTE ON FUNCTION public.enforce_comment_rate_limit() FROM PUBLIC, anon, authenticated;
