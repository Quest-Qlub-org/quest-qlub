-- ============================================================================
-- 共同編集機能（collaborator_ids）の追加 & 認可ポリシー更新
-- ----------------------------------------------------------------------------
-- 1. articles テーブルへの collaborator_ids text[] カラム追加 & GINインデックス
-- 2. series テーブルへの collaborator_ids text[] カラム追加 & GINインデックス
-- 3. articles RLSポリシー（下書き閲覧・更新）の共同編集者対応
-- 4. articles 更新トリガー関数 enforce_article_update_rules の共同編集者対応
-- 5. series RLSポリシー（更新）の共同編集者対応
-- ============================================================================

-- 1. articles テーブルへの collaborator_ids 追加
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS collaborator_ids text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_articles_collaborator_ids
  ON public.articles USING gin (collaborator_ids);

-- 2. series テーブルへの collaborator_ids 追加
ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS collaborator_ids text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_series_collaborator_ids
  ON public.series USING gin (collaborator_ids);

-- 3. articles RLS ポリシー更新 (下書き閲覧・更新)
DROP POLICY IF EXISTS "articles_select_own_drafts" ON public.articles;
CREATE POLICY "articles_select_own_drafts" ON public.articles
  FOR SELECT TO authenticated
  USING (
    (
      (auth.uid())::text = writer_id
      OR (auth.uid())::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
    )
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

DROP POLICY IF EXISTS "articles_update_own_articles" ON public.articles;
CREATE POLICY "articles_update_own_articles" ON public.articles
  FOR UPDATE TO authenticated
  USING (
    (
      (auth.uid())::text = writer_id
      OR (auth.uid())::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.id)::text = (auth.uid())::text
        AND (
          profiles.role IN ('writer', 'editor')
          OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
          OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
        )
    )
  )
  WITH CHECK (
    (
      (auth.uid())::text = writer_id
      OR (auth.uid())::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
    )
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

-- 4. articles 更新トリガー関数の共同編集者対応
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

  -- 4. 通常のユーザー（編集長、主作成者、または共同編集者）による更新
  IF NOT public.check_is_editor() THEN
    IF (auth.uid())::text IS NULL OR (
      (auth.uid())::text != OLD.writer_id
      AND NOT ((auth.uid())::text = ANY(COALESCE(OLD.collaborator_ids, '{}'::text[])))
    ) THEN
      RAISE EXCEPTION '他のユーザーの記事を更新することはできません。';
    END IF;

    -- 共同編集者による更新であっても、主作成者の改ざんは防止する
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

-- 5. series テーブルの RLS ポリシー更新 (共同編集者の更新許可)
DROP POLICY IF EXISTS "series_update_own_or_editor" ON public.series;
CREATE POLICY "series_update_own_or_editor" ON public.series
  FOR UPDATE TO authenticated
  USING (
    (
      (writer_id)::text = (auth.uid())::text
      OR (auth.uid())::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
      OR public.check_is_editor()
    )
    AND (
      public.check_is_editor()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE (profiles.id)::text = (auth.uid())::text
          AND (
            profiles.role IN ('writer', 'editor')
            OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
          )
      )
    )
  )
  WITH CHECK (
    (
      (writer_id)::text = (auth.uid())::text
      OR (auth.uid())::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
      OR public.check_is_editor()
    )
    AND (
      public.check_is_editor()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE (profiles.id)::text = (auth.uid())::text
          AND (
            profiles.role IN ('writer', 'editor')
            OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
          )
      )
    )
  );

-- 6. series 更新トリガー関数（共同編集者による作成者ID改ざん防止）
CREATE OR REPLACE FUNCTION public.enforce_series_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_editor() THEN
    NEW.writer_id := OLD.writer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_series_update_rules ON public.series;
CREATE TRIGGER trg_enforce_series_update_rules
  BEFORE UPDATE ON public.series
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_series_update_rules();
