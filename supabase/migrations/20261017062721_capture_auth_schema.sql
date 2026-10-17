-- ============================================================================
-- S1: 認可スキーマ（関数・トリガー・RLSポリシー）のバージョン管理と付与の最小化
-- ----------------------------------------------------------------------------
-- 背景:
--   profiles / articles の認可を担う関数・トリガー・RLSポリシーがライブDBのみに
--   存在し、リポジトリ（マイグレーション）には存在しなかった。そのため DB の
--   再構築・ブランチ・復元時に認可が失われるリスクがあった。
--   本マイグレーションはライブDBの現行定義をそのまま冪等に取り込み、あわせて
--   過剰な付与を最小化する。
--
-- 前提:
--   既存の 20260905195043 / 20260906063000 が旧ポリシーを DROP した後に適用される
--   想定（タイムスタンプはそれらより後）。
-- ============================================================================

-- 1. 認可ヘルパー関数 --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_is_editor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id::text = (auth.uid())::text AND role = 'editor'
  );
$function$;

-- 新規プロフィール作成時に、編集長以外は必ず viewer にする
CREATE OR REPLACE FUNCTION public.enforce_profile_initial_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.check_is_editor() THEN
    NEW.role := 'viewer';
  END IF;
  RETURN NEW;
END;
$function$;

-- 自分自身のロール変更（権限昇格）を防止する
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.check_is_editor() THEN
      RAISE EXCEPTION 'ロールを変更する権限がありません。管理者にお問い合わせください。';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- サインアップ時に profiles 行を自動作成
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'viewer');
  RETURN new;
END;
$function$;

-- 2. トリガー ----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_enforce_profile_initial_role ON public.profiles;
CREATE TRIGGER trg_enforce_profile_initial_role
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_initial_role();

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. RLS ポリシー（ライブDBと一致） ------------------------------------------
-- articles
DROP POLICY IF EXISTS "articles_select_published" ON public.articles;
CREATE POLICY "articles_select_published" ON public.articles
  FOR SELECT TO public USING (status = 'published');

DROP POLICY IF EXISTS "articles_select_own_drafts" ON public.articles;
CREATE POLICY "articles_select_own_drafts" ON public.articles
  FOR SELECT TO authenticated USING ((auth.uid())::text = writer_id);

DROP POLICY IF EXISTS "articles_select_editor_all" ON public.articles;
CREATE POLICY "articles_select_editor_all" ON public.articles
  FOR SELECT TO authenticated USING (public.check_is_editor());

DROP POLICY IF EXISTS "articles_insert_writer_or_editor" ON public.articles;
CREATE POLICY "articles_insert_writer_or_editor" ON public.articles
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid())::text = writer_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.id)::text = (auth.uid())::text
        AND profiles.role IN ('writer', 'editor')
    )
  );

DROP POLICY IF EXISTS "articles_update_own_articles" ON public.articles;
CREATE POLICY "articles_update_own_articles" ON public.articles
  FOR UPDATE TO authenticated
  USING ((auth.uid())::text = writer_id)
  WITH CHECK ((auth.uid())::text = writer_id);

DROP POLICY IF EXISTS "articles_update_editor_all" ON public.articles;
CREATE POLICY "articles_update_editor_all" ON public.articles
  FOR UPDATE TO authenticated
  USING (public.check_is_editor())
  WITH CHECK (public.check_is_editor());

DROP POLICY IF EXISTS "articles_delete_own_articles" ON public.articles;
CREATE POLICY "articles_delete_own_articles" ON public.articles
  FOR DELETE TO authenticated USING ((auth.uid())::text = writer_id);

DROP POLICY IF EXISTS "articles_delete_editor_all" ON public.articles;
CREATE POLICY "articles_delete_editor_all" ON public.articles
  FOR DELETE TO authenticated USING (public.check_is_editor());

-- profiles
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((auth.uid())::text = (id)::text);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (((auth.uid())::text = (id)::text) OR public.check_is_editor())
  WITH CHECK (((auth.uid())::text = (id)::text) OR public.check_is_editor());

-- series
DROP POLICY IF EXISTS "誰でも連載を閲覧できる" ON public.series;
CREATE POLICY "誰でも連載を閲覧できる" ON public.series
  FOR SELECT TO public USING (true);

-- contact_messages
DROP POLICY IF EXISTS "Allow editors to read contact_messages" ON public.contact_messages;
CREATE POLICY "Allow editors to read contact_messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'editor'
    )
  );

DROP POLICY IF EXISTS "Allow public insert to contact_messages" ON public.contact_messages;
CREATE POLICY "Allow public insert to contact_messages" ON public.contact_messages
  FOR INSERT TO public WITH CHECK (true);

-- 4. 関数実行権限 ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.check_is_editor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_is_editor() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_profile_initial_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 5. 付与の最小化（多層防御） ------------------------------------------------
-- profiles の SELECT 許可リスト（email は公開しない）
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, role, display_name, username, avatar_url, bio, created_at)
  ON public.profiles TO anon, authenticated;

-- articles: anon に必要なのは公開記事の SELECT のみ。書き込み系は剥奪する。
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.articles FROM anon;
