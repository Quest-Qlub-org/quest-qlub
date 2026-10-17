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

## 未適用のマイグレーション

- `20261017063000_restrict_role_update.sql`
  - `REVOKE UPDATE (role) ON public.profiles FROM authenticated;`
  - **適用順序の制約がある**: デプロイ済みの `SetupProfileView` が upsert で `role` を
    送信するため、先に適用すると既存ユーザーのプロフィール設定が権限エラーで失敗する。
    `SetupProfileView` から `role` を除去したコード（コミット `4a4f15e` に含まれる）を
    **デプロイした後に適用すること**。

## デプロイが必要なため未対応の項目

- 記事HTMLの保存時サニタイズ（サーバ側）
- お問い合わせフォームの Edge Function 側レート制限・CORS 許可リストの厳格化
- OGP エンドポイント修正の実効反映（Vercel デプロイ時）
