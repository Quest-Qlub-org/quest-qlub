-- #166: 保存済みの表示名を検証し、投稿の受理とレート制限を同時に確定する。
BEGIN;

CREATE SCHEMA IF NOT EXISTS quest_qlub_private;
REVOKE ALL ON SCHEMA quest_qlub_private FROM PUBLIC, anon;

CREATE TABLE IF NOT EXISTS quest_qlub_private.comment_submission_windows (
  author_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_at timestamptz[] NOT NULL DEFAULT '{}'
);
ALTER TABLE quest_qlub_private.comment_submission_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quest_qlub_private.comment_submission_windows FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION quest_qlub_private.comment_author_label(comment_author_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN profiles.username ~ '^[A-Za-z0-9_-]{1,30}$' THEN
      left(
        coalesce(nullif(btrim(profiles.display_name), ''), '読者'),
        46 - char_length(profiles.username)
      ) || ' (@' || profiles.username || ')'
    ELSE '読者 (' || comment_author_id::text || ')'
  END
  FROM (VALUES (comment_author_id)) AS author(id)
  LEFT JOIN public.profiles ON profiles.id = author.id;
$$;
REVOKE ALL ON FUNCTION quest_qlub_private.comment_author_label(uuid) FROM PUBLIC, anon, authenticated;

-- 既存の表示名は投稿者 ID と現在のプロフィールから再構成する。
-- 本文・ピン留め・日時は保持し、通常の UPDATE は引き続き表示名を書き換えられない。
LOCK TABLE public.article_comments IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.article_comments DISABLE TRIGGER trg_enforce_comment_update_rules;
UPDATE public.article_comments
SET author_name = quest_qlub_private.comment_author_label(author_id)
WHERE author_name IS DISTINCT FROM quest_qlub_private.comment_author_label(author_id);
ALTER TABLE public.article_comments ENABLE TRIGGER trg_enforce_comment_update_rules;

INSERT INTO quest_qlub_private.comment_submission_windows (author_id, submitted_at)
SELECT author_id, (array_agg(created_at ORDER BY created_at DESC))[1:5]
FROM public.article_comments
WHERE created_at > statement_timestamp() - interval '1 minute'
GROUP BY author_id
ON CONFLICT (author_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_comment_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  comment_author_id uuid := auth.uid();
  accepted_at timestamptz;
  previous_submissions timestamptz[];
  recent_submissions timestamptz[];
BEGIN
  IF comment_author_id IS NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'コメントを投稿するにはログインが必要です。';
  END IF;

  INSERT INTO quest_qlub_private.comment_submission_windows (author_id)
  VALUES (comment_author_id)
  ON CONFLICT (author_id) DO NOTHING;

  -- 投稿者ごとの行をロックし、別のトランザクションが完了した時点の記録を使う。
  SELECT submitted_at INTO STRICT previous_submissions
  FROM quest_qlub_private.comment_submission_windows
  WHERE author_id = comment_author_id
  FOR UPDATE;

  accepted_at := clock_timestamp();
  IF EXISTS (
    SELECT 1 FROM unnest(previous_submissions) AS previous(submitted_at)
    WHERE previous.submitted_at > accepted_at - interval '10 seconds'
  ) THEN
    RAISE EXCEPTION 'コメントの連続投稿は制限されています。少し時間を置いてから再度お試しください。'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT ARRAY(
    SELECT previous.submitted_at FROM unnest(previous_submissions) AS previous(submitted_at)
    WHERE previous.submitted_at > accepted_at - interval '1 minute'
  ) INTO recent_submissions;

  IF cardinality(recent_submissions) >= 5 THEN
    RAISE EXCEPTION '短時間に多数のコメントが投稿されています。1分ほど時間を置いてから再度お試しください。'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE quest_qlub_private.comment_submission_windows
  SET submitted_at = array_append(recent_submissions, accepted_at)
  WHERE author_id = comment_author_id;

  NEW.author_id := comment_author_id;
  NEW.author_name := quest_qlub_private.comment_author_label(comment_author_id);
  NEW.is_pinned := false;
  NEW.created_at := accepted_at;
  NEW.updated_at := accepted_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_comment_rate_limit ON public.article_comments;
CREATE TRIGGER trg_enforce_comment_rate_limit
  BEFORE INSERT ON public.article_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_comment_rate_limit();
REVOKE ALL ON FUNCTION public.enforce_comment_rate_limit() FROM PUBLIC, anon, authenticated;

COMMIT;
