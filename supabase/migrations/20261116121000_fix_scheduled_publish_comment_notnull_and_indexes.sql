-- ============================================================================
-- 20261116121000_fix_scheduled_publish_comment_notnull_and_indexes.sql
-- Issue #140: 複数件同時の予約投稿失敗・コメント投稿 NOT NULL 違反・INSERT 時予約日時消去・
--             重複 RLS ポリシーと GIN インデックス欠落の修正
-- ----------------------------------------------------------------------------
-- 1. enforce_article_update_rules() 内の行単位 set_config(..., 'false', true) を削除し、
--    publish_due_scheduled_articles(), increment_views(), sync_article_likes_on_favorite()
--    側で EXCEPTION ハンドラ付きで確実にリセットするように変更（複数件同時公開の失敗を解消）。
-- 2. enforce_comment_rate_limit() で NEW.updated_at := NEW.created_at を設定
--    （NOT NULL 制約 23502 違反を解消）。
-- 3. enforce_article_insert_rules() で draft / pending の場合は NEW.scheduled_at を保持
--    （published / scheduled 等を draft へ強制降格した場合のみ NULL 化）。
-- 4. article_comments の旧重複 SELECT ポリシー（article_comments_select_public,
--    article_comments_select_staff）を削除し、collaborator_ids の GIN インデックスを追加。
-- ============================================================================

-- 1. enforce_article_update_rules(): 行単位での GUC リセットを削除（#138 の保護は維持）
CREATE OR REPLACE FUNCTION public.enforce_article_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_in_likes_sync boolean := coalesce(current_setting('quest.in_likes_sync', true), 'false') = 'true';
  v_in_views_inc boolean := coalesce(current_setting('quest.in_views_increment', true), 'false') = 'true';
  v_in_scheduled_pub boolean := coalesce(current_setting('quest.in_scheduled_publish', true), 'false') = 'true';
  v_uid text := (auth.uid())::text;
  v_is_collaborator boolean := false;
BEGIN
  -- 1. システム内部のいいね同期処理（呼び出し元で一括リセット）
  IF v_in_likes_sync THEN
    OLD.likes := NEW.likes;
    RETURN OLD;
  END IF;

  -- 2. システム内部のPV加算処理（呼び出し元で一括リセット）
  IF v_in_views_inc THEN
    OLD.views := OLD.views + 1;
    RETURN OLD;
  END IF;

  -- 3. システム内部の予約公開昇格処理（複数行一括更新対応のため呼び出し元でリセット）
  IF v_in_scheduled_pub THEN
    OLD.status := NEW.status;
    OLD.updated_at := now();
    RETURN OLD;
  END IF;

  -- 4. 通常ユーザーによる更新
  IF NOT public.check_is_editor() THEN
    v_is_collaborator := (
      v_uid IS NOT NULL AND v_uid = ANY(COALESCE(OLD.collaborator_ids, '{}'::text[]))
    );

    IF v_uid IS NULL OR (v_uid != OLD.writer_id AND NOT v_is_collaborator) THEN
      RAISE EXCEPTION '他のユーザーの記事を更新することはできません。';
    END IF;

    -- 主作成者改ざん禁止
    NEW.writer_id := OLD.writer_id;

    -- 主作成者または編集長以外は共同執筆者リストを変更不可
    IF v_uid != OLD.writer_id THEN
      NEW.collaborator_ids := OLD.collaborator_ids;
    END IF;

    -- 非編集長が他のステータスから published / scheduled へ遷移するのを禁止
    IF NEW.status IN ('published', 'scheduled') AND OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'ライター自身で記事を公開または予約公開状態に変更することはできません。審査申請を行ってください。';
    END IF;

    -- 公開/予約公開状態の記事（未来の scheduled_at を持つ published 含む）の予約日時を
    -- 非編集長が変更・解除して早期公開するのを防止
    IF NEW.status IN ('published', 'scheduled')
       OR (OLD.status IN ('published', 'scheduled') AND OLD.scheduled_at IS NOT NULL AND OLD.scheduled_at > now()) THEN
      NEW.scheduled_at := OLD.scheduled_at;
    END IF;

    NEW.is_recommended := OLD.is_recommended;
    NEW.is_popular := OLD.is_popular;
    NEW.views := OLD.views;
    NEW.likes := OLD.likes;
    NEW.created_at := OLD.created_at;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_article_update_rules() FROM PUBLIC, anon, authenticated;

-- 呼び出し元側で例外発生時も含めて確実に GUC フラグをリセット
CREATE OR REPLACE FUNCTION public.sync_article_likes_on_favorite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('quest.in_likes_sync', 'true', true);
  BEGIN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.articles SET likes = likes + 1 WHERE id = NEW.article_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.articles SET likes = GREATEST(0, likes - 1) WHERE id = OLD.article_id;
    END IF;
    PERFORM set_config('quest.in_likes_sync', 'false', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('quest.in_likes_sync', 'false', true);
    RAISE;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_article_likes_on_favorite() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_views(p_article_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('quest.in_views_increment', 'true', true);
  BEGIN
    UPDATE public.articles
    SET views = views + 1
    WHERE id = p_article_id
      AND (
        (status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= now()))
        OR (status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now())
      );
    PERFORM set_config('quest.in_views_increment', 'false', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('quest.in_views_increment', 'false', true);
    RAISE;
  END;
END;
$$;

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
  BEGIN
    UPDATE public.articles
    SET status = 'published'
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= now();

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    PERFORM set_config('quest.in_scheduled_publish', 'false', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('quest.in_scheduled_publish', 'false', true);
    RAISE;
  END;
  RETURN v_updated_count;
END;
$$;

-- 2. enforce_comment_rate_limit(): updated_at に created_at を設定し NOT NULL 制約違反を防止
CREATE OR REPLACE FUNCTION public.enforce_comment_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recent_short_count integer;
  recent_minute_count integer;
BEGIN
  -- 作成者・ピン留め状態・タイムスタンプをサーバー側で強制（レート制限迂回・勝手なピン留め防止）
  IF auth.uid() IS NOT NULL THEN
    NEW.author_id := auth.uid();
  END IF;
  NEW.is_pinned := false;
  NEW.created_at := now();
  NEW.updated_at := NEW.created_at;

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
$$;

REVOKE ALL ON FUNCTION public.enforce_comment_rate_limit() FROM PUBLIC, anon, authenticated;

-- 3. enforce_article_insert_rules(): draft / pending では希望公開日時 (scheduled_at) を保持
CREATE OR REPLACE FUNCTION public.enforce_article_insert_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_editor() THEN
    -- ライター新規作成時は draft または pending のみに限定（published / scheduled 禁止）
    IF NEW.status IS NULL OR NEW.status NOT IN ('draft', 'pending') THEN
      NEW.status := 'draft';
      NEW.scheduled_at := NULL;
    END IF;
    NEW.is_recommended := false;
    NEW.is_popular := false;
    NEW.views := 0;
    NEW.likes := 0;
    NEW.writer_id := (auth.uid())::text;
  END IF;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_article_insert_rules() FROM PUBLIC, anon, authenticated;

-- 4. article_comments の重複 SELECT ポリシー削除 & collaborator_ids GIN インデックス補完
DROP POLICY IF EXISTS "article_comments_select_public" ON public.article_comments;
DROP POLICY IF EXISTS "article_comments_select_staff" ON public.article_comments;

CREATE INDEX IF NOT EXISTS idx_articles_collaborator_ids
  ON public.articles USING gin (collaborator_ids);

CREATE INDEX IF NOT EXISTS idx_series_collaborator_ids
  ON public.series USING gin (collaborator_ids);
