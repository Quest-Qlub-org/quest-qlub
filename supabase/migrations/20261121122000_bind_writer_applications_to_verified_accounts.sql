-- #164: writer applications are bound to an Auth account for their entire review.
BEGIN;

ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS message_kind text NOT NULL DEFAULT 'contact'
    CHECK (message_kind IN ('contact', 'writer_application', 'legacy_writer_application')),
  ADD COLUMN IF NOT EXISTS application_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_status text CHECK (review_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contact_messages_application_user
  ON public.contact_messages (application_user_id) WHERE application_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_messages_reviewed_by
  ON public.contact_messages (reviewed_by) WHERE reviewed_by IS NOT NULL;

-- Historical subjects and message bodies may identify requests to review, but
-- their contents cannot establish the applicant's identity.
UPDATE public.contact_messages
SET message_kind = 'legacy_writer_application'
WHERE message_kind = 'contact'
  AND btrim(subject) LIKE '【ライター応募】%'
  AND strpos(body, '【志望動機・自己PR】:') > 0;

CREATE OR REPLACE FUNCTION quest_qlub_private.classify_legacy_writer_application()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.message_kind = 'contact'
    AND btrim(NEW.subject) LIKE '【ライター応募】%'
    AND strpos(NEW.body, '【志望動機・自己PR】:') > 0
  THEN
    NEW.message_kind := 'legacy_writer_application';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION quest_qlub_private.classify_legacy_writer_application()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_classify_legacy_writer_application ON public.contact_messages;
CREATE TRIGGER trg_classify_legacy_writer_application
  BEFORE INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION quest_qlub_private.classify_legacy_writer_application();

-- Old browsers can still submit the legacy contact fields during deployment.
REVOKE INSERT ON public.contact_messages FROM PUBLIC, anon, authenticated;
REVOKE INSERT (message_kind, application_user_id, review_status, reviewed_at, reviewed_by)
  ON public.contact_messages FROM PUBLIC, anon, authenticated;
GRANT INSERT (name, email, subject, body) ON public.contact_messages TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_writer_application(
  sender_name text, motivation text, preferred_genres text[], previous_work_url text, honeypot text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  applicant_id uuid := auth.uid();
  verified_email text;
  receipt_id uuid;
BEGIN
  SELECT email INTO verified_email
  FROM auth.users WHERE id = applicant_id AND email_confirmed_at IS NOT NULL;

  IF coalesce(verified_email, '') = '' THEN
    RAISE insufficient_privilege USING MESSAGE = '確認済みのメールアドレスを持つアカウントでログインしてください。';
  END IF;

  IF coalesce(honeypot, '') <> '' THEN
    RETURN NULL;
  END IF;

  IF coalesce(btrim(motivation, E' \t\r\n'), '') = '' THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = '志望動機を入力してください。';
  END IF;

  INSERT INTO public.contact_messages (
    name, email, subject, body, message_kind, application_user_id, review_status
  )
  VALUES (
    sender_name,
    verified_email,
    '【ライター応募】' || btrim(sender_name) || '様より',
    concat_ws(E'\n',
      '【希望執筆ジャンル】: ' || coalesce(nullif(array_to_string(preferred_genres, ', '), ''), '未選択'),
      '【ポートフォリオ / 過去記事URL】: ' || coalesce(nullif(btrim(previous_work_url), ''), 'なし'),
      '【志望動機・自己PR】:' || E'\n' || btrim(motivation)
    ),
    'writer_application',
    applicant_id,
    'pending'
  )
  RETURNING id INTO receipt_id;

  RETURN receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_contact_receipts()
RETURNS TABLE (
  id uuid, name text, email text, subject text, body text, created_at timestamptz,
  message_kind text, application_user_id uuid, review_status text,
  account_display_name text, account_username text, notification_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (public.check_is_editor() AND quest_qlub_private.has_active_sudo()) THEN
    RAISE insufficient_privilege USING MESSAGE = '受付の確認には編集長の再認証が必要です。';
  END IF;

  RETURN QUERY
  SELECT messages.id, messages.name, messages.email, messages.subject, messages.body, messages.created_at,
    messages.message_kind, messages.application_user_id, messages.review_status,
    profiles.display_name, profiles.username, jobs.status
  FROM public.contact_messages AS messages
  LEFT JOIN public.profiles AS profiles ON profiles.id = messages.application_user_id
  LEFT JOIN quest_qlub_private.contact_notification_jobs AS jobs ON jobs.receipt_id = messages.id
  ORDER BY messages.created_at DESC, messages.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_writer_application(
  receipt_id uuid, expected_account_id uuid, decision text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  receipt public.contact_messages;
  existing_roles text[];
BEGIN
  -- Follow the lock ordering of the canonical admin role-change function.
  PERFORM pg_advisory_xact_lock(hashtext('quest-qlub.editor-roles'), 0);

  IF NOT (public.check_is_editor() AND quest_qlub_private.has_active_sudo()) THEN
    RAISE insufficient_privilege USING MESSAGE = '応募の審査には編集長の再認証が必要です。';
  END IF;

  IF decision IS NULL OR decision NOT IN ('approved', 'rejected') THEN
    RAISE invalid_parameter_value USING MESSAGE = '審査結果を選択してください。';
  END IF;

  SELECT * INTO receipt
  FROM public.contact_messages
  WHERE id = receipt_id AND message_kind = 'writer_application'
  FOR UPDATE;

  IF receipt.application_user_id IS NULL
    OR receipt.application_user_id IS DISTINCT FROM expected_account_id
  THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE =
      '応募に紐付くアカウントを確認できません。受付一覧を更新してください。';
  END IF;

  IF receipt.review_status = decision THEN
    RETURN decision;
  END IF;
  IF receipt.review_status IS DISTINCT FROM 'pending' THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'この応募は審査済みです。受付一覧を更新してください。';
  END IF;

  IF decision = 'approved' THEN
    SELECT array_remove(coalesce(profiles.roles, '{}') || profiles.role, 'viewer')
    INTO existing_roles
    FROM public.profiles AS profiles
    WHERE profiles.id = receipt.application_user_id
    FOR UPDATE;

    IF NOT FOUND OR NOT EXISTS (
      SELECT FROM auth.users
      WHERE id = receipt.application_user_id AND email_confirmed_at IS NOT NULL
    ) THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'メール確認とプロフィール登録の完了後に承認できます。';
    END IF;

    PERFORM public.admin_set_user_roles(
      receipt.application_user_id::text, existing_roles || ARRAY['writer']
    );
  END IF;

  UPDATE public.contact_messages AS messages
  SET review_status = decision, reviewed_at = clock_timestamp(), reviewed_by = auth.uid()
  WHERE messages.id = receipt.id;

  RETURN decision;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_writer_application(text, text, text[], text, text),
  public.admin_list_contact_receipts(), public.admin_review_writer_application(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_writer_application(text, text, text[], text, text),
  public.admin_list_contact_receipts(), public.admin_review_writer_application(uuid, uuid, text)
  TO authenticated;

DROP FUNCTION IF EXISTS public.admin_promote_writer(text);

COMMIT;
