-- #157: Durable, session-bound step-up authentication for management operations.
BEGIN;

CREATE SCHEMA IF NOT EXISTS quest_qlub_private;
REVOKE ALL ON SCHEMA quest_qlub_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS quest_qlub_private.sudo_sessions (
  session_id uuid PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
  expires_at timestamptz,
  challenge_id uuid
);
ALTER TABLE quest_qlub_private.sudo_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quest_qlub_private.sudo_sessions FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS quest_qlub_private.sudo_attempts (
  origin_session_id uuid PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE quest_qlub_private.sudo_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quest_qlub_private.sudo_attempts FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION quest_qlub_private.live_staff_session_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT session.id
  FROM auth.sessions AS session
  JOIN public.profiles AS profile ON profile.id = session.user_id
  WHERE session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    AND session.user_id = auth.uid()
    AND (session.not_after IS NULL OR session.not_after > statement_timestamp())
    AND (profile.role IN ('writer', 'editor')
      OR profile.roles && ARRAY['writer', 'editor']::text[]);
$$;


-- GoTrue records the actual primary credential and MFA event on the Auth session.
-- Token refresh does not refresh either credential's timestamp.
CREATE OR REPLACE FUNCTION quest_qlub_private.sudo_credential_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT max(primary_amr.created_at)
  FROM auth.sessions AS session
  JOIN auth.mfa_amr_claims AS primary_amr ON primary_amr.session_id = session.id
  WHERE session.id = quest_qlub_private.live_staff_session_id()
    AND primary_amr.authentication_method IN ('password', 'passkey')
    AND (
      NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors AS factor
        WHERE factor.user_id = session.user_id AND factor.status = 'verified'
      )
      OR (
        auth.jwt() ->> 'aal' = 'aal2'
        AND session.aal = 'aal2'
        AND EXISTS (
          SELECT 1 FROM auth.mfa_factors AS factor
          WHERE factor.id = session.factor_id
            AND factor.user_id = session.user_id
            AND factor.status = 'verified'
        )
        AND EXISTS (
          SELECT 1 FROM auth.mfa_amr_claims AS second_amr
          WHERE second_amr.session_id = session.id
            AND second_amr.authentication_method IN ('totp', 'mfa/webauthn', 'mfa/phone')
            AND second_amr.updated_at >= primary_amr.created_at
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION quest_qlub_private.has_active_sudo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM quest_qlub_private.sudo_sessions AS sudo
    WHERE sudo.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      AND sudo.expires_at > statement_timestamp()
      AND quest_qlub_private.sudo_credential_at() > statement_timestamp() - interval '15 minutes'
  );
$$;

CREATE OR REPLACE FUNCTION public.begin_sudo_session()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  origin uuid := quest_qlub_private.live_staff_session_id();
  challenge uuid;
BEGIN
  IF origin IS NULL THEN
    RAISE EXCEPTION '管理操作にはライターまたは編集長の有効なセッションが必要です。'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO quest_qlub_private.sudo_attempts (origin_session_id)
  VALUES (origin)
  ON CONFLICT (origin_session_id) DO UPDATE
  SET challenge_id = EXCLUDED.challenge_id, started_at = EXCLUDED.started_at
  RETURNING challenge_id INTO challenge;

  RETURN challenge;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_sudo_session(p_challenge_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  credential_at timestamptz := quest_qlub_private.sudo_credential_at();
  deadline timestamptz;
BEGIN
  IF credential_at IS NULL OR credential_at <= statement_timestamp() - interval '15 minutes' THEN
    RAISE EXCEPTION '管理操作には再認証と、設定済みの場合は2段階認証が必要です。'
      USING ERRCODE = '42501';
  END IF;

  -- A retry of the confirmation returns the original deadline for that challenge.
  SELECT expires_at INTO deadline
  FROM quest_qlub_private.sudo_sessions
  WHERE session_id = caller_session AND challenge_id = p_challenge_id
    AND expires_at > statement_timestamp();
  IF FOUND THEN
    RETURN deadline;
  END IF;

  -- The challenge must come from an earlier live session for the same account.
  -- Consumption and the grant are written in the same transaction.
  DELETE FROM quest_qlub_private.sudo_attempts AS attempt
  USING auth.sessions AS origin
  WHERE attempt.challenge_id = p_challenge_id
    AND attempt.origin_session_id = origin.id
    AND origin.user_id = auth.uid()
    AND origin.id <> caller_session
    AND (origin.not_after IS NULL OR origin.not_after > statement_timestamp())
    AND attempt.started_at <= credential_at
    AND attempt.started_at > statement_timestamp() - interval '3 minutes';

  IF NOT FOUND THEN
    RAISE EXCEPTION '管理操作の再認証を最初からやり直してください。' USING ERRCODE = '42501';
  END IF;

  INSERT INTO quest_qlub_private.sudo_sessions (session_id, expires_at, challenge_id)
  VALUES (caller_session, least(credential_at, statement_timestamp()) + interval '15 minutes', p_challenge_id)
  ON CONFLICT (session_id) DO NOTHING
  RETURNING expires_at INTO deadline;

  -- A revoked or previously used session requires a new authentication.
  IF NOT FOUND THEN
    RAISE EXCEPTION '管理操作の再認証が必要です。' USING ERRCODE = '42501';
  END IF;
  RETURN deadline;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_sudo_session()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cancelled_attempt AS (
    DELETE FROM quest_qlub_private.sudo_attempts
    USING auth.sessions AS origin
    WHERE origin_session_id = origin.id
      AND origin.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      AND origin.user_id = auth.uid()
  )
  INSERT INTO quest_qlub_private.sudo_sessions (session_id, expires_at)
  SELECT id, NULL
  FROM auth.sessions
  WHERE id = nullif(auth.jwt() ->> 'session_id', '')::uuid AND user_id = auth.uid()
  ON CONFLICT (session_id) DO UPDATE SET expires_at = NULL;
$$;

REVOKE ALL ON FUNCTION quest_qlub_private.live_staff_session_id(), quest_qlub_private.sudo_credential_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quest_qlub_private.has_active_sudo() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION quest_qlub_private.has_active_sudo() TO authenticated;
REVOKE ALL ON FUNCTION public.begin_sudo_session(), public.confirm_sudo_session(uuid), public.revoke_sudo_session()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_sudo_session(), public.confirm_sudo_session(uuid), public.revoke_sudo_session() TO authenticated;

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

CREATE OR REPLACE FUNCTION public.admin_promote_writer(target_email text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF NOT public.check_is_editor() OR NOT quest_qlub_private.has_active_sudo() THEN
    RAISE EXCEPTION 'ライターの昇格には編集長の再認証が必要です。' USING ERRCODE = '42501';
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
  public.admin_promote_writer(text), public.admin_get_all_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(text, text[]), public.admin_change_user_role(text, text),
  public.admin_promote_writer(text), public.admin_get_all_profiles() TO authenticated;

COMMIT;
