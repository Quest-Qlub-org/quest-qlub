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

- `20261017085124_harden_contact_and_article_content.sql`（適用済み）
  - **S3**: `contact_messages` のレート制限を DB トリガーで強制
    （同一メールアドレスにつき10分あたり3件）。Edge Function のインメモリ
    制限はコールドスタート・インスタンス毎で信頼できないため、DB 側を主防御とした。
    インデックス `contact_messages_email_created_at_idx` を追加。
  - **S2**: `articles.content` に代表的な XSS ベクタが含まれる場合、保存を拒否
    （`<script>`/`<iframe>` 等のタグ、タグ内イベントハンドラ、`javascript:` 等の
    URL スキーム、`srcdoc`）。
    - **注意**: 許可リスト方式ではなく**補助的な**多層防御。主防御は表示時の
      `sanitizeHtml()`（DOMPurify 許可リスト）であり、本トリガー単独では完全では
      ない。既存4記事が抵触しないことは確認済み。
  - **修正**: `20261017090141_fix_article_content_validation.sql` で `validate_article_content()`
    の正規表現を是正。適用時に `\s` が二重化して保存された点、および Postgres ARE では
    `\b` が後退(backspace)を意味し機能しなかった点を修正（タグ終端を `[\s>/]` または
    末尾に変更）。実DBで `<script>` / イベントハンドラ / `javascript:` / `srcdoc` を
    検知し、通常の本文では誤検知しないことを確認済み。

- `20261017100000_harden_mfa_backup_codes_security.sql`（未適用・次回デプロイ）
  - **MFAバックアップコードの暗号強度向上と権限最小化**:
    - `mfa_backup_codes` テーブルの直接 SELECT/INSERT/UPDATE/DELETE 権限を剥奪し、メタデータ列のみ許可。ハッシュ流出によるオフラインクラックを遮断。
    - `generate_mfa_backup_codes()` の疑似乱数 `random()` を廃止し、暗号学的安全な乱数 `gen_random_bytes` による生成へ更新。
    - `verify_and_consume_backup_code()` におけるブルートフォース試行への微小遅延防御を追加。

- `20261017101000_capture_missing_schema_and_policies.sql`（未適用・次回デプロイ）
  - **スキーマドリフト解消 & 記事認可ポリシー強化**:
    - `admin_promote_writer` 関数本体の正式定義とリポジトリ取り込み。
    - `article_comments` テーブル定義・RLSポリシー（閲覧・投稿・削除）の作成。
    - `articles` の UPDATE / DELETE ポリシーに `profiles.role IN ('writer', 'editor')` の存在チェックを追加し、降格された元ライターによる不正更新・削除を遮断。

## セキュリティ強化（コード・Edge Function）

- **S4**: `send-contact-email` の CORS 許可リストを厳格化。任意の `*.vercel.app`
  のうち `share-quest` を含むものを許可する条件を廃止し、明示的な許可オリジン
  （`share-quest.vercel.app` / `quest-qlub.vercel.app` / localhost）＋このプロジェクト
  自身の Vercel プレビュー（`quest-qlub*` に一致）のみ許可。`Vary: Origin` を付与。
  Edge Function へデプロイ済み（version 7）。
- **S6**: OGP エンドポイントの入力検証・フォールバック修正（デプロイ済み）。

## 依存関係の脆弱性（Dependabot）

- `vite-plus` / `vite-plus-core` / `vite-plus-test` を `0.1.24`、`dompurify` を
  `3.4.17`、`react-router-dom` を `7.18.4`、間接依存の `vite` を `^8.0.16` へ更新。
  `tinypool` / `source-map-js` は overrides で修正版へ固定。
- 残: `braces <= 3.0.3`（上流に修正版が存在しない開発用の間接依存）。

## 未対応・許容済み

- **S5** `increment_views`: セッション識別が無く重複カウントを排除できないため、
  閲覧数インフレは許容（低リスク。機密性・完全性には影響しない）。
- マイグレーション履歴の不一致（上記）: `schema_migrations` の調整が必要なため
  別タスクで対応する。
