-- ============================================================================
-- B1: X（旧Twitter）アカウントを username から分離する
-- ----------------------------------------------------------------------------
-- 背景:
--   profiles に x_account 列が存在しなかったため、Xアカウント編集が
--   username（サイト内ユーザー名・UNIQUE）を上書きしてしまい、
--   プロフィールURLの破壊や誤帰属（他人のXアカウントへのリンク表示）を
--   招く恐れがあった。x_account を独立した列として追加し、username と分離する。
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS x_account text;

-- 形式をサーバ側でも保証する（クライアント検証のバイパス対策）。
-- 既存データは本制約に準拠済みであることを確認済み。
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{3,20}$');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_x_account_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_x_account_format
  CHECK (x_account IS NULL OR x_account ~ '^[A-Za-z0-9_]{1,15}$');

-- 権限: 公開プロフィールに表示するため anon も SELECT 可、更新は本人のみ
GRANT SELECT (x_account) ON public.profiles TO anon, authenticated;
GRANT INSERT (x_account), UPDATE (x_account) ON public.profiles TO authenticated;
