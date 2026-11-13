-- ============================================================================
-- 20261113120000_comprehensive_security_performance_and_schema_sync.sql
-- Issues: #122 ([S-1]), #126 ([B-1]), #135 ([R-2])
-- ----------------------------------------------------------------------------
-- 1. スキーマ同期: articles.updated_at, articles.scheduled_at, profiles.roles 等の整合性確保
-- 2. セキュリティ強化:
--    - generate_mfa_backup_codes() での AAL2 (2要素認証済) 必須化 + 暗号論的乱数生成
--    - verify_and_consume_backup_code() でのブルートフォース遅延防御とソルト付きハッシュ対応
--    - anon / authenticated からの過剰な GRANT 剥奪・最小権限化
--    - profiles, articles, series, article_comments, contact_messages のトリガー防御強化
--    - 内部 GUC フラグ (quest.in_likes_sync 等) のリセット保証
--    - 未使用関数 increment_likes / decrement_likes 削除 & トリガー関数 EXECUTE 剥奪
-- 3. パフォーマンス最適化:
--    - 外部キーカバーインデックス追加 (articles.series_id, favorites.article_id, series.writer_id)
--    - RLS ポリシー内 auth.uid() の (select auth.uid()) 化 (InitPlan 最適化)
--    - articles テーブルの重複 Permissive ポリシー統合
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. スキーマ同期 & 欠落カラム・インデックスの補完
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roles text[] DEFAULT '{}'::text[];

UPDATE public.profiles
SET roles = ARRAY[role]
WHERE (roles IS NULL OR roles = '{}'::text[]) AND role IS NOT NULL;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS collaborator_ids text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS comments_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.articles
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS collaborator_ids text[] DEFAULT '{}'::text[];

-- パフォーマンス用インデックス（外部キー & 予約投稿 & 共同編集者）
CREATE INDEX IF NOT EXISTS idx_articles_series_id ON public.articles (series_id);
CREATE INDEX IF NOT EXISTS idx_favorites_article_id ON public.favorites (article_id);
CREATE INDEX IF NOT EXISTS idx_series_writer_id ON public.series (writer_id);
CREATE INDEX IF NOT EXISTS idx_articles_status_scheduled_at
  ON public.articles (status, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. テーブル・カラム権限 (GRANT / REVOKE) の最小化
-- ----------------------------------------------------------------------------
-- mfa_backup_codes: ハッシュ値の直接参照・改ざんを完全遮断
REVOKE ALL ON public.mfa_backup_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, used_at, created_at) ON public.mfa_backup_codes TO authenticated;

-- comment_edit_history: 直接 INSERT/UPDATE/DELETE を禁止（トリガー経由のみ）
REVOKE ALL ON public.comment_edit_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.comment_edit_history TO anon, authenticated;

-- profiles: email/role/roles の直接改ざんおよび email の他者閲覧を遮断
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, role, roles, display_name, created_at, avatar_url, bio, username, x_account)
  ON public.profiles TO anon, authenticated;
GRANT INSERT (id, display_name, username, avatar_url, bio, x_account)
  ON public.profiles TO authenticated;
GRANT UPDATE (display_name, username, avatar_url, bio, x_account)
  ON public.profiles TO authenticated;

-- articles: anon は SELECT のみ、authenticated は標準操作
REVOKE ALL ON public.articles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.articles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;

-- article_comments: anon は SELECT のみ、authenticated は標準操作
REVOKE ALL ON public.article_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.article_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_comments TO authenticated;

-- favorites / user_follows / series
REVOKE ALL ON public.favorites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;

REVOKE ALL ON public.user_follows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;

REVOKE ALL ON public.series FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.series TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.series TO authenticated;

-- contact_messages: 公開 INSERT は本文フィールドのみに限定し、created_at 偽装を防ぐ
REVOKE ALL ON public.contact_messages FROM PUBLIC, anon, authenticated;
GRANT INSERT (name, email, subject, body) ON public.contact_messages TO anon, authenticated;
GRANT SELECT ON public.contact_messages TO authenticated;

-- 未使用の危険関数を削除
DROP FUNCTION IF EXISTS public.increment_likes(text);
DROP FUNCTION IF EXISTS public.decrement_likes(text);

