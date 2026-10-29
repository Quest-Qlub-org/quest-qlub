-- ============================================================================
-- 未認証（anon）読者による記事コメント閲覧権限の修復
-- ----------------------------------------------------------------------------
-- 背景:
-- 20261018010000_implement_comments_and_follows.sql で定義された
-- article_comments_select ポリシーにおいて、
-- check_is_editor() 関数を public ポリシー内で評価していた。
-- しかし check_is_editor() は anon ロールから REVOKE されていたため、
-- 未ログイン（anon）ユーザーがコメントを取得しようとすると
-- "permission denied for function check_is_editor" (ERROR 42501) が発生し、
-- コメント一覧が一切表示されない不具合が発生していた。
--
-- 対策:
-- 1. anon ロールに対して check_is_editor() の EXECUTE 権限を付与
--    （関数内部で auth.uid() を参照するため未ログイン時は安全に false を返す）。
-- 2. article_comments, comment_edit_history の SELECT 権限を anon, authenticated に付与。
-- 3. article_comments の SELECT ポリシーを、public 向け（comments_enabled = true）と
--    authenticated 向け（comments_enabled = false 時の著者本人・編集長用）に分離。
-- ============================================================================

-- 1. テーブルおよび関数の権限付与 --------------------------------------------
GRANT SELECT ON public.article_comments TO anon, authenticated;
GRANT SELECT ON public.comment_edit_history TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_editor() TO anon;

-- 2. RLS ポリシーの再定義 ----------------------------------------------------
ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "article_comments_select" ON public.article_comments;
DROP POLICY IF EXISTS "article_comments_select_public" ON public.article_comments;
DROP POLICY IF EXISTS "article_comments_select_staff" ON public.article_comments;

-- 2-1. 一般公開用ポリシー: comments_enabled が true の記事コメントは誰でも閲覧可能
-- （check_is_editor() を呼ばないため、未ログイン anon ユーザーでも安全に評価される）
CREATE POLICY "article_comments_select_public" ON public.article_comments
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND articles.comments_enabled = true
    )
  );

-- 2-2. 記事コメント機能オフ時の著者本人・編集長用ポリシー
-- （authenticated ロールにのみ適用されるため、check_is_editor() 実行権限がある）
CREATE POLICY "article_comments_select_staff" ON public.article_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND (
          articles.writer_id = (auth.uid())::text
          OR public.check_is_editor()
        )
    )
  );
