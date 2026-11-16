-- ============================================================================
-- 20261116123000_cleanup_storage_avatars_comment_policy_and_contact_idx.sql
-- Issue #148: 残余 DB 整理（storage_avatars_* InitPlan 最適化・未使用ポリシー削除・式インデックス整備）
-- ----------------------------------------------------------------------------
-- 1. storage.objects の avatars バケットポリシー（insert/update/delete）を
--    ((select auth.uid()))::text に最適化し InitPlan 評価にする。
-- 2. INSERT 権限が剥奪済みの未使用ポリシー comment_edit_history_insert を削除。
-- 3. enforce_contact_rate_limit() の WHERE lower(trim(email)) = lower(trim(NEW.email))
--    に合致する式インデックス idx_contact_messages_lower_trim_email_created_at を作成し、
--    旧インデックス contact_messages_email_created_at_idx を削除。
-- ============================================================================

-- 1. storage.objects avatars ポリシーの (select auth.uid()) 最適化
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_avatars_insert_own'
  ) THEN
    ALTER POLICY "storage_avatars_insert_own" ON storage.objects
      WITH CHECK (
        bucket_id = 'avatars'
        AND ((select auth.uid()))::text = (storage.foldername(name))[1]
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_avatars_update_own'
  ) THEN
    ALTER POLICY "storage_avatars_update_own" ON storage.objects
      USING (
        bucket_id = 'avatars'
        AND ((select auth.uid()))::text = (storage.foldername(name))[1]
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_avatars_delete_own'
  ) THEN
    ALTER POLICY "storage_avatars_delete_own" ON storage.objects
      USING (
        bucket_id = 'avatars'
        AND ((select auth.uid()))::text = (storage.foldername(name))[1]
      );
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;

-- 2. 未使用の comment_edit_history_insert ポリシーを削除
DROP POLICY IF EXISTS "comment_edit_history_insert" ON public.comment_edit_history;

-- 3. contact_messages レート制限クエリに合致する式インデックスへ整理
CREATE INDEX IF NOT EXISTS idx_contact_messages_lower_trim_email_created_at
  ON public.contact_messages (lower(trim(email)), created_at DESC);

DROP INDEX IF EXISTS public.contact_messages_email_created_at_idx;
