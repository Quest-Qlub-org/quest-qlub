-- #158: an accepted receipt and its notification job commit together.
BEGIN;

CREATE SCHEMA IF NOT EXISTS quest_qlub_private;

CREATE TABLE IF NOT EXISTS quest_qlub_private.contact_submission_windows (
  window_key text PRIMARY KEY,
  submitted_at timestamptz[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE quest_qlub_private.contact_submission_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quest_qlub_private.contact_submission_windows FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_contact_submission_windows_last_used
  ON quest_qlub_private.contact_submission_windows (last_used_at);

CREATE TABLE IF NOT EXISTS quest_qlub_private.contact_notification_jobs (
  receipt_id uuid PRIMARY KEY REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts smallint NOT NULL DEFAULT 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  error_kind text,
  sent_at timestamptz
);
ALTER TABLE quest_qlub_private.contact_notification_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quest_qlub_private.contact_notification_jobs FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_contact_notification_jobs_ready
  ON quest_qlub_private.contact_notification_jobs (next_attempt_at, receipt_id)
  WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION quest_qlub_private.require_contact_quota(
  quota_key text, max_count integer, window_duration interval
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  previous_submissions timestamptz[];
  recent_submissions timestamptz[];
  accepted_at timestamptz;
BEGIN
  -- A no-op upsert locks and returns the current row even against concurrent inserts.
  INSERT INTO quest_qlub_private.contact_submission_windows AS limits (window_key)
  VALUES (quota_key)
  ON CONFLICT (window_key) DO UPDATE SET window_key = excluded.window_key
  RETURNING limits.submitted_at INTO previous_submissions;

  accepted_at := clock_timestamp();
  SELECT ARRAY(
    SELECT submitted_at
    FROM unnest(previous_submissions) AS submitted_at
    WHERE submitted_at > accepted_at - window_duration
  ) INTO recent_submissions;

  IF cardinality(recent_submissions) >= max_count THEN
    RAISE SQLSTATE 'PT429' USING MESSAGE =
      '短時間に多数の送信が行われました。時間をおいてから再度お試しください。';
  END IF;

  UPDATE quest_qlub_private.contact_submission_windows
  SET submitted_at = array_append(recent_submissions, accepted_at), last_used_at = accepted_at
  WHERE window_key = quota_key;
END;
$$;
REVOKE ALL ON FUNCTION quest_qlub_private.require_contact_quota(text, integer, interval)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_contact_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  gateway_ip text := request_headers->>'cf-connecting-ip';
BEGIN
  NEW.name := btrim(NEW.name, E' \t');
  NEW.email := btrim(NEW.email, E' \t');
  NEW.subject := btrim(NEW.subject, E' \t');
  NEW.body := btrim(NEW.body, E' \t\r\n');

  IF NEW.name IS NULL OR char_length(NEW.name) NOT BETWEEN 1 AND 100
    OR NEW.email IS NULL OR char_length(NEW.email) NOT BETWEEN 1 AND 254
    OR NEW.subject IS NULL OR char_length(NEW.subject) NOT BETWEEN 1 AND 200
    OR NEW.body IS NULL OR char_length(NEW.body) NOT BETWEEN 1 AND 5000
    OR NEW.name ~ E'[\r\n]' OR NEW.email ~ E'[\r\n]' OR NEW.subject ~ E'[\r\n]'
    OR NEW.email !~ $email$^[A-Za-z0-9.!#$%&'*+/=?^_{|}~`-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$$email$
  THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'お問い合わせの入力内容を確認してください。';
  END IF;

  PERFORM quest_qlub_private.require_contact_quota('email:' || lower(NEW.email), 3, interval '10 minutes');

  -- Supabase's hosted gateway supplies this header. The X-Forwarded-For chain can
  -- contain caller-controlled values. A direct local database query has no gateway IP.
  IF gateway_ip ~ '^[0-9A-Fa-f:.]{3,45}$' THEN
    BEGIN
      PERFORM quest_qlub_private.require_contact_quota(
        'ip:' || host(gateway_ip::inet), 3, interval '1 minute'
      );
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_contact_rate_limit ON public.contact_messages;
CREATE TRIGGER trg_enforce_contact_rate_limit
  BEFORE INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_rate_limit();
REVOKE ALL ON FUNCTION public.enforce_contact_rate_limit() FROM PUBLIC, anon, authenticated;

-- Honor the existing email limit through the transition. Existing receipts have
-- unknown delivery status and are not automatically re-enqueued.
INSERT INTO quest_qlub_private.contact_submission_windows (window_key, submitted_at)
SELECT 'email:' || lower(btrim(email)), (array_agg(created_at ORDER BY created_at DESC))[1:3]
FROM public.contact_messages
WHERE created_at > statement_timestamp() - interval '10 minutes'
GROUP BY lower(btrim(email))
ON CONFLICT (window_key) DO NOTHING;

CREATE OR REPLACE FUNCTION quest_qlub_private.queue_contact_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO quest_qlub_private.contact_notification_jobs (receipt_id)
  VALUES (NEW.id)
  ON CONFLICT (receipt_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION quest_qlub_private.queue_contact_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_queue_contact_notification ON public.contact_messages;
CREATE TRIGGER trg_queue_contact_notification
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION quest_qlub_private.queue_contact_notification();

CREATE OR REPLACE FUNCTION public.submit_contact_message(
  sender_name text, sender_email text, message_subject text, message_body text, honeypot text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  receipt_id uuid;
BEGIN
  IF coalesce(honeypot, '') <> '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.contact_messages (name, email, subject, body)
  VALUES (sender_name, sender_email, message_subject, message_body)
  RETURNING id INTO receipt_id;
  RETURN receipt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_contact_message(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_contact_notifications()
RETURNS TABLE (
  receipt_id uuid, lease_token uuid, name text, email text, subject text, body text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_at timestamptz;
  previous_claims timestamptz[];
  recent_claims timestamptz[];
  batch_size integer;
  claimed_count integer;
BEGIN
  INSERT INTO quest_qlub_private.contact_submission_windows AS limits (window_key)
  VALUES ('notification')
  ON CONFLICT (window_key) DO UPDATE SET window_key = excluded.window_key
  RETURNING limits.submitted_at INTO previous_claims;

  claimed_at := clock_timestamp();
  DELETE FROM quest_qlub_private.contact_submission_windows
  WHERE window_key IN (
    SELECT window_key FROM quest_qlub_private.contact_submission_windows
    WHERE window_key <> 'notification' AND last_used_at < claimed_at - interval '15 minutes'
    ORDER BY last_used_at
    LIMIT 1000
    FOR UPDATE SKIP LOCKED
  );

  -- A provider acceptance may precede a worker crash. Retrying beyond Resend's
  -- 24-hour deduplication period would risk sending a new message.
  UPDATE quest_qlub_private.contact_notification_jobs AS jobs
  SET status = 'failed', lease_token = NULL,
      error_kind = CASE WHEN jobs.status = 'processing' THEN 'lease_expired'
        ELSE coalesce(jobs.error_kind, 'retry_window_expired') END
  WHERE jobs.status IN ('pending', 'processing') AND jobs.next_attempt_at <= claimed_at
    AND (jobs.attempts >= 5 OR jobs.first_attempt_at <= claimed_at - interval '23 hours');

  SELECT ARRAY(
    SELECT submitted_at
    FROM unnest(previous_claims) AS submitted_at
    WHERE submitted_at > claimed_at - interval '1 minute'
  ) INTO recent_claims;
  batch_size := greatest(0, least(5, 10 - cardinality(recent_claims)));

  RETURN QUERY
  WITH due AS (
    SELECT jobs.receipt_id
    FROM quest_qlub_private.contact_notification_jobs AS jobs
    WHERE jobs.status IN ('pending', 'processing') AND jobs.next_attempt_at <= claimed_at
    ORDER BY jobs.next_attempt_at, jobs.receipt_id
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE quest_qlub_private.contact_notification_jobs AS jobs
    SET status = 'processing', attempts = jobs.attempts + 1,
        first_attempt_at = coalesce(jobs.first_attempt_at, claimed_at),
        next_attempt_at = claimed_at + interval '2 minutes',
        lease_token = gen_random_uuid()
    FROM due
    WHERE jobs.receipt_id = due.receipt_id
    RETURNING jobs.receipt_id, jobs.lease_token
  )
  SELECT claimed.receipt_id, claimed.lease_token, messages.name, messages.email, messages.subject, messages.body
  FROM claimed JOIN public.contact_messages AS messages ON messages.id = claimed.receipt_id;
  GET DIAGNOSTICS claimed_count = ROW_COUNT;

  UPDATE quest_qlub_private.contact_submission_windows
  SET submitted_at = recent_claims || array_fill(claimed_at, ARRAY[claimed_count]),
      last_used_at = claimed_at
  WHERE window_key = 'notification';
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_contact_notification(
  job_receipt_id uuid, job_lease_token uuid, delivery_error text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  final_status text;
BEGIN
  IF delivery_error IS NOT NULL
    AND delivery_error NOT IN ('provider_rejected', 'provider_unavailable', 'network_error', 'provider_rate_limit')
  THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid delivery error category';
  END IF;

  UPDATE quest_qlub_private.contact_notification_jobs AS jobs
  SET status = CASE
        WHEN delivery_error IS NULL THEN 'sent'
        WHEN delivery_error = 'provider_rejected' OR jobs.attempts >= 5 THEN 'failed'
        ELSE 'pending'
      END,
      sent_at = CASE WHEN delivery_error IS NULL THEN clock_timestamp() ELSE NULL END,
      lease_token = NULL,
      next_attempt_at = clock_timestamp() + make_interval(mins => (1 << jobs.attempts)),
      error_kind = delivery_error
  WHERE jobs.receipt_id = job_receipt_id AND jobs.lease_token = job_lease_token
    AND jobs.status = 'processing'
  RETURNING jobs.status INTO final_status;

  RETURN final_status;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_contact_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_contact_notification(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_contact_notifications() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_contact_notification(uuid, uuid, text) TO service_role;

COMMIT;
