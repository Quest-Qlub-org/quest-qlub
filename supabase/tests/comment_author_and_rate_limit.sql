-- Run with psql -X -v ON_ERROR_STOP=1 against a reset, isolated Supabase database.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('16600000-0000-4000-8000-000000000001', 'first-comment@example.test'),
  ('16600000-0000-4000-8000-000000000002', 'second-comment@example.test'),
  ('16600000-0000-4000-8000-000000000003', 'third-comment@example.test');

INSERT INTO public.profiles (id, display_name, username) VALUES
  ('16600000-0000-4000-8000-000000000001', '同じ名前', 'first_comment'),
  ('16600000-0000-4000-8000-000000000002', '同じ名前', 'second_comment')
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, username = excluded.username;

-- The public insert policy receives an article visible to the authenticated test readers.
ALTER TABLE public.articles DISABLE TRIGGER USER;
INSERT INTO public.articles (id, title, writer_id, status)
VALUES ('comment-rate-test-article', '投稿制限テスト', '16600000-0000-4000-8000-000000000001', 'published');
ALTER TABLE public.articles ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"16600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $$
DECLARE
  comment_row public.article_comments;
BEGIN
  INSERT INTO public.article_comments (article_id, author_id, author_name, content)
  VALUES ('comment-rate-test-article', '16600000-0000-4000-8000-000000000002', '別の名前', '初回投稿')
  RETURNING * INTO comment_row;

  IF comment_row.author_id::text <> '16600000-0000-4000-8000-000000000001'
    OR comment_row.author_name <> '同じ名前 (@first_comment)'
  THEN
    RAISE EXCEPTION 'Comment author was not resolved from the authenticated account';
  END IF;

  DELETE FROM public.article_comments WHERE id = comment_row.id;

  BEGIN
    INSERT INTO public.article_comments (article_id, content)
    VALUES ('comment-rate-test-article', '投稿間隔内の再投稿');
    RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'Repeat post was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'コメントの連続投稿%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"16600000-0000-4000-8000-000000000002","role":"authenticated"}', true);
INSERT INTO public.article_comments (article_id, content) VALUES ('comment-rate-test-article', '別の投稿者');
SELECT set_config('request.jwt.claims', '{"sub":"16600000-0000-4000-8000-000000000003","role":"authenticated"}', true);
INSERT INTO public.article_comments (article_id, content) VALUES ('comment-rate-test-article', 'プロフィール未設定');

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM public.article_comments
    WHERE article_id = 'comment-rate-test-article' AND author_name = '同じ名前 (@second_comment)'
  ) OR NOT EXISTS (
    SELECT FROM public.article_comments
    WHERE article_id = 'comment-rate-test-article'
      AND author_name = '読者 (16600000-0000-4000-8000-000000000003)'
  ) THEN
    RAISE EXCEPTION 'Comment authors were not separately identifiable';
  END IF;
END;
$$;

UPDATE quest_qlub_private.comment_submission_windows
SET submitted_at = ARRAY(
  SELECT clock_timestamp() - make_interval(secs => 11 * sample)
  FROM generate_series(1, 5) AS sample
)
WHERE author_id = '16600000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"16600000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.article_comments (article_id, content)
    VALUES ('comment-rate-test-article', '6件目の投稿');
    RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'Sixth post was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '短時間に多数%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;
