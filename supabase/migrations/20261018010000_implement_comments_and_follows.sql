-- ============================================================================
-- コメント機能・フォロー機能の本格実装
-- ----------------------------------------------------------------------------
-- 1. articles.comments_enabled: 記事ごとのコメントオン/オフ切り替え
-- 2. article_comments: ピン留め (is_pinned、ライターのみ・最大3件)、更新日時 (updated_at)
-- 3. comment_edit_history: コメント編集履歴の自動記録と全体公開
-- 4. user_follows: フォロー関係のDB化、全体公開用カウント取得RPC、本人限定の詳細閲覧RLS
-- ============================================================================

-- 1. articles テーブルに comments_enabled 列を追加 ---------------------------
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. article_comments テーブルの整備 -----------------------------------------
CREATE TABLE IF NOT EXISTS public.article_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id TEXT NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT article_comments_name_len CHECK (char_length(author_name) BETWEEN 1 AND 50),
  CONSTRAINT article_comments_content_len CHECK (char_length(content) BETWEEN 1 AND 500)
);

ALTER TABLE public.article_comments
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_article_comments_article_pin
  ON public.article_comments (article_id, is_pinned DESC, created_at ASC);

-- 3. comment_edit_history テーブル（編集履歴） --------------------------------
CREATE TABLE IF NOT EXISTS public.comment_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.article_comments(id) ON DELETE CASCADE,
  previous_content TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comment_edit_history_comment_id
  ON public.comment_edit_history (comment_id, edited_at DESC);

-- 4. user_follows テーブル（フォロー関係） ------------------------------------
CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT user_follows_no_self_follow CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON public.user_follows (following_id);

-- 5. RLS ポリシー ------------------------------------------------------------

-- 5-1. article_comments
ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "article_comments_select_public" ON public.article_comments;
DROP POLICY IF EXISTS "article_comments_select" ON public.article_comments;

-- 閲覧:
-- ・comments_enabled = true の記事は誰でも閲覧可能
-- ・comments_enabled = false の記事は、記事のライター本人または編集長のみ過去コメントを閲覧可能
CREATE POLICY "article_comments_select" ON public.article_comments
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND (
          articles.comments_enabled = true
          OR (
            auth.uid() IS NOT NULL
            AND (
              articles.writer_id = (auth.uid())::text
              OR public.check_is_editor()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "article_comments_insert_public" ON public.article_comments;
DROP POLICY IF EXISTS "article_comments_insert" ON public.article_comments;

-- 投稿: ログイン必須、かつ対象記事の comments_enabled が true の場合のみ
CREATE POLICY "article_comments_insert" ON public.article_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND char_length(content) BETWEEN 1 AND 500
    AND char_length(author_name) BETWEEN 1 AND 50
    AND EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND articles.comments_enabled = true
    )
  );

DROP POLICY IF EXISTS "article_comments_update" ON public.article_comments;

-- 更新: 投稿者本人（本文編集）または記事のライター（ピン留め切り替え）
CREATE POLICY "article_comments_update" ON public.article_comments
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = author_id)
    OR EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND articles.writer_id = (auth.uid())::text
    )
  )
  WITH CHECK (
    (auth.uid() = author_id)
    OR EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND articles.writer_id = (auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "article_comments_delete_own_or_editor" ON public.article_comments;
DROP POLICY IF EXISTS "article_comments_delete" ON public.article_comments;

-- 削除: 投稿者本人、記事のライター、または編集長
CREATE POLICY "article_comments_delete" ON public.article_comments
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = author_id)
    OR EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_comments.article_id
        AND articles.writer_id = (auth.uid())::text
    )
    OR public.check_is_editor()
  );

-- 5-2. トリガー: ピン留め権限（ライターのみ・最大3件）および本文編集権限（投稿者本人のみ）の厳格検証 + 履歴保存
CREATE OR REPLACE FUNCTION public.enforce_comment_update_rules_and_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_writer_id text;
  v_pinned_count integer;
BEGIN
  SELECT writer_id INTO v_writer_id
  FROM public.articles
  WHERE id = NEW.article_id;

  -- ピン留め状態の変更は記事のライターのみ許可（編集長や他者は不可）
  IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
    IF (auth.uid())::text IS DISTINCT FROM v_writer_id THEN
      RAISE EXCEPTION 'コメントをピン留めできるのはこの記事のライターのみです。';
    END IF;

    IF NEW.is_pinned = true THEN
      SELECT count(*) INTO v_pinned_count
      FROM public.article_comments
      WHERE article_id = NEW.article_id AND is_pinned = true AND id != OLD.id;

      IF v_pinned_count >= 3 THEN
        RAISE EXCEPTION 'ピン留めできるコメントは最大3件までです。';
      END IF;
    END IF;
  END IF;

  -- 本文の変更はコメント投稿者本人のみ許可し、自動で編集履歴を記録
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF auth.uid() IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'コメント本文を編集できるのは投稿者本人のみです。';
    END IF;

    INSERT INTO public.comment_edit_history (comment_id, previous_content, edited_at)
    VALUES (OLD.id, OLD.content, now());

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_comment_update_rules ON public.article_comments;
CREATE TRIGGER trg_enforce_comment_update_rules
  BEFORE UPDATE ON public.article_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_comment_update_rules_and_history();

-- 5-3. comment_edit_history の RLS（誰でも編集履歴を確認可能）
ALTER TABLE public.comment_edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_edit_history_select" ON public.comment_edit_history;
CREATE POLICY "comment_edit_history_select" ON public.comment_edit_history
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "comment_edit_history_insert" ON public.comment_edit_history;
CREATE POLICY "comment_edit_history_insert" ON public.comment_edit_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.article_comments
      WHERE article_comments.id = comment_edit_history.comment_id
        AND article_comments.author_id = auth.uid()
    )
  );

-- 5-4. user_follows の RLS（詳細リストの閲覧は本人のみ）
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_follows_select_own" ON public.user_follows;
CREATE POLICY "user_follows_select_own" ON public.user_follows
  FOR SELECT TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "user_follows_insert_own" ON public.user_follows;
CREATE POLICY "user_follows_insert_own" ON public.user_follows
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id AND follower_id != following_id);

DROP POLICY IF EXISTS "user_follows_delete_own" ON public.user_follows;
CREATE POLICY "user_follows_delete_own" ON public.user_follows
  FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

-- 5-5. フォロー数・フォロワー数集計用 RPC（誰でもカウントのみ取得可能）
CREATE OR REPLACE FUNCTION public.get_follow_counts(target_user_id uuid)
RETURNS TABLE (following_count bigint, followers_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*) FROM public.user_follows WHERE follower_id = target_user_id) AS following_count,
    (SELECT count(*) FROM public.user_follows WHERE following_id = target_user_id) AS followers_count;
$$;

GRANT EXECUTE ON FUNCTION public.get_follow_counts(uuid) TO public, anon, authenticated;
