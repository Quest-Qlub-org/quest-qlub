-- Run with psql -X -v ON_ERROR_STOP=1 against a reset, isolated Supabase database.
BEGIN;

SET LOCAL ROLE anon;
SELECT set_config('request.headers', '{"cf-connecting-ip":"203.0.113.158"}', true);

DO $$
BEGIN
  PERFORM public.submit_contact_message('Fixture', 'contact-158@example.test', 'Ignored', 'Fixture', 'trap');
  BEGIN
    PERFORM public.submit_contact_message(E'bad\nheader', 'contact-158@example.test', 'Fixture', 'Fixture', '');
    RAISE EXCEPTION 'A message with invalid headers was accepted';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN
    NULL;
  END;

  FOR index IN 1..3 LOOP
    PERFORM public.submit_contact_message('Fixture', 'Contact-158@example.test', 'Fixture', 'Fixture', '');
  END LOOP;

  BEGIN
    PERFORM public.submit_contact_message('Fixture', 'different-158@example.test', 'Fixture', 'Fixture', '');
    RAISE EXCEPTION 'A submission beyond the gateway IP limit was accepted';
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    NULL;
  END;

  PERFORM set_config('request.headers', '{"cf-connecting-ip":"203.0.113.159"}', true);
  BEGIN
    PERFORM public.submit_contact_message('Fixture', 'contact-158@example.test', 'Fixture', 'Fixture', '');
    RAISE EXCEPTION 'A submission beyond the email limit was accepted';
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.claim_contact_notifications();
    RAISE EXCEPTION 'A guest can claim notifications';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.contact_messages) <> 3
    OR (SELECT count(*) FROM quest_qlub_private.contact_notification_jobs) <> 3
  THEN
    RAISE EXCEPTION 'Each accepted receipt must have exactly one notification job';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
CREATE TEMPORARY TABLE first_claim AS SELECT * FROM public.claim_contact_notifications();
DO $$
DECLARE
  job record;
BEGIN
  IF (SELECT count(*) FROM first_claim) <> 3 OR EXISTS (SELECT FROM public.claim_contact_notifications()) THEN
    RAISE EXCEPTION 'A claimed receipt was missing or claimed twice';
  END IF;

  SELECT * INTO job FROM first_claim LIMIT 1;
  IF public.finish_contact_notification(job.receipt_id, job.lease_token, 'provider_unavailable')
    IS DISTINCT FROM 'pending'
  THEN
    RAISE EXCEPTION 'A temporary error must schedule a retry';
  END IF;

  IF public.finish_contact_notification(job.receipt_id, job.lease_token, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A finished lease can be reused';
  END IF;
END;
$$;
RESET ROLE;

UPDATE quest_qlub_private.contact_notification_jobs
SET next_attempt_at = clock_timestamp()
WHERE status = 'pending';

SET LOCAL ROLE service_role;
DO $$
DECLARE
  new_claim record;
  previous_claim record;
BEGIN
  SELECT * INTO STRICT new_claim FROM public.claim_contact_notifications();
  SELECT * INTO STRICT previous_claim FROM first_claim WHERE receipt_id = new_claim.receipt_id;
  IF previous_claim.lease_token = new_claim.lease_token
    OR public.finish_contact_notification(new_claim.receipt_id, previous_claim.lease_token, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'A stale worker can finalize another lease';
  END IF;
  IF public.finish_contact_notification(new_claim.receipt_id, new_claim.lease_token, NULL)
    IS DISTINCT FROM 'sent'
  THEN
    RAISE EXCEPTION 'A confirmed notification must be marked sent';
  END IF;
END;
$$;
RESET ROLE;

UPDATE quest_qlub_private.contact_notification_jobs
SET first_attempt_at = clock_timestamp() - interval '24 hours', next_attempt_at = clock_timestamp()
WHERE status = 'processing';

SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF EXISTS (SELECT FROM public.claim_contact_notifications()) THEN
    RAISE EXCEPTION 'Expired or sent notification was reclaimed';
  END IF;
END;
$$;
RESET ROLE;

SELECT set_config('request.headers', '{}', true);

INSERT INTO public.contact_messages (name, email, subject, body)
SELECT 'Fixture', format('quota-158-%s@example.test', sample), 'Fixture', 'Fixture'
FROM generate_series(1, 8) AS sample;
UPDATE quest_qlub_private.contact_submission_windows
SET submitted_at = array_fill(clock_timestamp(), ARRAY[9]) WHERE window_key = 'notification';

SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.claim_contact_notifications()) <> 1
    OR EXISTS (SELECT FROM public.claim_contact_notifications())
  THEN
    RAISE EXCEPTION 'Workers exceeded the shared notification rate limit';
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM quest_qlub_private.contact_notification_jobs WHERE status = 'failed'
    AND error_kind = 'lease_expired') <> 2 THEN
    RAISE EXCEPTION 'Expired notifications did not reach a final state';
  END IF;
END;
$$;

ROLLBACK;
