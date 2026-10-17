-- ============================================================================
-- S1（追加分）: プロフィールのロール列更新権限の剥奪（多層防御）
-- ----------------------------------------------------------------------------
-- 【適用順序】
--   このマイグレーションは「SetupProfileView の upsert から role を送らない
--   コード」をデプロイした後に適用すること。旧コード（origin/main = ab7280a）
--   は upsert で role を送信するため、先に適用すると既存ユーザーの
--   プロフィール設定が列権限エラーで失敗する。
--   （本番へは当該コードのデプロイ後に適用済み）
--
-- 【実装上の注意】
--   authenticated は profiles に「テーブルレベル UPDATE」を持っているため、
--   `REVOKE UPDATE (role)`（列単位）だけでは無効だった。テーブルレベル UPDATE を
--   剥奪したうえで、アプリが必要とする列のみを許可する必要がある。
--
-- 【目的】
--   ロール変更は admin_change_user_role()（SECURITY DEFINER）経由のみ許可し、
--   authenticated からの直接の role 更新（権限昇格）を DB 権限レベルで遮断する。
--   prevent_self_role_escalation トリガーと二重の防御になる。
-- ============================================================================

-- テーブルレベル UPDATE を剥奪（role 更新を許していた根本原因）
REVOKE UPDATE ON public.profiles FROM authenticated;

-- アプリが更新する列のみ許可（role / id / created_at は不可）
GRANT UPDATE (email, display_name, username, avatar_url, bio, x_account)
  ON public.profiles TO authenticated;
