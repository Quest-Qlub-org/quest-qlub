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

- `20261017101000_capture_missing_schema_and_policies.sql`（適用済み）
  - **スキーマドリフト解消 & 記事認可ポリシー強化**:
    - `admin_promote_writer` 関数本体の正式定義とリポジトリ取り込み（本番適用済み）。
    - `articles` の UPDATE / DELETE ポリシーに `profiles.role IN ('writer', 'editor')` の存在チェックを追加し、降格された元ライターによる不正更新・削除を遮断。

- `20261018010000_implement_comments_and_follows.sql`（適用済み）
  - **コメント機能・フォロー機能のDB化と権限・プライバシー強化**:
    - `articles.comments_enabled` 列の追加（ライター・編集長による記事ごとのコメントオン/オフ制御、オフ時はライター・編集長以外の過去コメント閲覧も遮断）。
    - `article_comments` テーブル作成および `is_pinned`（ライターのみ・最大3件トリガー検証）、`updated_at`、RLSポリシーの設定。
    - `comment_edit_history` テーブルと自動履歴記録トリガー（`trg_enforce_comment_update_rules`）の追加（全ユーザーが編集履歴を閲覧可能）。
    - `user_follows` テーブルの作成、全ユーザー公開用カウント集計RPC `get_follow_counts(uuid)`、および本人限定の詳細一覧SELECT RLSポリシーの設定。
  - **クライアント側スキーマ耐障害性（Graceful Degradation）**:
    - `ArticleComments` コンポーネントに `localStorage` 永続化フォールバック（`quest_qlub_comments_${articleId}`）を整備。万一のスキーマドリフト（PGRST205 / 42P01 / 42703）や一時的な通信障害時にも、コメント投稿・ピン留め・編集・削除がローカルに安全保持され、ブラウザ更新でコメントが消失しない耐障害性を担保。
    - `comments_enabled` 列が存在しない場合でも PostgREST 42703 エラーで記事一覧が非表示にならないよう、`DataContext`, `ProfileView`, `WriterDashboard` では安全なカラム定義（`ARTICLE_LIST_FIELDS`）を採用。
    - `ArticleEditorView` での保存・更新時には、DB側で `comments_enabled` が未存在の場合（42703）に自動で除外リトライする多層防御フォールバックを組み込み、未適用・適用後の両方でシームレスに動作する互換性を担保。
    - `user_follows` テーブルおよび `get_follow_counts` 関数が未適用の状態（PGRST205 / 42P01 / 42883）でも、`useFollows` フックがアカウント別の `localStorage`（`quest_qlub_user_follows_${currentUserId}`）へ透過的にフォールバック。ログイン済みユーザーがフォロー操作を行ってもエラーで弾かれたり `/login` に強制リダイレクトされることなく、安全にフォロー状態が維持されるクライアント耐障害性を担保。
    - 各画面（`ArticleView`, `ProfileView`, `WritersView`）において、フォローボタン押下時の未認証判定（`!isAuthenticated`）と実行失敗判定（`!ok`）を明確に分離。ログイン済みユーザーの操作失敗を「未ログイン」と誤認して `/login` に飛ばす挙動を根本解消するとともに、著者本人による自己フォロー操作の抑止（ボタン非表示および警告通知）を徹底。

- `20261024070000_add_profile_roles_array.sql`（未適用・次回デプロイ / Issue #54）
  - **プロフィール複数ロール対応（roles配列列と管理RPC）**:
    - `public.profiles` に `roles text[] DEFAULT '{}'::text[]` を追加し、1アカウントに複数のロール（例: 編集長 + エンジニア、ライター + エンジニア）を付与可能に拡張。
    - `anon`, `authenticated` に `roles` 列の SELECT 権限を付与（公開プロフィールおよび `/about` での表示用）。
    - 編集長専用の複数ロール一括更新RPC `admin_set_user_roles(target_user_id text, new_roles text[])` を新設（最後の編集長アカウント降格防止チェック付き、下位互換のため既存 `role` 列も主ロールとして自動同期）。
    - 既存の `admin_change_user_role`, `admin_promote_writer`, `admin_get_all_profiles` を `roles` 配列と同期するよう拡張。
    - `check_is_editor()` 関数およびトリガー `prevent_self_role_escalation`, `enforce_profile_initial_role` を更新し、`roles` 配列による権限昇格の不正試行を DB トリガー層で防御。
  - **クライアント側スキーマ耐障害性（Graceful Degradation）**:
    - `roles` カラムが DB 未適用の環境（42703 エラー）でも、`AuthContext`, `DataContext` (`fetchWriters`, `loadMoreWriters`, `fetchTeamMembers`), `ProfileView`, `EditorWritersView` のすべてで自動除外リトライと単一 `role` カラムへのフォールバック（`getProfileRoles`）を整備。
    - `admin_set_user_roles` RPC が未定義（42883 エラー）の場合でも、`EditorWritersView` が即座に従来の `admin_change_user_role` へ自動フォールバック。
    - `/about`（`AboutView`）では、ハードコードされていたメンバー一覧を廃止し、取得したロール情報から「編集長」「ライター」「エンジニア」「その他カスタムロール」へ動的分類して自動反映。複数ロールを持つメンバー（例: ライター兼エンジニアの「るーと」）は該当するすべてのセクションへ重複して自動掲載される。

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
