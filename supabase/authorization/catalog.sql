BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog, public;

-- JSON lines keep the catalog diff readable even for multi-line expressions.
WITH app_tables AS (
  SELECT c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND ((n.nspname = 'public' AND c.relname IN (
      'articles', 'article_comments', 'comment_edit_history', 'contact_messages',
      'favorites', 'mfa_backup_codes', 'profiles', 'series', 'user_follows'
    )) OR (n.nspname = 'storage' AND c.relname = 'objects')
      OR n.nspname = 'quest_qlub_private')
),
api_roles AS (
  SELECT oid, rolname, rolbypassrls
  FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
),
privileges(name) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
),
app_functions AS (
  SELECT p.*, n.nspname
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'quest_qlub_private')
    AND NOT EXISTS (
      SELECT FROM pg_depend AS d
      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
    )
),
entries AS (
  SELECT jsonb_build_array('rls', t.nspname, t.relname, t.relrowsecurity, t.relforcerowsecurity) AS entry
  FROM app_tables AS t
  UNION ALL
  SELECT jsonb_build_array('role', r.rolname, r.rolbypassrls, has_schema_privilege(r.oid, 'public', 'USAGE'),
    coalesce(has_schema_privilege(r.oid, to_regnamespace('quest_qlub_private'), 'USAGE'), false))
  FROM api_roles AS r
  UNION ALL
  SELECT jsonb_build_array('policy', p.schemaname, p.tablename, p.policyname,
    p.permissive, p.roles, p.cmd, p.qual, p.with_check)
  FROM pg_policies AS p
  JOIN app_tables AS t ON (p.schemaname, p.tablename) = (t.nspname, t.relname)
  UNION ALL
  SELECT jsonb_build_array('table', t.nspname, t.relname, r.rolname,
    ARRAY(SELECT name FROM privileges
      WHERE has_table_privilege(r.oid, t.oid, name) ORDER BY name))
  FROM app_tables AS t
  CROSS JOIN api_roles AS r
  WHERE t.nspname <> 'storage' AND r.rolname <> 'service_role'
  UNION ALL
  SELECT jsonb_build_array('columns', t.nspname, t.relname, r.rolname, v.name,
    array_agg(a.attname ORDER BY a.attname))
  FROM app_tables AS t
  JOIN pg_attribute AS a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN api_roles AS r
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS v(name)
  WHERE t.nspname <> 'storage' AND r.rolname <> 'service_role'
    AND NOT has_table_privilege(r.oid, t.oid, v.name)
    AND has_column_privilege(r.oid, t.oid, a.attnum, v.name)
  GROUP BY t.nspname, t.relname, r.rolname, v.name
  UNION ALL
  SELECT jsonb_build_array('function', f.nspname, f.oid::regprocedure::text, f.prosecdef,
    ARRAY(SELECT r.rolname FROM api_roles AS r
      WHERE has_function_privilege(r.oid, f.oid, 'EXECUTE') ORDER BY r.rolname),
    EXISTS (SELECT FROM aclexplode(coalesce(f.proacl, acldefault('f', f.proowner)))
      WHERE grantee = 0 AND privilege_type = 'EXECUTE'),
    ARRAY(SELECT setting FROM unnest(f.proconfig) AS setting
      WHERE setting LIKE 'search_path=%' ORDER BY setting))
  FROM app_functions AS f
  UNION ALL
  SELECT jsonb_build_array('trigger', n.nspname, c.relname, g.tgname,
    g.tgenabled, pg_get_triggerdef(g.oid))
  FROM pg_trigger AS g
  JOIN pg_class AS c ON c.oid = g.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT g.tgisinternal
    AND (EXISTS (SELECT FROM app_tables AS t WHERE t.oid = c.oid AND t.nspname <> 'storage')
      OR (n.nspname = 'auth' AND (c.relname, g.tgname) IN (
        ('users', 'on_auth_user_created'),
        ('mfa_factors', 'trg_invalidate_backup_codes_on_factor_removal')
      )))
)
SELECT entry::text
FROM entries
ORDER BY entry::text COLLATE "C";

ROLLBACK;
