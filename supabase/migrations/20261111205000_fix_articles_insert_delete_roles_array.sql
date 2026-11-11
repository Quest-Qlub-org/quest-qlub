-- ============================================================================
-- Issue #70: articles テーブルの INSERT / DELETE RLS ポリシーの profiles.roles 配列対応
-- ----------------------------------------------------------------------------
-- profiles.roles 配列導入に伴い、下書き閲覧（articles_select_own_drafts）や
-- 更新（articles_update_own_articles）は roles 配列を考慮するよう更新されたが、
-- INSERT (articles_insert_writer_or_editor) および
-- DELETE (articles_delete_own_articles) ポリシーが旧来の
-- profiles.role IN ('writer', 'editor') のまま残存していた。
--
-- これにより、主ロールが 'engineer' や 'viewer' で roles 配列に 'writer' や 'editor' を
-- 持つユーザーが記事作成（INSERT）や自記事削除（DELETE）を行った際に 42501 エラー
-- (permission denied) となる不具合を解消する。
-- ============================================================================

-- 1. articles_insert_writer_or_editor ポリシーの再定義
DROP POLICY IF EXISTS "articles_insert_writer_or_editor" ON public.articles;
CREATE POLICY "articles_insert_writer_or_editor" ON public.articles
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid())::text = writer_id
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

-- 2. articles_delete_own_articles ポリシーの再定義
DROP POLICY IF EXISTS "articles_delete_own_articles" ON public.articles;
CREATE POLICY "articles_delete_own_articles" ON public.articles
  FOR DELETE TO authenticated
  USING (
    (auth.uid())::text = writer_id
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
