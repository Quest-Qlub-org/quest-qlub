-- ============================================================================
-- 20261116122000_fix_article_comments_author_id_constraint.sql
-- Issue #141: article_comments.author_id の FK / NOT NULL 制約ドリフトの是正
-- ----------------------------------------------------------------------------
-- 20261017101000_capture_missing_schema_and_policies.sql は author_id を
-- nullable + ON DELETE SET NULL で作成し、20261018010000 では CREATE TABLE IF
-- NOT EXISTS のみに留まったため、既存 DB で制約ドリフトが残っていた。
-- 本マイグレーションで ON DELETE CASCADE および NOT NULL へ統一する。
-- ============================================================================

DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE n.nspname = 'public'
      AND t.relname = 'article_comments'
      AND c.contype = 'f'
      AND a.attname = 'author_id'
  LOOP
    EXECUTE format('ALTER TABLE public.article_comments DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.article_comments
  ADD CONSTRAINT article_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DELETE FROM public.article_comments WHERE author_id IS NULL;

ALTER TABLE public.article_comments
  ALTER COLUMN author_id SET NOT NULL;
