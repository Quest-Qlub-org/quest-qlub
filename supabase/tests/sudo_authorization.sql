-- Run with psql -v ON_ERROR_STOP=1 after applying migrations to a disposable database.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('d5000000-0000-0000-0000-000000000001', 'sudo-editor@example.test'),
  ('d5000000-0000-0000-0000-000000000002', 'sudo-writer@example.test');

-- Seed roles with trusted fixture privileges before switching to the Data API role.
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_self_role_escalation;
UPDATE public.profiles SET role = 'editor', roles = ARRAY['editor']
WHERE id = 'd5000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET role = 'writer', roles = ARRAY['writer']
WHERE id = 'd5000000-0000-0000-0000-000000000002';
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_self_role_escalation;

INSERT INTO public.contact_messages (name, email, subject, body)
VALUES ('Fixture', 'sudo-contact@example.test', 'Fixture', 'Test inquiry');

CREATE FUNCTION pg_temp.set_sudo_claims(test_user uuid, test_session uuid, test_aal text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', test_user, 'session_id', test_session, 'aal', test_aal, 'role', 'authenticated')::text,
    true
  );
$$;

INSERT INTO auth.sessions (id, user_id, aal)
VALUES ('d5000000-0000-0000-0000-000000000010', 'd5000000-0000-0000-0000-000000000001', 'aal1');

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_sudo_claims('d5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000010', 'aal1');

DO $$
BEGIN
  BEGIN
    PERFORM public.admin_get_all_profiles();
    RAISE EXCEPTION 'Editor without step-up can read private profiles';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.admin_set_user_roles('d5000000-0000-0000-0000-000000000002', ARRAY['engineer']);
    RAISE EXCEPTION 'Editor without step-up can change roles';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.contact_messages WHERE email = 'sudo-contact@example.test') THEN
    RAISE EXCEPTION 'Editor without step-up can read inquiries';
  END IF;
  PERFORM set_config('test.sudo_challenge', public.begin_sudo_session()::text, true);
END;
$$;

RESET ROLE;
INSERT INTO auth.sessions (id, user_id, aal) VALUES
  ('d5000000-0000-0000-0000-000000000011', 'd5000000-0000-0000-0000-000000000001', 'aal1'),
  ('d5000000-0000-0000-0000-000000000012', 'd5000000-0000-0000-0000-000000000002', 'aal1');
INSERT INTO auth.mfa_amr_claims (id, session_id, authentication_method, created_at, updated_at)
SELECT gen_random_uuid(), id, 'password', statement_timestamp(), statement_timestamp()
FROM auth.sessions WHERE id IN (
  'd5000000-0000-0000-0000-000000000010',
  'd5000000-0000-0000-0000-000000000011',
  'd5000000-0000-0000-0000-000000000012'
);
INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
VALUES ('d5000000-0000-0000-0000-000000000020', 'd5000000-0000-0000-0000-000000000001', 'totp', 'verified', now(), now());

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  challenge uuid := current_setting('test.sudo_challenge')::uuid;
BEGIN
  PERFORM pg_temp.set_sudo_claims('d5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000012', 'aal1');
  BEGIN
    PERFORM public.confirm_sudo_session(challenge);
    RAISE EXCEPTION 'Another account can confirm the challenge';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM pg_temp.set_sudo_claims('d5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000010', 'aal1');
  BEGIN
    PERFORM public.confirm_sudo_session(challenge);
    RAISE EXCEPTION 'Original session can confirm the challenge';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM pg_temp.set_sudo_claims('d5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000011', 'aal2');
  BEGIN
    PERFORM public.confirm_sudo_session(challenge);
    RAISE EXCEPTION 'An AAL2 claim without recorded MFA can confirm the challenge';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;
UPDATE auth.sessions SET aal = 'aal2', factor_id = 'd5000000-0000-0000-0000-000000000020'
WHERE id = 'd5000000-0000-0000-0000-000000000011';
INSERT INTO auth.mfa_amr_claims (id, session_id, authentication_method, created_at, updated_at)
VALUES (gen_random_uuid(), 'd5000000-0000-0000-0000-000000000011', 'totp', statement_timestamp(), statement_timestamp());

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  challenge uuid := current_setting('test.sudo_challenge')::uuid;
  deadline timestamptz;
BEGIN
  PERFORM pg_temp.set_sudo_claims('d5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000011', 'aal2');
  deadline := public.confirm_sudo_session(challenge);
  IF deadline <= statement_timestamp()
      OR deadline > statement_timestamp() + interval '15 minutes'
      OR public.confirm_sudo_session(challenge) IS DISTINCT FROM deadline THEN
    RAISE EXCEPTION 'Missing, extended or unstable Sudo deadline';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contact_messages WHERE email = 'sudo-contact@example.test') THEN
    RAISE EXCEPTION 'Editor with step-up cannot read inquiries';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_get_all_profiles() WHERE email = 'sudo-writer@example.test') THEN
    RAISE EXCEPTION 'Editor with step-up cannot read private profiles';
  END IF;
  PERFORM public.admin_set_user_roles('d5000000-0000-0000-0000-000000000002', ARRAY['writer', 'engineer']);
  INSERT INTO public.articles (id, title, writer_id) VALUES
    ('sudo-fixture-draft', 'fixture', 'd5000000-0000-0000-0000-000000000001');
END;
$$;

RESET ROLE;
SAVEPOINT role_guard;
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_self_role_escalation;
UPDATE public.profiles SET role = 'viewer', roles = ARRAY['viewer']
WHERE id = 'd5000000-0000-0000-0000-000000000001';
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_self_role_escalation;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.contact_messages WHERE email = 'sudo-contact@example.test') THEN
    RAISE EXCEPTION 'Revoked editor role can still read inquiries';
  END IF;
  UPDATE public.articles SET title = 'denied' WHERE id = 'sudo-fixture-draft';
  IF FOUND THEN
    RAISE EXCEPTION 'Revoked writer role can still edit drafts';
  END IF;
END;
$$;
ROLLBACK TO role_guard;

SAVEPOINT time_guard;
UPDATE quest_qlub_private.sudo_sessions SET expires_at = statement_timestamp() - interval '1 second'
WHERE session_id = 'd5000000-0000-0000-0000-000000000011';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.contact_messages WHERE email = 'sudo-contact@example.test') THEN
    RAISE EXCEPTION 'Expired step-up can still read inquiries';
  END IF;
END;
$$;
ROLLBACK TO time_guard;

SAVEPOINT signout_guard;
DELETE FROM auth.sessions WHERE id = 'd5000000-0000-0000-0000-000000000011';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.contact_messages WHERE email = 'sudo-contact@example.test') THEN
    RAISE EXCEPTION 'Signed-out session can still read inquiries';
  END IF;
END;
$$;
ROLLBACK TO signout_guard;

SET LOCAL ROLE authenticated;
SELECT public.revoke_sudo_session();
DO $$
BEGIN
  BEGIN
    PERFORM public.confirm_sudo_session(current_setting('test.sudo_challenge')::uuid);
    RAISE EXCEPTION 'A locked session can reissue its grant';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.contact_messages WHERE email = 'sudo-contact@example.test') THEN
    RAISE EXCEPTION 'Locked session can still read inquiries';
  END IF;
END;
$$;

ROLLBACK;
