-- #157: Durable, session-bound step-up authentication for management operations.
BEGIN;
SET LOCAL lock_timeout = '3s';

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

COMMIT;
