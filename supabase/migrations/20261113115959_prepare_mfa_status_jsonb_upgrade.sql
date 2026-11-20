-- The next migration replaces this function with the same API and a jsonb result.
-- PostgreSQL requires a drop before replacing the legacy json signature.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc
    WHERE oid = to_regprocedure('public.get_mfa_backup_codes_status()')
      AND prorettype = 'pg_catalog.json'::regtype
  ) THEN
    DROP FUNCTION public.get_mfa_backup_codes_status();
  END IF;
END;
$$;