-- ----------------------------------------------------------------------------
-- 3. ロール判定 & ロール管理 RPC / トリガー同期
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_is_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id::text = ((SELECT auth.uid()))::text
      AND (role = 'editor' OR 'editor' = ANY(COALESCE(roles, '{}'::text[])))
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_profile_initial_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_editor() THEN
    NEW.role := 'viewer';
    NEW.roles := ARRAY['viewer']::text[];
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.roles IS DISTINCT FROM OLD.roles) THEN
    IF NOT public.check_is_editor() THEN
      RAISE EXCEPTION 'ロールを変更する権限がありません。管理者にお問い合わせください。';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_roles(target_user_id text, new_roles text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_primary_role text := 'viewer';
  v_is_currently_editor boolean := false;
  v_editor_count int := 0;
  v_cleaned_roles text[] := '{}'::text[];
  r text;
BEGIN
  IF NOT public.check_is_editor() THEN
    RAISE EXCEPTION '権限がありません。編集長のみがロールを変更できます。';
  END IF;

  IF new_roles IS NOT NULL AND array_length(new_roles, 1) > 0 THEN
    FOREACH r IN ARRAY new_roles LOOP
      r := trim(r);
      IF r <> '' THEN
        IF r NOT IN ('viewer', 'writer', 'editor', 'engineer') THEN
          RAISE EXCEPTION '無効なロールです: %', r;
        END IF;
        IF NOT (r = ANY(v_cleaned_roles)) THEN
          v_cleaned_roles := array_append(v_cleaned_roles, r);
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_cleaned_roles, 1) IS NULL THEN
    v_cleaned_roles := ARRAY['viewer']::text[];
  END IF;

  SELECT (role = 'editor' OR 'editor' = ANY(COALESCE(roles, '{}'::text[])))
  INTO v_is_currently_editor
  FROM public.profiles
  WHERE id::text = target_user_id;

  IF v_is_currently_editor AND NOT ('editor' = ANY(v_cleaned_roles)) THEN
    SELECT count(*) INTO v_editor_count
    FROM public.profiles
    WHERE role = 'editor' OR 'editor' = ANY(COALESCE(roles, '{}'::text[]));

    IF v_editor_count <= 1 THEN
      RAISE EXCEPTION '最後の編集長アカウントを降格することはできません。';
    END IF;
  END IF;

  IF 'editor' = ANY(v_cleaned_roles) THEN
    v_primary_role := 'editor';
  ELSIF 'writer' = ANY(v_cleaned_roles) THEN
    v_primary_role := 'writer';
  ELSE
    v_primary_role := 'viewer';
  END IF;

  UPDATE public.profiles
  SET role = v_primary_role,
      roles = v_cleaned_roles
  WHERE id::text = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '対象のユーザーが見つかりません。';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_change_user_role(target_user_id text, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_editor() THEN
    RAISE EXCEPTION '権限がありません。編集長のみがロールを変更できます。';
  END IF;

  IF new_role NOT IN ('viewer', 'writer', 'editor') THEN
    RAISE EXCEPTION '無効なロールです: %', new_role;
  END IF;

  IF new_role != 'editor' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id::text = target_user_id AND (role = 'editor' OR 'editor' = ANY(COALESCE(roles, '{}'::text[])))
    ) THEN
      IF (SELECT count(*) FROM public.profiles WHERE role = 'editor' OR 'editor' = ANY(COALESCE(roles, '{}'::text[]))) <= 1 THEN
        RAISE EXCEPTION '最後の編集長アカウントを降格することはできません。';
      END IF;
    END IF;
  END IF;

  UPDATE public.profiles
  SET role = new_role,
      roles = CASE
        WHEN new_role = 'viewer' THEN
          COALESCE(
            NULLIF(ARRAY(SELECT unnest(COALESCE(roles, '{}'::text[])) EXCEPT SELECT unnest(ARRAY['viewer', 'writer', 'editor']::text[])), '{}'::text[]),
            ARRAY['viewer']::text[]
          )
        WHEN roles IS NULL OR roles = '{}'::text[] THEN
          ARRAY[new_role]::text[]
        ELSE
          array_append(ARRAY(SELECT unnest(COALESCE(roles, '{}'::text[])) EXCEPT SELECT unnest(ARRAY['viewer', 'writer', 'editor']::text[])), new_role)
      END
  WHERE id::text = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '対象のユーザーが見つかりません。';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_promote_writer(target_email text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF NOT public.check_is_editor() THEN
    RAISE EXCEPTION '権限がありません。編集長のみがライターを昇格できます。';
  END IF;

  IF target_email IS NULL OR trim(target_email) = '' THEN
    RAISE EXCEPTION 'メールアドレスを入力してください。';
  END IF;

  UPDATE public.profiles
  SET role = CASE WHEN role = 'editor' THEN 'editor' ELSE 'writer' END,
      roles = CASE
        WHEN 'writer' = ANY(COALESCE(roles, '{}'::text[])) THEN roles
        ELSE array_append(ARRAY(SELECT unnest(COALESCE(roles, '{}'::text[])) EXCEPT SELECT 'viewer'), 'writer')
      END
  WHERE lower(email) = lower(trim(target_email))
  RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION '指定されたメールアドレスのユーザーが見つかりません。';
  END IF;

  RETURN v_profile;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_get_all_profiles();
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  display_name text,
  created_at timestamptz,
  avatar_url text,
  bio text,
  username text,
  roles text[],
  x_account text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_editor() THEN
    RAISE EXCEPTION '権限がありません。編集長のみが実行できます。';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.role, p.display_name, p.created_at, p.avatar_url, p.bio, p.username,
         COALESCE(NULLIF(p.roles, '{}'::text[]), ARRAY[p.role]::text[]) AS roles,
         p.x_account
  FROM public.profiles p
  ORDER BY p.role ASC, p.created_at DESC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. MFA バックアップコードのセキュリティ強化（AAL2 必須化）
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_mfa_backup_codes()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  v_aal text := COALESCE(auth.jwt() ->> 'aal', 'aal1');
  codes text[] := '{}';
  new_code text;
  h text;
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  i int;
  j int;
  rand_byte int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_aal <> 'aal2' THEN
    RAISE EXCEPTION '2要素認証 (AAL2) を完了した状態で実行してください。'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.mfa_backup_codes WHERE user_id = uid;

  FOR i IN 1..10 LOOP
    new_code := '';
    FOR j IN 1..8 LOOP
      IF j = 5 THEN
        new_code := new_code || '-';
      END IF;
      rand_byte := get_byte(gen_random_bytes(1), 0);
      new_code := new_code || substr(chars, (rand_byte % length(chars)) + 1, 1);
    END LOOP;

    codes := array_append(codes, new_code);

    h := encode(sha256((uid::text || ':' || upper(replace(new_code, '-', '')))::bytea), 'hex');

    INSERT INTO public.mfa_backup_codes (user_id, code_hash)
    VALUES (uid, h);
  END LOOP;

  RETURN codes;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_and_consume_backup_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  normalized_code text;
  h_new text;
  h_legacy text;
  target_id UUID;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  IF p_code IS NULL OR trim(p_code) = '' THEN
    PERFORM pg_sleep(0.5);
    RETURN false;
  END IF;

  normalized_code := upper(regexp_replace(trim(p_code), '[^a-zA-Z0-9]', '', 'g'));
  h_new := encode(sha256((uid::text || ':' || normalized_code)::bytea), 'hex');
  h_legacy := encode(sha256(normalized_code::bytea), 'hex');

  SELECT id INTO target_id
  FROM public.mfa_backup_codes
  WHERE user_id = uid
    AND (code_hash = h_new OR code_hash = h_legacy)
    AND used_at IS NULL
  LIMIT 1;

  IF target_id IS NULL THEN
    PERFORM pg_sleep(0.5);
    RETURN false;
  END IF;

  UPDATE public.mfa_backup_codes
  SET used_at = now()
  WHERE id = target_id;

  DELETE FROM auth.mfa_factors
  WHERE user_id = uid;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.clean_unverified_mfa_factors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    DELETE FROM auth.mfa_factors
    WHERE user_id = auth.uid() AND status = 'unverified';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mfa_backup_codes_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_total integer;
  v_remaining integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'remaining', 0);
  END IF;

  SELECT count(*) INTO v_total
  FROM public.mfa_backup_codes
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_remaining
  FROM public.mfa_backup_codes
  WHERE user_id = v_user_id AND used_at IS NULL;

  RETURN jsonb_build_object('total', v_total, 'remaining', v_remaining);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. 記事・連載・コメント・お問い合わせトリガー＆RPC ハードニング
