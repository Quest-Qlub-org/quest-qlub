-- 1. articles テーブルの危険なレガシーポリシーの削除
DROP POLICY IF EXISTS "誰でもviews_likesを更新できる" ON public.articles;
DROP POLICY IF EXISTS "公開記事は誰でも読める" ON public.articles;
DROP POLICY IF EXISTS "editorは全操作できる" ON public.articles;
DROP POLICY IF EXISTS "writerは自分の記事を操作できる" ON public.articles;

-- 2. profiles テーブルの危険なレガシーポリシーの削除
DROP POLICY IF EXISTS "Allow individual update" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual insert" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read access" ON public.profiles;
DROP POLICY IF EXISTS "自分のプロフィールは自分だけ更新できる" ON public.profiles;
DROP POLICY IF EXISTS "自分のプロフィールは自分だけ読める" ON public.profiles;
DROP POLICY IF EXISTS "誰でもプロフィールを閲覧できる" ON public.profiles;
DROP POLICY IF EXISTS "editor can update any profile role" ON public.profiles;

-- 3. contact_messages / favorites テーブルの重複ポリシー整理
DROP POLICY IF EXISTS "anyone can insert" ON public.contact_messages;
DROP POLICY IF EXISTS "自分のお気に入りだけ操作できる" ON public.favorites;
DROP POLICY IF EXISTS "自分のお気に入りだけ操作" ON public.favorites;

DROP POLICY IF EXISTS "favorites_manage_own" ON public.favorites;
CREATE POLICY "favorites_manage_own" ON public.favorites
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. 関数サーチパスの固定と権限（REVOKE EXECUTE）の保護
ALTER FUNCTION public.decrement_likes(p_article_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_likes(p_article_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_change_user_role(target_user_id text, new_role text) SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_promote_writer(target_email text) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_is_editor() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_profile_initial_role() SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_self_role_escalation() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.enforce_profile_initial_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_change_user_role(target_user_id text, new_role text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_change_user_role(target_user_id text, new_role text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_promote_writer(target_email text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promote_writer(target_email text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_likes(p_article_id text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_likes(p_article_id text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.decrement_likes(p_article_id text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_likes(p_article_id text) TO authenticated;

-- 5. Storage バケット設定の制限強化 (storage.buckets)
UPDATE storage.buckets
SET 
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'avatars';

UPDATE storage.buckets
SET 
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'thumbnails';

-- 6. Storage (storage.objects) の危険なポリシーの削除と再構築
DROP POLICY IF EXISTS "anyone can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "writers can update thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "writers can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "アバター画像は誰でも読める" ON storage.objects;
DROP POLICY IF EXISTS "自分のアバターだけアップロードできる" ON storage.objects;
DROP POLICY IF EXISTS "自分のアバターだけ更新できる" ON storage.objects;
DROP POLICY IF EXISTS "anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "anyone can view thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "storage_avatars_select_public" ON storage.objects;
DROP POLICY IF EXISTS "storage_avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "storage_avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "storage_avatars_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "storage_thumbnails_select_public" ON storage.objects;
DROP POLICY IF EXISTS "storage_thumbnails_insert_writer" ON storage.objects;
DROP POLICY IF EXISTS "storage_thumbnails_update_writer" ON storage.objects;
DROP POLICY IF EXISTS "storage_thumbnails_delete_writer" ON storage.objects;

CREATE POLICY "storage_avatars_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "storage_avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars' 
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage_avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'avatars' 
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage_avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'avatars' 
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage_thumbnails_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'thumbnails');

CREATE POLICY "storage_thumbnails_insert_writer" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'thumbnails' 
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE (profiles.id)::text = (auth.uid())::text 
        AND profiles.role IN ('writer', 'editor')
    )
  );

CREATE POLICY "storage_thumbnails_update_writer" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'thumbnails' 
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE (profiles.id)::text = (auth.uid())::text 
        AND profiles.role IN ('writer', 'editor')
    )
  );

CREATE POLICY "storage_thumbnails_delete_writer" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'thumbnails' 
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE (profiles.id)::text = (auth.uid())::text 
        AND profiles.role IN ('writer', 'editor')
    )
  );
