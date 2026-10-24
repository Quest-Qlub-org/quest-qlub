-- ============================================================================
-- Issue #54: プロフィール複数ロール対応（roles 配列列の追加とロール管理RPC拡張）
-- ----------------------------------------------------------------------------
-- 【目的】
--   1. profiles テーブルに roles text[] 列を追加し、1つのアカウントに
--      複数のロール（例: 編集長 + エンジニア、ライター + エンジニア等）を付与可能にする。
--   2. 下位互換性のため、既存の role カラムも同期・維持する。
--   3. 編集長向けに複数ロール一括更新RPC admin_set_user_roles を追加する。
--   4. admin_get_all_profiles, admin_change_user_role, admin_promote_writer
--      を拡張し、roles 列と整合性を保つ。
-- ============================================================================

-- 1. profiles テーブルに roles 配列カラムを追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roles text[] DEFAULT '{}'::text[];

-- 2. 権限付与: 公開プロフィールおよび /about で参照するため anon, authenticated に SELECT を許可
GRANT SELECT (roles) ON public.profiles TO anon, authenticated;

-- 3. 既存データのバックフィル（roles が空のレコードに既存の role を設定）
UPDATE public.profiles
SET roles = ARRAY[role]
WHERE (roles IS NULL OR roles = '{}'::text[]) AND role IS NOT NULL;

-- 4. Issue #54 関連アカウントの初期ロール反映（該当アカウントが存在する場合のみ実行）
UPDATE public.profiles
SET roles = array_append(COALESCE(roles, '{}'::text[]), 'engineer')
WHERE (
    lower(coalesce(username, '')) LIKE '%root%'
    OR lower(coalesce(display_name, '')) LIKE '%るーと%'
    OR lower(coalesce(username, '')) LIKE '%noimzip%'
    OR lower(coalesce(display_name, '')) LIKE '%noimzip%'
  )
  AND NOT ('engineer' = ANY(COALESCE(roles, '{}'::text[])));

-- 5. 複数ロール設定用RPC関数: admin_set_user_roles
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
  -- 編集長権限の確認
  IF NOT public.check_is_editor() THEN
    RAISE EXCEPTION '権限がありません。編集長のみがロールを変更できます。';
  END IF;

  -- ロール配列のクリーンアップ（空白除去・トリム・重複排除）
  IF new_roles IS NOT NULL AND array_length(new_roles, 1) > 0 THEN
    FOREACH r IN ARRAY new_roles LOOP
      r := trim(r);
      IF r <> '' AND NOT (r = ANY(v_cleaned_roles)) THEN
        v_cleaned_roles := array_append(v_cleaned_roles, r);
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_cleaned_roles, 1) IS NULL THEN
    v_cleaned_roles := ARRAY['viewer']::text[];
  END IF;

  -- 最後の編集長アカウント降格の防止チェック
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

  -- 下位互換用の主ロール（RLS評価用）を優先順位順に決定
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

REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(text, text[]) TO authenticated;

-- 6. 既存 admin_change_user_role の roles 配列同期更新
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

  -- 最後の編集長を降格させないための安全チェック
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

-- 7. 既存 admin_promote_writer の roles 配列同期更新
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
  SET role = 'writer',
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

-- 8. admin_get_all_profiles に roles 列を追加して再定義
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
  roles text[]
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
         COALESCE(p.roles, ARRAY[p.role]::text[]) as roles
  FROM public.profiles p
  ORDER BY p.role ASC, p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_all_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO authenticated;

-- 9. check_is_editor の roles 配列対応
CREATE OR REPLACE FUNCTION public.check_is_editor()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id::text = (auth.uid())::text
      AND (role = 'editor' OR 'editor' = ANY(COALESCE(roles, '{}'::text[])))
  );
$$;

-- 10. prevent_self_role_escalation の roles 配列権限昇格抑止
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

-- 11. enforce_profile_initial_role の roles 初期値強制
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
