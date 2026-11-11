-- 20261112041000_fix_contact_messages_storage_roles_and_grants.sql
-- Fix Issue #79, #80, #85:
-- 1. Issue #80: contact_messages SELECT RLS ポリシーにおけるマルチロール（profiles.roles 配列）対応
-- 2. Issue #85: storage.objects (thumbnails バケット) におけるマルチロール対応
-- 3. Issue #79: user_follows および article_comments に対する明示的な GRANT 権限の補完

-- 1. contact_messages SELECT ポリシーのマルチロール対応 (Issue #80)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contact_messages' AND policyname = 'Allow editors to read contact_messages'
  ) THEN
    ALTER POLICY "Allow editors to read contact_messages" ON public.contact_messages
      USING (public.check_is_editor());
  ELSE
    CREATE POLICY "Allow editors to read contact_messages" ON public.contact_messages
      FOR SELECT TO authenticated
      USING (public.check_is_editor());
  END IF;
END $$;

-- 2. storage.objects thumbnails バケット RLS ポリシーのマルチロール対応 (Issue #85)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_thumbnails_insert_writer'
  ) THEN
    ALTER POLICY "storage_thumbnails_insert_writer" ON storage.objects
      WITH CHECK (
        bucket_id = 'thumbnails'
        AND (auth.uid())::text = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (profiles.id)::text = (auth.uid())::text
            AND (
              profiles.role IN ('writer', 'editor')
              OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
              OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            )
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_thumbnails_update_writer'
  ) THEN
    ALTER POLICY "storage_thumbnails_update_writer" ON storage.objects
      USING (
        bucket_id = 'thumbnails'
        AND (auth.uid())::text = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (profiles.id)::text = (auth.uid())::text
            AND (
              profiles.role IN ('writer', 'editor')
              OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
              OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            )
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_thumbnails_delete_writer'
  ) THEN
    ALTER POLICY "storage_thumbnails_delete_writer" ON storage.objects
      USING (
        bucket_id = 'thumbnails'
        AND (auth.uid())::text = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (profiles.id)::text = (auth.uid())::text
            AND (
              profiles.role IN ('writer', 'editor')
              OR 'writer' = ANY(COALESCE(profiles.roles, '{}'::text[]))
              OR 'editor' = ANY(COALESCE(profiles.roles, '{}'::text[]))
            )
        )
      );
  END IF;
END $$;

-- 3. user_follows および article_comments に対する明示的な GRANT 付与 (Issue #79)
GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_comments TO authenticated;
GRANT SELECT ON public.article_comments TO anon;
