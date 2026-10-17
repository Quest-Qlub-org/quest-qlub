# スキーマ・マイグレーションの現状記録

最終更新: 2026-10-17

このドキュメントは、Supabase の実DB（本番プロジェクト `uksgnlfnxytqljrctiqg`）と
`supabase/migrations/` の間の差分、および未適用のマイグレーションを記録する。

## 背景

認可（RLS・関数・トリガー）を担う一部のオブジェクトが、リポジトリではなく
ライブDBにのみ存在していた。再構築・ブランチ・復元時に認可が失われるリスクが
あったため、`20261017062721_capture_auth_schema.sql` でライブ定義を冪等に取り込んだ。

## マイグレーション履歴の不一致（未解消）

DB の `supabase_migrations.schema_migrations` に記録済みのバージョンと、
リポジトリのファイル名が一致していないものがある。

- DB履歴にはあるが、リポジトリにファイルが無い
  - `20260906050553` `create_mfa_backup_codes_v2`
    （内容は `20260906140500_mfa_backup_codes.sql` とほぼ同一と推定）
- リポジトリにはあるが、DB履歴に記録が無い
  - `20260906063000_harden_security_and_fix_vulnerabilities.sql`
  - `20260906140500_mfa_backup_codes.sql`
  - `20260906143500_admin_emergency_mfa_reset.sql`

> 解消には DB 履歴（`schema_migrations`）の調整が必要なため、影響範囲を確認のうえ
> 別タスクで対応する。

## 適用済みのマイグレーション（デプロイ順序に依存）

- `20261017063000_restrict_role_update.sql`（適用済み）
  - **実装上の注意**: `authenticated` は `profiles` に「テーブルレベル UPDATE」を
    持つため、`REVOKE UPDATE (role)`（列単位）だけでは無効だった。テーブルレベル
    UPDATE を剥奪したうえで、必要な列のみ許可する。
    ```sql
    REVOKE UPDATE ON public.profiles FROM authenticated;
    GRANT UPDATE (email, display_name, username, avatar_url, bio, x_account)
      ON public.profiles TO authenticated;
    ```
  - **適用順序**: デプロイ済みの `SetupProfileView` が upsert で `role` を送信する
    ため、`role` を除去したコードの**デプロイ後に適用**した（本番適用済み）。
  - 以降 `authenticated` は `role` を直接更新できない。ロール変更は
    `admin_change_user_role()`（SECURITY DEFINER）経由のみ。

## デプロイが必要なため未対応の項目

- 記事HTMLの保存時サニタイズ（サーバ側）
- お問い合わせフォームの Edge Function 側レート制限・CORS 許可リストの厳格化
- OGP エンドポイント修正の実効反映（Vercel デプロイ済み。`share-quest.vercel.app`）
