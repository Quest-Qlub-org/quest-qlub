-- ============================================================================
-- スキーマドリフト解消 & 記事認可ポリシー強化
-- ----------------------------------------------------------------------------
-- 1. admin_promote_writer 関数本体の正式定義とバージョン管理。
-- 2. article_comments テーブルの正式定義（RLS・入力制約・インデックス）。
-- 3. articles の UPDATE ポリシーにおけるロール検証の強化（降格者による更新遮断）。
-- ============================================================================

-- 1. admin_promote_writer 関数本体 -----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_promote_writer(target_email text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF NOT public.check_is_editor() THEN
    RAISE EXCEPTION '権限がありません。編集長のみがライターを昇格できます。';
  END IF;

  IF target_email IS NULL OR trim(target_email) = '' THEN
    RAISE EXCEPTION 'メールアドレスを入力してください。';
  END IF;

  UPDATE public.profiles
  SET role = 'writer'
  WHERE lower(email) = lower(trim(target_email))
  RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION '指定されたメールアドレスのユーザーが見つかりません。';
  END IF;

  RETURN v_profile;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_promote_writer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promote_writer(text) TO authenticated;

-- 2. article_comments テーブルの作成・RLS ------------------------------------
CREATE TABLE IF NOT EXISTS public.article_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id TEXT NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT article_comments_name_len CHECK (char_length(author_name) BETWEEN 1 AND 50),
  CONSTRAINT article_comments_content_len CHECK (char_length(content) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_article_comments_article_id_created_at
  ON public.article_comments (article_id, created_at ASC);

ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;

-- 閲覧: 誰でも可能
DROP POLICY IF EXISTS "article_comments_select_public" ON public.article_comments;
CREATE POLICY "article_comments_select_public" ON public.article_comments
  FOR SELECT TO public USING (true);

-- 投稿: 誰でも可能（文字数制約あり）
DROP POLICY IF EXISTS "article_comments_insert_public" ON public.article_comments;
CREATE POLICY "article_comments_insert_public" ON public.article_comments
  FOR INSERT TO public WITH CHECK (
    char_length(content) BETWEEN 1 AND 500
    AND char_length(author_name) BETWEEN 1 AND 50
  );

-- 削除: 投稿者自身（ログイン時）または編集長のみ
DROP POLICY IF EXISTS "article_comments_delete_own_or_editor" ON public.article_comments;
CREATE POLICY "article_comments_delete_own_or_editor" ON public.article_comments
  FOR DELETE TO authenticated USING (
    (auth.uid() = author_id) OR public.check_is_editor()
  );

-- 3. articles の UPDATE ポリシーにおけるロール検証強化 --------------------------
DROP POLICY IF EXISTS "articles_update_own_articles" ON public.articles;
CREATE POLICY "articles_update_own_articles" ON public.articles
  FOR UPDATE TO authenticated
  USING (
    (auth.uid())::text = writer_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.id)::text = (auth.uid())::text
        AND profiles.role IN ('writer', 'editor')
    )
  )
  WITH CHECK (
    (auth.uid())::text = writer_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.id)::text = (auth.uid())::text
        AND profiles.role IN ('writer', 'editor')
    )
  );

DROP POLICY IF EXISTS "articles_delete_own_articles" ON public.articles;
CREATE POLICY "articles_delete_own_articles" ON public.articles
  FOR DELETE TO authenticated
  USING (
    (auth.uid())::text = writer_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.id)::text = (auth.uid())::text
        AND profiles.role IN ('writer', 'editor')
    )
  );
