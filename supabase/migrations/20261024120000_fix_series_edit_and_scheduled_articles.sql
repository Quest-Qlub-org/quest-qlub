-- ============================================================================
-- Issue #54: 連載（series）編集認可の完全化 & 予約投稿（scheduled_at）の追加
-- ----------------------------------------------------------------------------
-- 1. series テーブルの GRANT 権限および RLS ポリシー（INSERT/UPDATE/DELETE）の
--    型安全な再定義（writer_id::text = auth.uid()::text および roles 配列対応）。
-- 2. articles テーブルへの scheduled_at カラム追加および予約公開用 RPC
--    publish_due_scheduled_articles() の定義。
-- 3. 公開記事 SELECT ポリシーおよび記事更新トリガーの予約投稿ステータス対応。
-- ============================================================================

-- 1. series テーブルの権限とRLSポリシー強化 (#54-10) -------------------------
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.series TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.series TO authenticated;

DROP POLICY IF EXISTS "誰でも連載を閲覧できる" ON public.series;
DROP POLICY IF EXISTS "series_select_public" ON public.series;
CREATE POLICY "series_select_public" ON public.series
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "自分の連載を作成できる" ON public.series;
DROP POLICY IF EXISTS "series_insert_writer_or_editor" ON public.series;
CREATE POLICY "series_insert_writer_or_editor" ON public.series
  FOR INSERT TO authenticated
  WITH CHECK (
    (writer_id)::text = (auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.id)::text = (auth.uid())::text
        AND (
          profiles.role IN ('writer', 'editor')
          OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
          OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
        )
    )
  );

DROP POLICY IF EXISTS "自分の連載を更新できる" ON public.series;
DROP POLICY IF EXISTS "series_update_own_or_editor" ON public.series;
CREATE POLICY "series_update_own_or_editor" ON public.series
  FOR UPDATE TO authenticated
  USING (
    (writer_id)::text = (auth.uid())::text OR public.check_is_editor()
  )
  WITH CHECK (
    (writer_id)::text = (auth.uid())::text OR public.check_is_editor()
  );

DROP POLICY IF EXISTS "自分の連載を削除できる" ON public.series;
DROP POLICY IF EXISTS "series_delete_own_or_editor" ON public.series;
CREATE POLICY "series_delete_own_or_editor" ON public.series
  FOR DELETE TO authenticated
  USING (
    (writer_id)::text = (auth.uid())::text OR public.check_is_editor()
  );

-- 2. 予約投稿用 scheduled_at カラムの追加 (#54-3) -----------------------------
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_articles_status_scheduled_at
  ON public.articles (status, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- 予約日時が到来した記事を自動公開状態に遷移させるRPC関数
CREATE OR REPLACE FUNCTION public.publish_due_scheduled_articles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_count integer := 0;
BEGIN
  PERFORM set_config('quest.in_scheduled_publish', 'true', true);

  UPDATE public.articles
  SET status = 'published'
  WHERE status = 'scheduled'
    AND scheduled_at IS NOT NULL
    AND scheduled_at <= now();

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_due_scheduled_articles() TO anon, authenticated;

-- 3. articles の更新トリガー・RLSポリシーの予約投稿対応 -----------------------
CREATE OR REPLACE FUNCTION public.enforce_article_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_in_likes_sync boolean := coalesce(current_setting('quest.in_likes_sync', true), 'false') = 'true';
  v_in_views_inc boolean := coalesce(current_setting('quest.in_views_increment', true), 'false') = 'true';
  v_in_scheduled_pub boolean := coalesce(current_setting('quest.in_scheduled_publish', true), 'false') = 'true';
BEGIN
  -- 1. システム内部のいいね同期処理
  IF v_in_likes_sync THEN
    OLD.likes := NEW.likes;
    RETURN OLD;
  END IF;

  -- 2. システム内部のPV加算処理
  IF v_in_views_inc THEN
    OLD.views := OLD.views + 1;
    RETURN OLD;
  END IF;

  -- 3. システム内部の予約公開昇格処理
  IF v_in_scheduled_pub THEN
    OLD.status := NEW.status;
    RETURN OLD;
  END IF;

  -- 4. 通常のユーザー（編集長またはライター）による更新
  IF NOT public.check_is_editor() THEN
    IF (auth.uid())::text IS NULL OR (auth.uid())::text != OLD.writer_id THEN
      RAISE EXCEPTION '他のユーザーの記事を更新することはできません。';
    END IF;

    NEW.writer_id := OLD.writer_id;

    -- ライター自身で直接 published または scheduled に昇格することはできない（審査申請 pending を経由する）
    IF NEW.status IN ('published', 'scheduled') AND OLD.status NOT IN ('published', 'scheduled') THEN
      RAISE EXCEPTION 'ライター自身で記事を公開状態に変更することはできません。審査申請を行ってください。';
    END IF;

    NEW.is_recommended := OLD.is_recommended;
    NEW.is_popular := OLD.is_popular;
    NEW.views := OLD.views;
    NEW.likes := OLD.likes;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "articles_select_published" ON public.articles;
CREATE POLICY "articles_select_published" ON public.articles
  FOR SELECT TO public
  USING (
    (status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= now()))
    OR (status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now())
  );
