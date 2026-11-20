-- Run with psql -X -v ON_ERROR_STOP=1 against a reset, isolated Supabase database.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('16400000-0000-4000-8000-000000000001', 'applicant-before@example.test', statement_timestamp()),
  ('16400000-0000-4000-8000-000000000002', 'editor-164@example.test', statement_timestamp()),
  ('16400000-0000-4000-8000-000000000003', 'unconfirmed-164@example.test', NULL);

ALTER TABLE public.profiles DISABLE TRIGGER USER;
INSERT INTO public.profiles (id, display_name, username, role, roles) VALUES
  ('16400000-0000-4000-8000-000000000001', '応募者', 'applicant_164', 'viewer', ARRAY['viewer','engineer']),
  ('16400000-0000-4000-8000-000000000002', '編集長', 'editor_164', 'editor', ARRAY['editor'])
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, username = excluded.username,
  role = excluded.role, roles = excluded.roles;
ALTER TABLE public.profiles ENABLE TRIGGER USER;

INSERT INTO auth.sessions (id, user_id, aal) VALUES
  ('16400000-0000-4000-8000-000000000010', '16400000-0000-4000-8000-000000000002', 'aal1');
INSERT INTO auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method)
VALUES (gen_random_uuid(), '16400000-0000-4000-8000-000000000010', statement_timestamp(), statement_timestamp(), 'password');

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_writer_application('匿名応募', '志望動機', '{}', '', '');
    RAISE EXCEPTION 'Anonymous applications must be associated with a verified account';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"16400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_writer_application('未確認', '志望動機', '{}', '', '');
    RAISE EXCEPTION 'An unverified email was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"16400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT set_config('quest_test.writer_receipt', public.submit_writer_application(
  '応募者', '志望動機', ARRAY['プログラミング・Web開発'], '', ''
)::text, true);

DO $$
DECLARE
  receipt jsonb := current_setting('quest_test.writer_receipt')::jsonb;
BEGIN
  IF receipt->>'id' IS NULL OR receipt->>'email' IS DISTINCT FROM 'applicant-before@example.test'
    OR receipt->>'name' IS DISTINCT FROM '応募者'
    OR receipt->>'subject' IS DISTINCT FROM '【ライター応募】応募者様より'
    OR strpos(receipt->>'body', '志望動機') = 0
  THEN
    RAISE EXCEPTION 'The receipt did not contain the saved fields and verified email address';
  END IF;

  IF public.submit_writer_application('応募者', '志望動機', '{}', '', 'trap') IS NOT NULL THEN
    RAISE EXCEPTION 'Honeypot submission returned a receipt';
  END IF;

  BEGIN
    INSERT INTO public.contact_messages (name, email, subject, body, application_user_id)
    VALUES ('別の人物', 'applicant-before@example.test', '応募', 'Fixture', '16400000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Direct insert can set a writer application account';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

INSERT INTO public.contact_messages (name, email, subject, body)
VALUES ('旧形式の応募', 'applicant-before@example.test', '【ライター応募】以前の応募', '【志望動機・自己PR】: 以前の志望動機');

UPDATE auth.users SET email = 'applicant-after@example.test' WHERE id = '16400000-0000-4000-8000-000000000001';
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('16400000-0000-4000-8000-000000000004', 'applicant-before@example.test', statement_timestamp());
INSERT INTO public.profiles (id, display_name, username)
VALUES ('16400000-0000-4000-8000-000000000004', '旧アドレスの使用者', 'old_address_164')
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, username = excluded.username;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"16400000-0000-4000-8000-000000000002","role":"authenticated","session_id":"16400000-0000-4000-8000-000000000010","aal":"aal1"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.admin_list_contact_receipts();
    RAISE EXCEPTION 'An editor without Sudo can read the inbox';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

INSERT INTO quest_qlub_private.sudo_sessions (session_id, expires_at)
VALUES ('16400000-0000-4000-8000-000000000010', statement_timestamp() + interval '15 minutes');

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  verified_receipt record;
  legacy_receipt record;
BEGIN
  SELECT * INTO STRICT verified_receipt FROM public.admin_list_contact_receipts()
  WHERE id = (current_setting('quest_test.writer_receipt')::jsonb->>'id')::uuid;
  SELECT * INTO STRICT legacy_receipt FROM public.admin_list_contact_receipts()
  WHERE message_kind = 'legacy_writer_application';

  IF verified_receipt.application_user_id IS DISTINCT FROM '16400000-0000-4000-8000-000000000001'::uuid
    OR verified_receipt.email IS DISTINCT FROM 'applicant-before@example.test'
    OR verified_receipt.account_username IS DISTINCT FROM 'applicant_164'
    OR legacy_receipt.application_user_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'The inbox did not preserve the verified account and original receipt address';
  END IF;

  BEGIN
    PERFORM public.admin_review_writer_application(verified_receipt.id, '16400000-0000-4000-8000-000000000004', 'approved');
    RAISE EXCEPTION 'An account using the old email could be promoted by this receipt';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.admin_review_writer_application(legacy_receipt.id, verified_receipt.application_user_id, 'approved');
    RAISE EXCEPTION 'A legacy receipt could be approved without account verification';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN
    NULL;
  END;

  IF public.admin_review_writer_application(verified_receipt.id, verified_receipt.application_user_id, 'approved')
    IS DISTINCT FROM 'approved'
    OR public.admin_review_writer_application(verified_receipt.id, verified_receipt.application_user_id, 'approved')
    IS DISTINCT FROM 'approved'
  THEN
    RAISE EXCEPTION 'Bound application approval is not idempotent';
  END IF;

  BEGIN
    PERFORM public.admin_review_writer_application(verified_receipt.id, verified_receipt.application_user_id, 'rejected');
    RAISE EXCEPTION 'A subsequent request overwrote the recorded decision';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM public.profiles WHERE id = '16400000-0000-4000-8000-000000000001'
    AND roles @> ARRAY['engineer','writer'] AND role = 'writer'
  ) OR EXISTS (
    SELECT FROM public.profiles WHERE id = '16400000-0000-4000-8000-000000000004'
    AND ('writer' = ANY(roles) OR role = 'writer')
  ) OR NOT EXISTS (
    SELECT FROM public.contact_messages WHERE id = (current_setting('quest_test.writer_receipt')::jsonb->>'id')::uuid
      AND review_status = 'approved' AND reviewed_by = '16400000-0000-4000-8000-000000000002'
      AND reviewed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Only the verified applicant should be promoted and record the reviewing editor';
  END IF;
END;
$$;

ROLLBACK;
