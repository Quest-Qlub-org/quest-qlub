-- ============================================================================
-- 共同編集者による collaborator_ids 改ざん防止 & コメント削除モデレーション権限付与
-- ----------------------------------------------------------------------------
-- 1. articles 更新トリガー関数 enforce_article_update_rules の更新
--    - 主作成者 (OLD.writer_id) または編集長以外による collaborator_ids 改ざんを防止
-- 2. series 更新トリガー関数 enforce_series_update_rules の更新
--    - 主作成者 (OLD.writer_id) または編集長以外による collaborator_ids 改ざんを防止
-- 3. article_comments 削除ポリシー article_comments_delete の更新
--    - 共同編集者 (collaborator_ids) にコメント削除（モデレーション）権限を付与
-- 4. article_comments 閲覧ポリシー article_comments_select_staff の更新
--    - コメント無効時 (comments_enabled = false) でも共同編集者が過去コメントを閲覧可能に
-- ============================================================================

-- 1. articles 更新トリガー関数 enforce_article_update_rules の更新
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

    -- 共同編集者が collaborator_ids を改ざんすることを防止する（主作成者または編集長のみ変更可能）
    IF (auth.uid())::text != OLD.writer_id THEN
      NEW.collaborator_ids := OLD.collaborator_ids;
    END IF;

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

-- 2. series 更新トリガー関数 enforce_series_update_rules の更新
CREATE OR REPLACE FUNCTION public.enforce_series_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_editor() THEN
    NEW.writer_id := OLD.writer_id;
    -- 共同編集者が collaborator_ids を改ざんすることを防止する（主作成者または編集長のみ変更可能）
    IF (auth.uid())::text != OLD.writer_id THEN
      NEW.collaborator_ids := OLD.collaborator_ids;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. article_comments 削除ポリシー article_comments_delete の更新
DROP POLICY IF EXISTS "article_comments_delete" ON public.article_comments;
DROP POLICY IF EXISTS "article_comments_delete_own_or_editor" ON public.article_comments;

CREATE POLICY "article_comments_delete" ON public.article_comments
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = author_id)
    OR EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND (
          articles.writer_id = (auth.uid())::text
          OR (auth.uid())::text = ANY(COALESCE(articles.collaborator_ids, '{}'::text[]))
        )
    )
    OR public.check_is_editor()
  );

-- 4. article_comments 閲覧ポリシー article_comments_select_staff の更新（コメント機能オフ時の共同編集者閲覧許可）
DROP POLICY IF EXISTS "article_comments_select_staff" ON public.article_comments;

CREATE POLICY "article_comments_select_staff" ON public.article_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND (
          articles.writer_id = (auth.uid())::text
          OR (auth.uid())::text = ANY(COALESCE(articles.collaborator_ids, '{}'::text[]))
          OR public.check_is_editor()
        )
    )
  );