-- ----------------------------------------------------------------------------
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
    END IF;
    NEW.scheduled_at := NULL;
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

    -- 予約公開状態の記事の予約日時を非編集長が過去へ改ざんするのを防止
    IF NEW.status = 'scheduled' THEN
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

CREATE OR REPLACE FUNCTION public.sync_article_likes_on_favorite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('quest.in_likes_sync', 'true', true);
  IF TG_OP = 'INSERT' THEN
    UPDATE public.articles SET likes = likes + 1 WHERE id = NEW.article_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.articles SET likes = GREATEST(0, likes - 1) WHERE id = OLD.article_id;
  END IF;
  PERFORM set_config('quest.in_likes_sync', 'false', true);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_views(p_article_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('quest.in_views_increment', 'true', true);
  UPDATE public.articles
  SET views = views + 1
  WHERE id = p_article_id
    AND (
      (status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= now()))
      OR (status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now())
    );
  PERFORM set_config('quest.in_views_increment', 'false', true);
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

  UPDATE public.articles
  SET status = 'published'
  WHERE status = 'scheduled'
    AND scheduled_at IS NOT NULL
    AND scheduled_at <= now();

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  PERFORM set_config('quest.in_scheduled_publish', 'false', true);
  RETURN v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_series_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_editor() THEN
    NEW.writer_id := OLD.writer_id;
    IF (auth.uid())::text IS DISTINCT FROM (OLD.writer_id)::text THEN
      NEW.collaborator_ids := OLD.collaborator_ids;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  NEW.updated_at := NULL;

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
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_contact_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recent_count integer;
BEGIN
  NEW.created_at := now();

  SELECT count(*) INTO recent_count
  FROM public.contact_messages
  WHERE lower(trim(email)) = lower(trim(NEW.email))
    AND created_at > now() - interval '10 minutes';

  IF recent_count >= 3 THEN
    RAISE EXCEPTION '同じメールアドレスから短時間に複数のお問い合わせが送信されています。しばらくしてから再度お試しください。';
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. 関数 EXECUTE 権限の適正化
-- ----------------------------------------------------------------------------
-- トリガー関数からの不要な EXECUTE 権限を完全剥奪
REVOKE ALL ON FUNCTION public.enforce_profile_initial_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_article_insert_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_article_update_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_article_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_article_likes_on_favorite() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_series_update_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_comment_rate_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_comment_update_rules_and_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_contact_rate_limit() FROM PUBLIC, anon, authenticated;

