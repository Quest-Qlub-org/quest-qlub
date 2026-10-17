-- ============================================================================
-- セキュリティ強化（デプロイ不要・DBのみで完結）
-- ----------------------------------------------------------------------------
-- S7: MFA 関連関数の実行権限を最小化する。
--   いずれも auth.uid() でガード済みだが、PUBLIC / anon への EXECUTE 付与は
--   不要なため剥奪する（authenticated / service_role は維持）。
--
-- S3: contact_messages の防御を強化する。
--   - 入力長をDB側で強制（クライアント検証のバイパス対策）。
--   - 付与を最小化（INSERT は anon / authenticated とも維持）。
--   適用前に既存 21 行がすべて制約に適合することを確認済み。
-- ============================================================================

-- S7: MFA 関数の実行権限 ------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.generate_mfa_backup_codes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_mfa_backup_codes_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_and_consume_backup_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clean_unverified_mfa_factors() FROM PUBLIC, anon;

-- S3: contact_messages の入力長 ------------------------------------------
ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_name_len;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_name_len
  CHECK (char_length(name) BETWEEN 1 AND 100);

ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_email_len;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_email_len
  CHECK (char_length(email) BETWEEN 3 AND 254);

ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_subject_len;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_subject_len
  CHECK (char_length(subject) BETWEEN 1 AND 200);

ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_body_len;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_body_len
  CHECK (char_length(body) BETWEEN 1 AND 5000);

-- S3: 付与の最小化 --------------------------------------------------------
-- anon は問い合わせの INSERT のみ必要（閲覧・更新・削除は不要）。
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON public.contact_messages FROM anon;
-- authenticated の SELECT は編集長向け RLS ポリシーのため維持。書き込み系は剥奪。
REVOKE UPDATE, DELETE, TRUNCATE ON public.contact_messages FROM authenticated;
