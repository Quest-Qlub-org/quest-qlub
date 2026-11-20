BEGIN;

-- Older installations retained the original three-state constraint.
ALTER TABLE public.articles
  DROP CONSTRAINT IF EXISTS articles_status_check,
  ADD CONSTRAINT articles_status_check
    CHECK (status IN ('draft', 'pending', 'scheduled', 'published'));

COMMIT;
