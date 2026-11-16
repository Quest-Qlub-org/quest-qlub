-- ============================================================================
-- 20260901000000_baseline_schema.sql
-- Issue #141: クリーン環境でのマイグレーション再生（supabase db reset）用ベースライン DDL
-- ----------------------------------------------------------------------------
-- 既存のライブDBで先行作成されていたコアテーブル・ストレージバケット・初期関数
-- シグネチャをすべて冪等に定義する（既存オブジェクトがある場合は上書きしない）。
-- ============================================================================

-- 0. 暗号関数用拡張 (gen_random_bytes / sha256 等)
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;

-- 1. コアテーブル定義 -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text NOT NULL DEFAULT 'viewer',
  display_name text,
  username text UNIQUE,
  avatar_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  writer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.articles (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  title text NOT NULL,
  thumbnail text NOT NULL DEFAULT '',
  thumbnail_url text,
  thumbnail_color text DEFAULT 'blue',
  writer_id text NOT NULL,
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  is_recommended boolean NOT NULL DEFAULT false,
  is_popular boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  content text,
  summary text,
  series_id uuid REFERENCES public.series(id) ON DELETE SET NULL,
  episode_number integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id text NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- 2. Storage バケット初期レコード -------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- 3. 後続マイグレーション (20260905195043) が ALTER/REVOKE/GRANT する初期関数
-- 既に存在する環境では上書きしないよう未定義時のみ作成する。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_is_editor'
  ) THEN
    CREATE FUNCTION public.check_is_editor()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id::text = (auth.uid())::text AND role = 'editor'
      );
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_profile_initial_role'
  ) THEN
    CREATE FUNCTION public.enforce_profile_initial_role()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    BEGIN
      IF NOT public.check_is_editor() THEN
        NEW.role := 'viewer';
      END IF;
      RETURN NEW;
    END;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prevent_self_role_escalation'
  ) THEN
    CREATE FUNCTION public.prevent_self_role_escalation()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    BEGIN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NOT public.check_is_editor() THEN
          RAISE EXCEPTION 'ロールを変更する権限がありません。管理者にお問い合わせください。';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    CREATE FUNCTION public.handle_new_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    BEGIN
      INSERT INTO public.profiles (id, email, role)
      VALUES (new.id, new.email, 'viewer');
      RETURN new;
    END;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_change_user_role'
  ) THEN
    CREATE FUNCTION public.admin_change_user_role(target_user_id text, new_role text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    BEGIN
      IF NOT public.check_is_editor() THEN
        RAISE EXCEPTION '権限がありません。編集長のみがロールを変更できます。';
      END IF;
      UPDATE public.profiles SET role = new_role WHERE id::text = target_user_id;
    END;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_promote_writer'
  ) THEN
    CREATE FUNCTION public.admin_promote_writer(target_email text)
    RETURNS public.profiles
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    DECLARE
      v_profile public.profiles;
    BEGIN
      IF NOT public.check_is_editor() THEN
        RAISE EXCEPTION '権限がありません。編集長のみがライターを昇格できます。';
      END IF;
      UPDATE public.profiles
      SET role = 'writer'
      WHERE lower(email) = lower(trim(target_email))
      RETURNING * INTO v_profile;
      RETURN v_profile;
    END;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_likes'
  ) THEN
    CREATE FUNCTION public.increment_likes(p_article_id text)
    RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
      UPDATE public.articles SET likes = likes + 1 WHERE id = p_article_id;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'decrement_likes'
  ) THEN
    CREATE FUNCTION public.decrement_likes(p_article_id text)
    RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
      UPDATE public.articles SET likes = GREATEST(0, likes - 1) WHERE id = p_article_id;
    $fn$;
  END IF;
END $$;
