-- 20261112040000_fix_comment_edit_history_security.sql
-- Issue #78: comment_edit_history の直接 INSERT 権限遮断および非公開記事コメント履歴の閲覧保護

-- 1. comment_edit_history への直接 INSERT を RLS で完全遮断
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comment_edit_history' AND policyname = 'comment_edit_history_insert'
  ) THEN
    ALTER POLICY "comment_edit_history_insert" ON public.comment_edit_history WITH CHECK (false);
  END IF;
END $$;

-- 2. SELECT ポリシー (USING (true)) を削除/再定義し、親コメントおよび記事の公開状態・アクセス権限に連動した安全なポリシーへ再定義
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comment_edit_history' AND policyname = 'comment_edit_history_select'
  ) THEN
    ALTER POLICY "comment_edit_history_select" ON public.comment_edit_history
      USING (
        EXISTS (
          SELECT 1 FROM public.article_comments ac
          JOIN public.articles a ON a.id = ac.article_id
          WHERE ac.id = comment_edit_history.comment_id
            AND (
              -- 公開記事かつコメントが有効な場合は誰でも閲覧可能
              (a.status = 'published' AND COALESCE(a.comments_enabled, true) = true)
              -- コメント投稿者本人は閲覧可能
              OR (auth.uid() IS NOT NULL AND ac.author_id = auth.uid())
              -- 記事の主執筆者は閲覧可能
              OR (auth.uid() IS NOT NULL AND a.writer_id = (auth.uid())::text)
              -- 記事の共同執筆者は閲覧可能
              OR (auth.uid() IS NOT NULL AND (auth.uid())::text = ANY(COALESCE(a.collaborator_ids, '{}'::text[])))
              -- 編集長スタッフは閲覧可能
              OR public.check_is_editor()
            )
        )
      );
  ELSE
    CREATE POLICY "comment_edit_history_select" ON public.comment_edit_history
      FOR SELECT TO public
      USING (
        EXISTS (
          SELECT 1 FROM public.article_comments ac
          JOIN public.articles a ON a.id = ac.article_id
          WHERE ac.id = comment_edit_history.comment_id
            AND (
              (a.status = 'published' AND COALESCE(a.comments_enabled, true) = true)
              OR (auth.uid() IS NOT NULL AND ac.author_id = auth.uid())
              OR (auth.uid() IS NOT NULL AND a.writer_id = (auth.uid())::text)
              OR (auth.uid() IS NOT NULL AND (auth.uid())::text = ANY(COALESCE(a.collaborator_ids, '{}'::text[])))
              OR public.check_is_editor()
            )
        )
      );
  END IF;
END $$;