-- 認証ユーザー向け RPC の EXECUTE 制限
REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(text, text[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_change_user_role(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_change_user_role(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_promote_writer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promote_writer(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_get_all_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_mfa_backup_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_mfa_backup_codes() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_and_consume_backup_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_and_consume_backup_code(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.clean_unverified_mfa_factors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clean_unverified_mfa_factors() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_mfa_backup_codes_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mfa_backup_codes_status() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.publish_due_scheduled_articles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_due_scheduled_articles() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_views(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_views(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_follow_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_follow_counts(uuid) TO anon, authenticated;

-- check_is_editor() は authenticated の RLS および公開 SELECT RLS で参照される
REVOKE ALL ON FUNCTION public.check_is_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_is_editor() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. RLS ポリシーの再構築（(select auth.uid()) InitPlan 最適化 & 重複解消）
-- ----------------------------------------------------------------------------
-- [profiles]
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()))::text = (id)::text);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (((select auth.uid()))::text = (id)::text OR public.check_is_editor())
  WITH CHECK (((select auth.uid()))::text = (id)::text OR public.check_is_editor());

-- [articles] 重複 Permissive ポリシーをロール別に整理して統合
DROP POLICY IF EXISTS "articles_select_published" ON public.articles;
DROP POLICY IF EXISTS "articles_select_own_drafts" ON public.articles;
DROP POLICY IF EXISTS "articles_select_editor_all" ON public.articles;
DROP POLICY IF EXISTS "articles_select_authenticated" ON public.articles;

CREATE POLICY "articles_select_published" ON public.articles
  FOR SELECT TO anon
  USING (
    (status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= now()))
    OR (status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now())
  );

CREATE POLICY "articles_select_authenticated" ON public.articles
  FOR SELECT TO authenticated
  USING (
    (status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= now()))
    OR (status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now())
    OR ((select auth.uid()))::text = writer_id
    OR ((select auth.uid()))::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
    OR public.check_is_editor()
  );

DROP POLICY IF EXISTS "articles_insert_writer_or_editor" ON public.articles;
CREATE POLICY "articles_insert_writer_or_editor" ON public.articles
  FOR INSERT TO authenticated
  WITH CHECK (
    ((select auth.uid()))::text = writer_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.id)::text = ((select auth.uid()))::text
        AND (
          profiles.role IN ('writer', 'editor')
          OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
          OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
        )
    )
  );

DROP POLICY IF EXISTS "articles_update_own_articles" ON public.articles;
DROP POLICY IF EXISTS "articles_update_editor_all" ON public.articles;
DROP POLICY IF EXISTS "articles_update_own_or_editor" ON public.articles;
CREATE POLICY "articles_update_own_or_editor" ON public.articles
  FOR UPDATE TO authenticated
  USING (
    public.check_is_editor()
    OR (
      (
        ((select auth.uid()))::text = writer_id
        OR ((select auth.uid()))::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
      )
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
  )
  WITH CHECK (
    public.check_is_editor()
    OR (
      (
        ((select auth.uid()))::text = writer_id
        OR ((select auth.uid()))::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
      )
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

DROP POLICY IF EXISTS "articles_delete_own_articles" ON public.articles;
DROP POLICY IF EXISTS "articles_delete_editor_all" ON public.articles;
DROP POLICY IF EXISTS "articles_delete_own_or_editor" ON public.articles;
CREATE POLICY "articles_delete_own_or_editor" ON public.articles
  FOR DELETE TO authenticated
  USING (
    public.check_is_editor()
    OR (
      ((select auth.uid()))::text = writer_id
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

-- [series]
DROP POLICY IF EXISTS "series_insert_writer_or_editor" ON public.series;
CREATE POLICY "series_insert_writer_or_editor" ON public.series
  FOR INSERT TO authenticated
  WITH CHECK (
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
  );

DROP POLICY IF EXISTS "series_update_own_or_editor" ON public.series;
CREATE POLICY "series_update_own_or_editor" ON public.series
  FOR UPDATE TO authenticated
  USING (
    public.check_is_editor()
    OR (
      (
        (writer_id)::text = ((select auth.uid()))::text
        OR ((select auth.uid()))::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
      )
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
  )
  WITH CHECK (
    public.check_is_editor()
    OR (
      (
        (writer_id)::text = ((select auth.uid()))::text
        OR ((select auth.uid()))::text = ANY(COALESCE(collaborator_ids, '{}'::text[]))
      )
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

DROP POLICY IF EXISTS "series_delete_own_or_editor" ON public.series;
CREATE POLICY "series_delete_own_or_editor" ON public.series
  FOR DELETE TO authenticated
  USING (writer_id = (select auth.uid()) OR public.check_is_editor());

-- [favorites]
DROP POLICY IF EXISTS "favorites_manage_own" ON public.favorites;
CREATE POLICY "favorites_manage_own" ON public.favorites
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- [mfa_backup_codes]
DROP POLICY IF EXISTS "Users can view own backup codes" ON public.mfa_backup_codes;
CREATE POLICY "Users can view own backup codes" ON public.mfa_backup_codes
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- [article_comments]
DROP POLICY IF EXISTS "article_comments_select" ON public.article_comments;
CREATE POLICY "article_comments_select" ON public.article_comments
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND (
          articles.comments_enabled = true
          OR (
            (select auth.uid()) IS NOT NULL
            AND (
              articles.writer_id = ((select auth.uid()))::text
              OR ((select auth.uid()))::text = ANY(COALESCE(articles.collaborator_ids, '{}'::text[]))
              OR public.check_is_editor()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "article_comments_insert" ON public.article_comments;
CREATE POLICY "article_comments_insert" ON public.article_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = author_id
    AND char_length(content) >= 1
    AND char_length(content) <= 500
    AND char_length(author_name) >= 1
    AND char_length(author_name) <= 50
    AND EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND articles.comments_enabled = true
    )
  );

DROP POLICY IF EXISTS "article_comments_update" ON public.article_comments;
CREATE POLICY "article_comments_update" ON public.article_comments
  FOR UPDATE TO authenticated
  USING (
    (select auth.uid()) = author_id
    OR EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND articles.writer_id = ((select auth.uid()))::text
    )
    OR public.check_is_editor()
  )
  WITH CHECK (
    (select auth.uid()) = author_id
    OR EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND articles.writer_id = ((select auth.uid()))::text
    )
    OR public.check_is_editor()
  );

DROP POLICY IF EXISTS "article_comments_delete" ON public.article_comments;
CREATE POLICY "article_comments_delete" ON public.article_comments
  FOR DELETE TO authenticated
  USING (
    (select auth.uid()) = author_id
    OR EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND (
          articles.writer_id = ((select auth.uid()))::text
          OR ((select auth.uid()))::text = ANY(COALESCE(articles.collaborator_ids, '{}'::text[]))
        )
    )
    OR public.check_is_editor()
  );

-- [comment_edit_history]
DROP POLICY IF EXISTS "comment_edit_history_select" ON public.comment_edit_history;
CREATE POLICY "comment_edit_history_select" ON public.comment_edit_history
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.article_comments ac
      JOIN public.articles a ON a.id = ac.article_id
      WHERE ac.id = comment_edit_history.comment_id
        AND (
          (a.status = 'published' AND COALESCE(a.comments_enabled, true) = true)
          OR ((select auth.uid()) IS NOT NULL AND ac.author_id = (select auth.uid()))
          OR ((select auth.uid()) IS NOT NULL AND a.writer_id = ((select auth.uid()))::text)
          OR ((select auth.uid()) IS NOT NULL AND ((select auth.uid()))::text = ANY(COALESCE(a.collaborator_ids, '{}'::text[])))
          OR public.check_is_editor()
        )
    )
  );

-- [user_follows]
DROP POLICY IF EXISTS "user_follows_select_own" ON public.user_follows;
CREATE POLICY "user_follows_select_own" ON public.user_follows
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = follower_id OR (select auth.uid()) = following_id);

DROP POLICY IF EXISTS "user_follows_insert_own" ON public.user_follows;
CREATE POLICY "user_follows_insert_own" ON public.user_follows
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = follower_id AND follower_id <> following_id);

DROP POLICY IF EXISTS "user_follows_delete_own" ON public.user_follows;
CREATE POLICY "user_follows_delete_own" ON public.user_follows
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = follower_id);

-- [storage.objects thumbnails]
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_thumbnails_insert_writer'
  ) THEN
    ALTER POLICY "storage_thumbnails_insert_writer" ON storage.objects
      WITH CHECK (
        bucket_id = 'thumbnails'
        AND ((select auth.uid()))::text = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (profiles.id)::text = ((select auth.uid()))::text
            AND (
              profiles.role IN ('writer', 'editor')
              OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
              OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            )
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_thumbnails_update_writer'
  ) THEN
    ALTER POLICY "storage_thumbnails_update_writer" ON storage.objects
      USING (
        bucket_id = 'thumbnails'
        AND ((select auth.uid()))::text = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (profiles.id)::text = ((select auth.uid()))::text
            AND (
              profiles.role IN ('writer', 'editor')
              OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
              OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            )
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_thumbnails_delete_writer'
  ) THEN
    ALTER POLICY "storage_thumbnails_delete_writer" ON storage.objects
      USING (
        bucket_id = 'thumbnails'
        AND ((select auth.uid()))::text = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (profiles.id)::text = ((select auth.uid()))::text
            AND (
              profiles.role IN ('writer', 'editor')
              OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
              OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            )
        )
      );
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
