-- Run with psql -v ON_ERROR_STOP=1 in a disposable database after applying the migrations.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('a1630000-0000-0000-0000-000000000001', 'mfa-recovery@example.test', now());

ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_self_role_escalation;
UPDATE public.profiles SET role = 'writer', roles = ARRAY['writer']
WHERE id = 'a1630000-0000-0000-0000-000000000001';
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_self_role_escalation;

INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
VALUES ('a1630000-0000-0000-0000-000000000020', 'a1630000-0000-0000-0000-000000000001', 'totp', 'verified', now(), now());

INSERT INTO auth.sessions (id, user_id, aal, factor_id) VALUES
  ('a1630000-0000-0000-0000-000000000010', 'a1630000-0000-0000-0000-000000000001', 'aal2', 'a1630000-0000-0000-0000-000000000020'),
  ('a1630000-0000-0000-0000-000000000011', 'a1630000-0000-0000-0000-000000000001', 'aal1', NULL),
  ('a1630000-0000-0000-0000-000000000012', 'a1630000-0000-0000-0000-000000000001', 'aal1', NULL);

CREATE FUNCTION pg_temp.set_recovery_claims(test_session uuid, test_aal text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object(
    'sub', 'a1630000-0000-0000-0000-000000000001', 'session_id', test_session, 'aal', test_aal
  )::text, true);
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_recovery_claims('a1630000-0000-0000-0000-000000000010', 'aal2');
DO $$
DECLARE
  codes text[] := public.generate_mfa_backup_codes();
BEGIN
  IF cardinality(codes) <> 10 OR EXISTS (
    SELECT 1 FROM unnest(codes) AS code WHERE code !~ '^[A-F0-9]{8}(-[A-F0-9]{8}){3}$'
  ) OR (SELECT count(DISTINCT code) FROM unnest(codes) AS code) <> 10 THEN
    RAISE EXCEPTION 'Expected ten distinct 128-bit backup codes';
  END IF;
  PERFORM set_config('test.fresh_recovery_code', codes[1], true);
END;
$$;

RESET ROLE;
INSERT INTO public.mfa_backup_codes (user_id, code_hash)
VALUES ('a1630000-0000-0000-0000-000000000001', encode(sha256('LEGACY12'::bytea), 'hex'));

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.set_recovery_claims('a1630000-0000-0000-0000-000000000011', 'aal1');
  BEGIN
    PERFORM public.generate_mfa_backup_codes();
    RAISE EXCEPTION 'AAL1 session can issue backup codes';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  FOR i IN 1..3 LOOP
    IF public.verify_and_consume_backup_code('wrong') THEN
      RAISE EXCEPTION 'Invalid backup code accepted';
    END IF;
  END LOOP;

  PERFORM pg_temp.set_recovery_claims('a1630000-0000-0000-0000-000000000012', 'aal1');
  FOR i IN 1..2 LOOP
    PERFORM public.verify_and_consume_backup_code('wrong');
  END LOOP;
  BEGIN
    PERFORM public.verify_and_consume_backup_code('LEGA-CY12');
    RAISE EXCEPTION 'Recovery cooldown was reset by the second session';
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    NULL;
  END;
END;
$$;

RESET ROLE;
UPDATE quest_qlub_private.mfa_recovery_state
SET window_started_at = statement_timestamp() - interval '16 minutes'
WHERE user_id = 'a1630000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.verify_and_consume_backup_code('LEGA-CY12') THEN
    RAISE EXCEPTION 'Legacy backup code rejected after rate window';
  END IF;
  IF public.verify_and_consume_backup_code('LEGA-CY12')
    OR public.verify_and_consume_backup_code(current_setting('test.fresh_recovery_code')) THEN
    RAISE EXCEPTION 'Previous backup codes survive recovery';
  END IF;
  IF public.get_mfa_backup_codes_status() <> '{"total":0,"remaining":0,"re_enroll_required":true}'::jsonb THEN
    RAISE EXCEPTION 'Recovery requiring re-enrollment was not recorded';
  END IF;
  BEGIN
    PERFORM public.begin_sudo_session();
    RAISE EXCEPTION 'Writer can begin Sudo before re-enrolling';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.claim_mfa_recovery_notifications();
    RAISE EXCEPTION 'An ordinary account can read recovery notifications';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM auth.sessions WHERE user_id = 'a1630000-0000-0000-0000-000000000001') <> 1
    OR EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id = 'a1630000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Previous Auth sessions or MFA survived recovery';
  END IF;
  IF (SELECT count(*) FROM quest_qlub_private.mfa_recovery_notifications
    WHERE user_id = 'a1630000-0000-0000-0000-000000000001' AND recipient = 'mfa-recovery@example.test') <> 1 THEN
    RAISE EXCEPTION 'Recovery should queue one notice to the verified address';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  job record;
BEGIN
  SELECT * INTO STRICT job FROM public.claim_mfa_recovery_notifications()
  WHERE to_email = 'mfa-recovery@example.test';
  IF job.attempt <> 1 OR NOT public.finish_mfa_recovery_notification(job.notification_id, job.attempt, 'sent') THEN
    RAISE EXCEPTION 'Recovery notification could not be completed';
  END IF;
  IF public.finish_mfa_recovery_notification(job.notification_id, job.attempt, 'retry') THEN
    RAISE EXCEPTION 'A stale notification lease can override successful delivery';
  END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM quest_qlub_private.mfa_recovery_notifications
    WHERE user_id = 'a1630000-0000-0000-0000-000000000001' AND status = 'sent' AND recipient IS NULL) THEN
    RAISE EXCEPTION 'Notification success did not clear the address';
  END IF;
END;
$$;

INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
VALUES ('a1630000-0000-0000-0000-000000000021', 'a1630000-0000-0000-0000-000000000001', 'totp', 'verified', now(), now());
UPDATE auth.sessions SET aal = 'aal2', factor_id = 'a1630000-0000-0000-0000-000000000021'
WHERE id = 'a1630000-0000-0000-0000-000000000012';

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_recovery_claims('a1630000-0000-0000-0000-000000000012', 'aal2');
DO $$
BEGIN
  PERFORM public.generate_mfa_backup_codes();
  IF public.get_mfa_backup_codes_status() <> '{"total":10,"remaining":10,"re_enroll_required":false}'::jsonb THEN
    RAISE EXCEPTION 'New codes did not finish recovery';
  END IF;
  PERFORM public.begin_sudo_session();
END;
$$;

RESET ROLE;
DELETE FROM auth.mfa_factors WHERE id = 'a1630000-0000-0000-0000-000000000021';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mfa_backup_codes WHERE user_id = 'a1630000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Removing a verified factor did not invalidate backup codes';
  END IF;
END;
$$;

ROLLBACK;
