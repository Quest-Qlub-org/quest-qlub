-- #163: Serialize recovery with code rotation, expire old factors/codes and queue a verified-address notice.
BEGIN;

CREATE TABLE IF NOT EXISTS quest_qlub_private.mfa_recovery_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  re_enroll_required boolean NOT NULL DEFAULT false
);
ALTER TABLE quest_qlub_private.mfa_recovery_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quest_qlub_private.mfa_recovery_state FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS quest_qlub_private.mfa_recovery_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  next_attempt_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  finished_at timestamptz
);
ALTER TABLE quest_qlub_private.mfa_recovery_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quest_qlub_private.mfa_recovery_notifications FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS mfa_recovery_notifications_next_idx
  ON quest_qlub_private.mfa_recovery_notifications (next_attempt_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS mfa_recovery_notifications_user_idx
  ON quest_qlub_private.mfa_recovery_notifications (user_id);

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
      OR profile.roles && ARRAY['writer', 'editor']::text[])
    AND NOT EXISTS (
      SELECT 1 FROM quest_qlub_private.mfa_recovery_state AS recovery
      WHERE recovery.user_id = session.user_id AND recovery.re_enroll_required
    );
$$;

CREATE OR REPLACE FUNCTION quest_qlub_private.invalidate_backup_codes_on_factor_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- This trigger runs with the removed factor row locked. Recovery and
  -- generation take their factor locks before acquiring the same account lock.
  PERFORM pg_advisory_xact_lock(hashtext('quest-qlub.mfa-recovery'), hashtext(OLD.user_id::text));
  DELETE FROM public.mfa_backup_codes WHERE user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_backup_codes_on_factor_removal ON auth.mfa_factors;
CREATE TRIGGER trg_invalidate_backup_codes_on_factor_removal
  AFTER DELETE ON auth.mfa_factors FOR EACH ROW WHEN (OLD.status = 'verified')
  EXECUTE FUNCTION quest_qlub_private.invalidate_backup_codes_on_factor_removal();

CREATE OR REPLACE FUNCTION public.generate_mfa_backup_codes()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  caller_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  codes text[] := '{}';
  token text;
BEGIN
  IF uid IS NULL OR coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'バックアップコードの発行には2要素認証が必要です。' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM auth.users WHERE id = uid FOR KEY SHARE;

  -- Lock the verified factor before changing codes, including when Auth unenrolls it concurrently.
  PERFORM 1
  FROM auth.sessions AS session
  JOIN auth.mfa_factors AS factor ON factor.id = session.factor_id
  WHERE session.id = caller_session AND session.user_id = uid AND session.aal = 'aal2'
    AND (session.not_after IS NULL OR session.not_after > statement_timestamp())
    AND factor.user_id = uid AND factor.status = 'verified'
  FOR UPDATE OF factor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'バックアップコードの発行には現在のセッションで2要素認証が必要です。'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('quest-qlub.mfa-recovery'), hashtext(uid::text));

  DELETE FROM public.mfa_backup_codes WHERE user_id = uid;

  FOR code_number IN 1..10 LOOP
    token := upper(encode(extensions.gen_random_bytes(16), 'hex'));
    codes := array_append(codes,
      substr(token, 1, 8) || '-' || substr(token, 9, 8) || '-' ||
      substr(token, 17, 8) || '-' || substr(token, 25, 8));

    INSERT INTO public.mfa_backup_codes (user_id, code_hash)
    VALUES (uid, encode(sha256((uid::text || ':' || token)::bytea), 'hex'));
  END LOOP;

  UPDATE quest_qlub_private.mfa_recovery_state
  SET re_enroll_required = false, failed_attempts = 0
  WHERE user_id = uid;

  RETURN codes;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_and_consume_backup_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  caller_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  recovery quest_qlub_private.mfa_recovery_state;
  attempted_at timestamptz;
  token text;
  consumed boolean := false;
