-- #157: Enforce the server-side Sudo grant once the web client can obtain it.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- Restrictive policies supplement every existing policy, including installations with legacy policy names.
DO $$
DECLARE
  managed_table text;
BEGIN
  FOREACH managed_table IN ARRAY ARRAY['articles', 'series'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS require_sudo_insert ON public.%I', managed_table);
    EXECUTE format('CREATE POLICY require_sudo_insert ON public.%I AS RESTRICTIVE
      FOR INSERT TO authenticated WITH CHECK ((SELECT quest_qlub_private.has_active_sudo()))', managed_table);
    EXECUTE format('DROP POLICY IF EXISTS require_sudo_update ON public.%I', managed_table);
    EXECUTE format('CREATE POLICY require_sudo_update ON public.%I AS RESTRICTIVE
      FOR UPDATE TO authenticated USING ((SELECT quest_qlub_private.has_active_sudo()))
      WITH CHECK ((SELECT quest_qlub_private.has_active_sudo()))', managed_table);
    EXECUTE format('DROP POLICY IF EXISTS require_sudo_delete ON public.%I', managed_table);
    EXECUTE format('CREATE POLICY require_sudo_delete ON public.%I AS RESTRICTIVE
      FOR DELETE TO authenticated USING ((SELECT quest_qlub_private.has_active_sudo()))', managed_table);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS require_sudo_editor_preview ON public.articles;
CREATE POLICY require_sudo_editor_preview ON public.articles AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    (status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= now()))
    OR (status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now())
    OR writer_id = (SELECT auth.uid())::text
    OR (SELECT auth.uid())::text = ANY(coalesce(collaborator_ids, '{}'::text[]))
    OR ((SELECT public.check_is_editor()) AND (SELECT quest_qlub_private.has_active_sudo()))
  );

DROP POLICY IF EXISTS require_sudo_other_profile_update ON public.profiles;
CREATE POLICY require_sudo_other_profile_update ON public.profiles AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR ((SELECT public.check_is_editor()) AND (SELECT quest_qlub_private.has_active_sudo())))
  WITH CHECK (id = (SELECT auth.uid()) OR ((SELECT public.check_is_editor()) AND (SELECT quest_qlub_private.has_active_sudo())));

DROP POLICY IF EXISTS require_sudo_contact_read ON public.contact_messages;
CREATE POLICY require_sudo_contact_read ON public.contact_messages AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING ((SELECT public.check_is_editor()) AND (SELECT quest_qlub_private.has_active_sudo()));

-- Existing role-management and private profile RPCs enforce the same server grant.
CREATE OR REPLACE FUNCTION public.admin_set_user_roles(target_user_id text, new_roles text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_primary_role text := 'viewer';
  v_is_currently_editor boolean := false;
  v_editor_count int := 0;
  v_cleaned_roles text[] := '{}'::text[];
  r text;
BEGIN
  -- Serialize role edits so concurrent requests cannot demote the last two editors.
  PERFORM pg_advisory_xact_lock(hashtext('quest-qlub.editor-roles'), 0);
  IF NOT public.check_is_editor() OR NOT quest_qlub_private.has_active_sudo() THEN
    RAISE EXCEPTION 'ロール変更には編集長の再認証が必要です。' USING ERRCODE = '42501';
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
SET search_path = ''
AS $$
BEGIN
  -- Serialize role edits so concurrent requests cannot demote the last two editors.
  PERFORM pg_advisory_xact_lock(hashtext('quest-qlub.editor-roles'), 0);
  IF NOT public.check_is_editor() OR NOT quest_qlub_private.has_active_sudo() THEN
    RAISE EXCEPTION 'ロール変更には編集長の再認証が必要です。' USING ERRCODE = '42501';
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
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_is_editor() OR NOT quest_qlub_private.has_active_sudo() THEN
    RAISE EXCEPTION 'プロフィール管理には編集長の再認証が必要です。' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.role, p.display_name, p.created_at, p.avatar_url, p.bio, p.username,
         COALESCE(NULLIF(p.roles, '{}'::text[]), ARRAY[p.role]::text[]) AS roles,
         p.x_account
  FROM public.profiles p
  ORDER BY p.role ASC, p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(text, text[]), public.admin_change_user_role(text, text),
  public.admin_get_all_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(text, text[]), public.admin_change_user_role(text, text),
  public.admin_get_all_profiles() TO authenticated;

-- The deployed application reviews signed-in applicants by receipt and account ID.
DROP FUNCTION IF EXISTS public.admin_promote_writer(text);

COMMIT;
