-- ============================================================================
-- 20261116120000_fix_security_triggers_and_series_delete_rls.sql
-- Issue #138: 予約投稿トリガー保護漏れ・series DELETE ロール検証欠落・コメント更新トリガー改ざん防止強化
-- ----------------------------------------------------------------------------
-- 1. enforce_article_update_rules():
--    status = 'published' かつ未来の scheduled_at が設定された記事等において、
--    非編集長が scheduled_at を NULL または過去日時へ書き換えて即時公開する抜け道を遮断。
-- 2. series_delete_own_or_editor RLS ポリシー:
--    (writer_id)::text = ((select auth.uid()))::text キャストと、
--    profiles の現役 writer / editor ロール検証（roles 配列含む）を追加。
-- 3. enforce_comment_update_rules_and_history():
--    NEW.author_name := OLD.author_name を強制し、content 未変更時は
--    NEW.updated_at := OLD.updated_at を強制して偽装編集表示を防止。
-- ============================================================================

-- 1. enforce_article_update_rules() の予約日時保護強化
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
  -- 1. システム内部のいいね同期処理（フラグを即座にリセット）
  IF v_in_likes_sync THEN
    OLD.likes := NEW.likes;
    PERFORM set_config('quest.in_likes_sync', 'false', true);
    RETURN OLD;
  END IF;

  -- 2. システム内部のPV加算処理（フラグを即座にリセット）
  IF v_in_views_inc THEN
    OLD.views := OLD.views + 1;
    PERFORM set_config('quest.in_views_increment', 'false', true);
    RETURN OLD;
  END IF;

  -- 3. システム内部の予約公開昇格処理（フラグを即座にリセット）
  IF v_in_scheduled_pub THEN
    OLD.status := NEW.status;
    OLD.updated_at := now();
    PERFORM set_config('quest.in_scheduled_publish', 'false', true);
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

-- 2. series_delete_own_or_editor RLS ポリシーの現役ロール検証 & 型安全化
DROP POLICY IF EXISTS "series_delete_own_or_editor" ON public.series;
CREATE POLICY "series_delete_own_or_editor" ON public.series
  FOR DELETE TO authenticated
  USING (
    public.check_is_editor()
    OR (
      (writer_id)::text = ((select auth.uid()))::text
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE (profiles.id)::text = ((select auth.uid()))::text
          AND (
            profiles.role IN ('writer', 'editor')
            OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
          )
      )
    )
  );

-- 3. enforce_comment_update_rules_and_history() の author_name & updated_at 改ざん防止
CREATE OR REPLACE FUNCTION public.enforce_comment_update_rules_and_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_writer_id text;
  v_pinned_count integer;
BEGIN
  NEW.id := OLD.id;
  NEW.article_id := OLD.article_id;
  NEW.author_id := OLD.author_id;
  NEW.author_name := OLD.author_name;
  NEW.created_at := OLD.created_at;

  SELECT writer_id INTO v_writer_id
  FROM public.articles
  WHERE id = NEW.article_id;

  IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
    IF (auth.uid())::text IS DISTINCT FROM v_writer_id AND NOT public.check_is_editor() THEN
      RAISE EXCEPTION 'コメントをピン留めできるのはこの記事のライターまたは編集長のみです。';
    END IF;

    IF NEW.is_pinned = true THEN
      SELECT count(*) INTO v_pinned_count
      FROM public.article_comments
      WHERE article_id = NEW.article_id AND is_pinned = true AND id != OLD.id;

      IF v_pinned_count >= 3 THEN
        RAISE EXCEPTION 'ピン留めできるコメントは最大3件までです。';
      END IF;
    END IF;
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF auth.uid() IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'コメント本文を編集できるのは投稿者本人のみです。';
    END IF;

    INSERT INTO public.comment_edit_history (comment_id, previous_content, edited_at)
    VALUES (OLD.id, OLD.content, now());

    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_comment_update_rules_and_history() FROM PUBLIC, anon, authenticated;