BEGIN
  IF uid IS NULL OR coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1' THEN
    RETURN false;
  END IF;

  PERFORM 1 FROM auth.users WHERE id = uid FOR KEY SHARE;
  PERFORM 1 FROM auth.mfa_factors
  WHERE user_id = uid AND status = 'verified'
  ORDER BY id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('quest-qlub.mfa-recovery'), hashtext(uid::text));
  -- A competing attempt must not lock a session that successful recovery deletes.
  PERFORM 1
  FROM auth.sessions
  WHERE id = caller_session AND user_id = uid AND coalesce(aal, 'aal1') = 'aal1'
    AND (not_after IS NULL OR not_after > statement_timestamp())
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  attempted_at := clock_timestamp();
  INSERT INTO quest_qlub_private.mfa_recovery_state (user_id, window_started_at)
  VALUES (uid, attempted_at)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO recovery FROM quest_qlub_private.mfa_recovery_state WHERE user_id = uid;
  IF recovery.window_started_at + interval '15 minutes' <= attempted_at THEN
    recovery.window_started_at := attempted_at;
    recovery.failed_attempts := 0;
  END IF;
  IF recovery.failed_attempts >= 5 THEN
    RAISE EXCEPTION 'バックアップコードの試行上限に達しました。時間をおいて再度お試しください。'
      USING ERRCODE = 'PT429';
  END IF;

  IF length(p_code) <= 128 THEN
    token := upper(regexp_replace(p_code, '[^a-zA-Z0-9]', '', 'g'));
    IF length(token) IN (8, 32) THEN
      UPDATE public.mfa_backup_codes
      SET used_at = attempted_at
      WHERE user_id = uid AND used_at IS NULL
        AND (code_hash = encode(sha256((uid::text || ':' || token)::bytea), 'hex')
          OR (length(token) = 8 AND code_hash = encode(sha256(token::bytea), 'hex')));
      consumed := FOUND;
    END IF;
  END IF;

  IF NOT consumed THEN
    UPDATE quest_qlub_private.mfa_recovery_state
    SET failed_attempts = recovery.failed_attempts + 1, window_started_at = recovery.window_started_at
    WHERE user_id = uid;
    RETURN false;
  END IF;

  UPDATE quest_qlub_private.mfa_recovery_state
  SET failed_attempts = 0, window_started_at = attempted_at, re_enroll_required = true
  WHERE user_id = uid;

  DELETE FROM auth.mfa_factors WHERE user_id = uid;
  DELETE FROM auth.sessions WHERE user_id = uid AND id <> caller_session;
  UPDATE quest_qlub_private.sudo_sessions SET expires_at = NULL WHERE session_id = caller_session;
  DELETE FROM quest_qlub_private.sudo_attempts WHERE origin_session_id = caller_session;

  INSERT INTO quest_qlub_private.mfa_recovery_notifications (user_id, recipient)
  SELECT id, email FROM auth.users
  WHERE id = uid AND email_confirmed_at IS NOT NULL AND email <> '';

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mfa_backup_codes_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'remaining', count(*) FILTER (WHERE used_at IS NULL),
    're_enroll_required', EXISTS (
      SELECT 1 FROM quest_qlub_private.mfa_recovery_state AS recovery
      WHERE recovery.user_id = auth.uid() AND recovery.re_enroll_required
    )
  )
  FROM public.mfa_backup_codes
  WHERE user_id = auth.uid();
$$;

-- A worker leases one bounded batch; a crash can be retried after the lease expires.
CREATE OR REPLACE FUNCTION public.claim_mfa_recovery_notifications()
RETURNS TABLE (notification_id uuid, to_email text, attempt integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE quest_qlub_private.mfa_recovery_notifications
  SET status = 'failed', recipient = NULL, finished_at = statement_timestamp()
  WHERE status = 'pending' AND next_attempt_at <= statement_timestamp()
    AND (attempts = 5 OR created_at < statement_timestamp() - interval '23 hours');

  RETURN QUERY
  WITH ready AS (
    SELECT id
    FROM quest_qlub_private.mfa_recovery_notifications
    WHERE status = 'pending' AND attempts < 5 AND next_attempt_at <= statement_timestamp()
      AND created_at >= statement_timestamp() - interval '23 hours'
    ORDER BY next_attempt_at, id
    LIMIT 10 FOR UPDATE SKIP LOCKED
  )
  UPDATE quest_qlub_private.mfa_recovery_notifications AS notification
  SET attempts = notification.attempts + 1, next_attempt_at = statement_timestamp() + interval '5 minutes'
  FROM ready
  WHERE notification.id = ready.id
  RETURNING notification.id, notification.recipient, notification.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_mfa_recovery_notification(
  p_id uuid, p_attempt integer, p_outcome text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  final_status text;
BEGIN
  CASE p_outcome
    WHEN 'sent' THEN final_status := 'sent';
    WHEN 'permanent' THEN final_status := 'failed';
    WHEN 'retry' THEN final_status := CASE WHEN p_attempt = 5 THEN 'failed' ELSE 'pending' END;
    ELSE RAISE EXCEPTION 'Invalid notification outcome';
  END CASE;

  UPDATE quest_qlub_private.mfa_recovery_notifications
  SET status = final_status,
      recipient = CASE WHEN final_status = 'pending' THEN recipient ELSE NULL END,
      next_attempt_at = statement_timestamp() + 2 * p_attempt * interval '1 minute',
      finished_at = CASE WHEN final_status = 'pending' THEN NULL ELSE statement_timestamp() END
  WHERE id = p_id AND attempts = p_attempt AND p_attempt > 0 AND status = 'pending';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION quest_qlub_private.invalidate_backup_codes_on_factor_removal()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_mfa_backup_codes(), public.verify_and_consume_backup_code(text),
  public.get_mfa_backup_codes_status() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_mfa_backup_codes(), public.verify_and_consume_backup_code(text),
  public.get_mfa_backup_codes_status() TO authenticated;
REVOKE ALL ON FUNCTION public.claim_mfa_recovery_notifications(),
  public.finish_mfa_recovery_notification(uuid, integer, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_mfa_recovery_notifications(),
  public.finish_mfa_recovery_notification(uuid, integer, text) TO service_role;

COMMIT;
