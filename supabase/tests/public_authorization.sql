-- Run on an isolated database after all migrations.
BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('86100000-0000-4000-8000-000000000001', 'release-check@example.test');
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_self_role_escalation;
UPDATE public.profiles
SET role = 'editor', roles = ARRAY['editor']
WHERE id = '86100000-0000-4000-8000-000000000001';
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_self_role_escalation;

SELECT set_config('request.jwt.claims', '{"sub":"86100000-0000-4000-8000-000000000001"}', true);

INSERT INTO public.articles (id, writer_id, title, status, scheduled_at)
VALUES
  ('release-check-public', '86100000-0000-4000-8000-000000000001', 'Public', 'published', NULL),
  ('release-check-draft', '86100000-0000-4000-8000-000000000001', 'Draft', 'draft', NULL),
  ('release-check-due', '86100000-0000-4000-8000-000000000001', 'Due', 'scheduled', now() - interval '1 hour'),
  ('release-check-future', '86100000-0000-4000-8000-000000000001', 'Future', 'scheduled', now() + interval '1 hour');

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

DO $$
BEGIN
  IF (SELECT array_agg(id ORDER BY id)
      FROM public.articles WHERE id LIKE 'release-check-%')
      IS DISTINCT FROM ARRAY['release-check-due', 'release-check-public'] THEN
    RAISE EXCEPTION 'Public article RLS differs from the publication rules';
  END IF;

  PERFORM public.get_follow_counts('86100000-0000-4000-8000-000000000001');
  PERFORM public.publish_due_scheduled_articles();
  PERFORM public.increment_views('release-check-public');
  PERFORM public.increment_views('release-check-future');
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.articles WHERE id = 'release-check-due' AND status = 'published')
      OR NOT EXISTS (SELECT FROM public.articles WHERE id = 'release-check-future' AND status = 'scheduled' AND views = 0)
      OR NOT EXISTS (SELECT FROM public.articles WHERE id = 'release-check-public' AND views = 1) THEN
    RAISE EXCEPTION 'Anonymous article RPC effects differ from the publication rules';
  END IF;
END;
$$;

ROLLBACK;
